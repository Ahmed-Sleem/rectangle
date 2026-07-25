/**
 * AuthService issues real authenticated sessions after validating tenant/user
 * credentials. It does not create demo users or bypass role lookup.
 */
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
  /** Present only on the per-request lookup, which re-reads live authority. */
  roles?: TenantRole[];
  permissions?: string[];
  id: string;
  tenantId: string;
  userId: string;
  expiresAt: string;
}

export interface AuthRepository {
  findCredentialUser(tenantSlug: string, email: string): Promise<CredentialUserRecord | null>;
  createSession(input: {
    tenantId: string;
    userId: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: string;
  }): Promise<AuthSessionRecord>;
  findActiveSession(sessionId: string, tenantId: string, userId: string): Promise<AuthSessionRecord | null>;
  revokeSession(sessionId: string, tenantId: string, userId: string): Promise<void>;
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

const accessTokenLifetimeSeconds = 60 * 60;

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
  ): Promise<{ roles: TenantRole[]; permissions: string[] } | null> {
    const session = await this.authRepository.findActiveSession(sessionId, tenantId, userId);
    if (!session) return null;
    return {
      roles: session.roles ?? [],
      permissions: [...new Set(session.permissions ?? [])],
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

    const expiresAt = new Date(Date.now() + accessTokenLifetimeSeconds * 1000).toISOString();
    const session = await this.authRepository.createSession({
      tenantId: user.tenantId,
      userId: user.userId,
      expiresAt,
      ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
    });

    const permissions = [...new Set(user.permissions)];
    const accessToken = await new SignJWT({ tenant_id: user.tenantId, roles, permissions, sid: session.id })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${accessTokenLifetimeSeconds}s`)
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

  private async auditFailure(tenantId: string | undefined, userId: string | undefined, tenantSlug: string, reason: string): Promise<void> {
    if (!tenantId || !userId) return;
    await this.audit.append({
      tenantId,
      actorUserId: userId,
      action: "auth.login_failed",
      entityType: "user",
      entityId: userId,
      result: "failure",
      metadata: { tenantSlug, reason },
    });
  }
}
