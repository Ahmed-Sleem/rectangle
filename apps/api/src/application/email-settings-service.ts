/** Tenant email settings service stores encrypted SMTP config and sends real test emails. */
import { requirePermission, type UserPrincipal } from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import { parseEmailSettings, parseTestEmail, type EmailSettingsInput } from "../domain/email-settings.js";
import { decryptSecret, encryptSecret } from "../infrastructure/secret-crypto.js";
import type { AuditRepository } from "./project-service.js";

export interface EmailSettingsRecord {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  encryptedPassword: string;
  fromEmail: string;
  fromName: string;
  updatedAt: string;
}

export interface PublicEmailSettings {
  configured: boolean;
  enabled: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  fromEmail?: string;
  fromName?: string;
  hasPassword: boolean;
  updatedAt?: string;
}

export interface EmailSettingsRepository {
  get(tenantId: string): Promise<EmailSettingsRecord | null>;
  upsert(tenantId: string, input: Omit<EmailSettingsInput, "password"> & { encryptedPassword: string }): Promise<EmailSettingsRecord>;
}

export interface EmailSender {
  send(input: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromEmail: string;
    fromName: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<void>;
}

function toPublic(record: EmailSettingsRecord | null): PublicEmailSettings {
  if (!record) return { configured: false, enabled: false, hasPassword: false };
  return {
    configured: true,
    enabled: record.enabled,
    host: record.host,
    port: record.port,
    secure: record.secure,
    username: record.username,
    fromEmail: record.fromEmail,
    fromName: record.fromName,
    hasPassword: Boolean(record.encryptedPassword),
    updatedAt: record.updatedAt,
  };
}

export class EmailSettingsService {
  constructor(
    private readonly repository: EmailSettingsRepository,
    private readonly sender: EmailSender,
    private readonly audit: AuditRepository,
  ) {}

  async getSettings(actor: UserPrincipal): Promise<{ emailSettings: PublicEmailSettings }> {
    requirePermission(actor, "settings.manage");
    return { emailSettings: toPublic(await this.repository.get(actor.tenantId)) };
  }

  async saveSettings(actor: UserPrincipal, rawInput: unknown): Promise<{ emailSettings: PublicEmailSettings }> {
    requirePermission(actor, "settings.manage");
    const input = parseEmailSettings(rawInput);
    const current = await this.repository.get(actor.tenantId);
    const encryptedPassword = input.password ? encryptSecret(input.password) : current?.encryptedPassword;
    if (!encryptedPassword) throw new DomainError("VALIDATION_FAILED", "SMTP password is required.");
    const saved = await this.repository.upsert(actor.tenantId, { ...input, encryptedPassword });
    await this.audit.append({ tenantId: actor.tenantId, actorUserId: actor.userId, action: "email_settings.update", entityType: "tenant", entityId: actor.tenantId, result: "success", metadata: { host: saved.host, enabled: saved.enabled } });
    return { emailSettings: toPublic(saved) };
  }

  async sendTestEmail(actor: UserPrincipal, rawInput: unknown): Promise<{ sent: true }> {
    requirePermission(actor, "settings.manage");
    const input = parseTestEmail(rawInput);
    const settings = await this.repository.get(actor.tenantId);
    if (!settings || !settings.enabled) throw new DomainError("VALIDATION_FAILED", "Email delivery is not configured or enabled.");
    await this.sender.send({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      username: settings.username,
      password: decryptSecret(settings.encryptedPassword),
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
      to: input.recipientEmail,
      subject: "Rectangle email test",
      text: "Rectangle email delivery is configured correctly.",
    });
    await this.audit.append({ tenantId: actor.tenantId, actorUserId: actor.userId, action: "email_settings.test", entityType: "tenant", entityId: actor.tenantId, result: "success", metadata: { recipientEmail: input.recipientEmail } });
    return { sent: true };
  }
}
