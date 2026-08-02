/**
 * PostgreSQL storage for the assistant's provider, keys and pending actions.
 *
 * Two of these are ordinary configuration. The third — pending actions — is a
 * security control, and its queries are written so that the guarantees the
 * service promises are enforced by the database rather than by the order in
 * which the service happens to call things.
 */
import type pg from "pg";
import type {
  AiSettingsRecord,
  AiSettingsRepository,
} from "../../application/ai-settings-service.js";
import type { AiPendingActionRepository, PendingAction } from "../../application/ai-service.js";

function mapSettings(row: Record<string, unknown>): AiSettingsRecord {
  return {
    baseUrl: String(row.base_url),
    model: String(row.model),
    encryptedApiKey: row.api_key_cipher == null ? null : String(row.api_key_cipher),
    enabled: Boolean(row.enabled),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export class PostgresAiSettingsRepository implements AiSettingsRepository {
  constructor(private readonly pool: pg.Pool) {}

  async get(tenantId: string): Promise<AiSettingsRecord | null> {
    const result = await this.pool.query(
      "select base_url, model, api_key_cipher, enabled, updated_at from ai_settings where tenant_id = $1",
      [tenantId],
    );
    return result.rows[0] ? mapSettings(result.rows[0] as Record<string, unknown>) : null;
  }

  async upsert(
    tenantId: string,
    input: {
      baseUrl: string;
      model: string;
      encryptedApiKey: string | null;
      enabled: boolean;
      updatedByUserId: string;
    },
  ): Promise<AiSettingsRecord> {
    const result = await this.pool.query(
      `insert into ai_settings (tenant_id, base_url, model, api_key_cipher, enabled, updated_at, updated_by_user_id)
       values ($1, $2, $3, $4, $5, now(), $6)
       on conflict (tenant_id) do update set
         base_url = excluded.base_url,
         model = excluded.model,
         api_key_cipher = excluded.api_key_cipher,
         enabled = excluded.enabled,
         updated_at = now(),
         updated_by_user_id = excluded.updated_by_user_id
       returning base_url, model, api_key_cipher, enabled, updated_at`,
      [
        tenantId,
        input.baseUrl,
        input.model,
        input.encryptedApiKey,
        input.enabled,
        input.updatedByUserId,
      ],
    );
    return mapSettings(result.rows[0] as Record<string, unknown>);
  }

  async getUserKey(tenantId: string, userId: string): Promise<string | null> {
    const result = await this.pool.query<{ api_key_cipher: string }>(
      "select api_key_cipher from ai_user_keys where tenant_id = $1 and user_id = $2",
      [tenantId, userId],
    );
    return result.rows[0]?.api_key_cipher ?? null;
  }

  async saveUserKey(tenantId: string, userId: string, encryptedApiKey: string): Promise<void> {
    await this.pool.query(
      `insert into ai_user_keys (tenant_id, user_id, api_key_cipher, updated_at)
       values ($1, $2, $3, now())
       on conflict (tenant_id, user_id) do update set
         api_key_cipher = excluded.api_key_cipher,
         updated_at = now()`,
      [tenantId, userId, encryptedApiKey],
    );
  }

  async deleteUserKey(tenantId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      "delete from ai_user_keys where tenant_id = $1 and user_id = $2",
      [tenantId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresAiPendingActionRepository implements AiPendingActionRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: {
    tenantId: string;
    userId: string;
    tool: string;
    arguments: Record<string, unknown>;
    expiresAt: string;
  }): Promise<{ id: string }> {
    const result = await this.pool.query<{ id: string }>(
      `insert into ai_pending_actions (tenant_id, user_id, tool, arguments, expires_at)
       values ($1, $2, $3, $4::jsonb, $5)
       returning id`,
      [input.tenantId, input.userId, input.tool, JSON.stringify(input.arguments), input.expiresAt],
    );
    return { id: String(result.rows[0]?.id) };
  }

  /**
   * A proposal that may still be acted on.
   *
   * Every condition is in the WHERE clause rather than checked afterwards:
   * belonging to this tenant and this person, not already confirmed, and not
   * expired. A row failing any of them is simply not found, so the service
   * cannot forget one of the four and produce a hole — and "not found" is the
   * right answer to all of them anyway, since distinguishing "expired" from
   * "someone else's" would tell a caller about a proposal that is none of
   * their business.
   */
  async findClaimable(tenantId: string, userId: string, id: string): Promise<PendingAction | null> {
    const result = await this.pool.query<{ id: string; tool: string; arguments: unknown }>(
      `select id, tool, arguments
         from ai_pending_actions
        where id = $1
          and tenant_id = $2
          and user_id = $3
          and confirmed_at is null
          and expires_at > now()`,
      [id, tenantId, userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      tool: String(row.tool),
      arguments: (row.arguments ?? {}) as Record<string, unknown>,
    };
  }

  /**
   * Claims the proposal, and reports whether this caller is the one who got it.
   *
   * `confirmed_at is null` inside the UPDATE is what makes this safe under
   * concurrency: two requests arriving together both run the statement, the
   * database serialises them, and exactly one matches a row that is still
   * unclaimed. Reading first and then writing would let both pass the read.
   */
  async markConfirmed(tenantId: string, userId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      `update ai_pending_actions
          set confirmed_at = now()
        where id = $1
          and tenant_id = $2
          and user_id = $3
          and confirmed_at is null
          and expires_at > now()`,
      [id, tenantId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Removes proposals nobody answered.
   *
   * They are not sensitive, but they are a record of what an assistant was
   * about to do, and keeping those indefinitely is a slow disclosure with no
   * purpose. Confirmed ones stay: the audit trail references them.
   */
  async deleteExpired(): Promise<number> {
    const result = await this.pool.query(
      "delete from ai_pending_actions where confirmed_at is null and expires_at < now()",
    );
    return result.rowCount ?? 0;
  }
}
