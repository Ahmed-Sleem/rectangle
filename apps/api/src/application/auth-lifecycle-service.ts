/**
 * Invitations, password resets, and email changes.
 *
 * All three are the same shape — prove control of an address, then let one
 * action through — so they share one token model. Splitting them would mean
 * three chances to get the security details wrong in three different ways.
 */
import type pg from "pg";
import { z } from "zod";
import type { UserPrincipal } from "../domain/auth.js";
import {
  acceptInvitationSchema,
  confirmResetSchema,
  consumeTokenSchema,
  expiryFor,
  generateToken,
  hashToken,
  isTokenUsable,
  requestEmailChangeSchema,
  requestResetSchema,
  tokensMatch,
  TOKEN_LIFETIMES_MS,
  type AuthTokenRecord,
  type TokenPurpose,
} from "../domain/auth-token.js";
import { DomainError } from "../domain/errors.js";
import type { LoginThrottle } from "../domain/login-throttle.js";
import type { PasswordHasher } from "../infrastructure/password.js";
import { messages, type NotificationSender } from "./notification-sender.js";
import type { AuditRepository } from "./project-service.js";

export interface AuthTokenRepository {
  issue(input: {
    tenantId: string;
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    metadata?: Record<string, unknown>;
    createdByUserId?: string;
  }): Promise<void>;
  findByHash(tokenHash: string): Promise<AuthTokenRecord | null>;
  consume<T>(tokenId: string, action: (client: pg.PoolClient) => Promise<T>): Promise<T | null>;
  findUserByEmail(
    tenantSlug: string,
    email: string,
  ): Promise<{ tenantId: string; userId: string; displayName: string; status: string } | null>;
  findUserById(
    tenantId: string,
    userId: string,
  ): Promise<{ email: string; displayName: string; status: string } | null>;
  emailTaken(tenantId: string, email: string, exceptUserId: string): Promise<boolean>;
  findTenantName(tenantId: string): Promise<string>;
  findPasswordHash(tenantId: string, userId: string): Promise<string | null>;
}

function parse<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DomainError("VALIDATION_FAILED", message, z.treeifyError(result.error));
  }
  return result.data;
}

export class AuthLifecycleService {
  constructor(
    private readonly tokens: AuthTokenRepository,
    private readonly notifications: NotificationSender,
    private readonly passwordHasher: PasswordHasher,
    private readonly audit: AuditRepository,
    /** Absolute base for links in email, e.g. https://rectangle.example. */
    private readonly appBaseUrl: string,
    private readonly throttle?: LoginThrottle,
  ) {}

  private link(path: string, token: string): string {
    return `${this.appBaseUrl.replace(/\/$/u, "")}${path}?token=${encodeURIComponent(token)}`;
  }

  /** Issues a token, returning the plaintext exactly once for the email. */
  private async mint(
    tenantId: string,
    userId: string,
    purpose: TokenPurpose,
    metadata?: Record<string, unknown>,
    createdByUserId?: string,
  ): Promise<string> {
    const token = generateToken();
    await this.tokens.issue({
      tenantId,
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: expiryFor(purpose),
      ...(metadata ? { metadata } : {}),
      ...(createdByUserId ? { createdByUserId } : {}),
    });
    return token;
  }

  /**
   * Resolves a presented token to a usable record.
   *
   * Purpose is checked here rather than trusted from the caller, so an
   * invitation link can never be replayed against the password-reset route.
   */
  private async resolve(rawToken: unknown, purpose: TokenPurpose): Promise<AuthTokenRecord> {
    const { token } = parse(consumeTokenSchema, { token: rawToken }, "This link is not valid.");
    const candidateHash = hashToken(token);
    const record = await this.tokens.findByHash(candidateHash);

    // One message for every failure mode: an attacker learns nothing about
    // whether a link existed, was for another purpose, or merely lapsed.
    const invalid = new DomainError(
      "VALIDATION_FAILED",
      "This link is no longer valid. Please request a new one.",
    );

    if (!record) throw invalid;
    if (!tokensMatch(candidateHash, record.tokenHash)) throw invalid;
    if (record.purpose !== purpose) throw invalid;
    if (!isTokenUsable(record)) throw invalid;
    return record;
  }

