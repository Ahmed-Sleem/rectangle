/** Tests that the production API can serve the built web app as a same-origin app. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuthService, type AuthRepository } from "../src/application/auth-service.js";
import { ProjectService, type AuditEventInput, type AuditRepository, type ProjectsRepository } from "../src/application/project-service.js";
import type { CreateProjectInput, ProjectListQuery, ProjectRecord, UpdateProjectInput } from "../src/domain/project.js";
import { createServer } from "../src/http/server.js";
import type { PasswordHasher } from "../src/infrastructure/password.js";

const jwtSecret = "rectangle-test-secret-must-be-at-least-32-chars";

class MemoryAuditRepository implements AuditRepository {
  async append(_event: AuditEventInput): Promise<void> {}
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

const inactiveAdminService = {
  listPermissions(): never { throw new Error("not used"); },
  listUserTypes(): never { throw new Error("not used"); },
  createUserType(): never { throw new Error("not used"); },
  updateUserType(): never { throw new Error("not used"); },
  listUsers(): never { throw new Error("not used"); },
  createUser(): never { throw new Error("not used"); },
};

const inactiveSetupService = {
  async getStatus() { return { setupRequired: false }; },
  async createFirstAdmin(): Promise<never> { throw new Error("not used"); },
};

async function createTestServer(webDistPath: string) {
  const audit = new MemoryAuditRepository();
  return createServer({
    adminService: inactiveAdminService,
    projectService: new ProjectService(new EmptyProjectsRepository(), audit),
    setupService: inactiveSetupService,
    authService: new AuthService(new EmptyAuthRepository(), new TestPasswordHasher(), audit, jwtSecret),
    jwtSecret,
    webDistPath,
    logger: false,
  });
}

describe("static web serving", () => {
  it("serves index.html for SPA routes while keeping API routes protected", async () => {
    const webDist = mkdtempSync(join(tmpdir(), "rectangle-web-dist-"));
    try {
      writeFileSync(join(webDist, "index.html"), "<!doctype html><title>Rectangle</title><div id=\"root\"></div>");
      const app = await createTestServer(webDist);

      const rootResponse = await app.inject({ method: "GET", url: "/" });
      expect(rootResponse.statusCode).toBe(200);
      expect(rootResponse.body).toContain("Rectangle");

      const projectRouteResponse = await app.inject({ method: "GET", url: "/projects" });
      expect(projectRouteResponse.statusCode).toBe(200);
      expect(projectRouteResponse.body).toContain("Rectangle");

      const apiResponse = await app.inject({ method: "GET", url: "/v1/projects" });
      expect(apiResponse.statusCode).toBe(401);

      await app.close();
    } finally {
      rmSync(webDist, { recursive: true, force: true });
    }
  });
});
