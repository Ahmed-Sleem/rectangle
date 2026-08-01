/**
 * That the separation-rule endpoints exist, authenticate, and reach the service.
 *
 * The service tests call the methods directly, so every one of them would still
 * pass if the routes had never been registered — the feature would be complete
 * and unreachable. These cover the wiring: the path, the verb, the status code,
 * and that an unauthenticated request never gets as far as the service.
 */
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { AuthService, type AuthRepository } from "../src/application/auth-service.js";
import { ProjectService, type AuditEventInput, type AuditRepository, type ProjectsRepository } from "../src/application/project-service.js";
import { ProjectTeamService } from "../src/application/project-team-service.js";
import { MemoryProjectTeamRepository } from "./support/memory-project-team-repository.js";
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
  inactiveDirectoryService,
} from "./support/inactive-services.js";

const jwtSecret = "rectangle-test-secret-must-be-at-least-32-chars";
const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const ruleId = "44444444-4444-4444-8444-444444444444";

async function token(): Promise<string> {
  return new SignJWT({ tenant_id: tenantId, roles: ["owner"], sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(jwtSecret));
}

class MemoryAuthRepository implements AuthRepository {
  async findCredentialUser() { return null; }
  async createSession() {
    return { id: sessionId, tenantId, userId, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
  }
  async findActiveSession() {
    return {
      id: sessionId,
      tenantId,
      userId,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      roles: ["owner"] as never,
      permissions: [],
    };
  }
  async touchSession(): Promise<void> {}
  async revokeSession(): Promise<void> {}
  async revokeAllSessionsForUser(): Promise<void> {}
  async findTenantBySlug() { return null; }
}

class TestPasswordHasher implements PasswordHasher {
  async hash() { return "hashed"; }
  async verify() { return true; }
}

class EmptyProjectsRepository implements ProjectsRepository {
  async deleteForTenant() { return false; }
  async create(): Promise<never> { throw new Error("not used"); }
  async findByTenantAndCode() { return null; }
  async findByIdForTenant() { return null; }
  async listForTenant() { return []; }
  async updateForTenant() { return null; }
}

class MemoryAuditRepository implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> { this.events.push(event); }
}

/** Records what the routes asked for, so the wiring can be asserted. */
function recordingAdminService() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const notUsed = (): never => { throw new Error("not used"); };
  return {
    calls,
    service: {
      listPermissions: notUsed,
      listUserTypes: notUsed,
      createUserType: notUsed,
      updateUserType: notUsed,
      listUsers: notUsed,
      createUser: notUsed,
      updateUser: notUsed,
      async listSeparationRules(...args: unknown[]) {
        calls.push({ method: "list", args });
        return { rules: [] };
      },
      async previewSeparationRule(...args: unknown[]) {
        calls.push({ method: "preview", args });
        return { violators: [] };
      },
      async createSeparationRule(...args: unknown[]) {
        calls.push({ method: "create", args });
        return {
          rule: { id: ruleId, a: "user_types.create" as const, b: "users.edit" as const, reason: "x" },
          strippedFrom: 0,
        };
      },
      async deleteSeparationRule(...args: unknown[]) {
        calls.push({ method: "delete", args });
      },
    },
  };
}

async function createTestServer() {
  const audit = new MemoryAuditRepository();
  const projects = new EmptyProjectsRepository();
  const projectTeamService = new ProjectTeamService(projects, new MemoryProjectTeamRepository(), audit);
  const admin = recordingAdminService();
  const app = await createServer({
    activityService: inactiveActivityService,
    overviewService: inactiveOverviewService,
    taskService: inactiveTaskService,
    searchService: inactiveSearchService,
    directoryService: inactiveDirectoryService,
    riskService: inactiveRiskService,
    profileService: inactiveProfileService,
    authLifecycleService: inactiveAuthLifecycleService,
    adminService: admin.service as never,
    emailSettingsService: {
      getSettings: () => { throw new Error("not used"); },
      saveSettings: () => { throw new Error("not used"); },
      sendTestEmail: () => { throw new Error("not used"); },
    } as never,
    passkeyService: {
      list: () => { throw new Error("not used"); },
      beginRegistration: () => { throw new Error("not used"); },
      verifyRegistration: () => { throw new Error("not used"); },
      beginLogin: () => { throw new Error("not used"); },
      verifyLogin: () => { throw new Error("not used"); },
    } as never,
    projectService: new ProjectService(projects, audit, projectTeamService),
    projectTeamService,
    setupService: {
      async getStatus() { return { setupRequired: false }; },
      createFirstAdmin: () => { throw new Error("not used"); },
    } as never,
    authService: new AuthService(new MemoryAuthRepository(), new TestPasswordHasher(), audit, jwtSecret),
    jwtSecret,
    logger: false,
  });
  return { app, admin };
}

describe("separation rule routes", () => {
  it("refuses an unauthenticated caller before reaching the service", async () => {
    const { app, admin } = await createTestServer();
    const response = await app.inject({ method: "GET", url: "/v1/admin/separation-rules" });
    expect(response.statusCode).toBe(401);
    // The service is never consulted, so nothing can leak from a failed auth.
    expect(admin.calls).toHaveLength(0);
    await app.close();
  });

  it("lists rules", async () => {
    const { app, admin } = await createTestServer();
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/separation-rules",
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ rules: [] });
    expect(admin.calls.map((call) => call.method)).toEqual(["list"]);
    await app.close();
  });

  it("previews a pair without creating anything", async () => {
    const { app, admin } = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/separation-rules/preview",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { a: "users.edit", b: "user_types.create" },
    });
    expect(response.statusCode).toBe(200);
    /*
     * Asserted on which method ran, not merely on the status. Both this and
     * create are POSTs under the same prefix, and a preview that reached the
     * create handler would still answer 2xx while having written a rule
     * nobody confirmed.
     *
     * Registration order turns out not to matter — Fastify matches the static
     * segment ahead of the shorter path either way, which I verified by
     * swapping them rather than assuming.
     */
    expect(admin.calls.map((call) => call.method)).toEqual(["preview"]);
    await app.close();
  });

  it("creates a rule and answers 201", async () => {
    const { app, admin } = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/separation-rules",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { a: "users.edit", b: "user_types.create", reason: "A long enough reason.", losing: "users.edit" },
    });
    expect(response.statusCode).toBe(201);
    expect(admin.calls.map((call) => call.method)).toEqual(["create"]);
    await app.close();
  });

  it("deletes a rule and answers 204 with no body", async () => {
    const { app, admin } = await createTestServer();
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/admin/separation-rules/${ruleId}`,
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    // The id reaches the service rather than being dropped by the route.
    expect(admin.calls[0]?.args[1]).toBe(ruleId);
    await app.close();
  });
});
