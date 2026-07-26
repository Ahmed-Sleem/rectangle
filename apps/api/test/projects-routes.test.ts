/** Tests Projects API contracts for auth, validation, and route behavior. */
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { AuthService, type AuthRepository, type CredentialUserRecord } from "../src/application/auth-service.js";
import { ProjectService, type AuditEventInput, type AuditRepository, type ProjectsRepository } from "../src/application/project-service.js";
import { ProjectTeamService } from "../src/application/project-team-service.js";
import { MemoryProjectTeamRepository } from "./support/memory-project-team-repository.js";
import { createServer } from "../src/http/server.js";
import type { CreateProjectInput, ProjectListQuery, ProjectRecord, UpdateProjectInput } from "../src/domain/project.js";
import type { PasswordHasher } from "../src/infrastructure/password.js";
import { inactiveAuthLifecycleService, inactiveOverviewService, inactiveProfileService, inactiveRiskService, inactiveSearchService, inactiveTaskService } from "./support/inactive-services.js";

const jwtSecret = "rectangle-test-secret-must-be-at-least-32-chars";
const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

/**
 * Authority is resolved from the session on every request, so the roles under
 * test are held by the session rather than baked into the token. Each token
 * gets its own session id, because a test that signs in as two different
 * people needs both to stay valid at once.
 */
const sessionRolesById = new Map<string, string[]>();
let nextSession = 0;

async function token(roles: string[]) {
  nextSession += 1;
  const sid = `33333333-3333-4333-8333-${String(nextSession).padStart(12, "0")}`;
  sessionRolesById.set(sid, roles);
  return new SignJWT({ tenant_id: tenantId, roles, sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(jwtSecret));
}

class MemoryProjectsRepository implements ProjectsRepository {
  async deleteForTenant(deleteTenantId: string, id: string): Promise<boolean> {
    const project = this.projects.get(id);
    if (!project || project.tenantId !== deleteTenantId) return false;
    this.projects.delete(id);
    return true;
  }

  readonly projects = new Map<string, ProjectRecord>();

  async create(projectTenantId: string, input: CreateProjectInput): Promise<ProjectRecord> {
    const now = new Date("2026-07-23T20:00:00.000Z").toISOString();
    const project: ProjectRecord = {
      id: crypto.randomUUID(),
      tenantId: projectTenantId,
      name: input.name,
      code: input.code,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(project.id, project);
    return project;
  }

  async findByTenantAndCode(projectTenantId: string, code: string): Promise<ProjectRecord | null> {
    return [...this.projects.values()].find((project) => project.tenantId === projectTenantId && project.code === code) ?? null;
  }

  async findByIdForTenant(projectTenantId: string, id: string): Promise<ProjectRecord | null> {
    const project = this.projects.get(id);
    return project?.tenantId === projectTenantId ? project : null;
  }

  async listForTenant(projectTenantId: string, query: ProjectListQuery): Promise<ProjectRecord[]> {
    return [...this.projects.values()].filter((project) => project.tenantId === projectTenantId).slice(0, query.limit);
  }

  async updateForTenant(projectTenantId: string, id: string, input: UpdateProjectInput): Promise<ProjectRecord | null> {
    const project = await this.findByIdForTenant(projectTenantId, id);
    if (!project) return null;
    const updated: ProjectRecord = {
      ...project,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.plannedStartDate !== undefined ? { plannedStartDate: input.plannedStartDate } : {}),
      ...(input.plannedFinishDate !== undefined ? { plannedFinishDate: input.plannedFinishDate } : {}),
      ...(input.budgetAmount !== undefined ? { budgetAmount: input.budgetAmount } : {}),
      ...(input.budgetCurrency !== undefined ? { budgetCurrency: input.budgetCurrency } : {}),
      ...(input.sector !== undefined ? { sector: input.sector } : {}),
      ...(input.deliveryMethod !== undefined ? { deliveryMethod: input.deliveryMethod } : {}),
      ...(input.locationName !== undefined ? { locationName: input.locationName } : {}),
      updatedAt: new Date("2026-07-23T21:00:00.000Z").toISOString(),
    };
    this.projects.set(id, updated);
    return updated;
  }
}

class MemoryAuditRepository implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> {
    this.events.push(event);
  }
}

