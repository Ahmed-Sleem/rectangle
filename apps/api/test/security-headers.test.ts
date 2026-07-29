/**
 * Tests that every response carries the security headers the browser relies on.
 *
 * These were absent entirely until an audit checked the deployed environment
 * rather than trusting that a framework supplies them. Nothing in the app's own
 * behaviour changes when they disappear, so only an assertion keeps them there.
 */
import { describe, expect, it } from "vitest";
import { AuthService, type AuthRepository } from "../src/application/auth-service.js";
import {
  ProjectService,
  type AuditEventInput,
  type AuditRepository,
  type ProjectsRepository,
} from "../src/application/project-service.js";
import { ProjectTeamService } from "../src/application/project-team-service.js";
import { MemoryProjectTeamRepository } from "./support/memory-project-team-repository.js";
import type { CreateProjectInput, ProjectListQuery, ProjectRecord, UpdateProjectInput } from "../src/domain/project.js";
import { createServer } from "../src/http/server.js";
import type { PasswordHasher } from "../src/infrastructure/password.js";
import {
  inactiveAuthLifecycleService,
  inactiveOverviewService,
  inactiveProfileService,
  inactiveRiskService,
  inactiveSearchService,
  inactiveTaskService,
  inactiveActivityService,
} from "./support/inactive-services.js";

const jwtSecret = "rectangle-test-secret-must-be-at-least-32-chars";

class MemoryAuditRepository implements AuditRepository {
  async append(_event: AuditEventInput): Promise<void> {}
}

class EmptyProjectsRepository implements ProjectsRepository {
  async deleteForTenant(): Promise<boolean> { return true; }
  async create(_tenantId: string, _input: CreateProjectInput): Promise<ProjectRecord> { throw new Error("not used"); }
  async findByTenantAndCode(): Promise<ProjectRecord | null> { return null; }
  async findByIdForTenant(): Promise<ProjectRecord | null> { return null; }
  async listForTenant(_tenantId: string, _query: ProjectListQuery): Promise<ProjectRecord[]> { return []; }
  async updateForTenant(): Promise<ProjectRecord | null> { return null; }
}

class EmptyAuthRepository implements AuthRepository {
  async findCredentialUser(): Promise<null> { return null; }
  async createSession(): Promise<{ id: string; tenantId: string; userId: string; expiresAt: string }> { throw new Error("not used"); }
  async findActiveSession(): Promise<null> { return null; }
  async revokeSession(): Promise<void> {}
}

class TestPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> { return password; }
  async verify(password: string, encodedHash: string): Promise<boolean> { return password === encodedHash; }
}

const notUsed = (): never => { throw new Error("not used"); };

async function createTestServer() {
  const audit = new MemoryAuditRepository();
  const projectTeamService = new ProjectTeamService(new EmptyProjectsRepository(), new MemoryProjectTeamRepository(), audit);
  return createServer({
    activityService: inactiveActivityService,
    overviewService: inactiveOverviewService,
    taskService: inactiveTaskService,
    searchService: inactiveSearchService,
    riskService: inactiveRiskService,
    profileService: inactiveProfileService,
    authLifecycleService: inactiveAuthLifecycleService,
    adminService: {
      listPermissions: notUsed, listUserTypes: notUsed, createUserType: notUsed,
      updateUserType: notUsed, listUsers: notUsed, createUser: notUsed, updateUser: notUsed,
    },
    emailSettingsService: { getSettings: notUsed, saveSettings: notUsed, sendTestEmail: notUsed },
    passkeyService: {
      list: notUsed, beginRegistration: notUsed, verifyRegistration: notUsed,
      beginLogin: notUsed, verifyLogin: notUsed,
    },
    projectService: new ProjectService(new EmptyProjectsRepository(), audit, projectTeamService),
    projectTeamService,
    setupService: { async getStatus() { return { setupRequired: false }; }, createFirstAdmin: notUsed },
    authService: new AuthService(new EmptyAuthRepository(), new TestPasswordHasher(), audit, jwtSecret),
    jwtSecret,
    logger: false,
  });
}

describe("security headers", () => {
  it("sets a content security policy that refuses inline script", async () => {
    const app = await createTestServer();
    const response = await app.inject({ method: "GET", url: "/health/live" });

    const csp = response.headers["content-security-policy"];
    expect(csp).toBeTypeOf("string");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // An inline-script allowance is what turns content injection into code
    // execution, so its absence is the assertion worth making.
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");

    await app.close();
  });

  it("blocks MIME sniffing and framing, and hides the referrer", async () => {
    const app = await createTestServer();
    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-frame-options"]).toBeDefined();

    await app.close();
  });

  it("carries the headers on error responses too", async () => {
    const app = await createTestServer();
    // Unauthenticated: the response the majority of probes actually receive.
    const response = await app.inject({ method: "GET", url: "/v1/projects" });

    expect(response.statusCode).toBe(401);
    expect(response.headers["content-security-policy"]).toBeTypeOf("string");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");

    await app.close();
  });

  it("refuses a request body beyond the configured ceiling", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ tenantSlug: "a", email: "a@b.co", password: "x".repeat(400 * 1024) }),
    });

    // 413 rather than a validation error: the body is rejected before it is
    // parsed, which is the point of the limit.
    expect(response.statusCode).toBe(413);

    await app.close();
  });

  it("reports a malformed body as the client fault it is", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });

    // Previously 500. A broken request is not a broken server, and counting it
    // as one hides real faults in the server-error rate.
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { message: "The request could not be accepted." } });

    await app.close();
  });
});
