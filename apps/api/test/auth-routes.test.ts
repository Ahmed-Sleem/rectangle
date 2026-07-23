/** Tests authentication API route contracts for real session issuing. */
import { describe, expect, it } from "vitest";
import { AuthService, type AuthRepository, type CredentialUserRecord } from "../src/application/auth-service.js";
import { ProjectService, type AuditEventInput, type AuditRepository, type ProjectsRepository } from "../src/application/project-service.js";
import type { CreateProjectInput, ProjectListQuery, ProjectRecord, UpdateProjectInput } from "../src/domain/project.js";
import { createServer } from "../src/http/server.js";
import { ScryptPasswordHasher } from "../src/infrastructure/password.js";

const jwtSecret = "rectangle-test-secret-must-be-at-least-32-chars";
const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

class MemoryAuditRepository implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> { this.events.push(event); }
}

class MemoryAuthRepository implements AuthRepository {
  constructor(private readonly user: CredentialUserRecord) {}
  async findCredentialUser(tenantSlug: string, email: string): Promise<CredentialUserRecord | null> {
    return this.user.tenantSlug === tenantSlug && this.user.email === email ? this.user : null;
  }
  async createSession(input: { tenantId: string; userId: string; expiresAt: string }) {
    return { id: "33333333-3333-4333-8333-333333333333", tenantId: input.tenantId, userId: input.userId, expiresAt: input.expiresAt };
  }
  async findActiveSession(sessionId: string, sessionTenantId: string, sessionUserId: string) {
    return { id: sessionId, tenantId: sessionTenantId, userId: sessionUserId, expiresAt: new Date(Date.now() + 3600000).toISOString() };
  }
  async revokeSession(): Promise<void> {}
}

class EmptyProjectsRepository implements ProjectsRepository {
  async create(_tenantId: string, _input: CreateProjectInput): Promise<ProjectRecord> { throw new Error("not used"); }
  async findByTenantAndCode(): Promise<ProjectRecord | null> { return null; }
  async findByIdForTenant(): Promise<ProjectRecord | null> { return null; }
  async listForTenant(_tenantId: string, _query: ProjectListQuery): Promise<ProjectRecord[]> { return []; }
  async updateForTenant(_tenantId: string, _id: string, _input: UpdateProjectInput): Promise<ProjectRecord | null> { return null; }
}

const inactiveSetupService = {
  async getStatus() { return { setupRequired: false }; },
  async createFirstAdmin(): Promise<never> { throw new Error("not used"); },
};

async function createTestServer() {
  const hasher = new ScryptPasswordHasher();
  const audit = new MemoryAuditRepository();
  const passwordHash = await hasher.hash("VeryStrongPassword123!");
  const user: CredentialUserRecord = {
    tenantId,
    tenantSlug: "rectangle-eg",
    userId,
    email: "owner@rectangle.test",
    displayName: "Project Owner",
    passwordHash,
    status: "active",
    roles: ["tenant_admin"],
  };
  const app = await createServer({
    projectService: new ProjectService(new EmptyProjectsRepository(), audit),
    setupService: inactiveSetupService,
    authService: new AuthService(new MemoryAuthRepository(user), hasher, audit, jwtSecret),
    jwtSecret,
    corsOrigin: "http://localhost:5173",
    logger: false,
  });
  return { app, audit };
}

describe("Auth routes", () => {
  it("issues an access token for valid credentials", async () => {
    const { app, audit } = await createTestServer();

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        tenantSlug: "rectangle-eg",
        email: "owner@rectangle.test",
        password: "VeryStrongPassword123!",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toEqual(expect.any(String));
    expect(response.json().user).toMatchObject({ email: "owner@rectangle.test", tenantId, roles: ["tenant_admin"] });
    expect(audit.events).toHaveLength(1);
    await app.close();
  });

  it("rejects invalid login payloads", async () => {
    const { app } = await createTestServer();

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { tenantSlug: "x", email: "bad", password: "short" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    await app.close();
  });
});
