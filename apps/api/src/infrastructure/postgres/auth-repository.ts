/**
 * PostgreSQL auth repository loads active tenant user credentials and persists
 * sessions for issued access tokens.
 */
import type pg from "pg";
import type { AuthRepository, AuthSessionRecord, CredentialUserRecord } from "../../application/auth-service.js";
import type { TenantRole } from "../../domain/auth.js";

function mapSession(row: Record<string, unknown>): AuthSessionRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
  };
}

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly pool: pg.Pool) {}

  async findCredentialUser(tenantSlug: string, email: string): Promise<CredentialUserRecord | null> {
    const result = await this.pool.query(
      `select
        tenants.id as tenant_id,
        tenants.slug as tenant_slug,
        users.id as user_id,
        users.email,
        users.display_name,
        users.password_hash,
        users.status,
        coalesce(array_agg(tenant_user_roles.role) filter (where tenant_user_roles.role is not null), '{}') as roles
      from tenants
      join users on users.tenant_id = tenants.id
      left join tenant_user_roles on tenant_user_roles.tenant_id = tenants.id and tenant_user_roles.user_id = users.id
      where tenants.slug = $1 and lower(users.email) = lower($2)
      group by tenants.id, tenants.slug, users.id, users.email, users.display_name, users.password_hash, users.status
      limit 1`,
      [tenantSlug, email],
    );

    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      tenantId: String(row.tenant_id),
      tenantSlug: String(row.tenant_slug),
      userId: String(row.user_id),
      email: String(row.email),
      displayName: String(row.display_name),
      passwordHash: row.password_hash == null ? null : String(row.password_hash),
      status: row.status as CredentialUserRecord["status"],
      roles: Array.isArray(row.roles) ? row.roles.map(String) as TenantRole[] : [],
    };
  }

  async createSession(input: {
    tenantId: string;
    userId: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: string;
  }): Promise<AuthSessionRecord> {
    const result = await this.pool.query(
      `insert into auth_sessions (tenant_id, user_id, user_agent, ip_address, expires_at)
       values ($1,$2,$3,$4,$5)
       returning id, tenant_id, user_id, expires_at`,
      [input.tenantId, input.userId, input.userAgent ?? null, input.ipAddress ?? null, input.expiresAt],
    );
    return mapSession(result.rows[0] as Record<string, unknown>);
  }

  async findActiveSession(sessionId: string, tenantId: string, userId: string): Promise<AuthSessionRecord | null> {
    const result = await this.pool.query(
      `select id, tenant_id, user_id, expires_at from auth_sessions
       where id = $1 and tenant_id = $2 and user_id = $3 and revoked_at is null and expires_at > now()
       limit 1`,
      [sessionId, tenantId, userId],
    );
    return result.rows[0] ? mapSession(result.rows[0] as Record<string, unknown>) : null;
  }

  async revokeSession(sessionId: string, tenantId: string, userId: string): Promise<void> {
    await this.pool.query(
      `update auth_sessions set revoked_at = now()
       where id = $1 and tenant_id = $2 and user_id = $3 and revoked_at is null`,
      [sessionId, tenantId, userId],
    );
  }
}
