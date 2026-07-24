/**
 * PostgreSQL setup repository creates the first tenant/admin atomically and
 * refuses to act once any tenant already exists.
 */
import type pg from "pg";
import { DomainError } from "../../domain/errors.js";
import type { SetupRepository, SetupStatus } from "../../application/setup-service.js";

export class PostgresSetupRepository implements SetupRepository {
  constructor(private readonly pool: pg.Pool) {}

  async getSetupStatus(): Promise<SetupStatus> {
    const result = await this.pool.query("select exists(select 1 from tenants) as exists");
    return { setupRequired: !Boolean(result.rows[0]?.exists) };
  }

  async createFirstAdmin(input: {
    companyName: string;
    companySlug: string;
    adminName: string;
    adminEmail: string;
    passwordHash: string;
    expiresAt: string;
    userAgent?: string;
    ipAddress?: string;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query("select 1 from tenants limit 1");
      if (existing.rowCount && existing.rowCount > 0) {
        throw new DomainError("FORBIDDEN", "Initial setup has already been completed.");
      }

      const tenant = await client.query(
        "insert into tenants (name, slug) values ($1, $2) returning id",
        [input.companyName, input.companySlug],
      );
      const tenantId = String(tenant.rows[0].id);

      const user = await client.query(
        `insert into users (tenant_id, email, display_name, password_hash, status)
         values ($1, $2, $3, $4, 'active') returning id, email, display_name`,
        [tenantId, input.adminEmail, input.adminName, input.passwordHash],
      );
      const userId = String(user.rows[0].id);

      await client.query(
        `insert into tenant_user_roles (tenant_id, user_id, role) values
         ($1, $2, 'tenant_owner'),
         ($1, $2, 'tenant_admin')`,
        [tenantId, userId],
      );

      const session = await client.query(
        `insert into auth_sessions (tenant_id, user_id, user_agent, ip_address, expires_at)
         values ($1, $2, $3, $4, $5) returning id`,
        [tenantId, userId, input.userAgent ?? null, input.ipAddress ?? null, input.expiresAt],
      );

      await client.query("commit");
      return {
        tenantId,
        userId,
        sessionId: String(session.rows[0].id),
        email: String(user.rows[0].email),
        displayName: String(user.rows[0].display_name),
        roles: ["tenant_owner", "tenant_admin"] as Array<"tenant_owner" | "tenant_admin">,
        permissions: [],
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