class MemoryAuthRepository implements AuthRepository {
  async findCredentialUser(): Promise<CredentialUserRecord | null> {
    return null;
  }
  async createSession() {
    return { id: sessionId, tenantId, userId, expiresAt: new Date(Date.now() + 3600000).toISOString() };
  }
  async findActiveSession(lookupSessionId: string, sessionTenantId: string, sessionUserId: string) {
    return {
      id: lookupSessionId,
      tenantId: sessionTenantId,
      userId: sessionUserId,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      roles: (sessionRolesById.get(lookupSessionId) ?? []) as never,
      permissions: [],
    };
  }
  async revokeSession(): Promise<void> {}
}

class TestPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> { return password; }
  async verify(password: string, encodedHash: string): Promise<boolean> { return password === encodedHash; }
}

const inactivePasskeyService = {
  list(): never { throw new Error("not used"); },
  beginRegistration(): never { throw new Error("not used"); },
  verifyRegistration(): never { throw new Error("not used"); },
  beginLogin(): never { throw new Error("not used"); },
  verifyLogin(): never { throw new Error("not used"); },
};

const inactiveEmailSettingsService = {
  getSettings(): never { throw new Error("not used"); },
  saveSettings(): never { throw new Error("not used"); },
  sendTestEmail(): never { throw new Error("not used"); },
};

const inactiveAdminService = {
  listPermissions(): never { throw new Error("not used"); },
  listUserTypes(): never { throw new Error("not used"); },
  createUserType(): never { throw new Error("not used"); },
  updateUserType(): never { throw new Error("not used"); },
  listUsers(): never { throw new Error("not used"); },
  createUser(): never { throw new Error("not used"); },
  updateUser(): never { throw new Error("not used"); },
};

const inactiveSetupService = {
  async getStatus() { return { setupRequired: false }; },
  async createFirstAdmin(): Promise<never> { throw new Error("not used"); },
};

async function createTestServer() {
  const projects = new MemoryProjectsRepository();
  const team = new MemoryProjectTeamRepository();
  const audit = new MemoryAuditRepository();
  const app = await createServer({
    overviewService: inactiveOverviewService,
    taskService: inactiveTaskService,
    searchService: inactiveSearchService,
    riskService: inactiveRiskService,
    profileService: inactiveProfileService,
    authLifecycleService: inactiveAuthLifecycleService,
    adminService: inactiveAdminService,
    emailSettingsService: inactiveEmailSettingsService,
    passkeyService: inactivePasskeyService,
    projectService: new ProjectService(projects, audit),
    projectTeamService: new ProjectTeamService(projects, team, audit),
    setupService: inactiveSetupService,
    authService: new AuthService(new MemoryAuthRepository(), new TestPasswordHasher(), audit, jwtSecret),
    jwtSecret,
    corsOrigin: "http://localhost:5173",
    logger: false,
  });
  return { app, projects, team, audit };
}

