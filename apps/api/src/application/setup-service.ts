/**
 * SetupService performs the one-time first company/admin bootstrap. It is the
 * only production path that can create the first tenant without authentication.
 */
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { parseFirstAdminSetupInput } from "../domain/setup.js";
import { DomainError } from "../domain/errors.js";
import type { PasswordHasher } from "../infrastructure/password.js";
import type { AuditRepository } from "./project-service.js";

export interface SetupStatus {
  setupRequired: boolean;
}

export interface SetupRepository {
  getSetupStatus(): Promise<SetupStatus>;
  createFirstAdmin(input: {
    companyName: string;
    companySlug: string;
    adminName: string;
    adminEmail: string;
    passwordHash: string;
    expiresAt: string;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<{
    tenantId: string;
    userId: string;
    sessionId: string;
    email: string;
    displayName: string;
    roles: Array<"tenant_owner" | "tenant_admin">;
    permissions: string[];
  }>;
}

export interface SetupResult {
  accessToken: string;
  expiresAt: string;
  user: {
    id: string;
    tenantId: string;
    email: string;
    displayName: string;
    roles: Array<"tenant_owner" | "tenant_admin">;
    permissions: string[];
  };
}

const accessTokenLifetimeSeconds = 60 * 60;

export class SetupService {
  constructor(
    private readonly setupRepository: SetupRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly audit: AuditRepository,
    private readonly jwtSecret: string,
  ) {}

  getStatus(): Promise<SetupStatus> {
    return this.setupRepository.getSetupStatus();
  }

  async createFirstAdmin(rawInput: unknown, context: { userAgent?: string; ipAddress?: string } = {}): Promise<SetupResult> {
    const status = await this.setupRepository.getSetupStatus();
    if (!status.setupRequired) {
      throw new DomainError("FORBIDDEN", "Initial setup has already been completed.");
    }

    const input = parseFirstAdminSetupInput(rawInput);
    const passwordHash = await this.passwordHasher.hash(input.password);
    const expiresAt = new Date(Date.now() + accessTokenLifetimeSeconds * 1000).toISOString();
    const created = await this.setupRepository.createFirstAdmin({
      companyName: input.companyName,
      companySlug: input.companySlug,
      adminName: input.adminName,
      adminEmail: input.adminEmail,
      passwordHash,
      expiresAt,
      ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
    });

    const accessToken = await new SignJWT({ tenant_id: created.tenantId, roles: created.roles, permissions: created.permissions, sid: created.sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(created.userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${accessTokenLifetimeSeconds}s`)
      .sign(new TextEncoder().encode(this.jwtSecret));

    await this.audit.append({
      tenantId: created.tenantId,
      actorUserId: created.userId,
      action: "setup.first_admin_create",
      entityType: "tenant",
      entityId: created.tenantId,
      result: "success",
      metadata: { companySlug: input.companySlug },
    });

    return {
      accessToken,
      expiresAt,
      user: {
        id: created.userId,
        tenantId: created.tenantId,
        email: created.email,
        displayName: created.displayName,
        roles: created.roles,
        permissions: created.permissions,
      },
    };
  }
}
