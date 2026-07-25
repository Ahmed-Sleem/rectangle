/**
 * Use-case layer for tasks.
 *
 * Authorization is object level and delegated to the project: reaching a task
 * means being able to reach the project it belongs to. That keeps one answer to
 * "who can see this project's work" instead of a second, drifting copy.
 */
import { canManageProjects, type UserPrincipal } from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import { parseProjectId } from "../domain/project.js";
import {
  assertTransition,
  isTerminalTaskStatus,
  parseCreateCommentInput,
  parseCreateTaskInput,
  parseTaskId,
  parseTaskListQuery,
  parseUpdateTaskInput,
  type CreateTaskInput,
  type TaskCommentRecord,
  type TaskListQuery,
  type TaskRecord,
  type UpdateTaskInput,
} from "../domain/task.js";
import type { AuditRepository } from "./project-service.js";
import type { ProjectTeamService } from "./project-team-service.js";

export interface TaskRepository {
  create(
    tenantId: string,
    projectId: string,
    createdByUserId: string,
    input: CreateTaskInput,
  ): Promise<TaskRecord>;
  findById(tenantId: string, taskId: string): Promise<TaskRecord | null>;
  list(tenantId: string, query: TaskListQuery, callerUserId: string): Promise<TaskRecord[]>;
  /** Restricts a portfolio-wide list to projects the caller is a member of. */
  listForMemberProjects(
    tenantId: string,
    query: TaskListQuery,
    callerUserId: string,
  ): Promise<TaskRecord[]>;
  update(
    tenantId: string,
    taskId: string,
    input: UpdateTaskInput,
    completion: { completedAt: string | null } | null,
  ): Promise<TaskRecord | null>;
  remove(tenantId: string, taskId: string): Promise<boolean>;
  listComments(tenantId: string, taskId: string): Promise<TaskCommentRecord[]>;
  addComment(
    tenantId: string,
    taskId: string,
    authorUserId: string,
    body: string,
  ): Promise<TaskCommentRecord>;
  isProjectMember(tenantId: string, projectId: string, userId: string): Promise<boolean>;
}

