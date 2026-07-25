/**
 * Task domain rules.
 *
 * The status set is closed and the transitions between statuses are explicit.
 * A board that lets any column move to any other column is not a workflow, it
 * is a drawing, and the reports built on it cannot be trusted.
 */
import { z } from "zod";
import { DomainError } from "./errors.js";

export const taskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "blocked",
  "in_review",
  "done",
  "cancelled",
]);

export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

/** Statuses in which a task is still real work. */
const openStatuses = new Set<TaskStatus>(["todo", "in_progress", "blocked", "in_review"]);

export function isOpenTaskStatus(status: TaskStatus): boolean {
  return openStatuses.has(status);
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === "done" || status === "cancelled";
}

/**
 * Permitted moves.
 *
 * Reopening is allowed from both terminal states, because work is closed by
 * mistake often enough that forbidding it would only push people to delete and
 * recreate the record, losing its history. Everything else follows the shape
 * of the work: nothing reaches review without being started, and blocked work
 * returns to where it came from.
 */
const allowedTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["in_progress", "blocked", "cancelled"],
  in_progress: ["todo", "blocked", "in_review", "done", "cancelled"],
  blocked: ["todo", "in_progress", "cancelled"],
  in_review: ["in_progress", "done", "blocked", "cancelled"],
  done: ["todo", "in_progress"],
  cancelled: ["todo"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return allowedTransitions[from].includes(to);
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "That status change is not allowed for this task.",
      { from, to, allowed: allowedTransitions[from] },
    );
  }
}

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Use the YYYY-MM-DD date format.")
  .optional();

const taskFields = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional(),
  status: taskStatusSchema.default("todo"),
  priority: taskPrioritySchema.default("medium"),
  assigneeUserId: z.uuid().optional(),
  startDate: optionalDate,
  dueDate: optionalDate,
});

function checkDateOrder(
  value: { startDate?: string | undefined; dueDate?: string | undefined },
  context: z.RefinementCtx,
): void {
  if (value.startDate && value.dueDate && value.dueDate < value.startDate) {
    context.addIssue({
      code: "custom",
      path: ["dueDate"],
      message: "Due date cannot be before the start date.",
    });
  }
}

export const createTaskInputSchema = taskFields.superRefine(checkDateOrder);

/**
 * Every field is optional on update, but `null` is meaningful and distinct from
 * absent: absent leaves the value alone, null clears it. Without that
 * distinction an assignee or a due date could never be removed once set.
 */
export const updateTaskInputSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    assigneeUserId: z.uuid().nullable().optional(),
    startDate: optionalDate.nullable(),
    dueDate: optionalDate.nullable(),
  })
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({ code: "custom", message: "No changes were provided." });
    }
    if (value.startDate && value.dueDate && value.dueDate < value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Due date cannot be before the start date.",
      });
    }
  });

export const taskListQuerySchema = z.object({
  projectId: z.uuid().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeUserId: z.uuid().optional(),
  /** Restricts to work assigned to the caller, whoever that turns out to be. */
  mine: z.coerce.boolean().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  /** Excludes done and cancelled, which is what a working list usually wants. */
  openOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const createCommentInputSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;

export interface TaskRecord {
  id: string;
  tenantId: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeUserId?: string;
  assigneeName?: string;
  startDate?: string;
  dueDate?: string;
  completedAt?: string;
  createdByUserId?: string;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskCommentRecord {
  id: string;
  taskId: string;
  authorUserId?: string;
  authorName?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

function parse<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DomainError("VALIDATION_FAILED", message, z.treeifyError(result.error));
  }
  return result.data;
}

export const taskIdSchema = z.uuid();

export function parseTaskId(input: unknown): string {
  return parse(taskIdSchema, input, "Task id is invalid.");
}

export function parseCreateTaskInput(input: unknown): CreateTaskInput {
  return parse(createTaskInputSchema, input, "Task details are invalid.");
}

export function parseUpdateTaskInput(input: unknown): UpdateTaskInput {
  return parse(updateTaskInputSchema, input, "Task changes are invalid.");
}

export function parseTaskListQuery(input: unknown): TaskListQuery {
  return parse(taskListQuerySchema, input ?? {}, "Task filters are invalid.");
}

export function parseCreateCommentInput(input: unknown): CreateCommentInput {
  return parse(createCommentInputSchema, input, "Comment is invalid.");
}
