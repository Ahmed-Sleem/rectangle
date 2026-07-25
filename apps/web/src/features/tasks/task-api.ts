/** API helpers for real task records stored by the Rectangle backend. */
import { apiRequest } from "@/shared/api/client";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "in_review" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface TaskRecord {
  id: string;
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
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorUserId?: string;
  authorName?: string;
  body: string;
  createdAt: string;
}

export interface TaskFilters {
  projectId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  mine?: boolean;
  search?: string;
  openOnly?: boolean;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeUserId?: string;
  startDate?: string;
  dueDate?: string;
}

/** `null` clears a value; omitting a key leaves it unchanged. */
export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeUserId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
}

export function listTasks(filters: TaskFilters = {}): Promise<{ tasks: TaskRecord[] }> {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.mine) params.set("mine", "true");
  if (filters.openOnly) params.set("openOnly", "true");
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return apiRequest(query ? `/v1/tasks?${query}` : "/v1/tasks");
}

export function createTask(
  projectId: string,
  payload: CreateTaskPayload,
): Promise<{ task: TaskRecord }> {
  return apiRequest(`/v1/projects/${projectId}/tasks`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTask(
  taskId: string,
  payload: UpdateTaskPayload,
): Promise<{ task: TaskRecord }> {
  return apiRequest(`/v1/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteTask(taskId: string): Promise<void> {
  return apiRequest(`/v1/tasks/${taskId}`, { method: "DELETE" });
}

export function listComments(taskId: string): Promise<{ comments: TaskComment[] }> {
  return apiRequest(`/v1/tasks/${taskId}/comments`);
}

export function addComment(taskId: string, body: string): Promise<{ comment: TaskComment }> {
  return apiRequest(`/v1/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
