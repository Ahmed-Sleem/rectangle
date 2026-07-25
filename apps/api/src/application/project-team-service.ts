/**
 * Use-case layer for the project team, stakeholder register, and activity feed.
 *
 * Authorization here is object level, not just permission level: a caller must
 * be able to reach *this* project, either through a tenant-wide project role or
 * through membership of the project itself.
 */
import { canManageProjects, requireProjectRead, type UserPrincipal } from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import { parseProjectId } from "../domain/project.js";
import type {
  AddProjectMemberInput,
  CreateStakeholderInput,
  UpdateStakeholderInput,
} from "../domain/project-team.js";
import {
  isProjectAdminRole,
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
  ): Promise<{ removed: boolean; unassignedTasks: number }>;
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
  listActivity(tenantId: string, projectId: string, limit: number): Promise<ProjectActivityRecord[]>;
}

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
   * A tenant-wide project manager can manage any project. Otherwise the caller
   * must be a member, and only project admin roles may change the team.
   */
  async resolveAccess(actor: UserPrincipal, projectId: string): Promise<ProjectAccess> {
    requireProjectRead(actor);

    const project = await this.projects.findByIdForTenant(actor.tenantId, projectId);
    if (!project) {
      throw new DomainError("NOT_FOUND", "Project was not found.");
    }

    if (canManageProjects(actor)) {
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

  private async requireManage(actor: UserPrincipal, projectId: string): Promise<void> {
    const access = await this.resolveAccess(actor, projectId);
    if (!access.canManage) {
      throw new DomainError("FORBIDDEN", "You do not have permission to manage this project.");
    }
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
    await this.resolveAccess(actor, projectId);
    const query = parseProjectActivityQuery(rawQuery);
    return this.team.listActivity(actor.tenantId, projectId, query.limit);
  }
}
