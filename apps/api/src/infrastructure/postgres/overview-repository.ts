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
  ProjectStatusCount,
  ProjectStatusKey,
  RiskExposure,
  TaskSummary,
  TeamSummary,
} from "../../domain/overview.js";

export class PostgresOverviewRepository implements OverviewRepository {
  constructor(private readonly pool: pg.Pool) {}

  async countProjectsByStatus(
    tenantId: string,
    userId: string,
    scope: "all" | "member",
  ): Promise<ProjectStatusCount[]> {
    /*
     * Scoped like every other block on this page. It was not, so the headline
     * figure counted the whole company while the register beneath it listed
     * only the viewer's projects — two numbers describing the same thing and
     * disagreeing, and the larger one disclosing how much work exists that
     * they cannot see.
     */
    const values: unknown[] = [tenantId];
    let membership = "";
    if (scope === "member") {
      values.push(userId);
      membership = `and exists (
             select 1 from project_members m
              where m.tenant_id = p.tenant_id and m.project_id = p.id
                and m.user_id = $${values.length}
           )`;
    }

    const result = await this.pool.query<{ status: ProjectStatusKey; count: string }>(
      `select p.status, count(*)::text as count
         from projects p
        where p.tenant_id = $1
          ${membership}
        group by p.status
        order by p.status asc`,
      values,
    );
    return result.rows.map((row) => ({ status: row.status, count: Number(row.count) }));
  }

  async sumBudgetsByCurrency(
    tenantId: string,
    userId: string,
    scope: "all" | "member",
  ): Promise<BudgetTotal[]> {
    // Archived projects are excluded: they are no longer part of what the
    // company is currently funding, and including them overstates commitment.
    //
    // Scoped for the same reason the status counts are: budget is the most
    // sensitive figure on the page, and a member has no business reading the
    // company's total commitment from a project they are not on.
    const values: unknown[] = [tenantId];
    let membership = "";
    if (scope === "member") {
      values.push(userId);
      membership = `and exists (
             select 1 from project_members m
              where m.tenant_id = p.tenant_id and m.project_id = p.id
                and m.user_id = $${values.length}
           )`;
    }

    const result = await this.pool.query<{
      currency: string;
      amount: string;
      project_count: string;
    }>(
      `select p.budget_currency as currency,
              sum(p.budget_amount)::text as amount,
              count(*)::text as project_count
         from projects p
        where p.tenant_id = $1
          and p.budget_amount is not null
          and p.budget_currency is not null
          and p.status <> 'archived'
          ${membership}
        group by p.budget_currency
        order by sum(p.budget_amount) desc`,
      values,
    );
    return result.rows.map((row) => ({
      currency: row.currency,
      amount: row.amount,
      projectCount: Number(row.project_count),
    }));
  }

  async listProjectsNeedingAttention(
    tenantId: string,
    userId: string,
    horizonDays: number,
    limit: number,
    scope: "all" | "member",
  ): Promise<AttentionProject[]> {
    // `current_date` is the database's date, so the answer does not change with
    // the timezone of whichever browser asked. Overdue work is ordered first
    // because it is already a problem, not a warning.
    //
    // The membership placeholder comes after the two the query already binds,
    // so it is pushed last.
    const values: unknown[] = [tenantId, horizonDays, limit];
    let membership = "";
    if (scope === "member") {
      values.push(userId);
      membership = `and exists (
             select 1 from project_members m
              where m.tenant_id = p.tenant_id and m.project_id = p.id
                and m.user_id = $${values.length}
           )`;
    }

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
           from projects p
          where p.tenant_id = $1
            and p.status in ('planned', 'active', 'on_hold')
            ${membership}
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
      values,
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

  /**
   * Counts open work in one pass.
   *
   * `overdue` and `dueSoon` are disjoint by construction so the two figures can
   * be read side by side without double counting, and both exclude finished
   * work: a task completed after its due date was late, but it is not
   * outstanding, and a dashboard that keeps counting it never reaches zero.
   */
  async summariseTasks(
    tenantId: string,
    userId: string,
    horizonDays: number,
    scope: "all" | "member",
  ): Promise<TaskSummary> {
    // Membership scoping happens inside the query. Counting everything and
    // subtracting afterwards would report work the caller cannot open.
    const membershipFilter =
      scope === "member"
        ? `and exists (
             select 1 from project_members m
              where m.tenant_id = t.tenant_id
                and m.project_id = t.project_id
                and m.user_id = $2
           )`
        : "";

    const result = await this.pool.query<{
      open: string;
      overdue: string;
      due_soon: string;
      assigned_to_me: string;
    }>(
      `select
         count(*)::text as open,
         count(*) filter (where t.due_date is not null and t.due_date < current_date)::text as overdue,
         count(*) filter (
           where t.due_date is not null
             and t.due_date >= current_date
             and t.due_date <= current_date + make_interval(days => $3::int)
         )::text as due_soon,
         count(*) filter (where t.assignee_user_id = $2)::text as assigned_to_me
       from tasks t
      where t.tenant_id = $1
        and t.status not in ('done', 'cancelled')
        ${membershipFilter}`,
      [tenantId, userId, horizonDays],
    );

    const row = result.rows[0];
    return {
      open: Number(row?.open ?? 0),
      overdue: Number(row?.overdue ?? 0),
      dueSoon: Number(row?.due_soon ?? 0),
      assignedToMe: Number(row?.assigned_to_me ?? 0),
    };
  }

  /** Live exposure only, scoped the same way the register itself is. */
  async summariseRisks(
    tenantId: string,
    userId: string,
    scope: "all" | "member",
  ): Promise<RiskExposure> {
    const values: unknown[] = [tenantId];
    let membershipFilter = "";

    if (scope === "member") {
      values.push(userId);
      membershipFilter = `and exists (
        select 1 from project_members m
         where m.tenant_id = r.tenant_id and m.project_id = r.project_id and m.user_id = $${values.length}
      )`;
    }

    const result = await this.pool.query<{
      open: string;
      critical_or_high: string;
      occurred: string;
    }>(
      `select count(*)::text as open,
              count(*) filter (where r.score >= 10)::text as critical_or_high,
              count(*) filter (where r.status = 'occurred')::text as occurred
         from risks r
        where r.tenant_id = $1
          and r.status not in ('closed', 'accepted')
          ${membershipFilter}`,
      values,
    );

    const row = result.rows[0];
    return {
      open: Number(row?.open ?? 0),
      criticalOrHigh: Number(row?.critical_or_high ?? 0),
      occurred: Number(row?.occurred ?? 0),
    };
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
