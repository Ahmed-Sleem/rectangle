/** PostgreSQL passkey repository for WebAuthn credentials and challenges. */
import type pg from "pg";
import type { PasskeyCredentialRecord, PasskeyRepository, PasskeyUserRecord } from "../../application/passkey-service.js";
import type { TenantRole } from "../../domain/auth.js";

function mapCredential(row: Record<string, unknown>): PasskeyCredentialRecord {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), userId: String(row.user_id), credentialId: String(row.credential_id), publicKey: String(row.public_key), counter: Number(row.counter), transports: Array.isArray(row.transports) ? row.transports.map(String) : [], backedUp: Boolean(row.backed_up), name: String(row.name), createdAt: new Date(String(row.created_at)).toISOString(), ...(row.device_type ? { deviceType: String(row.device_type) } : {}), ...(row.last_used_at ? { lastUsedAt: new Date(String(row.last_used_at)).toISOString() } : {}),
  };
}

function mapUser(row: Record<string, unknown>): PasskeyUserRecord {
  return { tenantId: String(row.tenant_id), userId: String(row.user_id), tenantSlug: String(row.tenant_slug), email: String(row.email), displayName: String(row.display_name), roles: Array.isArray(row.roles) ? row.roles.map(String) : [], permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [] };
}

export class PostgresPasskeyRepository implements PasskeyRepository {
  constructor(private readonly pool: pg.Pool) {}

  async listCredentials(tenantId: string, userId: string): Promise<PasskeyCredentialRecord[]> {
    const result = await this.pool.query("select * from webauthn_credentials where tenant_id = $1 and user_id = $2 order by created_at desc", [tenantId, userId]);
    return result.rows.map(mapCredential);
  }

  async findCredentialByCredentialId(credentialId: string): Promise<PasskeyCredentialRecord | null> {
    const result = await this.pool.query("select * from webauthn_credentials where credential_id = $1 limit 1", [credentialId]);
    return result.rows[0] ? mapCredential(result.rows[0]) : null;
  }

  async findUserByTenantAndEmail(tenantSlug: string, email: string): Promise<PasskeyUserRecord | null> {
    const result = await this.pool.query(
      `select tenants.id tenant_id, tenants.slug tenant_slug, users.id user_id, users.email, users.display_name,
        -- Resolved exactly as the password path resolves it. Two sign-in
        -- routes answering "what may this person do" differently would mean a
        -- passkey grants access a password does not.
        array[coalesce(max(tenant_user_roles.role), 'none')] as roles,
        coalesce(array_agg(distinct user_permissions.permission) filter (where user_permissions.permission is not null), '{}') as permissions
       from tenants join users on users.tenant_id = tenants.id
       left join tenant_user_roles on tenant_user_roles.tenant_id = tenants.id and tenant_user_roles.user_id = users.id
       left join user_permissions on user_permissions.tenant_id = tenants.id and user_permissions.user_id = users.id
       where ($1 = '' or tenants.slug = $1) and lower(users.email) = lower($2) and users.status = 'active'
       group by tenants.id, tenants.slug, users.id, users.email, users.display_name limit 1`,
      [tenantSlug, email],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findUserById(tenantId: string, userId: string): Promise<PasskeyUserRecord | null> {
    const result = await this.pool.query(
      `select tenants.id tenant_id, tenants.slug tenant_slug, users.id user_id, users.email, users.display_name,
        -- Resolved exactly as the password path resolves it. Two sign-in
        -- routes answering "what may this person do" differently would mean a
        -- passkey grants access a password does not.
        array[coalesce(max(tenant_user_roles.role), 'none')] as roles,
        coalesce(array_agg(distinct user_permissions.permission) filter (where user_permissions.permission is not null), '{}') as permissions
       from tenants join users on users.tenant_id = tenants.id
       left join tenant_user_roles on tenant_user_roles.tenant_id = tenants.id and tenant_user_roles.user_id = users.id
       left join user_permissions on user_permissions.tenant_id = tenants.id and user_permissions.user_id = users.id
       where tenants.id = $1 and users.id = $2 and users.status = 'active'
       group by tenants.id, tenants.slug, users.id, users.email, users.display_name limit 1`,
      [tenantId, userId],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async saveChallenge(input: { tenantId: string; userId: string; ceremony: "registration" | "authentication"; challenge: string; expiresAt: string }): Promise<void> {
    await this.pool.query("insert into webauthn_challenges (tenant_id, user_id, ceremony, challenge, expires_at) values ($1,$2,$3,$4,$5)", [input.tenantId, input.userId, input.ceremony, input.challenge, input.expiresAt]);
  }

  async consumeChallenge(input: { tenantId: string; userId: string; ceremony: "registration" | "authentication" }): Promise<string | null> {
    const result = await this.pool.query("delete from webauthn_challenges where id = (select id from webauthn_challenges where tenant_id = $1 and user_id = $2 and ceremony = $3 and expires_at > now() order by created_at desc limit 1) returning challenge", [input.tenantId, input.userId, input.ceremony]);
    return result.rows[0] ? String(result.rows[0].challenge) : null;
  }

  async saveCredential(input: Omit<PasskeyCredentialRecord, "id" | "createdAt" | "lastUsedAt">): Promise<PasskeyCredentialRecord> {
    const result = await this.pool.query("insert into webauthn_credentials (tenant_id,user_id,credential_id,public_key,counter,transports,device_type,backed_up,name) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *", [input.tenantId, input.userId, input.credentialId, input.publicKey, input.counter, input.transports, input.deviceType ?? null, input.backedUp, input.name]);
    return mapCredential(result.rows[0]);
  }

  async updateCredentialCounter(credentialId: string, counter: number): Promise<void> {
    await this.pool.query("update webauthn_credentials set counter = $2, last_used_at = now() where credential_id = $1", [credentialId, counter]);
  }

  async createSession(input: { tenantId: string; userId: string; expiresAt: string; userAgent?: string; ipAddress?: string }) {
    const result = await this.pool.query("insert into auth_sessions (tenant_id,user_id,user_agent,ip_address,expires_at) values ($1,$2,$3,$4,$5) returning id, expires_at", [input.tenantId, input.userId, input.userAgent ?? null, input.ipAddress ?? null, input.expiresAt]);
    return { id: String(result.rows[0].id), expiresAt: new Date(String(result.rows[0].expires_at)).toISOString() };
  }
}
