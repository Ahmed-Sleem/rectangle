/**
 * AuthService issues real authenticated sessions after validating tenant/user
 * credentials. It does not create demo users or bypass role lookup.
 */
import { nextIdleDeadline, sessionDeadlines, tokenLifetimeSeconds } from "../domain/session-policy.js";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { tenantRoleSchema, type TenantRole } from "../domain/auth.js";
import { parseLoginInput } from "../domain/auth-login.js";
import { DomainError } from "../domain/errors.js";
import type { AuditRepository } from "./project-service.js";
import type { PasswordHasher } from "../infrastructure/password.js";
import type { LoginThrottle } from "../domain/login-throttle.js";

export interface CredentialUserRecord {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  status: "active" | "invited" | "disabled";
  roles: TenantRole[];
  permissions: string[];
}

export interface AuthSessionRecord {
  /**
   * Present only on the per-request lookup, which re-reads live identity and
   * authority. Session creation does not select them.
   */
  roles?: TenantRole[];
  permissions?: string[];
  displayName?: string;
  email?: string;
  id: string;
  tenantId: string;
  userId: string;
  expiresAt: string;
  /** Fixed at sign-in and never extended; absent on rows created before it existed. */
  absoluteExpiresAt?: string;
}

export interface AuthRepository {
  findCredentialUser(tenantSlug: string, email: string): Promise<CredentialUserRecord | null>;
  createSession(input: {
    tenantId: string;
    userId: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: string;
    absoluteExpiresAt: string;
  }): Promise<AuthSessionRecord>;
  findActiveSession(sessionId: string, tenantId: string, userId: string): Promise<AuthSessionRecord | null>;
  /** Slides the idle deadline. Never moves the absolute cap. */
  touchSession(sessionId: string, expiresAt: string): Promise<void>;
  revokeSession(sessionId: string, tenantId: string, userId: string): Promise<void>;
  /**
   * The tenant behind a slug, regardless of whether the email matched anyone.
   *
   * Needed so a failed sign-in against an address that does not exist can still
   * be recorded. That is the attempt most worth recording, and it was
   * previously the only one silently discarded.
   */
  findTenantIdBySlug?(tenantSlug: string): Promise<string | null>;
}

export interface LoginContext {
  userAgent?: string;
  ipAddress?: string;
}

export interface LoginResult {
  accessToken: string;
  expiresAt: string;
  user: {
    id: string;
    tenantId: string;
    email: string;
    displayName: string;
    roles: TenantRole[];
    permissions: string[];
  };
}