export class TaskService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly projectTeam: Pick<ProjectTeamService, "resolveAccess">,
    private readonly audit: AuditRepository,
  ) {}

  /**
   * Resolves the task and the caller's rights over it in one step.
   *
   * A caller who cannot reach the project is told the task does not exist
   * rather than that it exists and is forbidden, so the endpoint cannot be used
   * to discover which task ids are real.
   */
  private async loadTask(
    actor: UserPrincipal,
    rawTaskId: unknown,
  ): Promise<{ task: TaskRecord; canManage: boolean }> {
    const taskId = parseTaskId(rawTaskId);
    const task = await this.tasks.findById(actor.tenantId, taskId);
    if (!task) {
      throw new DomainError("NOT_FOUND", "Task was not found.");
    }

    const access = await this.projectTeam.resolveAccess(actor, task.projectId).catch(() => null);
    if (!access?.canRead) {
      throw new DomainError("NOT_FOUND", "Task was not found.");
    }

    return { task, canManage: access.canManage };
  }

  /**
   * Work is assigned to people who are on the project.
   *
   * Assigning an outsider produces a task nobody can open, and quietly grants
   * visibility of the project's work to someone who was never added to it.
   */
  private async assertAssignable(
    tenantId: string,
    projectId: string,
    assigneeUserId: string,
  ): Promise<void> {
    const member = await this.tasks.isProjectMember(tenantId, projectId, assigneeUserId);
    if (!member) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "That person is not a member of this project. Add them to the project team first.",
        { assigneeUserId },
      );
    }
  }

  async createTask(
    actor: UserPrincipal,
    rawProjectId: unknown,
    rawInput: unknown,
  ): Promise<TaskRecord> {
    const projectId = parseProjectId(rawProjectId);
    const access = await this.projectTeam.resolveAccess(actor, projectId);
    if (!access.canManage) {
      throw new DomainError("FORBIDDEN", "You do not have permission to add work to this project.");
    }

    const input = parseCreateTaskInput(rawInput);
    if (input.assigneeUserId) {
      await this.assertAssignable(actor.tenantId, projectId, input.assigneeUserId);
    }

    const task = await this.tasks.create(actor.tenantId, projectId, actor.userId, input);
    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "task.create",
      entityType: "task",
      entityId: task.id,
      result: "success",
      metadata: { projectId, status: task.status, priority: task.priority },
    });
    return task;
  }

  /**
   * Lists tasks the caller may see.
   *
   * The scope mirrors `resolveAccess`: a tenant-wide project manager can reach
   * any project, so they see all of its work; everyone else sees only projects
   * they belong to. Using a different rule here would mean an administrator
   * could open a project workspace but find its task list empty.
   *
   * The narrowing happens in SQL rather than by fetching everything and
   * discarding rows, which would still leak their existence through counts.
   */
  async listTasks(actor: UserPrincipal, rawQuery: unknown): Promise<TaskRecord[]> {
    const query = parseTaskListQuery(rawQuery);

    if (query.projectId) {
      const access = await this.projectTeam.resolveAccess(actor, query.projectId);
      if (!access.canRead) {
        throw new DomainError("NOT_FOUND", "Project was not found.");
      }
      return this.tasks.list(actor.tenantId, query, actor.userId);
    }

    return canManageProjects(actor)
      ? this.tasks.list(actor.tenantId, query, actor.userId)
      : this.tasks.listForMemberProjects(actor.tenantId, query, actor.userId);
  }

  async getTask(actor: UserPrincipal, rawTaskId: unknown): Promise<TaskRecord> {
    const { task } = await this.loadTask(actor, rawTaskId);
    return task;
  }

  async updateTask(
    actor: UserPrincipal,
    rawTaskId: unknown,
    rawInput: unknown,
  ): Promise<TaskRecord> {
    const { task, canManage } = await this.loadTask(actor, rawTaskId);
    const input = parseUpdateTaskInput(rawInput);

    // Someone who can see a project's work may progress their own task without
    // being able to administer the project. Every other edit needs manage
    // rights, so a viewer cannot retitle or reassign work.
    const onlyStatusChange = Object.keys(input).length === 1 && input.status !== undefined;
    const isOwnTask = task.assigneeUserId === actor.userId;
    if (!canManage && !(onlyStatusChange && isOwnTask)) {
      throw new DomainError("FORBIDDEN", "You do not have permission to change this task.");
    }

    if (input.status && input.status !== task.status) {
      assertTransition(task.status, input.status);
    }

    if (input.assigneeUserId) {
      await this.assertAssignable(actor.tenantId, task.projectId, input.assigneeUserId);
    }

    // `completed_at` is a stored fact, so it is set and cleared alongside the
    // status rather than inferred later from the audit trail.
    let completion: { completedAt: string | null } | null = null;
    if (input.status && input.status !== task.status) {
      completion = isTerminalTaskStatus(input.status)
        ? { completedAt: new Date().toISOString() }
        : { completedAt: null };
    }

    const updated = await this.tasks.update(actor.tenantId, task.id, input, completion);
    if (!updated) {
      throw new DomainError("NOT_FOUND", "Task was not found.");
    }

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "task.update",
      entityType: "task",
      entityId: updated.id,
      result: "success",
      metadata: {
        projectId: updated.projectId,
        changedFields: Object.keys(input),
        ...(input.status && input.status !== task.status
          ? { statusFrom: task.status, statusTo: input.status }
          : {}),
      },
    });
    return updated;
  }

  async deleteTask(actor: UserPrincipal, rawTaskId: unknown): Promise<void> {
    const { task, canManage } = await this.loadTask(actor, rawTaskId);
    if (!canManage) {
      throw new DomainError("FORBIDDEN", "You do not have permission to delete this task.");
    }

    // Written before the row goes, since the audit entry becomes the only
    // remaining record of it.
    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "task.delete",
      entityType: "task",
      entityId: task.id,
      result: "success",
      metadata: { projectId: task.projectId, title: task.title, status: task.status },
    });

    const removed = await this.tasks.remove(actor.tenantId, task.id);
    if (!removed) {
      throw new DomainError("NOT_FOUND", "Task was not found.");
    }
  }

  async listComments(actor: UserPrincipal, rawTaskId: unknown): Promise<TaskCommentRecord[]> {
    const { task } = await this.loadTask(actor, rawTaskId);
    return this.tasks.listComments(actor.tenantId, task.id);
  }

  /** Anyone who can see the task can comment; discussion is not an admin act. */
  async addComment(
    actor: UserPrincipal,
    rawTaskId: unknown,
    rawInput: unknown,
  ): Promise<TaskCommentRecord> {
    const { task } = await this.loadTask(actor, rawTaskId);
    const input = parseCreateCommentInput(rawInput);

    const comment = await this.tasks.addComment(actor.tenantId, task.id, actor.userId, input.body);
    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "task.comment",
      entityType: "task",
      entityId: task.id,
      result: "success",
      metadata: { projectId: task.projectId, commentId: comment.id },
    });
    return comment;
  }
}
