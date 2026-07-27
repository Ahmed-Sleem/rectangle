/**
 * Use-case layer for the Today / Command Center surface.
 *
 * This service only reads. It writes no audit events, because opening a
 * dashboard is not an action taken on a record, and logging every page view
 * would bury the mutations the audit trail exists to preserve.
 *
 * Each block is gated on its own permission rather than the page as a whole, so
 * a user who may see projects but not the user register gets the project blocks
 * and simply has no team block, instead of being refused the page.
 */
import {
  canManageProjects,
  canReadUsers,
  hasPermission,
  requireProjectRead,
  type UserPrincipal,
} from "../domain/auth.js";
import {
  parseOverviewQuery,
  type AttentionProject,
  type BudgetTotal,
  type OverviewSummary,
  type ProjectStatusCount,
  type RiskExposure,
  type TaskSummary,
  type TeamSummary,
} from "../domain/overview.js";

export interface OverviewRepository {
  countProjectsByStatus(tenantId: string): Promise<ProjectStatusCount[]>;
  sumBudgetsByCurrency(tenantId: string): Promise<BudgetTotal[]>;
  listProjectsNeedingAttention(
    tenantId: string,
    horizonDays: number,
    limit: number,
  ): Promise<AttentionProject[]>;
  countUsersByStatus(tenantId: string): Promise<TeamSummary>;
  summariseRisks(
    tenantId: string,
    userId: string,
    scope: "all" | "member",
  ): Promise<RiskExposure>;
  summariseTasks(
    tenantId: string,
    userId: string,
    horizonDays: number,
    scope: "all" | "member",
  ): Promise<TaskSummary>;
}

export class OverviewService {
  constructor(private readonly repository: OverviewRepository) {}

  async getSummary(actor: UserPrincipal, rawQuery: unknown): Promise<OverviewSummary> {
    requireProjectRead(actor);
    const query = parseOverviewQuery(rawQuery);

    // The blocks are independent reads, so they run together rather than
    // adding four round trips of latency to the first screen after sign-in.
    // Matches the rule the task list and project workspace already use: a
    // tenant-wide project manager can reach any project, everyone else only
    // the ones they belong to. Counting work the viewer cannot open would send
    // them from a figure to an empty list.
    const taskScope = canManageProjects(actor) ? "all" : "member";

    const [statusCounts, budgets, attention, tasks, risks, team] = await Promise.all([
      this.repository.countProjectsByStatus(actor.tenantId),
      this.repository.sumBudgetsByCurrency(actor.tenantId),
      this.repository.listProjectsNeedingAttention(
        actor.tenantId,
        query.horizonDays,
        query.attentionLimit,
      ),
      this.repository.summariseTasks(actor.tenantId, actor.userId, query.horizonDays, taskScope),
      this.repository.summariseRisks(actor.tenantId, actor.userId, taskScope),
      canReadUsers(actor) ? this.repository.countUsersByStatus(actor.tenantId) : null,
    ]);

    const totalProjects = statusCounts.reduce((sum, entry) => sum + entry.count, 0);

    return {
      horizonDays: query.horizonDays,
      totalProjects,
      statusCounts,
      budgets,
      attention,
      tasks,
      risks,
      ...(team ? { team } : {}),
    };
  }
}
