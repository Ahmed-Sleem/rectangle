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
import { canReadUsers, requireProjectRead, type UserPrincipal } from "../domain/auth.js";
import {
  parseOverviewQuery,
  type AttentionProject,
  type BudgetTotal,
  type OverviewActivityEntry,
  type OverviewSummary,
  type ProjectStatusCount,
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
  listRecentActivity(tenantId: string, limit: number): Promise<OverviewActivityEntry[]>;
  countUsersByStatus(tenantId: string): Promise<TeamSummary>;
}

export class OverviewService {
  constructor(private readonly repository: OverviewRepository) {}

  async getSummary(actor: UserPrincipal, rawQuery: unknown): Promise<OverviewSummary> {
    requireProjectRead(actor);
    const query = parseOverviewQuery(rawQuery);

    // The blocks are independent reads, so they run together rather than
    // adding four round trips of latency to the first screen after sign-in.
    const [statusCounts, budgets, attention, activity, team] = await Promise.all([
      this.repository.countProjectsByStatus(actor.tenantId),
      this.repository.sumBudgetsByCurrency(actor.tenantId),
      this.repository.listProjectsNeedingAttention(
        actor.tenantId,
        query.horizonDays,
        query.attentionLimit,
      ),
      this.repository.listRecentActivity(actor.tenantId, query.activityLimit),
      canReadUsers(actor) ? this.repository.countUsersByStatus(actor.tenantId) : null,
    ]);

    const totalProjects = statusCounts.reduce((sum, entry) => sum + entry.count, 0);

    return {
      horizonDays: query.horizonDays,
      totalProjects,
      statusCounts,
      budgets,
      attention,
      activity,
      ...(team ? { team } : {}),
    };
  }
}
