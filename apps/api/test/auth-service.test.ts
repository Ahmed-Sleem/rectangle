/** Tests real authentication service behavior without production-path fake users. */
import { jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { AuthService, type AuthRepository, type CredentialUserRecord } from "../src/application/auth-service.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";
import { InMemoryLoginThrottle } from "../src/domain/login-throttle.js";
import { ScryptPasswordHasher } from "../src/infrastructure/password.js";

const jwtSecret = "rectangle-test-secret-must-be-at-least-32-chars";
const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

class MemoryAuditRepository implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> {
    this.events.push(event);
  }
}

class MemoryAuthRepository implements AuthRepository {
  constructor(public user: CredentialUserRecord | null) {}

  async findCredentialUser(tenantSlug: string, email: string): Promise<CredentialUserRecord | null> {
    if (!this.user) return null;
    return this.user.tenantSlug === tenantSlug && this.user.email === email ? this.user : null;
  }

  async createSession(input: { tenantId: string; userId: string; expiresAt: string }) {
    return {
      id: "33333333-3333-4333-8333-333333333333",
      tenantId: input.tenantId,
      userId: input.userId,
      expiresAt: input.expiresAt,
    };
  }

  async findActiveSession(sessionId: string, sessionTenantId: string, sessionUserId: string) {
    return { id: sessionId, tenantId: sessionTenantId, userId: sessionUserId, expiresAt: new Date(Date.now() + 3600000).toISOString() };
  }

  async revokeSession(): Promise<void> {}
}

async function createService() {
  const hasher = new ScryptPasswordHasher();
  const passwordHash = await hasher.hash("VeryStrongPassword123!");
  const audit = new MemoryAuditRepository();
  const authRepository = new MemoryAuthRepository({
    tenantId,
    tenantSlug: "rectangle-eg",
    userId,
    email: "owner@rectangle.test",
    displayName: "Project Owner",
    passwordHash,
    status: "active",
    roles: ["tenant_admin", "project_manager"],
    permissions: [],
  });
  const throttle = new InMemoryLoginThrottle({ maxAttempts: 3, windowSeconds: 60, lockoutSeconds: 120 });
  return { service: new AuthService(authRepository, hasher, audit, jwtSecret, throttle), audit, throttle };
}

describe("AuthService", () => {
  it("issues a signed access token and records login audit", async () => {
    const { service, audit } = await createService();

    const result = await service.login({
      tenantSlug: "rectangle-eg",
      email: "owner@rectangle.test",
      password: "VeryStrongPassword123!",
    });

    expect(result.user.roles).toContain("tenant_admin");
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({ action: "auth.login", result: "success", entityId: userId });

    const verified = await jwtVerify(result.accessToken, new TextEncoder().encode(jwtSecret));
    expect(verified.payload.sub).toBe(userId);
    expect(verified.payload.tenant_id).toBe(tenantId);
    expect(verified.payload.sid).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("rejects invalid passwords and records a failure audit", async () => {
    const { service, audit } = await createService();

    await expect(service.login({
      tenantSlug: "rectangle-eg",
      email: "owner@rectangle.test",
      password: "WrongPassword123!",
    })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({ action: "auth.login_failed", result: "failure" });
  });

  it("rejects users with no active role", async () => {
    const hasher = new ScryptPasswordHasher();
    const audit = new MemoryAuditRepository();
    const service = new AuthService(new MemoryAuthRepository({
      tenantId,
      tenantSlug: "rectangle-eg",
      userId,
      email: "viewer@rectangle.test",
      displayName: "No Role User",
      passwordHash: await hasher.hash("VeryStrongPassword123!"),
      status: "active",
      roles: [],
      permissions: [],
    }), hasher, audit, jwtSecret);

    await expect(service.login({
      tenantSlug: "rectangle-eg",
      email: "viewer@rectangle.test",
      password: "VeryStrongPassword123!",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("stops guessing after repeated wrong passwords", async () => {
    const { service } = await createService();
    const attempt = () =>
      service.login({ tenantSlug: "rectangle-eg", email: "owner@rectangle.test", password: "WrongPassword123!" });

    for (let tries = 0; tries < 3; tries += 1) {
      await expect(attempt()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }

    // The fourth attempt is refused before the password is even checked.
    await expect(attempt()).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("refuses the correct password too while the lockout stands", async () => {
    const { service } = await createService();
    for (let tries = 0; tries < 3; tries += 1) {
      await expect(
        service.login({ tenantSlug: "rectangle-eg", email: "owner@rectangle.test", password: "WrongPassword123!" }),
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }

    // Otherwise an attacker who guesses correctly on attempt 50 still wins.
    await expect(
      service.login({ tenantSlug: "rectangle-eg", email: "owner@rectangle.test", password: "VeryStrongPassword123!" }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("records the refusal so an attack is visible in the audit trail", async () => {
    const { service, audit } = await createService();
    for (let tries = 0; tries < 4; tries += 1) {
      await service
        .login({ tenantSlug: "rectangle-eg", email: "owner@rectangle.test", password: "WrongPassword123!" })
        .catch(() => undefined);
    }

    expect(audit.events.some((event) => event.metadata?.reason === "rate_limited")).toBe(true);
  });
});
