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

const admin: UserPrincipal = { tenantId, userId: adminUserId, roles: ["admin"], permissions: [] };
const viewer: UserPrincipal = { tenantId, userId: memberUserId, roles: ["member"], permissions: [] };
const outsider: UserPrincipal = { tenantId, userId: outsiderUserId, roles: ["member"], permissions: [] };
const foreignAdmin: UserPrincipal = {
  tenantId: otherTenantId,
  userId: foreignUserId,
  roles: ["admin"],
  permissions: [],
};

class StubProjectsRepository implements ProjectsRepository {
  async deleteForTenant(): Promise<boolean> {
    return true;
  }

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

  it("releases the removed member's open work and records how much", async () => {
    await service.addMember(admin, projectId, { userId: memberUserId, role: "viewer" });
    // Two open tasks are assigned to this person on this project.
    team.openTasksByAssignee.set(memberUserId, 2);
    team.openRisksByOwner.set(memberUserId, 3);

    await service.removeMember(admin, projectId, memberUserId);

    // Tasks may only be assigned to members, so leaving them assigned would
    // put the database in a state the service treats as impossible.
    expect(team.openTasksByAssignee.has(memberUserId)).toBe(false);
    const event = audit.events.find((entry) => entry.action === "project.member.remove");
    expect(event?.metadata).toMatchObject({ unassignedTasks: 2, unassignedRisks: 3 });
  });

  it("records a removal that released no work", async () => {
    await service.addMember(admin, projectId, { userId: memberUserId, role: "viewer" });

    await service.removeMember(admin, projectId, memberUserId);

    const event = audit.events.find((entry) => entry.action === "project.member.remove");
    expect(event?.metadata).toMatchObject({ unassignedTasks: 0 });
  });
});

describe("the capabilities reported for one project", () => {
  /*
   * The client used to answer this for itself from the company-wide permission
   * alone, and was wrong in both directions: it offered a Create button on a
   * project the person was not on, which failed on click, and it withheld one
   * from a project manager whose project role granted the action, making the
   * appointment decorative.
   *
   * The property that matters is not any particular answer but that the
   * reported capability and the guard always agree — so most of what follows
   * asks both and requires the same verdict, for every permission, for every
   * kind of caller.
   */
  let projects: StubProjectsRepository;
  let team: MemoryProjectTeamRepository;
  let service: ProjectTeamService;

  beforeEach(() => {
    projects = new StubProjectsRepository();
    projects.seed(buildProject());
    team = new MemoryProjectTeamRepository();
    team.addTenantUser({ id: adminUserId, tenantId, displayName: "Site Owner", email: "owner@example.com" });
    team.addTenantUser({ id: memberUserId, tenantId, displayName: "Mona Adel", email: "mona@example.com" });
    service = new ProjectTeamService(projects, team, new MemoryAuditRepository());
  });

  /** Every capability beside the permission the guard checks for it. */
  const PAIRS = [
    ["editProject", "projects.edit"],
    ["archiveProject", "projects.archive"],
    ["manageTeam", "project_team.manage"],
    ["createTask", "tasks.create"],
    ["editTask", "tasks.edit"],
    ["deleteTask", "tasks.delete"],
    ["createRisk", "risks.create"],
    ["editRisk", "risks.edit"],
    ["deleteRisk", "risks.delete"],
  ] as const;

  async function guardAllows(actor: UserPrincipal, permission: string): Promise<boolean> {
    try {
      await service.requireProjectCapability(actor, projectId, permission as never);
      return true;
    } catch {
      return false;
    }
  }

  it("gives a project manager the actions their project role grants, with no company permission", async () => {
    /*
     * The missing-button half of the bug, and the reason a company-wide flag
     * cannot answer this: Mona holds nothing at company level. Her authority
     * is entirely the role she was given on this one project.
     */
    await service.addMember(admin, projectId, { userId: memberUserId, role: "project_manager" });

    const access = await service.resolveAccess(viewer, projectId);

    expect(access.capabilities.createTask).toBe(true);
    expect(access.capabilities.editTask).toBe(true);
    expect(access.capabilities.createRisk).toBe(true);
    expect(access.capabilities.manageTeam).toBe(true);
    // Granted by the role, and still not enough to destroy the project.
    expect(access.capabilities.deleteProject).toBe(false);
  });

  it("gives a project viewer none of the write actions", async () => {
    await service.addMember(admin, projectId, { userId: memberUserId, role: "viewer" });

    const access = await service.resolveAccess(viewer, projectId);

    expect(access.canRead).toBe(true);
    for (const [capability] of PAIRS) {
      expect(access.capabilities[capability], capability).toBe(false);
    }
  });

  it("agrees with the guard for every permission, for a project manager", async () => {
    await service.addMember(admin, projectId, { userId: memberUserId, role: "project_manager" });
    const access = await service.resolveAccess(viewer, projectId);

    for (const [capability, permission] of PAIRS) {
      expect(access.capabilities[capability], `${capability} vs ${permission}`).toBe(
        await guardAllows(viewer, permission),
      );
    }
  });

  it("agrees with the guard for every permission, for a project viewer", async () => {
    await service.addMember(admin, projectId, { userId: memberUserId, role: "viewer" });
    const access = await service.resolveAccess(viewer, projectId);

    for (const [capability, permission] of PAIRS) {
      expect(access.capabilities[capability], `${capability} vs ${permission}`).toBe(
        await guardAllows(viewer, permission),
      );
    }
  });

  it("refuses every write to somebody who can reach the project but not manage it", async () => {
    /*
     * The case that exposes a capability set built without consulting reach.
     * An external collaborator is a member — they resolve, they can read — and
     * `canManage` is false for them, so every write must be false even when
     * the company-wide permission is held. Break-testing found this missing:
     * removing the `canManage` guard from the derivation left every other test
     * in this file green, because nobody else here reads a project they may
     * not manage.
     */
    await service.addMember(admin, projectId, {
      userId: memberUserId,
      role: "external_collaborator",
    });
    const collaborator: UserPrincipal = {
      tenantId,
      userId: memberUserId,
      roles: ["member"],
      // Deliberately generous at company level. Reach decides, not this.
      permissions: ["tasks.create", "tasks.edit", "risks.create", "project_team.manage"],
    };

    const access = await service.resolveAccess(collaborator, projectId);

    expect(access.canRead).toBe(true);
    expect(access.canManage).toBe(false);
    for (const [capability, permission] of PAIRS) {
      expect(access.capabilities[capability], capability).toBe(false);
      expect(await guardAllows(collaborator, permission), permission).toBe(false);
    }
  });

  it("agrees with the guard for every permission, for a company administrator", async () => {
    const access = await service.resolveAccess(admin, projectId);

    for (const [capability, permission] of PAIRS) {
      expect(access.capabilities[capability], `${capability} vs ${permission}`).toBe(
        await guardAllows(admin, permission),
      );
    }
  });

  it("lets a company administrator delete, and head office not", async () => {
    /*
     * Deletion is the one capability not derived like the others: reaching
     * every project is enough to edit any of them and deliberately not enough
     * to destroy one, because it takes the tasks, risks and history with it.
     */
    const headOffice: UserPrincipal = {
      tenantId,
      userId: memberUserId,
      roles: ["member"],
      permissions: ["projects.read", "projects.manage_all", "projects.delete"],
    };

    expect((await service.resolveAccess(admin, projectId)).capabilities.deleteProject).toBe(true);
    expect((await service.resolveAccess(headOffice, projectId)).capabilities.deleteProject).toBe(false);
  });

  it("lets a project admin holding projects.delete delete their own project", async () => {
    await service.addMember(admin, projectId, { userId: memberUserId, role: "project_admin" });
    const deleter: UserPrincipal = {
      tenantId,
      userId: memberUserId,
      roles: ["member"],
      permissions: ["projects.delete"],
    };

    expect((await service.resolveAccess(deleter, projectId)).capabilities.deleteProject).toBe(true);
  });
});

