/** Tests project team authorization, tenant isolation, safeguards, and audit behavior. */
import { beforeEach, describe, expect, it } from "vitest";
import { ProjectTeamService } from "../src/application/project-team-service.js";
import type {
  AuditEventInput,
  AuditRepository,
  ProjectsRepository,
} from "../src/application/project-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import { DomainError } from "../src/domain/errors.js";
import type { ProjectRecord } from "../src/domain/project.js";
import { MemoryProjectTeamRepository } from "./support/memory-project-team-repository.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const otherTenantId = "99999999-9999-4999-8999-999999999999";
const projectId = "33333333-3333-4333-8333-333333333333";

const adminUserId = "22222222-2222-4222-8222-222222222222";
const memberUserId = "44444444-4444-4444-8444-444444444444";
const outsiderUserId = "55555555-5555-4555-8555-555555555555";
const foreignUserId = "66666666-6666-4666-8666-666666666666";

const admin: UserPrincipal = { tenantId, userId: adminUserId, roles: ["tenant_admin"], permissions: [] };
const viewer: UserPrincipal = { tenantId, userId: memberUserId, roles: ["viewer"], permissions: [] };
const outsider: UserPrincipal = { tenantId, userId: outsiderUserId, roles: ["viewer"], permissions: [] };
const foreignAdmin: UserPrincipal = {
  tenantId: otherTenantId,
  userId: foreignUserId,
  roles: ["tenant_admin"],
  permissions: [],
};

class StubProjectsRepository implements ProjectsRepository {
  readonly projects = new Map<string, ProjectRecord>();

  seed(record: ProjectRecord): void {
    this.projects.set(record.id, record);
  }

  async create(): Promise<ProjectRecord> {
    throw new Error("not used");
  }
  async findByTenantAndCode(): Promise<ProjectRecord | null> {
    return null;
  }
  async findByIdForTenant(lookupTenantId: string, id: string): Promise<ProjectRecord | null> {
    const project = this.projects.get(id);
    return project && project.tenantId === lookupTenantId ? project : null;
  }
  async listForTenant(): Promise<ProjectRecord[]> {
    return [];
  }
  async updateForTenant(): Promise<ProjectRecord | null> {
    return null;
  }
}

class MemoryAuditRepository implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> {
    this.events.push(event);
  }
}

function buildProject(): ProjectRecord {
  return {
    id: projectId,
    tenantId,
    name: "New Hospital",
    code: "HOSP-01",
    status: "active",
    createdAt: "2026-07-25T10:00:00.000Z",
    updatedAt: "2026-07-25T10:00:00.000Z",
  };
}