  // ── Password reset ────────────────────────────────────────────────────────

  /**
   * Starts a password reset.
   *
   * Always reports success. Telling a caller that an address is unknown turns
   * the endpoint into a way to enumerate a company's staff.
   */
  async requestPasswordReset(rawInput: unknown): Promise<{ requested: true }> {
    const input = parse(requestResetSchema, rawInput, "Company and email are required.");
    const throttleKey = [`reset:${input.tenantSlug.toLowerCase()}:${input.email.toLowerCase()}`];

    const decision = this.throttle?.check(throttleKey);
    if (decision && !decision.allowed) {
      throw new DomainError("RATE_LIMITED", "Too many requests. Please wait before trying again.", {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }
    this.throttle?.recordFailure(throttleKey);

    const user = await this.tokens.findUserByEmail(input.tenantSlug, input.email);
    // A disabled or still-invited account gets no reset: the first cannot sign
    // in anyway, and the second has an invitation to finish instead.
    if (!user || user.status !== "active") {
      return { requested: true };
    }

    const token = await this.mint(user.tenantId, user.userId, "password_reset");
    const companyName = await this.tokens.findTenantName(user.tenantId);
    const body = messages.passwordReset(
      companyName,
      this.link("/reset/confirm", token),
      TOKEN_LIFETIMES_MS.password_reset / 60000,
    );

    await this.notifications.send(user.tenantId, { to: input.email, ...body });
    await this.audit.append({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: "auth.password_reset_requested",
      entityType: "user",
      entityId: user.userId,
      result: "success",
    });

    return { requested: true };
  }

  /**
   * Completes a password reset.
   *
   * Every session is ended: a reset is what somebody does when they believe
   * their account is compromised, and leaving the intruder signed in would
   * waste the act entirely.
   */
  async confirmPasswordReset(rawInput: unknown): Promise<{ reset: true }> {
    const input = parse(confirmResetSchema, rawInput, "This link or password is not valid.");
    const record = await this.resolve(input.token, "password_reset");
    const passwordHash = await this.passwordHasher.hash(input.newPassword);

    const done = await this.tokens.consume(record.id, async (client) => {
      await client.query(
        "update users set password_hash = $3, updated_at = now() where tenant_id = $1 and id = $2",
        [record.tenantId, record.userId, passwordHash],
      );
      await client.query(
        `update auth_sessions set revoked_at = now()
          where tenant_id = $1 and user_id = $2 and revoked_at is null`,
        [record.tenantId, record.userId],
      );
      return true;
    });

    if (!done) {
      throw new DomainError("VALIDATION_FAILED", "This link has already been used.");
    }

    await this.audit.append({
      tenantId: record.tenantId,
      actorUserId: record.userId,
      action: "auth.password_reset_completed",
      entityType: "user",
      entityId: record.userId,
      result: "success",
    });
    return { reset: true };
  }

  // ── Invitations ───────────────────────────────────────────────────────────

  /** Sends or resends an invitation. The caller has already been authorised. */
  async sendInvitation(
    actor: UserPrincipal,
    userId: string,
    email: string,
    displayName: string,
  ): Promise<void> {
    const token = await this.mint(actor.tenantId, userId, "invitation", {}, actor.userId);
    const companyName = await this.tokens.findTenantName(actor.tenantId);
    const body = messages.invitation(
      companyName,
      actor.displayName ?? companyName,
      this.link("/invite/accept", token),
      TOKEN_LIFETIMES_MS.invitation / 86_400_000,
    );

    await this.notifications.send(actor.tenantId, { to: email, ...body });
    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "user.invited",
      entityType: "user",
      entityId: userId,
      result: "success",
      metadata: { email, displayName },
    });
  }

