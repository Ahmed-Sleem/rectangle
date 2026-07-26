/**
 * In-memory implementation of the project team repository.
 *
 * It enforces the same tenant scoping as PostgreSQL so route and service tests
 * exercise real authorization behaviour rather than a permissive stub.
 */
import type { ProjectTeamRepository } from "../../src/application/project-team-service.js";
import type {
  AddProjectMemberInput,
  CreateStakeholderInput,
  ProjectActivityRecord,
  ProjectMemberRecord,
  ProjectMemberRole,
  StakeholderRecord,
  UpdateStakeholderInput,
} from "../../src/domain/project-team.js";

export interface MemoryTenantUser {
  id: string;
  tenantId: string;
  displayName: string;
  email: string;
}

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

export class MemoryProjectTeamRepository implements ProjectTeamRepository {
  readonly members: ProjectMemberRecord[] = [];
  readonly stakeholders: StakeholderRecord[] = [];
  readonly activity: ProjectActivityRecord[] = [];
  readonly users: MemoryTenantUser[] = [];

  addTenantUser(user: MemoryTenantUser): void {
    this.users.push(user);
  }

  async listMembers(tenantId: string, projectId: string): Promise<ProjectMemberRecord[]> {
    return this.members.filter(
      (member) => member.tenantId === tenantId && member.projectId === projectId,
    );
  }

  async findMember(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<ProjectMemberRecord | null> {
    return (
      this.members.find(
        (member) =>
          member.tenantId === tenantId &&
          member.projectId === projectId &&
          member.userId === userId,
      ) ?? null
    );
  }

  async tenantUserExists(tenantId: string, userId: string): Promise<boolean> {
    return this.users.some((user) => user.tenantId === tenantId && user.id === userId);
  }

  async addMember(
    tenantId: string,
    projectId: string,
    input: AddProjectMemberInput,
  ): Promise<ProjectMemberRecord | null> {
    const user = this.users.find((item) => item.tenantId === tenantId && item.id === input.userId);
    if (!user) return null;

    const existing = await this.findMember(tenantId, projectId, input.userId);
    if (existing) {
      existing.role = input.role;
      existing.updatedAt = new Date().toISOString();
      return existing;
    }

    const now = new Date().toISOString();
    const member: ProjectMemberRecord = {
      projectId,
      tenantId,
      userId: input.userId,
      role: input.role,
      displayName: user.displayName,
      email: user.email,
      createdAt: now,
      updatedAt: now,
    };
    this.members.push(member);
    return member;
  }

  async updateMemberRole(
    tenantId: string,
    projectId: string,
    userId: string,
    role: ProjectMemberRole,
  ): Promise<ProjectMemberRecord | null> {
    const member = await this.findMember(tenantId, projectId, userId);
    if (!member) return null;
    member.role = role;
    member.updatedAt = new Date().toISOString();
    return member;
  }

  /**
   * Open tasks assigned to the removed member, keyed by user id. Set by a test
   * that wants to prove the removal releases them; the real repository does
   * this in the same transaction as the delete.
   */
  openTasksByAssignee = new Map<string, number>();
  /** Open risks owned by the removed member, released by the same transaction. */
  openRisksByOwner = new Map<string, number>();

  async removeMember(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<{ removed: boolean; unassignedTasks: number; unassignedRisks: number }> {
    const index = this.members.findIndex(
      (member) =>
        member.tenantId === tenantId && member.projectId === projectId && member.userId === userId,
    );
    if (index === -1) return { removed: false, unassignedTasks: 0, unassignedRisks: 0 };
    this.members.splice(index, 1);

    const unassignedTasks = this.openTasksByAssignee.get(userId) ?? 0;
    this.openTasksByAssignee.delete(userId);
    const unassignedRisks = this.openRisksByOwner.get(userId) ?? 0;
    this.openRisksByOwner.delete(userId);
    return { removed: true, unassignedTasks, unassignedRisks };
  }

  async countAdmins(tenantId: string, projectId: string): Promise<number> {
    return this.members.filter(
      (member) =>
        member.tenantId === tenantId &&
        member.projectId === projectId &&
        (member.role === "project_admin" || member.role === "project_manager"),
    ).length;
  }

  async listStakeholders(tenantId: string, projectId: string): Promise<StakeholderRecord[]> {
    return this.stakeholders.filter(
      (item) => item.tenantId === tenantId && item.projectId === projectId,
    );
  }

  async createStakeholder(
    tenantId: string,
    projectId: string,
    input: CreateStakeholderInput,
  ): Promise<StakeholderRecord> {
    const now = new Date().toISOString();
    const record: StakeholderRecord = {
      id: nextId(),
      projectId,
      tenantId,
      name: input.name,
      ...(input.organization ? { organization: input.organization } : {}),
      category: input.category,
      influence: input.influence,
      interest: input.interest,
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.stakeholders.push(record);
    return record;
  }

  async findStakeholder(
    tenantId: string,
    projectId: string,
    id: string,
  ): Promise<StakeholderRecord | null> {
    return (
      this.stakeholders.find(
        (item) => item.tenantId === tenantId && item.projectId === projectId && item.id === id,
      ) ?? null
    );
  }

  async updateStakeholder(
    tenantId: string,
    projectId: string,
    id: string,
    input: UpdateStakeholderInput,
  ): Promise<StakeholderRecord | null> {
    const record = await this.findStakeholder(tenantId, projectId, id);
    if (!record) return null;
    Object.assign(record, input, { updatedAt: new Date().toISOString() });
    return record;
  }

  async deleteStakeholder(tenantId: string, projectId: string, id: string): Promise<boolean> {
    const index = this.stakeholders.findIndex(
      (item) => item.tenantId === tenantId && item.projectId === projectId && item.id === id,
    );
    if (index === -1) return false;
    this.stakeholders.splice(index, 1);
    return true;
  }

  async listActivity(
    tenantId: string,
    projectId: string,
    limit: number,
  ): Promise<ProjectActivityRecord[]> {
    return this.activity
      .filter(
        (event) =>
          event.entityId === projectId ||
          (event.metadata as { projectId?: string }).projectId === projectId,
      )
      .slice(0, limit);
  }
}
