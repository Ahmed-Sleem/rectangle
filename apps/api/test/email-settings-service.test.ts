/** Tests encrypted SMTP settings and real sender adapter boundary. */
import { describe, expect, it, beforeEach } from "vitest";
import { EmailSettingsService, type EmailSender, type EmailSettingsRecord, type EmailSettingsRepository } from "../src/application/email-settings-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const admin: UserPrincipal = { tenantId, userId: "22222222-2222-4222-8222-222222222222", roles: ["owner"], permissions: [] };

class MemoryAuditRepository implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> { this.events.push(event); }
}

class MemoryEmailSettingsRepository implements EmailSettingsRepository {
  record: EmailSettingsRecord | null = null;
  async get(): Promise<EmailSettingsRecord | null> { return this.record; }
  async upsert(tenant: string, input: Omit<Parameters<EmailSettingsRepository["upsert"]>[1], never>): Promise<EmailSettingsRecord> {
    this.record = { tenantId: tenant, ...input, updatedAt: new Date().toISOString() } as EmailSettingsRecord;
    return this.record;
  }
}

class MemoryEmailSender implements EmailSender {
  sent: Array<Parameters<EmailSender["send"]>[0]> = [];
  async send(input: Parameters<EmailSender["send"]>[0]): Promise<void> { this.sent.push(input); }
}

function createService() {
  const repo = new MemoryEmailSettingsRepository();
  const sender = new MemoryEmailSender();
  const audit = new MemoryAuditRepository();
  return { service: new EmailSettingsService(repo, sender, audit), repo, sender, audit };
}

describe("EmailSettingsService", () => {
  beforeEach(() => { process.env.APP_SECRET_KEY = "test-secret-key-with-at-least-32-chars"; });

  it("stores SMTP password encrypted and never returns it publicly", async () => {
    const { service, repo } = createService();
    const result = await service.saveSettings(admin, {
      enabled: true,
      host: "smtp.example.com",
      port: 587,
      secure: false,
      username: "mailer@example.com",
      password: "smtp-password",
      fromEmail: "mailer@example.com",
      fromName: "Rectangle",
    });

    expect(repo.record?.encryptedPassword).not.toBe("smtp-password");
    expect(result.emailSettings).toMatchObject({ configured: true, hasPassword: true, host: "smtp.example.com" });
    expect(result.emailSettings).not.toHaveProperty("password");
  });

  it("sends real test email through configured sender", async () => {
    const { service, sender } = createService();
    await service.saveSettings(admin, { enabled: true, host: "smtp.example.com", port: 587, secure: false, username: "mailer@example.com", password: "smtp-password", fromEmail: "mailer@example.com", fromName: "Rectangle" });

    await service.sendTestEmail(admin, { recipientEmail: "owner@example.com" });

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({ to: "owner@example.com", password: "smtp-password" });
  });
});
