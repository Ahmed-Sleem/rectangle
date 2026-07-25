/**
 * PostgreSQL task storage.
 *
 * Every statement is tenant-scoped, and the portfolio-wide list restricts to
 * projects the caller belongs to inside SQL rather than filtering afterwards:
 * discarding rows in application code still leaks their existence through
 * counts and paging.
 */
import type pg from "pg";
import type { TaskRepository } from "../../application/task-service.js";
import type {
  CreateTaskInput,
  TaskCommentRecord,
  TaskListQuery,
  TaskPriority,
  TaskRecord,
  TaskStatus,
  UpdateTaskInput,
} from "../../domain/task.js";

interface TaskRow {
  id: string;
  tenant_id: string;
  project_id: string;
  project_name: string;
  project_code: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_user_id: string | null;
  assignee_name: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_at: Date | null;
  created_by_user_id: string | null;
  comment_count: string;
  created_at: Date;
  updated_at: Date;
}

function mapTask(row: TaskRow): TaskRecord {
  const task: TaskRecord = {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    projectName: row.project_name,
    projectCode: row.project_code,
    title: row.title,
    status: row.status,
    priority: row.priority,
    commentCount: Number(row.comment_count ?? 0),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
  if (row.description != null) task.description = row.description;
  if (row.assignee_user_id != null) task.assigneeUserId = row.assignee_user_id;
  if (row.assignee_name != null) task.assigneeName = row.assignee_name;
  if (row.start_date != null) task.startDate = row.start_date;
  if (row.due_date != null) task.dueDate = row.due_date;
  if (row.completed_at != null) task.completedAt = row.completed_at.toISOString();
  if (row.created_by_user_id != null) task.createdByUserId = row.created_by_user_id;
  return task;
}

/** Shared projection so every read returns an identically shaped task. */
const TASK_SELECT = `
  select t.id, t.tenant_id, t.project_id, p.name as project_name, p.code as project_code,
         t.title, t.description, t.status, t.priority,
         t.assignee_user_id, u.display_name as assignee_name,
         t.start_date::text as start_date, t.due_date::text as due_date,
         t.completed_at, t.created_by_user_id,
         (select count(*) from task_comments c where c.task_id = t.id)::text as comment_count,
         t.created_at, t.updated_at
    from tasks t
    join projects p on p.id = t.project_id and p.tenant_id = t.tenant_id
    left join users u on u.id = t.assignee_user_id and u.tenant_id = t.tenant_id`;

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(
    tenantId: string,
    projectId: string,
    createdByUserId: string,
    input: CreateTaskInput,
  ): Promise<TaskRecord> {
    const inserted = await this.pool.query<{ id: string }>(
      `insert into tasks (
         tenant_id, project_id, title, description, status, priority,
         assignee_user_id, start_date, due_date, created_by_user_id
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id`,
      [
        tenantId,
        projectId,
        input.title,
        input.description ?? null,
        input.status,
        input.priority,
        input.assigneeUserId ?? null,
        input.startDate ?? null,
        input.dueDate ?? null,
        createdByUserId,
      ],
    );

    const task = await this.findById(tenantId, inserted.rows[0]!.id);
    if (!task) throw new Error("Task disappeared immediately after insert.");
    return task;
  }

  async findById(tenantId: string, taskId: string): Promise<TaskRecord | null> {
    const result = await this.pool.query<TaskRow>(
      `${TASK_SELECT} where t.tenant_id = $1 and t.id = $2 limit 1`,
      [tenantId, taskId],
    );
    return result.rows[0] ? mapTask(result.rows[0]) : null;
  }

  /**
   * Builds the shared filter clause.
   *
   * Parameters are numbered from an offset because the caller has already
   * consumed some positions; the values are always bound, never interpolated.
   */
  private buildFilters(
    query: TaskListQuery,
    callerUserId: string,
    values: unknown[],
  ): string {
    const clauses: string[] = [];

    if (query.projectId) {
      values.push(query.projectId);
      clauses.push(`t.project_id = $${values.length}`);
    }
    if (query.status) {
      values.push(query.status);
      clauses.push(`t.status = $${values.length}`);
    }
    if (query.priority) {
      values.push(query.priority);
      clauses.push(`t.priority = $${values.length}`);
    }
    if (query.mine) {
      values.push(callerUserId);
      clauses.push(`t.assignee_user_id = $${values.length}`);
    } else if (query.assigneeUserId) {
      values.push(query.assigneeUserId);
      clauses.push(`t.assignee_user_id = $${values.length}`);
    }
    if (query.openOnly) {
      clauses.push(`t.status not in ('done', 'cancelled')`);
    }
    if (query.search) {
      values.push(`%${query.search}%`);
      clauses.push(`(t.title ilike $${values.length} or t.description ilike $${values.length})`);
    }

    return clauses.length > 0 ? ` and ${clauses.join(" and ")}` : "";
  }

  /**
   * Urgent work first, then the nearest due date. Tasks with no due date sort
   * last rather than first, since an undated task is not more urgent than a
   * dated one.
   */
  private static readonly ORDER = `
    order by case t.priority
               when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3
             end,
             t.due_date asc nulls last,
             t.created_at desc`;

  async list(tenantId: string, query: TaskListQuery, callerUserId: string): Promise<TaskRecord[]> {
    const values: unknown[] = [tenantId];
    const filters = this.buildFilters(query, callerUserId, values);
    values.push(query.limit);

    const result = await this.pool.query<TaskRow>(
      `${TASK_SELECT} where t.tenant_id = $1${filters}
       ${PostgresTaskRepository.ORDER}
       limit $${values.length}`,
      values,
    );
    return result.rows.map(mapTask);
  }

  async listForMemberProjects(
    tenantId: string,
    query: TaskListQuery,
    callerUserId: string,
  ): Promise<TaskRecord[]> {
    const values: unknown[] = [tenantId, callerUserId];
    const filters = this.buildFilters(query, callerUserId, values);
    values.push(query.limit);

    const result = await this.pool.query<TaskRow>(
      `${TASK_SELECT}
        where t.tenant_id = $1
          and exists (
            select 1 from project_members m
             where m.tenant_id = t.tenant_id
               and m.project_id = t.project_id
               and m.user_id = $2
          )${filters}
       ${PostgresTaskRepository.ORDER}
       limit $${values.length}`,
      values,
    );
    return result.rows.map(mapTask);
  }

  async update(
    tenantId: string,
    taskId: string,
    input: UpdateTaskInput,
    completion: { completedAt: string | null } | null,
  ): Promise<TaskRecord | null> {
    const assignments: string[] = [];
    const values: unknown[] = [tenantId, taskId];

    // `undefined` means "leave alone" and `null` means "clear", so presence is
    // tested with `in` rather than truthiness.
    const set = (column: string, value: unknown) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };

    if (input.title !== undefined) set("title", input.title);
    if ("description" in input) set("description", input.description ?? null);
    if (input.status !== undefined) set("status", input.status);
    if (input.priority !== undefined) set("priority", input.priority);
    if ("assigneeUserId" in input) set("assignee_user_id", input.assigneeUserId ?? null);
    if ("startDate" in input) set("start_date", input.startDate ?? null);
    if ("dueDate" in input) set("due_date", input.dueDate ?? null);
    if (completion) set("completed_at", completion.completedAt);

    if (assignments.length === 0) return this.findById(tenantId, taskId);

    const result = await this.pool.query<{ id: string }>(
      `update tasks set ${assignments.join(", ")}, updated_at = now()
        where tenant_id = $1 and id = $2
        returning id`,
      values,
    );
    if (result.rowCount === 0) return null;
    return this.findById(tenantId, taskId);
  }

  async remove(tenantId: string, taskId: string): Promise<boolean> {
    const result = await this.pool.query(
      "delete from tasks where tenant_id = $1 and id = $2",
      [tenantId, taskId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listComments(tenantId: string, taskId: string): Promise<TaskCommentRecord[]> {
    const result = await this.pool.query<{
      id: string;
      task_id: string;
      author_user_id: string | null;
      author_name: string | null;
      body: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `select c.id, c.task_id, c.author_user_id, u.display_name as author_name,
              c.body, c.created_at, c.updated_at
         from task_comments c
         left join users u on u.id = c.author_user_id and u.tenant_id = c.tenant_id
        where c.tenant_id = $1 and c.task_id = $2
        order by c.created_at asc`,
      [tenantId, taskId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      ...(row.author_user_id ? { authorUserId: row.author_user_id } : {}),
      ...(row.author_name ? { authorName: row.author_name } : {}),
      body: row.body,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async addComment(
    tenantId: string,
    taskId: string,
    authorUserId: string,
    body: string,
  ): Promise<TaskCommentRecord> {
    const result = await this.pool.query<{ id: string; created_at: Date; updated_at: Date }>(
      `insert into task_comments (tenant_id, task_id, author_user_id, body)
       values ($1,$2,$3,$4)
       returning id, created_at, updated_at`,
      [tenantId, taskId, authorUserId, body],
    );
    const row = result.rows[0]!;

    const author = await this.pool.query<{ display_name: string }>(
      "select display_name from users where tenant_id = $1 and id = $2 limit 1",
      [tenantId, authorUserId],
    );

    return {
      id: row.id,
      taskId,
      authorUserId,
      ...(author.rows[0] ? { authorName: author.rows[0].display_name } : {}),
      body,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async isProjectMember(tenantId: string, projectId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `select 1 from project_members
        where tenant_id = $1 and project_id = $2 and user_id = $3
        limit 1`,
      [tenantId, projectId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