  /** Reads an invitation without consuming it, so the page can be rendered. */
  async describeInvitation(rawToken: unknown): Promise<{ email: string; displayName: string; companyName: string }> {
    const record = await this.resolve(rawToken, "invitation");
    const user = await this.tokens.findUserById(record.tenantId, record.userId);
    if (!user) throw new DomainError("VALIDATION_FAILED", "This link is no longer valid.");
    return {
      email: user.email,
      displayName: user.displayName,
      companyName: await this.tokens.findTenantName(record.tenantId),
    };
  }

  async acceptInvitation(rawInput: unknown): Promise<{ accepted: true }> {
    const input = parse(acceptInvitationSchema, rawInput, "This link or password is not valid.");
    const record = await this.resolve(input.token, "invitation");
    const passwordHash = await this.passwordHasher.hash(input.password);

    const done = await this.tokens.consume(record.id, async (client) => {
      // The status change is what actually grants access: login already
      // refuses anyone who is not active.
      await client.query(
        `update users
            set password_hash = $3,
                status = 'active',
                display_name = coalesce($4, display_name),
                updated_at = now()
          where tenant_id = $1 and id = $2`,
        [record.tenantId, record.userId, passwordHash, input.displayName ?? null],
      );
      return true;
    });

    if (!done) {
      throw new DomainError("VALIDATION_FAILED", "This invitation has already been used.");
    }

    await this.audit.append({
      tenantId: record.tenantId,
      actorUserId: record.userId,
      action: "user.invitation_accepted",
      entityType: "user",
      entityId: record.userId,
      result: "success",
    });
    return { accepted: true };
  }

  // ── Email change ──────────────────────────────────────────────────────────

  /**
   * Starts an email change. The token goes to the *new* address, because the
   * point is to prove the person controls it before anything moves.
   */
  async requestEmailChange(actor: UserPrincipal, rawInput: unknown): Promise<{ requested: true }> {
    const input = parse(requestEmailChangeSchema, rawInput, "Email or password is not valid.");
    const throttleKey = [`email-change:${actor.tenantId}:${actor.userId}`];

    const decision = this.throttle?.check(throttleKey);
    if (decision && !decision.allowed) {
      throw new DomainError("RATE_LIMITED", "Too many attempts. Please wait before trying again.", {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }

    const currentHash = await this.tokens.findPasswordHash(actor.tenantId, actor.userId);
    if (!currentHash || !(await this.passwordHasher.verify(input.currentPassword, currentHash))) {
      this.throttle?.recordFailure(throttleKey);
      throw new DomainError("VALIDATION_FAILED", "Your current password is incorrect.");
    }
    this.throttle?.recordSuccess(throttleKey);

    if (await this.tokens.emailTaken(actor.tenantId, input.newEmail, actor.userId)) {
      throw new DomainError("CONFLICT", "Another account in this company already uses that email.");
    }

    const token = await this.mint(actor.tenantId, actor.userId, "email_change", {
      newEmail: input.newEmail,
    });
    const companyName = await this.tokens.findTenantName(actor.tenantId);
    const body = messages.emailChangeConfirm(
      companyName,
      this.link("/email-change/confirm", token),
      TOKEN_LIFETIMES_MS.email_change / 60000,
    );

    await this.notifications.send(actor.tenantId, { to: input.newEmail, ...body });
    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "user.email_change_requested",
      entityType: "user",
      entityId: actor.userId,
      result: "success",
      metadata: { newEmail: input.newEmail },
    });
    return { requested: true };
  }

