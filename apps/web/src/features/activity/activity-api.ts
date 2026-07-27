/** API helpers for the audit trail, scoped by the server to the caller. */
import { apiRequest } from "@/shared/api/client";

export type ActivityScope = "self" | "team" | "all";
export type ActivitySensitivity = "operational" | "personal" | "security" | "administrative";

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  result: "success" | "failure";
  sensitivity: ActivitySensitivity;
  actorUserId?: string;
  actorName?: string;
  projectId?: string;
  projectName?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type ActivityPreset = "today" | "week" | "month" | "custom";

/** Figures describing the whole range, not the page that was fetched. */
export interface ActivitySummary {
  total: number;
  failures: number;
  people: number;
  busiestDay?: string;
  busiestDayCount?: number;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  nextCursor?: string;
  /** Which scopes this person may ask for. The page offers only these. */
  availableScopes: ActivityScope[];
  summary: ActivitySummary;
}

export interface ActivityFilters {
  scope: ActivityScope;
  preset?: ActivityPreset;
  actorUserId?: string;
  projectId?: string;
  action?: string;
  result?: "success" | "failure";
  from?: string;
  to?: string;
  cursor?: string;
}

export function listActivity(filters: ActivityFilters): Promise<ActivityPage> {
  const params = new URLSearchParams({ scope: filters.scope });
  if (filters.preset) params.set("preset", filters.preset);
  if (filters.actorUserId) params.set("actorUserId", filters.actorUserId);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.action) params.set("action", filters.action);
  if (filters.result) params.set("result", filters.result);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.cursor) params.set("cursor", filters.cursor);

  return apiRequest<ActivityPage>(`/v1/activity?${params.toString()}`);
}

export function listActivityActions(): Promise<{ actions: string[] }> {
  return apiRequest<{ actions: string[] }>("/v1/activity/actions");
}