export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly audit: AuditRepository,
    private readonly jwtSecret: string,
    private readonly throttle?: LoginThrottle,
  ) {}

  /**
   * Confirms the session is still live and reports the authority the user holds
   * *now*.
   *
   * Roles and permissions are also carried in the token, but a token is a
   * snapshot taken at login. Trusting it means an administrator who revokes
   * access has not actually revoked it until the token expires. The session
   * lookup already reads the user row on every request, so resolving authority
   * from the same query costs nothing extra and makes changes immediate.
   */
  async resolveSession(
    sessionId: string,
    tenantId: string,
    userId: string,
  ): Promise<{
    roles: TenantRole[];
    permissions: string[];
    displayName?: string;
    email?: string;
  } | null> {
    const session = await this.authRepository.findActiveSession(sessionId, tenantId, userId);
    if (!session) return null;

    /*
     * Being used is what keeps a session alive.
     *
     * This runs on every authenticated request, which makes it the only place
     * that reliably knows somebody is still working. The write is skipped
     * unless the deadline has drifted far enough to be worth one, so a page
     * issuing several queries at once does not write the same row several
     * times.
     *
     * Deliberately not awaited into the failure path: if the update fails the
     * request should still succeed, because the person is authenticated and
     * the worst case is that their session expires on the original schedule.
     * Failing a valid request to record a timestamp would be the tail wagging
     * the dog.
     */
    if (session.absoluteExpiresAt) {
      const next = nextIdleDeadline(
        new Date(session.expiresAt),
        new Date(session.absoluteExpiresAt),
      );
      if (next) {
        await this.authRepository
          .touchSession(sessionId, next)
          .catch(() => undefined);
      }
    }

    return {
      roles: session.roles ?? [],
      permissions: [...new Set(session.permissions ?? [])],
      // Read from the same row as authority, so a renamed person is renamed
      // everywhere on their next request rather than at their next sign-in.
      ...(session.displayName ? { displayName: session.displayName } : {}),
      ...(session.email ? { email: session.email } : {}),
    };
  }

  async verifySession(sessionId: string, tenantId: string, userId: string): Promise<boolean> {
    return (await this.resolveSession(sessionId, tenantId, userId)) !== null;
  }

  async logout(input: { tenantId: string; userId: string; sessionId?: string }): Promise<void> {
    if (!input.sessionId) return;
    await this.authRepository.revokeSession(input.sessionId, input.tenantId, input.userId);
    await this.audit.append({
      tenantId: input.tenantId,
      actorUserId: input.userId,
      action: "auth.logout",
      entityType: "user",
      entityId: input.userId,
      result: "success",
      metadata: { sessionId: input.sessionId },
    });
  }

  async login(rawInput: unknown, context: LoginContext = {}): Promise<LoginResult> {
    const input = parseLoginInput(rawInput);

    // Keyed by identity and by source, so neither one account under sustained
    // attack nor one machine spraying many accounts can keep guessing.
    const throttleKeys = [
      `identity:${(input.tenantSlug ?? "").toLowerCase()}:${input.email.toLowerCase()}`,
      ...(context.ipAddress ? [`address:${context.ipAddress}`] : []),
    ];

    // Resolved before the throttle check purely so a refusal can be attributed
    // to a real account in the audit trail. No credential is verified here.
    const user = await this.authRepository.findCredentialUser(input.tenantSlug ?? "", input.email);

    const decision = this.throttle?.check(throttleKeys);
    if (decision && !decision.allowed) {
      await this.auditFailure(user?.tenantId, user?.userId, input.tenantSlug ?? "", "rate_limited");
      throw new DomainError(
        "RATE_LIMITED",
        "Too many sign-in attempts. Please wait before trying again.",
        { retryAfterSeconds: decision.retryAfterSeconds },
      );
    }

    if (!user || user.status !== "active" || !user.passwordHash) {
      this.throttle?.recordFailure(throttleKeys);
      await this.auditFailure(user?.tenantId, user?.userId, input.tenantSlug ?? "", "invalid_credentials");
      throw new DomainError("UNAUTHENTICATED", "Email or password is incorrect.");
    }

    const roles = user.roles.filter((role) => tenantRoleSchema.safeParse(role).success);
    if (roles.length === 0) {
      await this.auditFailure(user.tenantId, user.userId, input.tenantSlug ?? "", "missing_roles");
      throw new DomainError("FORBIDDEN", "No active role is assigned to this user.");
    }

    const passwordOk = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!passwordOk) {
      this.throttle?.recordFailure(throttleKeys);
      await this.auditFailure(user.tenantId, user.userId, input.tenantSlug ?? "", "invalid_credentials");
      throw new DomainError("UNAUTHENTICATED", "Email or password is incorrect.");
    }

    this.throttle?.recordSuccess(throttleKeys);

    const { expiresAt, absoluteExpiresAt } = sessionDeadlines();
    const session = await this.authRepository.createSession({
      tenantId: user.tenantId,
      userId: user.userId,
      expiresAt,
      absoluteExpiresAt,
      ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
    });

    const permissions = [...new Set(user.permissions)];
    const accessToken = await new SignJWT({ tenant_id: user.tenantId, roles, permissions, sid: session.id })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${tokenLifetimeSeconds}s`)
      .sign(new TextEncoder().encode(this.jwtSecret));

    await this.audit.append({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: "auth.login",
      entityType: "user",
      entityId: user.userId,
      result: "success",
      metadata: { sessionId: session.id },
    });

    return {
      accessToken,
      expiresAt,
      user: {
        id: user.userId,
        tenantId: user.tenantId,
        email: user.email,
        displayName: user.displayName,
        roles,
        permissions,
      },
    };
  }

  /**
   * Records a refused sign-in.
   *
   * This previously began `if (!tenantId || !userId) return`, so an attempt
   * against an address that does not exist left no trace at all — which is
   * precisely the pattern worth recording, because it is what credential
   * spraying looks like. The tenant is resolved from the slug when the email
   * matches nobody, and the entry is written with no actor rather than not
   * written. `audit_events.actor_user_id` is nullable for exactly this case;
   * `tenant_id` is not, so an attempt against an unknown company genuinely
   * cannot be attributed and is the one case still skipped.
   */
  private async auditFailure(
    tenantId: string | undefined,
    userId: string | undefined,
    tenantSlug: string,
    reason: string,
  ): Promise<void> {
    const resolvedTenantId =
      tenantId ?? (tenantSlug ? await this.authRepository.findTenantIdBySlug?.(tenantSlug) : null);

    if (!resolvedTenantId) return;

    await this.audit.append({
      tenantId: resolvedTenantId,
      // Null rather than a fabricated id: nobody performed this action.
      actorUserId: userId ?? null,
      action: "auth.login_failed",
      entityType: "user",
      // The subject when known; otherwise the tenant, since the row needs one.
      entityId: userId ?? resolvedTenantId,
      result: "failure",
      metadata: { tenantSlug, reason },
    });
  }
}