  /**
   * Completes an email change and warns the address being replaced.
   *
   * The warning carries a revert token, which is what turns this from a
   * notification into a defence: whoever still holds the old address can undo
   * a change they did not make.
   */
  async confirmEmailChange(rawInput: unknown): Promise<{ changed: true }> {
    const record = await this.resolve(
      parse(consumeTokenSchema, rawInput, "This link is not valid.").token,
      "email_change",
    );

    const newEmail = String(record.metadata.newEmail ?? "");
    if (!newEmail) throw new DomainError("VALIDATION_FAILED", "This link is no longer valid.");

    const user = await this.tokens.findUserById(record.tenantId, record.userId);
    if (!user) throw new DomainError("VALIDATION_FAILED", "This link is no longer valid.");
    const previousEmail = user.email;

    // Rechecked at consumption, not only at request: two people can ask for
    // the same address before either confirms.
    if (await this.tokens.emailTaken(record.tenantId, newEmail, record.userId)) {
      throw new DomainError("CONFLICT", "Another account in this company already uses that email.");
    }

    const revertToken = generateToken();
    const done = await this.tokens.consume(record.id, async (client) => {
      await client.query(
        "update users set email = $3, updated_at = now() where tenant_id = $1 and id = $2",
        [record.tenantId, record.userId, newEmail],
      );
      // The identity moved, so sessions opened against the old one end.
      await client.query(
        `update auth_sessions set revoked_at = now()
          where tenant_id = $1 and user_id = $2 and revoked_at is null`,
        [record.tenantId, record.userId],
      );
      // Issued in the same transaction as the change it can undo, so a revert
      // link never exists for a change that did not happen.
      await client.query(
        `insert into auth_tokens (tenant_id, user_id, purpose, token_hash, metadata, expires_at)
         values ($1,$2,'email_revert',$3,$4,$5)`,
        [
          record.tenantId,
          record.userId,
          hashToken(revertToken),
          { previousEmail },
          expiryFor("email_revert"),
        ],
      );
      return true;
    });

    if (!done) throw new DomainError("VALIDATION_FAILED", "This link has already been used.");

    const companyName = await this.tokens.findTenantName(record.tenantId);
    const warning = messages.emailChangeWarning(
      companyName,
      newEmail,
      this.link("/email-change/revert", revertToken),
    );
    // Best effort: the change has already happened and is audited, so a
    // delivery failure must not roll it back or surface as an error to
    // somebody who did nothing wrong.
    await this.notifications.send(record.tenantId, { to: previousEmail, ...warning }).catch(() => undefined);

    await this.audit.append({
      tenantId: record.tenantId,
      actorUserId: record.userId,
      action: "user.email_changed",
      entityType: "user",
      entityId: record.userId,
      result: "success",
      metadata: { previousEmail, newEmail },
    });
    return { changed: true };
  }

  /**
   * Undoes an email change and disables the account.
   *
   * Reverting means somebody says they did not authorise the change, so the
   * account is locked rather than merely restored: if an attacker held it
   * long enough to move the address, returning the address alone does not
   * evict them.
   */
  async revertEmailChange(rawInput: unknown): Promise<{ reverted: true }> {
    const record = await this.resolve(
      parse(consumeTokenSchema, rawInput, "This link is not valid.").token,
      "email_revert",
    );
    const previousEmail = String(record.metadata.previousEmail ?? "");
    if (!previousEmail) throw new DomainError("VALIDATION_FAILED", "This link is no longer valid.");

    const done = await this.tokens.consume(record.id, async (client) => {
      await client.query(
        `update users set email = $3, status = 'disabled', updated_at = now()
          where tenant_id = $1 and id = $2`,
        [record.tenantId, record.userId, previousEmail],
      );
      await client.query(
        `update auth_sessions set revoked_at = now()
          where tenant_id = $1 and user_id = $2 and revoked_at is null`,
        [record.tenantId, record.userId],
      );
      return true;
    });

    if (!done) throw new DomainError("VALIDATION_FAILED", "This link has already been used.");

    await this.audit.append({
      tenantId: record.tenantId,
      actorUserId: record.userId,
      action: "user.email_change_reverted",
      entityType: "user",
      entityId: record.userId,
      result: "success",
      metadata: { restoredEmail: previousEmail },
    });
    return { reverted: true };
  }
}