describe("ProjectTeamService", () => {
  let projects: StubProjectsRepository;
  let team: MemoryProjectTeamRepository;
  let audit: MemoryAuditRepository;
  let service: ProjectTeamService;

  beforeEach(() => {
    projects = new StubProjectsRepository();
    projects.seed(buildProject());
    team = new MemoryProjectTeamRepository();
    team.addTenantUser({ id: adminUserId, tenantId, displayName: "Site Owner", email: "owner@example.com" });
    team.addTenantUser({ id: memberUserId, tenantId, displayName: "Mona Adel", email: "mona@example.com" });
    team.addTenantUser({ id: outsiderUserId, tenantId, displayName: "Omar Fathy", email: "omar@example.com" });
    team.addTenantUser({
      id: foreignUserId,
      tenantId: otherTenantId,
      displayName: "Other Co",
      email: "other@example.com",
    });
    audit = new MemoryAuditRepository();
    service = new ProjectTeamService(projects, team, audit);
  });

  it("lets a tenant project manager add a member and records an audit event", async () => {
    const member = await service.addMember(admin, projectId, {
      userId: memberUserId,
      role: "project_manager",
    });

    expect(member.userId).toBe(memberUserId);
    expect(member.displayName).toBe("Mona Adel");
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      action: "project.member.add",
      entityType: "project_member",
      result: "success",
      tenantId,
    });
    expect(audit.events[0]?.metadata).toMatchObject({ projectId, memberUserId, role: "project_manager" });
  });

  it("refuses to attach a user from another company", async () => {
    // The service must reject this itself. Assert on the repository call so a
    // permissive persistence layer cannot mask a missing service-level check.
    const attempted: string[] = [];
    const guarded = new ProjectTeamService(
      projects,
      Object.assign(Object.create(Object.getPrototypeOf(team)), team, {
        addMember: async (...args: Parameters<typeof team.addMember>) => {
          attempted.push(args[2].userId);
          return team.addMember(...args);
        },
      }),
      audit,
    );

    await expect(
      guarded.addMember(admin, projectId, { userId: foreignUserId, role: "viewer" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The write must never be reached for a user outside the tenant.
    expect(attempted).toEqual([]);
    expect(team.members).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });

  it("hides a project from another company entirely", async () => {
    await expect(service.listMembers(foreignAdmin, projectId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("hides a project from a tenant user who is not a member", async () => {
    // NOT_FOUND rather than FORBIDDEN so the response does not confirm the
    // project exists to someone who cannot reach it.
    await expect(service.listMembers(outsider, projectId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("grants read access through project membership alone", async () => {
    await service.addMember(admin, projectId, { userId: memberUserId, role: "viewer" });

    const members = await service.listMembers(viewer, projectId);
    expect(members).toHaveLength(1);

    const access = await service.resolveAccess(viewer, projectId);
    expect(access).toMatchObject({ canRead: true, canManage: false, membershipRole: "viewer" });
  });

  it("stops a project viewer from changing the team", async () => {
    await service.addMember(admin, projectId, { userId: memberUserId, role: "viewer" });

    await expect(
      service.addMember(viewer, projectId, { userId: outsiderUserId, role: "viewer" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets a project admin manage the team without tenant-wide rights", async () => {
    await service.addMember(admin, projectId, { userId: memberUserId, role: "project_admin" });

    const added = await service.addMember(viewer, projectId, {
      userId: outsiderUserId,
      role: "viewer",
    });
    expect(added.userId).toBe(outsiderUserId);
  });

  it("keeps at least one project administrator", async () => {
    await service.addMember(admin, projectId, { userId: memberUserId, role: "project_admin" });

    await expect(
      service.updateMemberRole(admin, projectId, memberUserId, { role: "viewer" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(service.removeMember(admin, projectId, memberUserId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("allows demotion once another administrator exists", async () => {
    await service.addMember(admin, projectId, { userId: memberUserId, role: "project_admin" });
    await service.addMember(admin, projectId, { userId: outsiderUserId, role: "project_manager" });

    const updated = await service.updateMemberRole(admin, projectId, memberUserId, {
      role: "viewer",
    });
    expect(updated.role).toBe("viewer");
    expect(audit.events.at(-1)).toMatchObject({ action: "project.member.update" });
  });

  it("rejects an invalid member role", async () => {
    await expect(
      service.addMember(admin, projectId, { userId: memberUserId, role: "owner" }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("creates a stakeholder with an Arabic name and audits it", async () => {
    const stakeholder = await service.createStakeholder(admin, projectId, {
      name: "الشركة السعودية للمقاولات",
      category: "contractor",
      organization: "Riyadh Works",
    });

    expect(stakeholder.name).toBe("الشركة السعودية للمقاولات");
    expect(stakeholder.influence).toBe("medium");
    expect(audit.events.at(-1)).toMatchObject({
      action: "project.stakeholder.create",
      entityType: "project_stakeholder",
    });
  });

  it("does not leak stakeholders across projects or tenants", async () => {
    await service.createStakeholder(admin, projectId, { name: "Client One", category: "client" });

    await expect(service.listStakeholders(foreignAdmin, projectId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("updates and deletes a stakeholder with audit trail", async () => {
    const created = await service.createStakeholder(admin, projectId, {
      name: "Client One",
      category: "client",
    });

    const updated = await service.updateStakeholder(admin, projectId, created.id, {
      influence: "high",
    });
    expect(updated.influence).toBe("high");

    await service.deleteStakeholder(admin, projectId, created.id);
    expect(await service.listStakeholders(admin, projectId)).toHaveLength(0);
    expect(audit.events.at(-1)).toMatchObject({ action: "project.stakeholder.delete" });
  });

  it("reports a missing stakeholder rather than failing silently", async () => {
    await expect(
      service.deleteStakeholder(admin, projectId, "77777777-7777-4777-8777-777777777777"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns project activity to anyone who can read the project", async () => {
    team.activity.push({
      id: "88888888-8888-4888-8888-888888888888",
      action: "project.create",
      entityType: "project",
      entityId: projectId,
      result: "success",
      actorUserId: adminUserId,
      actorName: "Site Owner",
      metadata: {},
      createdAt: "2026-07-25T10:00:00.000Z",
    });

    const activity = await service.listActivity(admin, projectId, {});
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ action: "project.create", actorName: "Site Owner" });
  });
});