describe("capabilities for many projects at once", () => {
  /*
   * This method had no test of its own, and that is how two faults shipped: it
   * answered for ids that are not projects, and it carried its ids in a query
   * string that the server refused at around four hundred of them.
   */
  let projects: StubProjectsRepository;
  let team: MemoryProjectTeamRepository;
  let service: ProjectTeamService;

  const ghost = "77777777-7777-4777-8777-777777777777";

  beforeEach(() => {
    projects = new StubProjectsRepository();
    projects.seed(buildProject());
    team = new MemoryProjectTeamRepository();
    team.seedProject(projectId);
    team.addTenantUser({ id: adminUserId, tenantId, displayName: "Site Owner", email: "owner@example.com" });
    team.addTenantUser({ id: memberUserId, tenantId, displayName: "Mona Adel", email: "mona@example.com" });
    service = new ProjectTeamService(projects, team, new MemoryAuditRepository());
  });

  it("says nothing about an id that is not a project", async () => {
    /*
     * It used to answer `true` for any id at all when the caller reaches every
     * project — including strings that are not identifiers — because it never
     * asked the database. `/access` reports the same id as not found, so the
     * two endpoints contradicted each other.
     */
    const answer = await service.capabilitiesForProjects(admin, { projectIds: [ghost] });

    expect(answer).toEqual({});
  });

  it("answers for the real ids and drops the phantom ones from the same request", async () => {
    const answer = await service.capabilitiesForProjects(admin, {
      projectIds: [projectId, ghost],
    });

    expect(Object.keys(answer)).toEqual([projectId]);
  });

  it("agrees with resolveAccess for the same project", async () => {
    await service.addMember(admin, projectId, { userId: memberUserId, role: "project_manager" });

    const single = await service.resolveAccess(viewer, projectId);
    const bulk = await service.capabilitiesForProjects(viewer, { projectIds: [projectId] });

    expect(bulk[projectId]).toEqual(single.capabilities);
  });

  it("reports no capabilities on a project the caller cannot reach", async () => {
    // Present in the answer with everything false, rather than absent, so a
    // caller iterating ids need not treat "missing" and "refused" differently.
    const answer = await service.capabilitiesForProjects(viewer, { projectIds: [projectId] });

    expect(answer[projectId]).toBeDefined();
    expect(Object.values(answer[projectId]!).every((allowed) => allowed === false)).toBe(true);
  });

  it("refuses an id that is not a uuid", async () => {
    await expect(
      service.capabilitiesForProjects(admin, { projectIds: ["' or 1=1 --"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("refuses more ids than any register would ask for", async () => {
    // The list is caller-controlled and the answer is one entry per id, so it
    // is bounded rather than trusted.
    const tooMany = Array.from({ length: 201 }, () => ghost);

    await expect(
      service.capabilitiesForProjects(admin, { projectIds: tooMany }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("returns nothing for an empty request rather than failing", async () => {
    expect(await service.capabilitiesForProjects(admin, { projectIds: [] })).toEqual({});
  });
});
