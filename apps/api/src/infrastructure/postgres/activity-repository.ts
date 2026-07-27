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

export class PostgresActivityRepository {
  constructor(private readonly pool: pg.Pool) {}

  async list(options: ActivityReadOptions): Promise<Omit<ActivityPage, "availableScopes">> {
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

    if (query.action) where.push(`a.action = ${bind(query.action)}`);
    if (query.entityType) where.push(`a.entity_type = ${bind(query.entityType)}`);
    if (query.actorUserId) where.push(`a.actor_user_id = ${bind(query.actorUserId)}`);
    if (query.projectId) where.push(`a.project_id = ${bind(query.projectId)}`);
    if (query.result) where.push(`a.result = ${bind(query.result)}`);
    if (query.from) where.push(`a.created_at >= ${bind(query.from)}::date`);
    // Inclusive of the end day: a person filtering "to the 5th" means through it.
    if (query.to) where.push(`a.created_at < (${bind(query.to)}::date + interval '1 day')`);

    if (query.cursor) {
      const { createdAt, id } = decodeCursor(query.cursor);
      where.push(`(a.created_at, a.id) < (${bind(createdAt)}::timestamptz, ${bind(id)}::uuid)`);
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
        where ${where.join(" and ")}
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
