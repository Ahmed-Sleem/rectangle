/**
 * PostgreSQL self-service profile storage.
 *
 * Every statement is scoped by both tenant and user id. A profile query that
 * matched on user id alone would be one bug away from crossing tenants.
 */
import type pg from "pg";
import type { ProfileRecord, ProfileRepository } from "../../application/profile-service.js";

export class PostgresProfileRepository implements ProfileRepository {
  constructor(private readonly pool: pg.Pool) {}

  async findProfile(tenantId: string, userId: string): Promise<ProfileRecord | null> {
    const result = await this.pool.query<{
      user_id: string;
      tenant_id: string;
      display_name: string;
      email: string;
      status: string;
      roles: string[];
      permissions: string[];

      passkey_count: number;
      created_at: Date;
    }>(
      `select u.id as user_id, u.tenant_id, u.display_name, u.email, u.status, u.created_at,
              array[coalesce(max(r.role), 'none')] as roles,
              coalesce(array_agg(distinct p.permission) filter (where p.permission is not null), '{}') as permissions,
              (select count(*) from webauthn_credentials c
                where c.tenant_id = u.tenant_id and c.user_id = u.id)::int as passkey_count
         from users u
         left join tenant_user_roles r on r.tenant_id = u.tenant_id and r.user_id = u.id
         left join user_permissions p on p.tenant_id = u.tenant_id and p.user_id = u.id
        where u.tenant_id = $1 and u.id = $2
        group by u.id, u.tenant_id, u.display_name, u.email, u.status, u.created_at
        limit 1`,
      [tenantId, userId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      userId: row.user_id,
      tenantId: row.tenant_id,
      displayName: row.display_name,
      email: row.email,
      status: row.status,
      roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
      // Filled in by the service from the permission catalogue, which is
      // domain knowledge rather than anything the database holds.
      permissionLabels: [],
      permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
      passkeyCount: Number(row.passkey_count ?? 0),
      createdAt: row.created_at.toISOString(),
    };
  }

  async updateDisplayName(
    tenantId: string,
    userId: string,
    displayName: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `update users set display_name = $3, updated_at = now()
        where tenant_id = $1 and id = $2`,
      [tenantId, userId, displayName],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findPasswordHash(tenantId: string, userId: string): Promise<string | null> {
    const result = await this.pool.query<{ password_hash: string | null }>(
      "select password_hash from users where tenant_id = $1 and id = $2 limit 1",
      [tenantId, userId],
    );
    return result.rows[0]?.password_hash ?? null;
  }

  async updatePasswordHash(
    tenantId: string,
    userId: string,
    passwordHash: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `update users set password_hash = $3, updated_at = now()
        where tenant_id = $1 and id = $2`,
      [tenantId, userId, passwordHash],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async revokeOtherSessions(
    tenantId: string,
    userId: string,
    keepSessionId: string,
  ): Promise<number> {
    const result = await this.pool.query(
      `update auth_sessions set revoked_at = now()
        where tenant_id = $1 and user_id = $2 and id <> $3 and revoked_at is null`,
      [tenantId, userId, keepSessionId],
    );
    return result.rowCount ?? 0;
  }
}
