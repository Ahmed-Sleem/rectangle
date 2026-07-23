/**
 * PostgreSQL audit repository appends immutable action events for project
 * mutations and future AI/tool activity.
 */
import type pg from "pg";
import type { AuditEventInput, AuditRepository } from "../../application/project-service.js";

export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly pool: pg.Pool) {}

  async append(event: AuditEventInput): Promise<void> {
    await this.pool.query(
      `insert into audit_events (
        tenant_id, actor_user_id, action, entity_type, entity_id, result, metadata
      ) values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        event.tenantId,
        event.actorUserId,
        event.action,
        event.entityType,
        event.entityId,
        event.result,
        event.metadata ?? {},
      ],
    );
  }
}
