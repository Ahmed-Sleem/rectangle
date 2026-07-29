/** Tests task authorization, status transitions, and assignment rules. */
import { beforeEach, describe, expect, it } from "vitest";
import { TaskService, type TaskRepository } from "../src/application/task-service.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";
import type { ProjectAccess } from "../src/application/project-team-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import { DomainError } from "../src/domain/errors.js";
import type {
  CreateTaskInput,
  TaskCommentRecord,
  TaskListQuery,
  TaskRecord,
  UpdateTaskInput,
} from "../src/domain/task.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const projectId = "33333333-3333-4333-8333-333333333333";
const adminUserId = "22222222-2222-4222-8222-222222222222";
const memberUserId = "44444444-4444-4444-8444-444444444444";
const outsiderUserId = "55555555-5555-4555-8555-555555555555";
const taskId = "66666666-6666-4666-8666-666666666666";

const admin: UserPrincipal = { tenantId, userId: adminUserId, roles: ["admin"], permissions: [] };
const member: UserPrincipal = { tenantId, userId: memberUserId, roles: ["member"], permissions: [] };

class MemoryAudit implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> {
    this.events.push(event);
  }
}

function baseTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: taskId,
    tenantId,
    projectId,
    projectName: "New Cairo Tower",
    projectCode: "NCT-01",
    title: "Pour raft foundation",
    status: "todo",
    priority: "high",
    commentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

class MemoryTaskRepository implements TaskRepository {
  tasks = new Map<string, TaskRecord>();
  members = new Set<string>([memberUserId]);
  lastUpdate: { input: UpdateTaskInput; completion: { completedAt: string | null } | null } | null = null;
  listedForMemberProjects = false;

  seed(task: TaskRecord): void {
    this.tasks.set(task.id, task);
  }

  async create(
    createTenantId: string,
    createProjectId: string,
    createdByUserId: string,
    input: CreateTaskInput,
  ): Promise<TaskRecord> {
    const task = baseTask({
      id: `task-${this.tasks.size + 1}`,
      tenantId: createTenantId,
      projectId: createProjectId,
      title: input.title,
      status: input.status,
      priority: input.priority,
      createdByUserId,
      ...(input.assigneeUserId ? { assigneeUserId: input.assigneeUserId } : {}),
    });
    this.tasks.set(task.id, task);
    return task;
  }

  async findById(findTenantId: string, findTaskId: string): Promise<TaskRecord | null> {
    const task = this.tasks.get(findTaskId);
    return task && task.tenantId === findTenantId ? task : null;
  }

  async list(): Promise<TaskRecord[]> {
    return [...this.tasks.values()];
  }

  async listForMemberProjects(
    _tenantId: string,
    _query: TaskListQuery,
    _callerUserId: string,
  ): Promise<TaskRecord[]> {
    this.listedForMemberProjects = true;
    return [];
  }

  async update(
    _tenantId: string,
    updateTaskId: string,
    input: UpdateTaskInput,
    completion: { completedAt: string | null } | null,
  ): Promise<TaskRecord | null> {
    const task = this.tasks.get(updateTaskId);
    if (!task) return null;
    this.lastUpdate = { input, completion };
    const updated: TaskRecord = {
      ...task,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(completion?.completedAt ? { completedAt: completion.completedAt } : {}),
    };
    this.tasks.set(updateTaskId, updated);
    return updated;
  }

  async remove(_tenantId: string, removeTaskId: string): Promise<boolean> {
    return this.tasks.delete(removeTaskId);
  }

  async listComments(): Promise<TaskCommentRecord[]> {
    return [];
  }

