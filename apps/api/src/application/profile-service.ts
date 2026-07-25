/**
 * Self-service profile.
 *
 * Everything here acts on the caller's own record, so authorization is
 * implicit: the principal *is* the subject. No permission is required to
 * manage yourself, and no route accepts a user id — a profile endpoint that
 * took one would be an admin endpoint wearing the wrong name.
 */
import { z } from "zod";
import type { UserPrincipal } from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import type { LoginThrottle } from "../domain/login-throttle.js";
import type { PasswordHasher } from "../infrastructure/password.js";
import type { AuditRepository } from "./project-service.js";

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
});

/**
 * The current password is required.
 *
 * Without it, anyone reaching an unlocked screen can lock the real owner out
 * of their account permanently. The check is what makes this a password
 * *change* rather than a password takeover.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z
    .string()
    .min(12)
    .max(256)
    .regex(/[a-z]/u, "Include a lowercase letter.")
    .regex(/[A-Z]/u, "Include an uppercase letter.")
    .regex(/[0-9]/u, "Include a digit."),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export interface ProfileRecord {
  userId: string;
  tenantId: string;
  displayName: string;
  email: string;
  status: string;
  roles: string[];
  permissions: string[];
  userTypes: Array<{ id: string; name: string; key: string }>;
  passkeyCount: number;
  createdAt: string;
}

export interface ProfileRepository {
  findProfile(tenantId: string, userId: string): Promise<ProfileRecord | null>;
  updateDisplayName(tenantId: string, userId: string, displayName: string): Promise<boolean>;
  findPasswordHash(tenantId: string, userId: string): Promise<string | null>;
  updatePasswordHash(tenantId: string, userId: string, passwordHash: string): Promise<boolean>;
  /** Ends every session for this person except the one making the request. */
  revokeOtherSessions(tenantId: string, userId: string, keepSessionId: string): Promise<number>;
}

function parse<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DomainError("VALIDATION_FAILED", message, z.treeifyError(result.error));
  }
  return result.data;
}

export class ProfileService {
  constructor(
    private readonly repository: ProfileRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly audit: AuditRepository,
    private readonly throttle?: LoginThrottle,
  ) {}

  async getProfile(actor: UserPrincipal): Promise<ProfileRecord> {
    const profile = await this.repository.findProfile(actor.tenantId, actor.userId);
    if (!profile) {
      throw new DomainError("NOT_FOUND", "Your profile could not be loaded.");
    }
    return profile;
  }

  async updateProfile(actor: UserPrincipal, rawInput: unknown): Promise<ProfileRecord> {
    const input = parse(updateProfileSchema, rawInput, "Profile details are invalid.");

    const updated = await this.repository.updateDisplayName(
      actor.tenantId,
      actor.userId,
      input.displayName,
    );
    if (!updated) {
      throw new DomainError("NOT_FOUND", "Your profile could not be loaded.");
    }

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "profile.update",
      entityType: "user",
      entityId: actor.userId,
      result: "success",
      metadata: { changedFields: ["displayName"] },
    });

    return this.getProfile(actor);
  }

  /**
   * Changes the caller's password and ends their other sessions.
   *
   * A password change is how somebody responds to a suspected compromise, so
   * leaving other sessions alive would defeat the point of making it. The
   * current session survives, because signing the person out of the very act
   * of securing their account teaches them not to bother.
   */
  async changePassword(
    actor: UserPrincipal,
    rawInput: unknown,
  ): Promise<{ revokedSessions: number }> {
    const input = parse(changePasswordSchema, rawInput, "Password details are invalid.");

    // Guessing the current password is guessing a password, so it is throttled
    // exactly like the login route rather than left as an unmetered oracle.
    const throttleKey = [`profile-password:${actor.tenantId}:${actor.userId}`];
    const decision = this.throttle?.check(throttleKey);
    if (decision && !decision.allowed) {
      throw new DomainError(
        "RATE_LIMITED",
        "Too many attempts. Please wait before trying again.",
        { retryAfterSeconds: decision.retryAfterSeconds },
      );
    }

    const currentHash = await this.repository.findPasswordHash(actor.tenantId, actor.userId);
    if (!currentHash) {
      throw new DomainError("NOT_FOUND", "Your profile could not be loaded.");
    }

    const matches = await this.passwordHasher.verify(input.currentPassword, currentHash);
    if (!matches) {
      this.throttle?.recordFailure(throttleKey);
      await this.audit.append({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "profile.password_change",
        entityType: "user",
        entityId: actor.userId,
        result: "failure",
        metadata: { reason: "invalid_current_password" },
      });
      throw new DomainError("VALIDATION_FAILED", "Your current password is incorrect.");
    }

    if (input.newPassword === input.currentPassword) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "Your new password must be different from your current one.",
      );
    }

    this.throttle?.recordSuccess(throttleKey);

    const newHash = await this.passwordHasher.hash(input.newPassword);
    const changed = await this.repository.updatePasswordHash(
      actor.tenantId,
      actor.userId,
      newHash,
    );
    if (!changed) {
      throw new DomainError("NOT_FOUND", "Your profile could not be loaded.");
    }

    const revokedSessions = actor.sessionId
      ? await this.repository.revokeOtherSessions(actor.tenantId, actor.userId, actor.sessionId)
      : 0;

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "profile.password_change",
      entityType: "user",
      entityId: actor.userId,
      result: "success",
      metadata: { revokedSessions },
    });

    return { revokedSessions };
  }
}
