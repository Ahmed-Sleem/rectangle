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
  ) {}

  async verifySession(sessionId: string, tenantId: string, userId: string): Promise<boolean> {
    const session = await this.authRepository.findActiveSession(sessionId, tenantId, userId);
    return Boolean(session);
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
    const user = await this.authRepository.findCredentialUser(input.tenantSlug, input.email);
    if (!user || user.status !== "active" || !user.passwordHash) {
      await this.auditFailure(user?.tenantId, user?.userId, input.tenantSlug, "invalid_credentials");
      throw new DomainError("UNAUTHENTICATED", "Email, password, or company is incorrect.");
    }

    const roles = user.roles.filter((role) => tenantRoleSchema.safeParse(role).success);
    if (roles.length === 0) {
      await this.auditFailure(user.tenantId, user.userId, input.tenantSlug, "missing_roles");
      throw new DomainError("FORBIDDEN", "No active role is assigned to this user.");
    }

    const passwordOk = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!passwordOk) {
      await this.auditFailure(user.tenantId, user.userId, input.tenantSlug, "invalid_credentials");
      throw new DomainError("UNAUTHENTICATED", "Email, password, or company is incorrect.");
    }

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
