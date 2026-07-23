/** Tests Projects API contracts for auth, validation, and route behavior. */
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { ProjectService, type AuditEventInput, type AuditRepository, type ProjectsRepository } from "../src/application/project-service.js";
import { createServer } from "../src/http/server.js";
import type { CreateProjectInput, ProjectListQuery, ProjectRecord, UpdateProjectInput } from "../src/domain/project.js";

const jwtSecret = "rectangle-test-secret-must-be-at-least-32-chars";
const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

async function token(roles: string[]) {
  return new SignJWT({ tenant_id: tenantId, roles })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(jwtSecret));
}

class MemoryProjectsRepository implements ProjectsRepository {
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

async function createTestServer() {
  const projects = new MemoryProjectsRepository();
  const audit = new MemoryAuditRepository();
  const app = await createServer({
    projectService: new ProjectService(projects, audit),
    jwtSecret,
    corsOrigin: "http://localhost:5173",
    logger: false,
  });
  return { app, projects, audit };
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
});
