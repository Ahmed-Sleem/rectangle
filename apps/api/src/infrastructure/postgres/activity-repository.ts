/**
 * Activity reads.
 *
 * Every scope is a different WHERE clause over the same table, and each one is
 * built here rather than assembled by the service, so the predicate that
 * decides who sees what cannot be bypassed by a caller that forgets to pass a
 * filter. The rule the clauses implement:
 *
 *   You may see an entry if you can already reach the thing it is about,
 *   or if it is about you.
 */
import type pg from "pg";
import {
  decodeCursor,
  encodeCursor,
  type ActivityEntry,
  type ActivityPage,
  type ActivityQuery,
  type ActivityScope,
  type ActivitySensitivity,
  type ActivitySummary,
  type ActivityTally,
} from "../../domain/activity.js";

interface Row {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  result: "success" | "failure";
  sensitivity: ActivitySensitivity;
  actor_user_id: string | null;
  actor_name: string | null;
  project_id: string | null;
  project_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

function mapRow(row: Row): ActivityEntry {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    result: row.result,
    sensitivity: row.sensitivity,
    ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
    ...(row.actor_name ? { actorName: row.actor_name } : {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.project_name ? { projectName: row.project_name } : {}),
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export interface ActivityReadOptions {
  tenantId: string;
  userId: string;
  scope: ActivityScope;
  query: ActivityQuery;
}

/**
 * The WHERE clause both the list and its summary run against.
 *
 * Built once and shared deliberately. A summary computed over a different
 * predicate than the rows beneath it reports a number nobody can reconcile with
 * what they are looking at, and the two would drift the first time a filter was
 * added to one and not the other.
 */
function buildPredicate(options: ActivityReadOptions): { where: string; values: unknown[] } {
  const { tenantId, userId, scope, query } = options;

  const values: unknown[] = [tenantId];
  const where: string[] = ["a.tenant_id = $1"];

  const bind = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

    switch (scope) {
      case "self":
        /*
         * Your own record, at every sensitivity. Seeing your own failed
         * sign-ins is how you notice somebody else trying to use your account,
         * so withholding them would defeat the purpose of recording them.
         *
         * Union'd with the projects you *run*, not merely belong to. Being a
         * member on a job does not entitle you to a colleague's history there;
         * managing it does. This previously returned everything operational on
         * any project you were a member of, so a junior saw every action their
         * colleagues took.
         */
        where.push(`(
          a.actor_user_id = ${bind(userId)}
          or (
            a.sensitivity = 'operational'
            and a.project_id is not null
            and exists (
              select 1 from project_members m
               where m.tenant_id = a.tenant_id
                 and m.project_id = a.project_id
                 and m.user_id = ${bind(userId)}
                 and m.role in ('project_admin', 'project_manager')
            )
          )
        )`);
        break;

      case "team":
        /*
         * Work done by people the caller manages. Operational only — a manager
         * sees what their people did to the work, never when they last changed
         * their password.
         *
         * The team tables arrive with the Teams feature. Until then this
         * resolves to the caller's own actions rather than silently widening,
         * because a scope that fails open is worse than one that returns little.
         */
        where.push(`(
          a.sensitivity = 'operational'
          and a.actor_user_id = ${bind(userId)}
        )`);
        break;

      case "all":
        // Authorised by the service. No additional predicate.
        break;
    }

    if (query.search) {
    /*
     * Actor, action and project — the three things visible on a row. Matching
     * the raw action key as well as the display name means a search for
     * "login_failed" works even though the row renders it as prose.
     */
    const term = bind(`%${query.search}%`);
    where.push(`(u.display_name ilike ${term} or a.action ilike ${term} or p.name ilike ${term})`);
  }
  if (query.action) where.push(`a.action = ${bind(query.action)}`);
    if (query.entityType) where.push(`a.entity_type = ${bind(query.entityType)}`);
    if (query.actorUserId) where.push(`a.actor_user_id = ${bind(query.actorUserId)}`);
    if (query.projectId) where.push(`a.project_id = ${bind(query.projectId)}`);
    if (query.result) where.push(`a.result = ${bind(query.result)}`);
    if (query.from) where.push(`a.created_at >= ${bind(query.from)}::date`);
    // Inclusive of the end day: a person filtering "to the 5th" means through it.
    if (query.to) where.push(`a.created_at < (${bind(query.to)}::date + interval '1 day')`);

  return { where: where.join(" and "), values };
}

export class PostgresActivityRepository {
  constructor(private readonly pool: pg.Pool) {}

  async list(options: ActivityReadOptions): Promise<Omit<ActivityPage, "availableScopes" | "summary">> {
    const { query } = options;
    const base = buildPredicate(options);
    const values = [...base.values];
    let where = base.where;

    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    if (query.cursor) {
      const { createdAt, id } = decodeCursor(query.cursor);
      where += ` and (a.created_at, a.id) < (${bind(createdAt)}::timestamptz, ${bind(id)}::uuid)`;
    }

    // One more than asked for, so "is there another page" is answered without
    // a second count query over the same predicate.
    const limitPlusOne = bind(query.limit + 1);

    const result = await this.pool.query<Row>(
      `select a.id, a.action, a.entity_type, a.entity_id, a.result, a.sensitivity,
              a.actor_user_id, u.display_name as actor_name,
              a.project_id, p.name as project_name,
              a.metadata, a.created_at
         from audit_events a
         left join users u
           on u.id = a.actor_user_id and u.tenant_id = a.tenant_id
         left join projects p
           on p.id = a.project_id and p.tenant_id = a.tenant_id
        where ${where}
        order by a.created_at desc, a.id desc
        limit ${limitPlusOne}`,
      values,
    );

    const rows = result.rows.slice(0, query.limit);
    const entries = rows.map(mapRow);
    const last = rows[rows.length - 1];

    return {
      entries,
      ...(result.rows.length > query.limit && last
        ? { nextCursor: encodeCursor(last.created_at.toISOString(), last.id) }
        : {}),
    };
  }

  /**
   * The four figures above the list, over the same predicate as the list.
   *
   * Computed in SQL rather than from the fetched page: a page holds thirty rows
   * and the range may hold thousands, so counting what was fetched would report
   * the page and call it the range. Invisible until a company is busy, then
   * permanently wrong.
   */
  async summarise(options: ActivityReadOptions): Promise<ActivitySummary> {
    const { where, values } = buildPredicate(options);

    const result = await this.pool.query<{
      total: string;
      failures: string;
      people: string;
      busiest_day: string | null;
      busiest_count: string | null;
      top_actors: ActivityTally[];
      top_actions: ActivityTally[];
      top_projects: ActivityTally[];
      attention: ActivityTally[];
    }>(
      `with scoped as (
         select a.actor_user_id, u.display_name as actor_name,
                a.action, a.result, a.created_at,
                a.project_id, p.name as project_name, a.sensitivity
           from audit_events a
           left join users u on u.id = a.actor_user_id and u.tenant_id = a.tenant_id
           left join projects p on p.id = a.project_id and p.tenant_id = a.tenant_id
          where ${where}
       ),
       days as (
         select date_trunc('day', created_at) as day, count(*)::text as day_count
           from scoped group by 1 order by count(*) desc, 1 desc limit 1
       ),
       actors as (
         select actor_user_id::text as key,
                coalesce(actor_name, 'Someone') as label,
                count(*)::int as count
           from scoped where actor_user_id is not null
          group by 1, 2 order by count(*) desc, 2 asc limit 5
       ),
       actions as (
         select action as key, action as label, count(*)::int as count
           from scoped group by 1 order by count(*) desc, 1 asc limit 5
       ),
       project_tally as (
         select project_id::text as key,
                coalesce(project_name, '') as label,
                count(*)::int as count
           from scoped where project_id is not null
          group by 1, 2 order by count(*) desc, 2 asc limit 5
       ),
       attention as (
         -- Refusals, and the changes that alter who can do what. These are the
         -- entries somebody scanning a trail is actually hunting for.
         select action as key, action as label, count(*)::int as count
           from scoped
          where result = 'failure'
             or sensitivity = 'administrative'
             or action like '%.delete'
             or action like '%.remove'
          group by 1 order by count(*) desc, 1 asc limit 5
       )
       select
         (select count(*)::text from scoped) as total,
         (select count(*)::text from scoped where result = 'failure') as failures,
         (select count(distinct actor_user_id)::text from scoped where actor_user_id is not null) as people,
         (select to_char(day, 'YYYY-MM-DD') from days) as busiest_day,
         (select day_count from days) as busiest_count,
         (select coalesce(json_agg(actors), '[]') from actors) as top_actors,
         (select coalesce(json_agg(actions), '[]') from actions) as top_actions,
         (select coalesce(json_agg(project_tally), '[]') from project_tally) as top_projects,
         (select coalesce(json_agg(attention), '[]') from attention) as attention`,
      values,
    );

    const row = result.rows[0];
    return {
      total: Number(row?.total ?? 0),
      failures: Number(row?.failures ?? 0),
      people: Number(row?.people ?? 0),
      ...(row?.busiest_day
        ? { busiestDay: row.busiest_day, busiestDayCount: Number(row.busiest_count ?? 0) }
        : {}),
      topActors: row?.top_actors ?? [],
      topActions: row?.top_actions ?? [],
      topProjects: row?.top_projects ?? [],
      attention: row?.attention ?? [],
    };
  }

  /** Distinct actions present in the tenant, so the filter offers real choices. */
  async listActions(tenantId: string): Promise<string[]> {
    const result = await this.pool.query<{ action: string }>(
      `select distinct action from audit_events where tenant_id = $1 order by action asc limit 200`,
      [tenantId],
    );
    return result.rows.map((row) => row.action);
  }

  /**
   * Removes entries past the retention window, for every tenant.
   *
   * Not scoped to one tenant: retention is a property of the installation, and
   * a per-tenant purge would need something to iterate tenants and would skip
   * any that had gone quiet — exactly the ones whose old rows nobody wants.
   */
  async purgeAuditEvents(days: number): Promise<number> {
    const result = await this.pool.query(
      `delete from audit_events where created_at < now() - make_interval(days => $1::int)`,
      [days],
    );
    return result.rowCount ?? 0;
  }
}