  async addComment(
    _tenantId: string,
    commentTaskId: string,
    authorUserId: string,
    body: string,
  ): Promise<TaskCommentRecord> {
    return {
      id: "comment-1",
      taskId: commentTaskId,
      authorUserId,
      body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async isProjectMember(_tenantId: string, _projectId: string, userId: string): Promise<boolean> {
    return this.members.has(userId);
  }
}

/** Stands in for the project team service, which owns object-level access. */
function accessStub(access: Partial<ProjectAccess> & { throws?: boolean } = {}) {
  const resolve = async (): Promise<ProjectAccess> => {
    if (access.throws) throw new DomainError("NOT_FOUND", "Project was not found.");
    return { canRead: access.canRead ?? true, canManage: access.canManage ?? true };
  };
  return {
    resolveAccess: resolve,
    /*
     * Mirrors the real rule rather than waving every call through. A stub that
     * always allowed would make every authorization test here pass regardless
     * of what the service did, which is worse than having no test.
     */
    async requireProjectCapability(): Promise<ProjectAccess> {
      const resolved = await resolve();
      if (!resolved.canManage) {
        throw new DomainError("FORBIDDEN", "You do not have permission to manage this project.");
      }
      return resolved;
    },
  };
}

describe("TaskService", () => {
  let repository: MemoryTaskRepository;
  let audit: MemoryAudit;

  beforeEach(() => {
    repository = new MemoryTaskRepository();
    audit = new MemoryAudit();
  });

  it("refuses to create work on a project the caller cannot manage", async () => {
    const service = new TaskService(repository, accessStub({ canManage: false }), audit);
    await expect(
      service.createTask(member, projectId, { title: "Survey the site" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("records an audit entry when work is created", async () => {
    const service = new TaskService(repository, accessStub(), audit);
    await service.createTask(admin, projectId, { title: "Survey the site" });
    expect(audit.events.map((event) => event.action)).toContain("task.create");
  });

  it("refuses to assign someone who is not on the project", async () => {
    const service = new TaskService(repository, accessStub(), audit);
    await expect(
      service.createTask(admin, projectId, { title: "Survey", assigneeUserId: outsiderUserId }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("accepts an assignee who is a project member", async () => {
    const service = new TaskService(repository, accessStub(), audit);
    const task = await service.createTask(admin, projectId, {
      title: "Survey",
      assigneeUserId: memberUserId,
    });
    expect(task.assigneeUserId).toBe(memberUserId);
  });

  it("hides a task on a project the caller cannot reach, rather than forbidding it", async () => {
    repository.seed(baseTask());
    const service = new TaskService(repository, accessStub({ throws: true }), audit);
    // NOT_FOUND, so the endpoint cannot be used to discover real task ids.
    await expect(service.getTask(member, taskId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a status move the workflow does not allow", async () => {
    repository.seed(baseTask({ status: "todo" }));
    const service = new TaskService(repository, accessStub(), audit);
    // Work cannot go straight from not-started to reviewed.
    await expect(service.updateTask(admin, taskId, { status: "in_review" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("allows a legitimate status move", async () => {
    repository.seed(baseTask({ status: "in_progress" }));
    const service = new TaskService(repository, accessStub(), audit);
    const updated = await service.updateTask(admin, taskId, { status: "in_review" });
    expect(updated.status).toBe("in_review");
  });

  it("stamps the completion time when work reaches a terminal state", async () => {
    repository.seed(baseTask({ status: "in_progress" }));
    const service = new TaskService(repository, accessStub(), audit);
    await service.updateTask(admin, taskId, { status: "done" });
    expect(repository.lastUpdate?.completion?.completedAt).toBeTruthy();
  });

  it("clears the completion time when work is reopened", async () => {
    repository.seed(baseTask({ status: "done", completedAt: new Date().toISOString() }));
    const service = new TaskService(repository, accessStub(), audit);
    await service.updateTask(admin, taskId, { status: "in_progress" });
    expect(repository.lastUpdate?.completion).toEqual({ completedAt: null });
  });

  it("lets an assignee progress their own task without project manage rights", async () => {
    repository.seed(baseTask({ status: "todo", assigneeUserId: memberUserId }));
    const service = new TaskService(repository, accessStub({ canManage: false }), audit);
    const updated = await service.updateTask(member, taskId, { status: "in_progress" });
    expect(updated.status).toBe("in_progress");
  });

  it("does not let an assignee retitle or reassign their own task", async () => {
    repository.seed(baseTask({ assigneeUserId: memberUserId }));
    const service = new TaskService(repository, accessStub({ canManage: false }), audit);
    await expect(service.updateTask(member, taskId, { title: "Something else" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("does not let a non-assignee move someone else's task", async () => {
    repository.seed(baseTask({ assigneeUserId: outsiderUserId }));
    const service = new TaskService(repository, accessStub({ canManage: false }), audit);
    await expect(service.updateTask(member, taskId, { status: "in_progress" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("records the status change in the audit entry", async () => {
    repository.seed(baseTask({ status: "todo" }));
    const service = new TaskService(repository, accessStub(), audit);
    await service.updateTask(admin, taskId, { status: "in_progress" });
    const event = audit.events.find((entry) => entry.action === "task.update");
    expect(event?.metadata).toMatchObject({ statusFrom: "todo", statusTo: "in_progress" });
  });

  it("writes the audit entry before deleting, since the row is about to vanish", async () => {
    repository.seed(baseTask());
    const service = new TaskService(repository, accessStub(), audit);
    await service.deleteTask(admin, taskId);
    expect(audit.events.some((event) => event.action === "task.delete")).toBe(true);
    expect(repository.tasks.has(taskId)).toBe(false);
  });

  it("refuses deletion from someone who cannot manage the project", async () => {
    repository.seed(baseTask());
    const service = new TaskService(repository, accessStub({ canManage: false }), audit);
    await expect(service.deleteTask(member, taskId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.tasks.has(taskId)).toBe(true);
  });

  it("restricts a portfolio-wide list to projects the caller belongs to", async () => {
    const service = new TaskService(repository, accessStub(), audit);
    await service.listTasks(member, {});
    expect(repository.listedForMemberProjects).toBe(true);
  });

  it("shows a tenant-wide manager every project's work", async () => {
    const service = new TaskService(repository, accessStub(), audit);
    // An admin can open any project, so a membership-scoped list would leave
    // them looking at an empty board for a project they can plainly see.
    await service.listTasks(admin, {});
    expect(repository.listedForMemberProjects).toBe(false);
  });

  it("lets anyone who can see a task comment on it", async () => {
    repository.seed(baseTask());
    const service = new TaskService(repository, accessStub({ canManage: false }), audit);
    const comment = await service.addComment(member, taskId, { body: "Rebar arrives Tuesday." });
    expect(comment.body).toBe("Rebar arrives Tuesday.");
  });

  it("rejects an empty comment", async () => {
    repository.seed(baseTask());
    const service = new TaskService(repository, accessStub(), audit);
    await expect(service.addComment(admin, taskId, { body: "   " })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});
