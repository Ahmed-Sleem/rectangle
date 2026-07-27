/** Tests self-service profile: identity, renaming, and password change rules. */
import { beforeEach, describe, expect, it } from "vitest";
import {
  ProfileService,
  type ProfileRecord,
  type ProfileRepository,
} from "../src/application/profile-service.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import { InMemoryLoginThrottle } from "../src/domain/login-throttle.js";
import type { PasswordHasher } from "../src/infrastructure/password.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

const actor: UserPrincipal = {
  tenantId,
  userId,
  sessionId,
  roles: ["member"],
  permissions: [],
};

class MemoryAudit implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> {
    this.events.push(event);
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

class MemoryProfileRepository implements ProfileRepository {
  displayName = "Ahmed Sleem";
  passwordHash: string | null = "hashed:CurrentPassword123";
  revokedKeeping: string | null = null;
  otherSessions = 3;

  async findProfile(lookupTenantId: string, lookupUserId: string): Promise<ProfileRecord | null> {
    if (lookupTenantId !== tenantId || lookupUserId !== userId) return null;
    return {
      userId,
      tenantId,
      displayName: this.displayName,
      email: "ahmed@rectangle.test",
      status: "active",
      roles: ["member"],
      permissions: [],
      userTypes: [],
      passkeyCount: 1,
      createdAt: new Date().toISOString(),
    };
  }

  async updateDisplayName(_t: string, _u: string, displayName: string): Promise<boolean> {
    this.displayName = displayName;
    return true;
  }

  async findPasswordHash(): Promise<string | null> {
    return this.passwordHash;
  }

  async updatePasswordHash(_t: string, _u: string, passwordHash: string): Promise<boolean> {
    this.passwordHash = passwordHash;
    return true;
  }

  async revokeOtherSessions(_t: string, _u: string, keepSessionId: string): Promise<number> {
    this.revokedKeeping = keepSessionId;
    return this.otherSessions;
  }
}

function createService() {
  const repository = new MemoryProfileRepository();
  const audit = new MemoryAudit();
  const throttle = new InMemoryLoginThrottle({ maxAttempts: 3, windowSeconds: 60, lockoutSeconds: 120 });
  return {
    service: new ProfileService(repository, new TestHasher(), audit, throttle),
    repository,
    audit,
  };
}

describe("ProfileService", () => {
  let context: ReturnType<typeof createService>;

  beforeEach(() => {
    context = createService();
  });

  it("returns the caller's own identity", async () => {
    const profile = await context.service.getProfile(actor);
    expect(profile.displayName).toBe("Ahmed Sleem");
    expect(profile.email).toBe("ahmed@rectangle.test");
    expect(profile.passkeyCount).toBe(1);
  });

  it("lets someone rename themselves and records it", async () => {
    const profile = await context.service.updateProfile(actor, { displayName: "Ahmed M. Sleem" });
    expect(profile.displayName).toBe("Ahmed M. Sleem");
    expect(context.audit.events.some((event) => event.action === "profile.update")).toBe(true);
  });

  it("rejects a name too short to be a name", async () => {
    await expect(context.service.updateProfile(actor, { displayName: "A" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("refuses a password change without the correct current password", async () => {
    await expect(
      context.service.changePassword(actor, {
        currentPassword: "WrongPassword123",
        newPassword: "BrandNewPassword123",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    // The stored password must be untouched by a failed attempt.
    expect(context.repository.passwordHash).toBe("hashed:CurrentPassword123");
  });

  it("records a failed password change so an attempt is visible", async () => {
    await context.service
      .changePassword(actor, { currentPassword: "Wrong", newPassword: "BrandNewPassword123" })
      .catch(() => undefined);

    const event = context.audit.events.find((entry) => entry.action === "profile.password_change");
    expect(event?.result).toBe("failure");
  });

  it("changes the password when the current one is correct", async () => {
    await context.service.changePassword(actor, {
      currentPassword: "CurrentPassword123",
      newPassword: "BrandNewPassword123",
    });
    expect(context.repository.passwordHash).toBe("hashed:BrandNewPassword123");
  });

  it("ends other sessions but keeps the one making the change", async () => {
    const result = await context.service.changePassword(actor, {
      currentPassword: "CurrentPassword123",
      newPassword: "BrandNewPassword123",
    });

    // A password change is how someone responds to a compromise; leaving the
    // other sessions alive would defeat it.
    expect(result.revokedSessions).toBe(3);
    expect(context.repository.revokedKeeping).toBe(sessionId);
  });

  it("refuses a new password that is the same as the current one", async () => {
    await expect(
      context.service.changePassword(actor, {
        currentPassword: "CurrentPassword123",
        newPassword: "CurrentPassword123",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("refuses a new password that is too weak", async () => {
    await expect(
      context.service.changePassword(actor, {
        currentPassword: "CurrentPassword123",
        newPassword: "short",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("throttles repeated wrong current-password attempts", async () => {
    const attempt = () =>
      context.service.changePassword(actor, {
        currentPassword: "Wrong",
        newPassword: "BrandNewPassword123",
      });

    for (let tries = 0; tries < 3; tries += 1) {
      await expect(attempt()).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }

    // Otherwise the endpoint is an unmetered oracle for guessing a password.
    await expect(attempt()).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
