/**
 * PostgreSQL auth repository loads active tenant user credentials and persists
 * sessions for issued access tokens.
 */
import type pg from "pg";
import type { AuthRepository, AuthSessionRecord, CredentialUserRecord } from "../../application/auth-service.js";
import type { TenantRole } from "../../domain/auth.js";

function mapSession(row: Record<string, unknown>): AuthSessionRecord {
  const session: AuthSessionRecord = {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
  };
  // Only the per-request lookup selects identity and authority; session
  // creation returns the bare session row.
  if (Array.isArray(row.roles)) session.roles = row.roles.map(String) as TenantRole[];
  if (Array.isArray(row.permissions)) session.permissions = row.permissions.map(String);
  if (row.display_name != null) session.displayName = String(row.display_name);
  if (row.email != null) session.email = String(row.email);
  return session;
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
        coalesce(array_agg(distinct tenant_user_roles.role) filter (where tenant_user_roles.role is not null), '{}') as roles,
        coalesce(array_agg(distinct permission_value) filter (where permission_value is not null), '{}') as permissions
      from tenants
      join users on users.tenant_id = tenants.id
      left join tenant_user_roles on tenant_user_roles.tenant_id = tenants.id and tenant_user_roles.user_id = users.id
      left join user_type_assignments on user_type_assignments.tenant_id = tenants.id and user_type_assignments.user_id = users.id
      left join user_types on user_types.id = user_type_assignments.user_type_id
      left join lateral unnest(user_types.permissions) as permission_value on true
      where ($1 = '' or tenants.slug = $1) and lower(users.email) = lower($2) and users.status = 'active'
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
      permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
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
      // Status *and* authority are resolved on every request, not just at
      // login. Without the status check a disabled account keeps working until
      // its token expires; without re-reading roles and permissions, granting
      // or revoking access does not take effect until then either.
      `select s.id, s.tenant_id, s.user_id, s.expires_at,
              u.display_name, u.email,
              coalesce(array_agg(distinct r.role) filter (where r.role is not null), '{}') as roles,
              coalesce(array_agg(distinct permission_value) filter (where permission_value is not null), '{}') as permissions
         from auth_sessions s
         join users u on u.id = s.user_id and u.tenant_id = s.tenant_id
         left join tenant_user_roles r on r.tenant_id = u.tenant_id and r.user_id = u.id
         left join user_type_assignments a on a.tenant_id = u.tenant_id and a.user_id = u.id
         left join user_types t on t.id = a.user_type_id
         left join lateral unnest(t.permissions) as permission_value on true
        where s.id = $1 and s.tenant_id = $2 and s.user_id = $3
          and s.revoked_at is null and s.expires_at > now()
          and u.status = 'active'
        group by s.id, s.tenant_id, s.user_id, s.expires_at, u.display_name, u.email
        limit 1`,
      [sessionId, tenantId, userId],
    );
    return result.rows[0] ? mapSession(result.rows[0] as Record<string, unknown>) : null;
  }

  /** Ends every live session for one person, used when access is withdrawn. */
  async revokeAllSessionsForUser(tenantId: string, userId: string): Promise<void> {
    await this.pool.query(
      `update auth_sessions set revoked_at = now()
       where tenant_id = $1 and user_id = $2 and revoked_at is null`,
      [tenantId, userId],
    );
  }

  async revokeSession(sessionId: string, tenantId: string, userId: string): Promise<void> {
    await this.pool.query(
      `update auth_sessions set revoked_at = now()
       where id = $1 and tenant_id = $2 and user_id = $3 and revoked_at is null`,
      [sessionId, tenantId, userId],
    );
  }
}