describe("Projects routes", () => {
  it("requires authentication for project routes", async () => {
    const { app } = await createTestServer();
    const response = await app.inject({ method: "GET", url: "/v1/projects" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    await app.close();
  });

  it("creates and lists projects for an authorized tenant user", async () => {
    const { app, audit } = await createTestServer();
    const bearer = await token(["tenant_admin"]);

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: { authorization: `Bearer ${bearer}` },
      payload: { name: "Cairo Metro Extension", code: "CME-01", status: "active" },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().project).toMatchObject({ code: "CME-01", status: "active" });
    expect(audit.events).toHaveLength(1);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/projects",
      headers: { authorization: `Bearer ${bearer}` },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().projects).toHaveLength(1);
    await app.close();
  });

  it("returns validation errors for invalid create payloads", async () => {
    const { app } = await createTestServer();
    const bearer = await token(["tenant_admin"]);

    const response = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: { authorization: `Bearer ${bearer}` },
      payload: { name: "A", code: "bad code" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    await app.close();
  });

  it("exposes project team, stakeholder, and activity endpoints end to end", async () => {
    const { app, team, audit } = await createTestServer();
    const bearer = await token(["tenant_admin"]);
    const teammateId = "44444444-4444-4444-8444-444444444444";
    team.addTenantUser({ id: teammateId, tenantId, displayName: "Mona Adel", email: "mona@example.com" });

    const created = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: { authorization: `Bearer ${bearer}` },
      payload: { name: "Cairo Metro Extension", code: "CME-02", status: "active" },
    });
    const projectId = created.json().project.id as string;

    const access = await app.inject({
      method: "GET",
      url: `/v1/projects/${projectId}/access`,
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(access.statusCode).toBe(200);
    expect(access.json().access).toMatchObject({ canRead: true, canManage: true });

    const addMember = await app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/members`,
      headers: { authorization: `Bearer ${bearer}` },
      payload: { userId: teammateId, role: "project_manager" },
    });
    expect(addMember.statusCode).toBe(201);
    expect(addMember.json().member).toMatchObject({ userId: teammateId, displayName: "Mona Adel" });

    const members = await app.inject({
      method: "GET",
      url: `/v1/projects/${projectId}/members`,
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(members.json().members).toHaveLength(1);

    const stakeholder = await app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/stakeholders`,
      headers: { authorization: `Bearer ${bearer}` },
      payload: { name: "الهيئة القومية للأنفاق", category: "authority" },
    });
    expect(stakeholder.statusCode).toBe(201);
    const stakeholderId = stakeholder.json().stakeholder.id as string;
    expect(stakeholder.json().stakeholder.name).toBe("الهيئة القومية للأنفاق");

    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${projectId}/stakeholders/${stakeholderId}`,
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(removed.statusCode).toBe(204);

    // Every write above must have produced an audit trail entry.
    const actions = audit.events.map((event) => event.action);
    expect(actions).toEqual([
      "project.create",
      "project.member.add",
      "project.stakeholder.create",
      "project.stakeholder.delete",
    ]);

    const activity = await app.inject({
      method: "GET",
      url: `/v1/projects/${projectId}/activity`,
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(activity.statusCode).toBe(200);
    await app.close();
  });

  it("refuses team changes from a user without project management rights", async () => {
    const { app, team } = await createTestServer();
    const adminBearer = await token(["tenant_admin"]);
    const viewerBearer = await token(["viewer"]);
    const teammateId = "44444444-4444-4444-8444-444444444444";
    team.addTenantUser({ id: teammateId, tenantId, displayName: "Mona Adel", email: "mona@example.com" });
    team.addTenantUser({ id: userId, tenantId, displayName: "Viewer", email: "viewer@example.com" });

    const created = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: { authorization: `Bearer ${adminBearer}` },
      payload: { name: "Riyadh Tower", code: "RYD-01", status: "planned" },
    });
    const projectId = created.json().project.id as string;

    await app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/members`,
      headers: { authorization: `Bearer ${adminBearer}` },
      payload: { userId, role: "viewer" },
    });

    const forbidden = await app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/members`,
      headers: { authorization: `Bearer ${viewerBearer}` },
      payload: { userId: teammateId, role: "viewer" },
    });

    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    await app.close();
  });

  it("does not reveal a project to a user who cannot reach it", async () => {
    const { app } = await createTestServer();
    const adminBearer = await token(["tenant_admin"]);
    const viewerBearer = await token(["viewer"]);

    const created = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: { authorization: `Bearer ${adminBearer}` },
      payload: { name: "Private Site", code: "PRV-01", status: "planned" },
    });
    const projectId = created.json().project.id as string;

    const response = await app.inject({
      method: "GET",
      url: `/v1/projects/${projectId}/members`,
      headers: { authorization: `Bearer ${viewerBearer}` },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("deletes a project and records why it disappeared", async () => {
    const { app, audit } = await createTestServer();
    const bearer = await token(["tenant_admin"]);

    const created = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: { authorization: `Bearer ${bearer}` },
      payload: { name: "Cancelled Tender", code: "CAN-01", status: "planned" },
    });
    const projectId = created.json().project.id as string;

    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(removed.statusCode).toBe(204);

    // The record is gone, so the audit entry is the only remaining trace and
    // must carry enough detail to identify what was removed.
    expect(audit.events.at(-1)).toMatchObject({ action: "project.delete" });
    expect(audit.events.at(-1)?.metadata).toMatchObject({ code: "CAN-01", name: "Cancelled Tender" });

    const after = await app.inject({
      method: "GET",
      url: `/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(after.statusCode).toBe(404);
    await app.close();
  });

  it("refuses deletion from a user who cannot manage projects", async () => {
    const { app } = await createTestServer();
    const adminBearer = await token(["tenant_admin"]);
    const viewerBearer = await token(["viewer"]);

    const created = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: { authorization: `Bearer ${adminBearer}` },
      payload: { name: "Protected", code: "PRO-01", status: "active" },
    });
    const projectId = created.json().project.id as string;

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${viewerBearer}` },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
