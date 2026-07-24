/** PostgreSQL repository for encrypted tenant SMTP settings. */
import type pg from "pg";
import type { EmailSettingsRecord, EmailSettingsRepository } from "../../application/email-settings-service.js";
import type { EmailSettingsInput } from "../../domain/email-settings.js";

function mapRow(row: Record<string, unknown>): EmailSettingsRecord {
  return {
    enabled: Boolean(row.enabled),
    host: String(row.host),
    port: Number(row.port),
    secure: Boolean(row.secure),
    username: String(row.username),
    encryptedPassword: String(row.encrypted_password),
    fromEmail: String(row.from_email),
    fromName: String(row.from_name),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export class PostgresEmailSettingsRepository implements EmailSettingsRepository {
  constructor(private readonly pool: pg.Pool) {}

  async get(tenantId: string): Promise<EmailSettingsRecord | null> {
    const result = await this.pool.query("select * from tenant_email_settings where tenant_id = $1 limit 1", [tenantId]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async upsert(tenantId: string, input: Omit<EmailSettingsInput, "password"> & { encryptedPassword: string }): Promise<EmailSettingsRecord> {
    const result = await this.pool.query(
      `insert into tenant_email_settings (tenant_id, enabled, host, port, secure, username, encrypted_password, from_email, from_name)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (tenant_id) do update set
         enabled = excluded.enabled,
         host = excluded.host,
         port = excluded.port,
         secure = excluded.secure,
         username = excluded.username,
         encrypted_password = excluded.encrypted_password,
         from_email = excluded.from_email,
         from_name = excluded.from_name,
         updated_at = now()
       returning *`,
      [tenantId, input.enabled, input.host, input.port, input.secure, input.username, input.encryptedPassword, input.fromEmail, input.fromName],
    );
    return mapRow(result.rows[0]);
  }
}
