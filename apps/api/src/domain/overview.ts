/**
 * Domain shapes for the Today / Command Center surface.
 *
 * Everything here is a rollup of records that already exist. There is no
 * overview table and no stored snapshot: a figure the company can see must be
 * recomputable from projects, users, and audit events at the moment it is read,
 * otherwise it is a claim rather than a fact.
 */
import { z } from "zod";
import { DomainError } from "./errors.js";
import { projectStatusSchema } from "./project.js";

export type ProjectStatusKey = z.infer<typeof projectStatusSchema>;

/**
 * How far ahead the schedule is examined.
 *
 * Construction planning works in weeks, so a two-week horizon is the default:
 * long enough to act on, short enough that the list stays a to-do rather than
 * the whole programme. The caller may narrow or widen it.
 */
export const overviewQuerySchema = z.object({
  horizonDays: z.coerce.number().int().min(1).max(90).default(14),
  attentionLimit: z.coerce.number().int().min(1).max(50).default(8),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;

/**
 * Why a project is asking for attention. These are facts about dates, not
 * judgements about health: `overdue` means the planned finish has passed while
 * the project is still open, nothing more.
 */
export const attentionReasonSchema = z.enum(["overdue", "finishing_soon", "starting_soon"]);

export type AttentionReason = z.infer<typeof attentionReasonSchema>;

export interface ProjectStatusCount {
  status: ProjectStatusKey;
  count: number;
}

/**
 * Budgets are grouped by currency and never added across currencies. A single
 * portfolio total would require exchange rates Rectangle does not hold, and an
 * invented rate is an invented number.
 */
export interface BudgetTotal {
  currency: string;
  amount: string;
  projectCount: number;
}

export interface AttentionProject {
  id: string;
  name: string;
  code: string;
  status: ProjectStatusKey;
  reason: AttentionReason;
  /** Signed days from today: negative is overdue, positive is upcoming. */
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

/**
 * Work counts for the landing page.
 *
 * Scoped the same way the task list is: a tenant-wide project reader sees the
 * whole portfolio, anyone else sees only projects they belong to. A dashboard
 * that counts work the viewer cannot open would send them to an empty list.
 */
export interface TaskSummary {
  open: number;
  overdue: number;
  dueSoon: number;
  assignedToMe: number;
}

/**
 * Live risk exposure for the landing page.
 *
 * Only entries still demanding attention: a count that keeps including closed
 * risks never falls, and stops describing the situation now.
 */
export interface RiskExposure {
  open: number;
  criticalOrHigh: number;
  occurred: number;
}

export interface TeamSummary {
  activeUsers: number;
  disabledUsers: number;
}

export interface OverviewSummary {
  /** The horizon actually applied, so the interface can describe it honestly. */
  horizonDays: number;
  totalProjects: number;
  statusCounts: ProjectStatusCount[];
  budgets: BudgetTotal[];
  attention: AttentionProject[];
  tasks: TaskSummary;
  risks: RiskExposure;
  /** Absent when the caller may not read the user register. */
  team?: TeamSummary;
}

export function parseOverviewQuery(input: unknown): OverviewQuery {
  const result = overviewQuerySchema.safeParse(input ?? {});
  if (!result.success) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Overview query is invalid.",
      z.treeifyError(result.error),
    );
  }
  return result.data;
}

/** Statuses whose dates still matter. A completed or archived project is done. */
const openStatuses = new Set<ProjectStatusKey>(["planned", "active", "on_hold"]);

export function isOpenStatus(status: ProjectStatusKey): boolean {
  return openStatuses.has(status);
}
