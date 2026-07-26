/** Tests the token security properties every lifecycle flow depends on. */
import { beforeEach, describe, expect, it } from "vitest";
import {
  AuthLifecycleService,
  type AuthTokenRepository,
} from "../src/application/auth-lifecycle-service.js";
import type { NotificationSender, OutboundMessage } from "../src/application/notification-sender.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import {
  hashToken,
  type AuthTokenRecord,
  type TokenPurpose,
} from "../src/domain/auth-token.js";
import { InMemoryLoginThrottle } from "../src/domain/login-throttle.js";
import type { PasswordHasher } from "../src/infrastructure/password.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

const actor: UserPrincipal = {
  tenantId,
  userId,
  sessionId: "33333333-3333-4333-8333-333333333333",
  roles: ["viewer"],
  permissions: [],
  displayName: "Ahmed Sleem",
};

class MemoryAudit implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> {
    this.events.push(event);
  }
}

class CapturingSender implements NotificationSender {
  readonly sent: Array<{ tenantId: string; message: OutboundMessage }> = [];
  failing = false;

  async send(sendTenantId: string, message: OutboundMessage): Promise<void> {
    if (this.failing) throw new Error("smtp down");
    this.sent.push({ tenantId: sendTenantId, message });
  }
}

class TestHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return `hashed:${password}`;
  }
  async verify(password: string, encodedHash: string): Promise<boolean> {
    return encodedHash === `hashed:${password}`;
  }
}

/** Models the pieces of the schema the service touches. */
class MemoryTokenRepository implements AuthTokenRepository {
  tokens: AuthTokenRecord[] = [];
  users = new Map<string, { email: string; displayName: string; status: string; passwordHash: string | null }>();
  passwordUpdates: string[] = [];
  revokedSessionsFor: string[] = [];
  statusChanges: string[] = [];
  emailChanges: string[] = [];
  nextId = 0;

  seedUser(email: string, status = "active"): void {
    this.users.set(userId, {
      email,
      displayName: "Ahmed Sleem",
      status,
      passwordHash: "hashed:CurrentPassword123",
    });
  }

