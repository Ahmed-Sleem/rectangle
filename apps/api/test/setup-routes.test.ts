/** Tests first company/admin setup API without fake seeded users. */
import { describe, expect, it } from "vitest";
import type { SetupResult, SetupStatus } from "../src/application/setup-service.js";
import { AuthService, type AuthRepository } from "../src/application/auth-service.js";
import { ProjectService, type AuditEventInput, type AuditRepository, type ProjectsRepository } from "../src/application/project-service.js";
import type { CreateProjectInput, ProjectListQuery, ProjectRecord, UpdateProjectInput } from "../src/domain/project.js";
import { createServer } from "../src/http/server.js";
import type { PasswordHasher } from "../src/infrastructure/password.js";

const jwtSecret = "rectangle-test-secret-must-be-at-least-32-chars";

class MemoryAuditRepository implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> { this.events.push(event); }
}

class EmptyProjectsRepository implements ProjectsRepository {
  async create(_tenantId: string, _input: CreateProjectInput): Promise<ProjectRecord> { throw new Error("not used"); }
  async findByTenantAndCode(): Promise<ProjectRecord | null> { return null; }
  async findByIdForTenant(): Promise<ProjectRecord | null> { return null; }
  async listForTenant(_tenantId: string, _query: ProjectListQuery): Promise<ProjectRecord[]> { return []; }
  async updateForTenant(_tenantId: string, _id: string, _input: UpdateProjectInput): Promise<ProjectRecord | null> { return null; }
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

function createSetupService(status: SetupStatus, result?: SetupResult) {
  return {
    async getStatus() { return status; },
    async createFirstAdmin(): Promise<SetupResult> {
      if (!result) throw new Error("not configured");
      return result;
    },
  };
}

const inactiveAdminService = {
  listPermissions(): never { throw new Error("not used"); },
  listUserTypes(): never { throw new Error("not used"); },
  createUserType(): never { throw new Error("not used"); },
  updateUserType(): never { throw new Error("not used"); },
  listUsers(): never { throw new Error("not used"); },
  createUser(): never { throw new Error("not used"); },
  updateUser(): never { throw new Error("not used"); },
};

async function createTestServer(status: SetupStatus, result?: SetupResult) {
  const audit = new MemoryAuditRepository();
  const app = await createServer({
    adminService: inactiveAdminService,
    projectService: new ProjectService(new EmptyProjectsRepository(), audit),
    authService: new AuthService(new EmptyAuthRepository(), new TestPasswordHasher(), audit, jwtSecret),
    setupService: createSetupService(status, result),
    jwtSecret,
    logger: false,
  });
  return app;
}

describe("Setup routes", () => {
  it("returns setup status", async () => {
    const app = await createTestServer({ setupRequired: true });
    const response = await app.inject({ method: "GET", url: "/v1/setup/status" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ setupRequired: true });
    await app.close();
  });

  it("sets a session cookie after first admin setup", async () => {
    const app = await createTestServer({ setupRequired: true }, {
      accessToken: "signed-token",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        tenantId: "11111111-1111-4111-8111-111111111111",
        email: "owner@rectangle.test",
        displayName: "Owner",
        roles: ["tenant_owner", "tenant_admin"],
        permissions: [],
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/setup/first-admin",
      payload: {
        companyName: "Rectangle Egypt",
        companySlug: "rectangle-eg",
        adminName: "Owner",
        adminEmail: "owner@rectangle.test",
        password: "VeryStrongPassword123",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers["set-cookie"]).toContain("rectangle_session=");
    expect(response.json().user.roles).toContain("tenant_owner");
    await app.close();
  });
});
