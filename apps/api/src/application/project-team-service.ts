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
import { parseProjectId } from "../domain/project.js";
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
export interface ProjectAccess {
  canRead: boolean;
  canManage: boolean;
  membershipRole?: ProjectMemberRecord["role"];
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
      return { canRead: true, canManage: true };
    }

    const membership = await this.team.findMember(actor.tenantId, projectId, actor.userId);
    if (!membership) {
      // Same response as a missing project: never reveal that a project exists
      // to someone who cannot reach it.
      throw new DomainError("NOT_FOUND", "Project was not found.");
    }

    return {
      canRead: true,
      canManage: isProjectAdminRole(membership.role),
      membershipRole: membership.role,
    };
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
     * The capability can come from either side, and both are legitimate.
     *
     * A company-wide permission grants the action everywhere the person can
     * reach. A project role grants it on the one project it is held on, which
     * is what being made administrator of a project has to mean — otherwise
     * the appointment is decorative and a site team has to ask head office
     * before adding its own people.
     */
    const grantedByRole =
      access.membershipRole !== undefined &&
      roleGrantsOnProject(access.membershipRole, permission);
    if (!grantedByRole && !hasPermission(actor, permission)) {
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
