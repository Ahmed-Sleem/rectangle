/** Reads the Today rollup. Every figure here is computed from stored records. */
import { apiRequest } from "@/shared/api/client";

export type ProjectStatus = "planned" | "active" | "on_hold" | "completed" | "archived";

export type AttentionReason = "overdue" | "finishing_soon" | "starting_soon";

export interface ProjectStatusCount {
  status: ProjectStatus;
  count: number;
}

export interface BudgetTotal {
  currency: string;
  amount: string;
  projectCount: number;
}

export interface AttentionProject {
  id: string;
  name: string;
  code: string;
  status: ProjectStatus;
  reason: AttentionReason;
  daysFromToday: number;
  plannedStartDate?: string;
  plannedFinishDate?: string;
}

export interface OverviewActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  result: "success" | "failure";
  actorUserId?: string;
  actorName?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TaskSummary {
  open: number;
  overdue: number;
  dueSoon: number;
  assignedToMe: number;
}

export interface RiskExposure {
  open: number;
  criticalOrHigh: number;
  occurred: number;
}

export interface OverviewSummary {
  horizonDays: number;
  totalProjects: number;
  statusCounts: ProjectStatusCount[];
  budgets: BudgetTotal[];
  attention: AttentionProject[];
  activity: OverviewActivityEntry[];
  tasks: TaskSummary;
  risks: RiskExposure;
  /** Absent when this user may not read the company user register. */
  team?: { activeUsers: number; disabledUsers: number };
}

export function getOverview(): Promise<{ overview: OverviewSummary }> {
  return apiRequest("/v1/overview");
}
