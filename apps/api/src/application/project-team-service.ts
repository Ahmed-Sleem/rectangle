/**
 * Use-case layer for the project team, stakeholder register, and activity feed.
 *
 * Authorization here is object level, not just permission level: a caller must
 * be able to reach *this* project, either through a tenant-wide project role or
 * through membership of the project itself.
 */
import {
  canReachAllProjects,
  hasPermission,
  isCompanyAdministrator,
  requireProjectRead,
  type UserPrincipal,
} from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import { z } from "zod";
import { parseProjectId, projectCapabilityIdsSchema } from "../domain/project.js";
import type {
  AddProjectMemberInput,
  CreateStakeholderInput,
  UpdateStakeholderInput,
} from "../domain/project-team.js";
import {
  isProjectAdminRole,
  roleGrantsOnProject,
  parseAddProjectMemberInput,
  parseCreateStakeholderInput,
  parseProjectActivityQuery,
  parseStakeholderId,
  parseUpdateProjectMemberInput,
  parseUpdateStakeholderInput,
  parseUserId,
  type ProjectActivityRecord,
  type ProjectMemberRecord,
  type StakeholderRecord,
} from "../domain/project-team.js";
import type { AuditRepository, ProjectsRepository } from "./project-service.js";

export interface ProjectTeamRepository {
  listMembers(tenantId: string, projectId: string): Promise<ProjectMemberRecord[]>;
  findMember(tenantId: string, projectId: string, userId: string): Promise<ProjectMemberRecord | null>;
  /** Every project in the tenant this person is on, as project id to role. */
  findMembershipsForUser(tenantId: string, userId: string): Promise<Array<{ projectId: string; role: ProjectMemberRecord["role"] }>>;
  /** Of the ids given, the ones that are real projects in this tenant. */
  filterExistingProjectIds(tenantId: string, projectIds: readonly string[]): Promise<string[]>;
  tenantUserExists(tenantId: string, userId: string): Promise<boolean>;
  addMember(
    tenantId: string,
    projectId: string,
    input: AddProjectMemberInput,
  ): Promise<ProjectMemberRecord | null>;
  updateMemberRole(
    tenantId: string,
    projectId: string,
    userId: string,
    role: ProjectMemberRecord["role"],
  ): Promise<ProjectMemberRecord | null>;
  removeMember(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<{ removed: boolean; unassignedTasks: number; unassignedRisks: number }>;
  countAdmins(tenantId: string, projectId: string): Promise<number>;
  listStakeholders(tenantId: string, projectId: string): Promise<StakeholderRecord[]>;
  createStakeholder(
    tenantId: string,
    projectId: string,
    input: CreateStakeholderInput,
  ): Promise<StakeholderRecord>;
  findStakeholder(tenantId: string, projectId: string, id: string): Promise<StakeholderRecord | null>;
  updateStakeholder(
    tenantId: string,
    projectId: string,
    id: string,
    input: UpdateStakeholderInput,
  ): Promise<StakeholderRecord | null>;
  deleteStakeholder(tenantId: string, projectId: string, id: string): Promise<boolean>;
  /** `onlyActorUserId` restricts the feed to one person's own actions. */
  listActivity(
    tenantId: string,
    projectId: string,
    limit: number,
    onlyActorUserId?: string,
  ): Promise<ProjectActivityRecord[]>;
}

/**
 * What the caller may do on one project.
 *
 * `canManage` answers *reach with authority over this project* — company
 * administrator, head office through `projects.manage_all`, or a project admin
 * role on this project. It deliberately does not answer "may they edit", which
 * is a capability question the caller asks separately with the relevant atomic
 * permission. Keeping them apart is the whole point of the model: reach says
 * which projects, capability says which actions.
 */
/**
 * The capabilities a page needs to decide what to offer on one project.
 *
 * Named individually rather than returned as a list of permission strings so
 * that adding one is a compile error at every call site rather than a lookup
 * that silently returns false.
 */
export interface ProjectCapabilities {
  editProject: boolean;
  archiveProject: boolean;
  deleteProject: boolean;
  manageTeam: boolean;
  createTask: boolean;
  editTask: boolean;
  deleteTask: boolean;
  createRisk: boolean;
  editRisk: boolean;
  deleteRisk: boolean;
}

export interface ProjectAccess {
  canRead: boolean;
  canManage: boolean;
  membershipRole?: ProjectMemberRecord["role"];
  /**
   * What this caller may actually do here.
   *
   * The client used to answer this for itself from the company-wide permission
   * alone, and was wrong in both directions: it offered a Create button on a
   * project the person was not on, which failed on click, and it withheld one
   * from a project manager whose project role granted the action — making the
   * appointment decorative. Both are the same mistake, a second implementation
   * of a rule that already exists here.
   */
  capabilities: ProjectCapabilities;
}

/** Validates and bounds the ids a capability lookup asks about. */
function parseProjectCapabilityIds(raw: unknown): string[] {
  const parsed = projectCapabilityIdsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError("VALIDATION_FAILED", "Project ids are invalid.", z.treeifyError(parsed.error));
  }
  return parsed.data;
}

