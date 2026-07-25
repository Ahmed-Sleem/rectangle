/**
 * PostgreSQL rollups for the Today / Command Center surface.
 *
 * The aggregation happens in SQL rather than in the service. Counting a page of
 * rows the client happens to have loaded would report the page, not the
 * portfolio, and that difference is invisible until a company grows past the
 * first page.
 */
import type pg from "pg";
import type { OverviewRepository } from "../../application/overview-service.js";
import type {
  AttentionProject,
  AttentionReason,
  BudgetTotal,
  OverviewActivityEntry,
  ProjectStatusCount,
  ProjectStatusKey,
  TeamSummary,
} from "../../domain/overview.js";

export class PostgresOverviewRepository implements OverviewRepository {
  constructor(private readonly pool: pg.Pool) {}

  async countProjectsByStatus(tenantId: string): Promise<ProjectStatusCount[]> {
    const result = await this.pool.query<{ status: ProjectStatusKey; count: string }>(
      `select status, count(*)::text as count
         from projects
        where tenant_id = $1
        group by status
        order by status asc`,
      [tenantId],
    );
    return result.rows.map((row) => ({ status: row.status, count: Number(row.count) }));
  }

  async sumBudgetsByCurrency(tenantId: string): Promise<BudgetTotal[]> {
    // Archived projects are excluded: they are no longer part of what the
    // company is currently funding, and including them overstates commitment.
    const result = await this.pool.query<{
      currency: string;
      amount: string;
      project_count: string;
    }>(
      `select budget_currency as currency,
              sum(budget_amount)::text as amount,
              count(*)::text as project_count
         from projects
        where tenant_id = $1
          and budget_amount is not null
          and budget_currency is not null
          and status <> 'archived'
        group by budget_currency
        order by sum(budget_amount) desc`,
      [tenantId],
    );
    return result.rows.map((row) => ({
      currency: row.currency,
      amount: row.amount,
      projectCount: Number(row.project_count),
    }));
  }

  async listProjectsNeedingAttention(
    tenantId: string,
    horizonDays: number,
    limit: number,
  ): Promise<AttentionProject[]> {
    // `current_date` is the database's date, so the answer does not change with
    // the timezone of whichever browser asked. Overdue work is ordered first
    // because it is already a problem, not a warning.
    const result = await this.pool.query<{
      id: string;
      name: string;
      code: string;
      status: ProjectStatusKey;
      reason: AttentionReason;
      days_from_today: string;
      planned_start_date: string | null;
      planned_finish_date: string | null;
    }>(
      `with dated as (
         select id, name, code, status, planned_start_date, planned_finish_date,
                case
                  when planned_finish_date is not null and planned_finish_date < current_date
                    then 'overdue'
                  when planned_finish_date is not null
                       and planned_finish_date <= current_date + make_interval(days => $2::int)
                    then 'finishing_soon'
                  when planned_start_date is not null
                       and planned_start_date >= current_date
                       and planned_start_date <= current_date + make_interval(days => $2::int)
                    then 'starting_soon'
                end as reason
           from projects
          where tenant_id = $1
            and status in ('planned', 'active', 'on_hold')
       )
       select id, name, code, status, reason,
              (case
                 when reason = 'starting_soon' then planned_start_date - current_date
                 else planned_finish_date - current_date
               end)::text as days_from_today,
              planned_start_date::text as planned_start_date,
              planned_finish_date::text as planned_finish_date
         from dated
        where reason is not null
        order by case reason
                   when 'overdue' then 0
                   when 'finishing_soon' then 1
                   else 2
                 end,
                 coalesce(planned_finish_date, planned_start_date) asc,
                 name asc
        limit $3`,
      [tenantId, horizonDays, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      status: row.status,
      reason: row.reason,
      daysFromToday: Number(row.days_from_today),
      ...(row.planned_start_date ? { plannedStartDate: row.planned_start_date } : {}),
      ...(row.planned_finish_date ? { plannedFinishDate: row.planned_finish_date } : {}),
    }));
  }

  async listRecentActivity(tenantId: string, limit: number): Promise<OverviewActivityEntry[]> {
    const result = await this.pool.query<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      result: "success" | "failure";
      actor_user_id: string | null;
      actor_name: string | null;
      metadata: Record<string, unknown>;
      created_at: Date;
    }>(
      `select a.id, a.action, a.entity_type, a.entity_id, a.result,
              a.actor_user_id, u.display_name as actor_name, a.metadata, a.created_at
         from audit_events a
         left join users u on u.id = a.actor_user_id and u.tenant_id = a.tenant_id
        where a.tenant_id = $1
        order by a.created_at desc, a.id desc
        limit $2`,
      [tenantId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      result: row.result,
      ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
      ...(row.actor_name ? { actorName: row.actor_name } : {}),
      metadata: row.metadata ?? {},
      createdAt: row.created_at.toISOString(),
    }));
  }

  async countUsersByStatus(tenantId: string): Promise<TeamSummary> {
    const result = await this.pool.query<{ active: string; disabled: string }>(
      `select count(*) filter (where status = 'active')::text as active,
              count(*) filter (where status = 'disabled')::text as disabled
         from users
        where tenant_id = $1`,
      [tenantId],
    );
    const row = result.rows[0];
    return {
      activeUsers: Number(row?.active ?? 0),
      disabledUsers: Number(row?.disabled ?? 0),
    };
  }
}