  async issue(input: {
    tenantId: string;
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    // Mirrors the real retirement of earlier tokens of the same purpose.
    for (const token of this.tokens) {
      if (token.userId === input.userId && token.purpose === input.purpose && !token.consumedAt) {
        token.consumedAt = new Date().toISOString();
      }
    }
    this.nextId += 1;
    this.tokens.push({
      id: `token-${this.nextId}`,
      tenantId: input.tenantId,
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      metadata: input.metadata ?? {},
      expiresAt: input.expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    });
  }

  async findByHash(tokenHash: string): Promise<AuthTokenRecord | null> {
    return this.tokens.find((token) => token.tokenHash === tokenHash) ?? null;
  }

  async consume<T>(tokenId: string, action: (client: never) => Promise<T>): Promise<T | null> {
    const token = this.tokens.find((candidate) => candidate.id === tokenId);
    if (!token || token.consumedAt) return null;
    token.consumedAt = new Date().toISOString();

    // A stand-in for the transaction client, recording what the SQL would do.
    const client = {
      query: async (sql: string, values: unknown[]) => {
        if (sql.includes("password_hash = $3")) this.passwordUpdates.push(String(values[2]));
        if (sql.includes("revoked_at = now()")) this.revokedSessionsFor.push(String(values[1]));
        if (sql.includes("status = 'active'")) this.statusChanges.push("active");
        if (sql.includes("status = 'disabled'")) this.statusChanges.push("disabled");
        if (sql.includes("set email = $3")) this.emailChanges.push(String(values[2]));
        if (sql.includes("insert into auth_tokens")) {
          this.nextId += 1;
          this.tokens.push({
            id: `token-${this.nextId}`,
            tenantId: String(values[0]),
            userId: String(values[1]),
            purpose: "email_revert",
            tokenHash: String(values[2]),
            metadata: values[3] as Record<string, unknown>,
            expiresAt: (values[4] as Date).toISOString(),
            createdAt: new Date().toISOString(),
          });
        }
        return { rowCount: 1 };
      },
    } as never;

    return action(client);
  }

  async findUserByEmail(_slug: string, email: string) {
    const entry = this.users.get(userId);
    if (!entry || entry.email.toLowerCase() !== email.toLowerCase()) return null;
    return { tenantId, userId, displayName: entry.displayName, status: entry.status };
  }

  async findUserById(_tenantId: string, lookupUserId: string) {
    const entry = this.users.get(lookupUserId);
    return entry ? { email: entry.email, displayName: entry.displayName, status: entry.status } : null;
  }

  async emailTaken(_tenantId: string, email: string, exceptUserId: string): Promise<boolean> {
    for (const [id, entry] of this.users) {
      if (id !== exceptUserId && entry.email.toLowerCase() === email.toLowerCase()) return true;
    }
    return false;
  }

  async findTenantName(): Promise<string> {
    return "Cairo Build Co";
  }

  async findPasswordHash(): Promise<string | null> {
    return this.users.get(userId)?.passwordHash ?? null;
  }
}

function createService(repository: MemoryTokenRepository) {
  const sender = new CapturingSender();
  const audit = new MemoryAudit();
  const throttle = new InMemoryLoginThrottle({ maxAttempts: 3, windowSeconds: 60, lockoutSeconds: 120 });
  const service = new AuthLifecycleService(
    repository,
    sender,
    new TestHasher(),
    audit,
    "https://rectangle.example",
    throttle,
  );
  return { service, sender, audit };
}

/** Pulls the token out of a link the way a recipient's browser would. */
function tokenFromLink(text: string): string {
  const match = /token=([^\s]+)/u.exec(text);
  return decodeURIComponent(match![1]!);
}

describe("AuthLifecycleService", () => {
  let repository: MemoryTokenRepository;

  beforeEach(() => {
    repository = new MemoryTokenRepository();
    repository.seedUser("ahmed@rectangle.test");
  });

  describe("password reset", () => {
    it("emails a link that works once", async () => {
      const { service, sender } = createService(repository);
      await service.requestPasswordReset({ tenantSlug: "cairo", email: "ahmed@rectangle.test" });

      const token = tokenFromLink(sender.sent[0]!.message.text);
      await service.confirmPasswordReset({ token, newPassword: "BrandNewPassword123" });
      expect(repository.passwordUpdates).toEqual(["hashed:BrandNewPassword123"]);

      // Replaying the same link must not work a second time.
      await expect(
        service.confirmPasswordReset({ token, newPassword: "AnotherPassword123" }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    });

    it("says nothing about whether an address exists", async () => {
      const { service, sender } = createService(repository);
      const unknown = await service.requestPasswordReset({
        tenantSlug: "cairo",
        email: "nobody@rectangle.test",
      });

      // Same answer as a real address, and nothing sent.
      expect(unknown).toEqual({ requested: true });
      expect(sender.sent).toHaveLength(0);
    });

    it("ends every session, because a reset answers a suspected compromise", async () => {
      const { service, sender } = createService(repository);
      await service.requestPasswordReset({ tenantSlug: "cairo", email: "ahmed@rectangle.test" });
      await service.confirmPasswordReset({
        token: tokenFromLink(sender.sent[0]!.message.text),
        newPassword: "BrandNewPassword123",
      });

      expect(repository.revokedSessionsFor).toContain(userId);
    });

    it("refuses a link issued for a different purpose", async () => {
      const { service, sender } = createService(repository);
      await service.sendInvitation(actor, userId, "ahmed@rectangle.test", "Ahmed Sleem");
      const invitationToken = tokenFromLink(sender.sent[0]!.message.text);

      // An invitation must never work as a password reset, or the weakest
      // flow sets the security of the strongest.
      await expect(
        service.confirmPasswordReset({
          token: invitationToken,
          newPassword: "BrandNewPassword123",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      expect(repository.passwordUpdates).toHaveLength(0);
    });

    it("stores only a hash, so a leaked database is not a set of live links", async () => {
      const { service, sender } = createService(repository);
      await service.requestPasswordReset({ tenantSlug: "cairo", email: "ahmed@rectangle.test" });
      const token = tokenFromLink(sender.sent[0]!.message.text);

      const stored = repository.tokens.at(-1)!;
      expect(stored.tokenHash).not.toBe(token);
      expect(stored.tokenHash).toBe(hashToken(token));
    });

    it("throttles repeated requests for the same address", async () => {
      const { service } = createService(repository);
      const attempt = () =>
        service.requestPasswordReset({ tenantSlug: "cairo", email: "ahmed@rectangle.test" });

      for (let tries = 0; tries < 3; tries += 1) await attempt();
      await expect(attempt()).rejects.toMatchObject({ code: "RATE_LIMITED" });
    });

    it("retires an earlier link when a new one is issued", async () => {
      const { service, sender } = createService(repository);
      await service.requestPasswordReset({ tenantSlug: "cairo", email: "ahmed@rectangle.test" });
      const first = tokenFromLink(sender.sent[0]!.message.text);
      await service.requestPasswordReset({ tenantSlug: "cairo", email: "ahmed@rectangle.test" });

      // Otherwise every resend widens the set of live links.
      await expect(
        service.confirmPasswordReset({ token: first, newPassword: "BrandNewPassword123" }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    });
  });

  describe("invitations", () => {
    it("activates the account when accepted", async () => {
      repository.seedUser("new@rectangle.test", "invited");
      const { service, sender } = createService(repository);
      await service.sendInvitation(actor, userId, "new@rectangle.test", "New Person");

      const token = tokenFromLink(sender.sent[0]!.message.text);
      await service.acceptInvitation({ token, password: "BrandNewPassword123" });

      // Login filters on active, so this is what actually grants access.
      expect(repository.statusChanges).toContain("active");
      expect(repository.passwordUpdates).toEqual(["hashed:BrandNewPassword123"]);
    });

    it("cannot be accepted twice", async () => {
      repository.seedUser("new@rectangle.test", "invited");
      const { service, sender } = createService(repository);
      await service.sendInvitation(actor, userId, "new@rectangle.test", "New Person");
      const token = tokenFromLink(sender.sent[0]!.message.text);

      await service.acceptInvitation({ token, password: "BrandNewPassword123" });
      await expect(
        service.acceptInvitation({ token, password: "SomethingElse123" }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    });

    it("rejects a password that would be too weak to protect the account", async () => {
      repository.seedUser("new@rectangle.test", "invited");
      const { service, sender } = createService(repository);
      await service.sendInvitation(actor, userId, "new@rectangle.test", "New Person");
      const token = tokenFromLink(sender.sent[0]!.message.text);

      await expect(service.acceptInvitation({ token, password: "short" })).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
    });

    it("fails loudly when the company has not configured email", async () => {
      const { service, sender } = createService(repository);
      sender.failing = true;

      // An invitation that silently goes nowhere leaves an administrator
      // waiting for somebody who was never contacted.
      await expect(
        service.sendInvitation(actor, userId, "new@rectangle.test", "New Person"),
      ).rejects.toThrow();
    });
  });

  describe("email change", () => {
    it("sends the confirmation to the new address, not the current one", async () => {
      const { service, sender } = createService(repository);
      await service.requestEmailChange(actor, {
        newEmail: "ahmed.new@rectangle.test",
        currentPassword: "CurrentPassword123",
      });

      // The point is proving control of the address being moved to.
      expect(sender.sent[0]!.message.to).toBe("ahmed.new@rectangle.test");
      expect(repository.emailChanges).toHaveLength(0);
    });

    it("requires the current password", async () => {
      const { service } = createService(repository);
      await expect(
        service.requestEmailChange(actor, {
          newEmail: "ahmed.new@rectangle.test",
          currentPassword: "WrongPassword123",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    });

    it("moves the address and warns the old one, with a way back", async () => {
      const { service, sender } = createService(repository);
      await service.requestEmailChange(actor, {
        newEmail: "ahmed.new@rectangle.test",
        currentPassword: "CurrentPassword123",
      });
      await service.confirmEmailChange({ token: tokenFromLink(sender.sent[0]!.message.text) });

      expect(repository.emailChanges).toEqual(["ahmed.new@rectangle.test"]);
      // The warning is what catches a takeover.
      const warning = sender.sent[1]!;
      expect(warning.message.to).toBe("ahmed@rectangle.test");
      expect(warning.message.text).toContain("/email-change/revert");
    });

    it("locks the account when a change is reverted", async () => {
      const { service, sender } = createService(repository);
      await service.requestEmailChange(actor, {
        newEmail: "ahmed.new@rectangle.test",
        currentPassword: "CurrentPassword123",
      });
      await service.confirmEmailChange({ token: tokenFromLink(sender.sent[0]!.message.text) });

      repository.users.set(userId, {
        email: "ahmed.new@rectangle.test",
        displayName: "Ahmed Sleem",
        status: "active",
        passwordHash: "hashed:CurrentPassword123",
      });
      await service.revertEmailChange({ token: tokenFromLink(sender.sent[1]!.message.text) });

      // Restoring the address alone would not evict whoever moved it.
      expect(repository.emailChanges).toContain("ahmed@rectangle.test");
      expect(repository.statusChanges).toContain("disabled");
    });

    it("refuses an address another account already uses", async () => {
      repository.users.set("other-user", {
        email: "taken@rectangle.test",
        displayName: "Someone",
        status: "active",
        passwordHash: null,
      });
      const { service } = createService(repository);

      await expect(
        service.requestEmailChange(actor, {
          newEmail: "taken@rectangle.test",
          currentPassword: "CurrentPassword123",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });
});
