/**
 * PostgreSQL audit repository appends immutable action events for project
 * mutations and future AI/tool activity.
 *
 * Sensitivity and project are derived here rather than supplied by callers.
 * Every service that records an action would otherwise have to remember to
 * classify it, and the one that forgot would leak — the classification decides
 * who may read the row, so it is too important to be a caller's responsibility.
 */
import type pg from "pg";
import type { AuditEventInput, AuditRepository } from "../../application/project-service.js";
import { classifyActivity } from "../../domain/activity.js";

/** A project id carried in metadata, when the action concerns one. */
function projectIdOf(event: AuditEventInput): string | null {
  if (event.entityType === "project") return event.entityId;
  const fromMetadata = event.metadata?.projectId;
  return typeof fromMetadata === "string" ? fromMetadata : null;
}

export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly pool: pg.Pool) {}

  async append(event: AuditEventInput): Promise<void> {
    await this.pool.query(
      `insert into audit_events (
        tenant_id, actor_user_id, action, entity_type, entity_id, result, metadata,
        sensitivity, project_id
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        event.tenantId,
        event.actorUserId,
        event.action,
        event.entityType,
        event.entityId,
        event.result,
        event.metadata ?? {},
        classifyActivity(event.action),
        projectIdOf(event),
      ],
    );
  }
}