export class ProjectTeamService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly team: ProjectTeamRepository,
    private readonly audit: AuditRepository,
  ) {}

  /**
   * Resolves what the caller may do on one project.
   *
   * Membership is the authority, and that is the correction this carries.
   * A company-wide grant used to answer this on its own, so anyone who could
   * create a project could also edit and destroy every project in the company
   * without ever being part of it. Now only a company administrator or the
   * explicit head-office permission reaches past membership, and everyone else
   * gets exactly the projects they were put on.
   */
  async resolveAccess(actor: UserPrincipal, projectId: string): Promise<ProjectAccess> {
    /*
     * Deliberately not `requireProjectRead`. That guards the company-wide
     * register; this resolves one project, where membership is the authority.
     * Requiring the register here would lock a member out of the very project
     * they were added to, and a guest out of everything.
     */
    const project = await this.projects.findByIdForTenant(actor.tenantId, projectId);
    if (!project) {
      throw new DomainError("NOT_FOUND", "Project was not found.");
    }

    if (canReachAllProjects(actor)) {
      const reachesEverything = { canRead: true, canManage: true };
      return { ...reachesEverything, capabilities: this.capabilitiesFor(actor, reachesEverything) };
    }

    const membership = await this.team.findMember(actor.tenantId, projectId, actor.userId);
    if (!membership) {
      // Same response as a missing project: never reveal that a project exists
      // to someone who cannot reach it.
      throw new DomainError("NOT_FOUND", "Project was not found.");
    }

    const access = {
      canRead: true,
      canManage: isProjectAdminRole(membership.role),
      membershipRole: membership.role,
    };
    return { ...access, capabilities: this.capabilitiesFor(actor, access) };
  }

  /**
   * The same answer as `resolveAccess`, for many projects in one round trip.
   *
   * The register and the task and risk lists span projects, and asking per row
   * would be a request per project on every render. One membership lookup
   * answers all of them, and the capabilities are derived by the same private
   * method, so the bulk answer cannot drift from the single one.
   */
  async capabilitiesForProjects(
    actor: UserPrincipal,
    rawProjectIds: unknown,
  ): Promise<Record<string, ProjectCapabilities>> {
    const projectIds = parseProjectCapabilityIds(rawProjectIds);
    if (projectIds.length === 0) return {};

    /*
     * Only projects that exist. Answering for an id that is not a project told
     * the caller something untrue and disagreed with `/access`, which reports
     * the same id as not found — two endpoints meant to give one answer giving
     * two. An id that survives this is real; one that does not is simply absent
     * from the reply, exactly as an unreachable project is.
     */
    const existing = await this.team.filterExistingProjectIds(actor.tenantId, projectIds);
    if (existing.length === 0) return {};

    if (canReachAllProjects(actor)) {
      const reaching = { canRead: true, canManage: true };
      const capabilities = this.capabilitiesFor(actor, reaching);
      return Object.fromEntries(existing.map((id) => [id, capabilities]));
    }

    const memberships = await this.team.findMembershipsForUser(actor.tenantId, actor.userId);
    const byProject = new Map(memberships.map((m) => [m.projectId, m.role]));

    const answer: Record<string, ProjectCapabilities> = {};
    for (const projectId of existing) {
      const role = byProject.get(projectId);
      // Absent means unreachable, and an unreachable project is reported as
      // no capabilities rather than omitted, so a caller iterating ids does
      // not have to treat "missing" and "refused" as different cases.
      const access = {
        canRead: role !== undefined,
        canManage: role !== undefined && isProjectAdminRole(role),
        ...(role !== undefined ? { membershipRole: role } : {}),
      };
      answer[projectId] = this.capabilitiesFor(actor, access);
    }
    return answer;
  }

  /**
   * Answers, for one project, every question a page needs to ask.
   *
   * Deliberately expressed by calling the same predicate the guards call rather
   * than by restating the rule. If this drifted from `requireProjectCapability`
   * the interface would confidently offer actions the server then refuses,
   * which is worse than not offering them at all.
   */
  private capabilitiesFor(
    actor: UserPrincipal,
    access: Omit<ProjectAccess, "capabilities">,
  ): ProjectCapabilities {
    const may = (permission: Parameters<typeof hasPermission>[1]): boolean =>
      this.allows(actor, access, permission);

    return {
      editProject: may("projects.edit"),
      archiveProject: may("projects.archive"),
      /*
       * Deletion is not a capability like the others and is not derived like
       * one. It requires administering this project specifically, or the
       * company: the head-office permission that reaches every project is
       * deliberately not enough to destroy one. Mirrors
       * `requireProjectDeletion`.
       */
      deleteProject:
        isCompanyAdministrator(actor) ||
        (access.membershipRole === "project_admin" && hasPermission(actor, "projects.delete")),
      manageTeam: may("project_team.manage"),
      createTask: may("tasks.create"),
      editTask: may("tasks.edit"),
      deleteTask: may("tasks.delete"),
      createRisk: may("risks.create"),
      editRisk: may("risks.edit"),
      deleteRisk: may("risks.delete"),
    };
  }

  /**
   * The single rule: reach, then capability from either the company-wide
   * permission or the project role. `requireProjectCapability` throws on the
   * same answer this returns.
   */
  private allows(
    actor: UserPrincipal,
    access: Omit<ProjectAccess, "capabilities">,
    permission: Parameters<typeof hasPermission>[1],
  ): boolean {
    if (!access.canManage) return false;
    const grantedByRole =
      access.membershipRole !== undefined &&
      roleGrantsOnProject(access.membershipRole, permission);
    return grantedByRole || hasPermission(actor, permission);
  }

  /**
   * Reach *and* capability, which is the rule the whole model rests on.
   *
   * Reaching a project says which records a person is allowed near. It never
   * says what they may do once there — that is the atomic permission, checked
   * here in the same breath so no call site can satisfy one and forget the
   * other. Company administrators hold every permission, so they pass the
   * second test by holding it rather than by being excused from it.
   */
  async requireProjectCapability(
    actor: UserPrincipal,
    projectId: string,
    permission: Parameters<typeof hasPermission>[1],
  ): Promise<ProjectAccess> {
    const access = await this.resolveAccess(actor, projectId);
    if (!access.canManage) {
      throw new DomainError("FORBIDDEN", "You do not have permission to manage this project.");
    }

    /*
     * The same predicate the reported capabilities are built from, called
     * rather than restated. Written twice, the guard and the answer the page
     * renders would eventually disagree, and the interface would offer actions
     * that fail on click — which is the fault this change exists to remove.
     *
     * The capability may come from either side, and both are legitimate: a
     * company-wide permission grants the action everywhere the person can
     * reach, and a project role grants it on the one project it is held on,
     * which is what being made administrator of a project has to mean.
     */
    if (!this.allows(actor, access, permission)) {
      throw new DomainError("FORBIDDEN", "You do not have permission to perform this action.");
    }
    return access;
  }

  /**
   * Destroying a project is held to a stricter rule than changing one.
   *
   * Deletion takes the tasks, risks and history with it and cannot be undone,
   * so the head-office reach that is enough to edit any project is deliberately
   * not enough to destroy one. It requires being the administrator of that
   * specific project, or administering the company. Archiving remains open to
   * anyone who can manage the project, because it is the reversible answer and
   * should be the easy one to reach for.
   */
  async requireProjectDeletion(actor: UserPrincipal, projectId: string): Promise<void> {
    if (isCompanyAdministrator(actor)) return;

    if (!hasPermission(actor, "projects.delete")) {
      throw new DomainError("FORBIDDEN", "You do not have permission to delete projects.");
    }

    const membership = await this.team.findMember(actor.tenantId, projectId, actor.userId);
    if (membership?.role !== "project_admin") {
      throw new DomainError(
        "FORBIDDEN",
        "Deleting a project requires being its project administrator. Archive it instead.",
      );
    }
  }

  /**
   * Members and stakeholders are one register, so one capability governs both.
   * Reach still has to hold as well; `requireProjectCapability` asks both.
   */
  private async requireManage(actor: UserPrincipal, projectId: string): Promise<void> {
    await this.requireProjectCapability(actor, projectId, "project_team.manage");
  }

  async listMembers(actor: UserPrincipal, rawProjectId: unknown): Promise<ProjectMemberRecord[]> {
    const projectId = parseProjectId(rawProjectId);
    await this.resolveAccess(actor, projectId);
    return this.team.listMembers(actor.tenantId, projectId);
  }

  async addMember(
    actor: UserPrincipal,
    rawProjectId: unknown,
    rawInput: unknown,
  ): Promise<ProjectMemberRecord> {
    const projectId = parseProjectId(rawProjectId);
    await this.requireManage(actor, projectId);
    const input = parseAddProjectMemberInput(rawInput);

    // Without this check a manager could attach a user from another tenant.
    const userExists = await this.team.tenantUserExists(actor.tenantId, input.userId);
    if (!userExists) {
      throw new DomainError("NOT_FOUND", "That person was not found in your company.");
    }

    const member = await this.team.addMember(actor.tenantId, projectId, input);
    if (!member) {
      throw new DomainError("NOT_FOUND", "Project was not found.");
    }

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "project.member.add",
      entityType: "project_member",
      entityId: projectId,
      result: "success",
      metadata: { projectId, memberUserId: member.userId, role: member.role },
    });
    return member;
  }

  async updateMemberRole(
    actor: UserPrincipal,
    rawProjectId: unknown,
    rawUserId: unknown,
    rawInput: unknown,
  ): Promise<ProjectMemberRecord> {
    const projectId = parseProjectId(rawProjectId);
    await this.requireManage(actor, projectId);
    const userId = parseUserId(rawUserId);
    const input = parseUpdateProjectMemberInput(rawInput);

    const current = await this.team.findMember(actor.tenantId, projectId, userId);
    if (!current) {
      throw new DomainError("NOT_FOUND", "That person is not on this project.");
    }

    // Demoting the last administrator would leave the project unmanageable.
    if (isProjectAdminRole(current.role) && !isProjectAdminRole(input.role)) {
      const admins = await this.team.countAdmins(actor.tenantId, projectId);
      if (admins <= 1) {
        throw new DomainError(
          "CONFLICT",
          "This project needs at least one project manager or project admin.",
        );
      }
    }

    const member = await this.team.updateMemberRole(actor.tenantId, projectId, userId, input.role);
    if (!member) {
      throw new DomainError("NOT_FOUND", "That person is not on this project.");
    }

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "project.member.update",
      entityType: "project_member",
      entityId: projectId,
      result: "success",
      metadata: { projectId, memberUserId: userId, from: current.role, to: member.role },
    });
    return member;
  }

  async removeMember(
    actor: UserPrincipal,
    rawProjectId: unknown,
    rawUserId: unknown,
  ): Promise<void> {
    const projectId = parseProjectId(rawProjectId);
    await this.requireManage(actor, projectId);
    const userId = parseUserId(rawUserId);

    const current = await this.team.findMember(actor.tenantId, projectId, userId);
    if (!current) {
      throw new DomainError("NOT_FOUND", "That person is not on this project.");
    }

    if (isProjectAdminRole(current.role)) {
      const admins = await this.team.countAdmins(actor.tenantId, projectId);
      if (admins <= 1) {
        throw new DomainError(
          "CONFLICT",
          "This project needs at least one project manager or project admin.",
        );
      }
    }

    const outcome = await this.team.removeMember(actor.tenantId, projectId, userId);
    if (!outcome.removed) {
      throw new DomainError("NOT_FOUND", "That person is not on this project.");
    }

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "project.member.remove",
      entityType: "project_member",
      entityId: projectId,
      result: "success",
      // Work released by the removal is recorded, because tasks silently
      // losing their owner is exactly the kind of change someone later needs
      // to explain.
      metadata: {
        projectId,
        memberUserId: userId,
        role: current.role,
        unassignedTasks: outcome.unassignedTasks,
        unassignedRisks: outcome.unassignedRisks,
      },
    });
  }

  async listStakeholders(actor: UserPrincipal, rawProjectId: unknown): Promise<StakeholderRecord[]> {
    const projectId = parseProjectId(rawProjectId);
    await this.resolveAccess(actor, projectId);
    return this.team.listStakeholders(actor.tenantId, projectId);
  }

  async createStakeholder(
    actor: UserPrincipal,
    rawProjectId: unknown,
    rawInput: unknown,
  ): Promise<StakeholderRecord> {
    const projectId = parseProjectId(rawProjectId);
    await this.requireManage(actor, projectId);
    const input = parseCreateStakeholderInput(rawInput);

    const stakeholder = await this.team.createStakeholder(actor.tenantId, projectId, input);

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "project.stakeholder.create",
      entityType: "project_stakeholder",
      entityId: stakeholder.id,
      result: "success",
      metadata: { projectId, name: stakeholder.name, category: stakeholder.category },
    });
    return stakeholder;
  }

  async updateStakeholder(
    actor: UserPrincipal,
    rawProjectId: unknown,
    rawStakeholderId: unknown,
    rawInput: unknown,
  ): Promise<StakeholderRecord> {
    const projectId = parseProjectId(rawProjectId);
    await this.requireManage(actor, projectId);
    const stakeholderId = parseStakeholderId(rawStakeholderId);
    const input = parseUpdateStakeholderInput(rawInput);

    const updated = await this.team.updateStakeholder(
      actor.tenantId,
      projectId,
      stakeholderId,
      input,
    );
    if (!updated) {
      throw new DomainError("NOT_FOUND", "Stakeholder was not found.");
    }

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "project.stakeholder.update",
      entityType: "project_stakeholder",
      entityId: stakeholderId,
      result: "success",
      metadata: { projectId, changedFields: Object.keys(input) },
    });
    return updated;
  }

  async deleteStakeholder(
    actor: UserPrincipal,
    rawProjectId: unknown,
    rawStakeholderId: unknown,
  ): Promise<void> {
    const projectId = parseProjectId(rawProjectId);
    await this.requireManage(actor, projectId);
    const stakeholderId = parseStakeholderId(rawStakeholderId);

    const removed = await this.team.deleteStakeholder(actor.tenantId, projectId, stakeholderId);
    if (!removed) {
      throw new DomainError("NOT_FOUND", "Stakeholder was not found.");
    }

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "project.stakeholder.delete",
      entityType: "project_stakeholder",
      entityId: stakeholderId,
      result: "success",
      metadata: { projectId },
    });
  }

  async listActivity(
    actor: UserPrincipal,
    rawProjectId: unknown,
    rawQuery: unknown,
  ): Promise<ProjectActivityRecord[]> {
    const projectId = parseProjectId(rawProjectId);
    const access = await this.resolveAccess(actor, projectId);
    const query = parseProjectActivityQuery(rawQuery);

    /*
     * Whoever runs the project sees its whole history; everyone else on it sees
     * their own. `canManage` is true for company administrators and for project
     * admins and managers, which is exactly the set entitled to the full feed.
     */
    return this.team.listActivity(
      actor.tenantId,
      projectId,
      query.limit,
      access.canManage ? undefined : actor.userId,
    );
  }
}
