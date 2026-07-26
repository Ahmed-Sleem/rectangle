/**
 * PostgreSQL storage for single-use lifecycle tokens.
 *
 * Consumption and the action it authorises must succeed or fail together, so
 * the interesting methods take a transaction rather than running standalone.
 */
import type pg from "pg";
import type { AuthTokenRepository } from "../../application/auth-lifecycle-service.js";
import type { AuthTokenRecord, TokenPurpose } from "../../domain/auth-token.js";

interface TokenRow {
  id: string;
  tenant_id: string;
  user_id: string;
  purpose: TokenPurpose;
  token_hash: string;
  metadata: Record<string, unknown>;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

function mapToken(row: TokenRow): AuthTokenRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    purpose: row.purpose,
    tokenHash: row.token_hash,
    metadata: row.metadata ?? {},
    expiresAt: row.expires_at.toISOString(),
    ...(row.consumed_at ? { consumedAt: row.consumed_at.toISOString() } : {}),
    createdAt: row.created_at.toISOString(),
  };
}

export class PostgresAuthTokenRepository implements AuthTokenRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Issues a token and retires any earlier unused one of the same purpose.
   *
   * Without the retirement, pressing "resend" three times leaves three live
   * links, and revoking access would mean finding all of them.
   */
  async issue(input: {
    tenantId: string;
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    metadata?: Record<string, unknown>;
    createdByUserId?: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      await client.query(
        `update auth_tokens set consumed_at = now()
          where tenant_id = $1 and user_id = $2 and purpose = $3 and consumed_at is null`,
        [input.tenantId, input.userId, input.purpose],
      );

      await client.query(
        `insert into auth_tokens (
           tenant_id, user_id, purpose, token_hash, metadata, expires_at, created_by_user_id
         ) values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          input.tenantId,
          input.userId,
          input.purpose,
          input.tokenHash,
          input.metadata ?? {},
          input.expiresAt,
          input.createdByUserId ?? null,
        ],
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async findByHash(tokenHash: string): Promise<AuthTokenRecord | null> {
    const result = await this.pool.query<TokenRow>(
      "select * from auth_tokens where token_hash = $1 limit 1",
      [tokenHash],
    );
    return result.rows[0] ? mapToken(result.rows[0]) : null;
  }

  /**
   * Marks a token used and runs the action it authorises in one transaction.
   *
   * `consumed_at is null` in the update is what makes this safe against two
   * simultaneous uses of the same link: the second finds no row to update and
   * the whole transaction is abandoned.
   */
  async consume<T>(
    tokenId: string,
    action: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      const claimed = await client.query(
        "update auth_tokens set consumed_at = now() where id = $1 and consumed_at is null",
        [tokenId],
      );
      if ((claimed.rowCount ?? 0) === 0) {
        await client.query("rollback");
        return null;
      }

      const outcome = await action(client);
      await client.query("commit");
      return outcome;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByEmail(
    tenantSlug: string,
    email: string,
  ): Promise<{ tenantId: string; userId: string; displayName: string; status: string } | null> {
    const result = await this.pool.query<{
      tenant_id: string;
      user_id: string;
      display_name: string;
      status: string;
    }>(
      `select t.id as tenant_id, u.id as user_id, u.display_name, u.status
         from tenants t
         join users u on u.tenant_id = t.id
        where t.slug = $1 and lower(u.email) = lower($2)
        limit 1`,
      [tenantSlug, email],
    );
    const row = result.rows[0];
    return row
      ? {
          tenantId: row.tenant_id,
          userId: row.user_id,
          displayName: row.display_name,
          status: row.status,
        }
      : null;
  }

  async findUserById(
    tenantId: string,
    userId: string,
  ): Promise<{ email: string; displayName: string; status: string } | null> {
    const result = await this.pool.query<{
      email: string;
      display_name: string;
      status: string;
    }>("select email, display_name, status from users where tenant_id = $1 and id = $2 limit 1", [
      tenantId,
      userId,
    ]);
    const row = result.rows[0];
    return row ? { email: row.email, displayName: row.display_name, status: row.status } : null;
  }

  async emailTaken(tenantId: string, email: string, exceptUserId: string): Promise<boolean> {
    const result = await this.pool.query(
      `select 1 from users
        where tenant_id = $1 and lower(email) = lower($2) and id <> $3
        limit 1`,
      [tenantId, email, exceptUserId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findTenantName(tenantId: string): Promise<string> {
    const result = await this.pool.query<{ name: string }>(
      "select name from tenants where id = $1 limit 1",
      [tenantId],
    );
    return result.rows[0]?.name ?? "Rectangle";
  }

  async findPasswordHash(tenantId: string, userId: string): Promise<string | null> {
    const result = await this.pool.query<{ password_hash: string | null }>(
      "select password_hash from users where tenant_id = $1 and id = $2 limit 1",
      [tenantId, userId],
    );
    return result.rows[0]?.password_hash ?? null;
  }
}
