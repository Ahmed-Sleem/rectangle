/** Tests Projects service validation, authorization, uniqueness, and audit behavior. */
import { describe, expect, it } from "vitest";
import { ProjectTeamService } from "../src/application/project-team-service.js";
import { MemoryProjectTeamRepository } from "./support/memory-project-team-repository.js";
import { ProjectService, type AuditEventInput, type AuditRepository, type ProjectsRepository } from "../src/application/project-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import { DomainError } from "../src/domain/errors.js";
import type { CreateProjectInput, ProjectListQuery, ProjectRecord, UpdateProjectInput } from "../src/domain/project.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const admin: UserPrincipal = { tenantId, userId, roles: ["admin"], permissions: [] };
const viewer: UserPrincipal = { tenantId, userId, roles: ["member"], permissions: [] };

class MemoryProjectsRepository implements ProjectsRepository {
  async deleteForTenant(): Promise<boolean> {
    return true;
  }

  readonly projects = new Map<string, ProjectRecord>();

  /** Records who the repository was told to enrol, so the service can be checked. */
  enrolled: Array<{ projectId: string; userId: string }> = [];

  async create(
    projectTenantId: string,
    input: CreateProjectInput,
    creatorUserId: string,
  ): Promise<ProjectRecord> {
    const now = new Date("2026-07-23T20:00:00.000Z").toISOString();
    const project: ProjectRecord = {
      id: crypto.randomUUID(),
      tenantId: projectTenantId,
      name: input.name,
      code: input.code,
      status: input.status,
      ...(input.description ? { description: input.description } : {}),
      ...(input.plannedStartDate ? { plannedStartDate: input.plannedStartDate } : {}),
      ...(input.plannedFinishDate ? { plannedFinishDate: input.plannedFinishDate } : {}),
      ...(input.budgetAmount ? { budgetAmount: input.budgetAmount } : {}),
      ...(input.budgetCurrency ? { budgetCurrency: input.budgetCurrency } : {}),
      ...(input.sector ? { sector: input.sector } : {}),
      ...(input.deliveryMethod ? { deliveryMethod: input.deliveryMethod } : {}),
      ...(input.locationName ? { locationName: input.locationName } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(project.id, project);
    this.enrolled.push({ projectId: project.id, userId: creatorUserId });
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
    return [...this.projects.values()]
      .filter((project) => project.tenantId === projectTenantId)
      .filter((project) => !query.status || project.status === query.status)
      .filter((project) => !query.search || project.name.includes(query.search) || project.code.includes(query.search))
      .slice(0, query.limit);
  }

  async updateForTenant(projectTenantId: string, id: string, input: UpdateProjectInput): Promise<ProjectRecord | null> {
    const existing = await this.findByIdForTenant(projectTenantId, id);
    if (!existing) return null;
    const updated: ProjectRecord = { ...existing, updatedAt: new Date("2026-07-23T21:00:00.000Z").toISOString() };
    if (input.name !== undefined) updated.name = input.name;
    if (input.code !== undefined) updated.code = input.code;
    if (input.description !== undefined) updated.description = input.description;
    if (input.status !== undefined) updated.status = input.status;
    if (input.plannedStartDate !== undefined) updated.plannedStartDate = input.plannedStartDate;
    if (input.plannedFinishDate !== undefined) updated.plannedFinishDate = input.plannedFinishDate;
    if (input.budgetAmount !== undefined) updated.budgetAmount = input.budgetAmount;
    if (input.budgetCurrency !== undefined) updated.budgetCurrency = input.budgetCurrency;
    if (input.sector !== undefined) updated.sector = input.sector;
    if (input.deliveryMethod !== undefined) updated.deliveryMethod = input.deliveryMethod;
    if (input.locationName !== undefined) updated.locationName = input.locationName;
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

function createService() {
  const projects = new MemoryProjectsRepository();
  const audit = new MemoryAuditRepository();
  /*
   * The real collaborator, not a stand-in. Reach is part of what these tests
   * exercise, and a permissive stub would let them pass whatever the
   * authorization code did.
   */
  const team = new MemoryProjectTeamRepository();
  const projectTeam = new ProjectTeamService(projects, team, audit);
  return { service: new ProjectService(projects, audit, projectTeam), projects, audit, team };
}

describe("ProjectService", () => {
  it("creates a project with construction fields and records an audit event", async () => {
    const { service, audit } = createService();

    const project = await service.createProject(admin, {
      name: "New Cairo Hospital",
      code: "NCH-001",
      status: "active",
      plannedStartDate: "2026-08-01",
      plannedFinishDate: "2027-08-01",
      budgetAmount: "125000000.00",
      budgetCurrency: "EGP",
      sector: "healthcare",
      deliveryMethod: "design_bid_build",
      locationName: "New Cairo",
    });

    expect(project.code).toBe("NCH-001");
    expect(project.budgetCurrency).toBe("EGP");
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({ action: "project.create", entityId: project.id, result: "success" });
  });

  it("rejects invalid dates and unsafe project codes", async () => {
    const { service } = createService();

    await expect(service.createProject(admin, {
      name: "A",
      code: "unsafe code",
      plannedStartDate: "2026-10-01",
      plannedFinishDate: "2026-09-01",
    })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("blocks users without project management permissions", async () => {
    const { service } = createService();

    await expect(service.createProject(viewer, {
      name: "Alex Tower",
      code: "AT-001",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("enforces code uniqueness per tenant", async () => {
    const { service } = createService();
    await service.createProject(admin, { name: "Mall Phase 1", code: "MALL-01" });

    await expect(service.createProject(admin, { name: "Mall Phase 2", code: "MALL-01" })).rejects.toBeInstanceOf(DomainError);
    await expect(service.createProject(admin, { name: "Mall Phase 2", code: "MALL-01" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("creating a project you can then open", () => {
  it("enrols the creator as the project's administrator", async () => {
    /*
     * A real bug this catches. Membership is what grants reach, so somebody
     * holding `projects.create` without the company-wide `projects.manage_all`
     * created a job and immediately lost it: `resolveAccess` found no
     * membership and answered "not found". They had made something they could
     * not open, and could not even see to ask about.
     *
     * Procore does the same thing for the same reason — granting project
     * creation makes the creator administrator of what they create.
     */
    const { service, projects } = createService();
    const starter: UserPrincipal = {
      tenantId,
      userId: "44444444-4444-4444-8444-444444444444",
      roles: ["member"],
      permissions: ["projects.read", "projects.create"],
    };

    const project = await service.createProject(starter, {
      name: "Sheikh Zayed Depot",
      code: "SZD-001",
      status: "active",
    });

    expect(projects.enrolled).toEqual([
      { projectId: project.id, userId: starter.userId },
    ]);
  });
});
