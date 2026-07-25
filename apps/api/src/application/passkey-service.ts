/** Passkey service implements WebAuthn registration and login ceremonies. */
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON, WebAuthnCredential } from "@simplewebauthn/server";
import { z } from "zod";
import type { UserPrincipal } from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import type { AuditRepository } from "./project-service.js";

export interface PasskeyCredentialRecord {
  id: string;
  tenantId: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType?: string;
  backedUp: boolean;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface PasskeyUserRecord {
  tenantId: string;
  userId: string;
  tenantSlug: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}

export interface PasskeyRepository {
  listCredentials(tenantId: string, userId: string): Promise<PasskeyCredentialRecord[]>;
  findCredentialByCredentialId(credentialId: string): Promise<PasskeyCredentialRecord | null>;
  findUserByTenantAndEmail(tenantSlug: string, email: string): Promise<PasskeyUserRecord | null>;
  findUserById(tenantId: string, userId: string): Promise<PasskeyUserRecord | null>;
  saveChallenge(input: { tenantId: string; userId: string; ceremony: "registration" | "authentication"; challenge: string; expiresAt: string }): Promise<void>;
  consumeChallenge(input: { tenantId: string; userId: string; ceremony: "registration" | "authentication" }): Promise<string | null>;
  saveCredential(input: Omit<PasskeyCredentialRecord, "id" | "createdAt" | "lastUsedAt">): Promise<PasskeyCredentialRecord>;
  updateCredentialCounter(credentialId: string, counter: number): Promise<void>;
  createSession(input: { tenantId: string; userId: string; expiresAt: string; userAgent?: string; ipAddress?: string }): Promise<{ id: string; expiresAt: string }>;
}

export interface RelyingPartyInfo {
  rpID: string;
  origin: string;
}

const accessTokenLifetimeSeconds = 60 * 60;

/**
 * Transport input is parsed rather than cast. WebAuthn verification does the
 * cryptographic work, but every other service validates its boundary with a
 * schema and this one should not be the exception that hides a shape error.
 */
const beginLoginSchema = z.object({
  tenantSlug: z.string().trim().min(1).max(63),
  email: z.string().trim().email().max(254),
});

const verifyLoginSchema = z.object({
  tenantId: z.uuid(),
  userId: z.uuid(),
  response: z.object({ id: z.string().min(1) }).loose(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DomainError("VALIDATION_FAILED", message, z.treeifyError(result.error));
  }
  return result.data;
}

function publicKeyToBase64(publicKey: Uint8Array): string {
  return Buffer.from(publicKey).toString("base64url");
}

function credentialToWebAuthn(record: PasskeyCredentialRecord): WebAuthnCredential {
  return {
    id: record.credentialId,
    publicKey: Buffer.from(record.publicKey, "base64url"),
    counter: record.counter,
    transports: record.transports as NonNullable<WebAuthnCredential["transports"]>,
  };
}

export class PasskeyService {
  constructor(
    private readonly repository: PasskeyRepository,
    private readonly audit: AuditRepository,
    private readonly jwtSecret: string,
  ) {}

  list(actor: UserPrincipal) {
    return this.repository.listCredentials(actor.tenantId, actor.userId).then((passkeys) => ({ passkeys }));
  }

  async beginRegistration(actor: UserPrincipal, rp: RelyingPartyInfo) {
    const existing = await this.repository.listCredentials(actor.tenantId, actor.userId);
    const options = await generateRegistrationOptions({
      rpName: "Rectangle",
      rpID: rp.rpID,
      userName: actor.userId,
      userID: Buffer.from(actor.userId),
      userDisplayName: "Rectangle user",
      attestationType: "none",
      excludeCredentials: existing.map((credential) => ({ id: credential.credentialId, transports: credential.transports as never })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    });
    await this.repository.saveChallenge({ tenantId: actor.tenantId, userId: actor.userId, ceremony: "registration", challenge: options.challenge, expiresAt: new Date(Date.now() + 300000).toISOString() });
    return options;
  }

  async verifyRegistration(actor: UserPrincipal, rp: RelyingPartyInfo, response: RegistrationResponseJSON) {
    const challenge = await this.repository.consumeChallenge({ tenantId: actor.tenantId, userId: actor.userId, ceremony: "registration" });
    if (!challenge) throw new DomainError("VALIDATION_FAILED", "Passkey registration challenge expired.");
    const verification = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: true });
    if (!verification.verified || !verification.registrationInfo) throw new DomainError("VALIDATION_FAILED", "Passkey registration could not be verified.");
    const credential = verification.registrationInfo.credential;
    const saved = await this.repository.saveCredential({
      tenantId: actor.tenantId,
      userId: actor.userId,
      credentialId: credential.id,
      publicKey: publicKeyToBase64(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
      name: "Passkey",
    });
    await this.audit.append({ tenantId: actor.tenantId, actorUserId: actor.userId, action: "passkey.register", entityType: "user", entityId: actor.userId, result: "success", metadata: { credentialId: saved.id } });
    return { verified: true, passkey: saved };
  }

  async beginLogin(rawInput: unknown, rp: RelyingPartyInfo) {
    const input = parseOrThrow(beginLoginSchema, rawInput, "Company and email are required.");
    const user = await this.repository.findUserByTenantAndEmail(input.tenantSlug, input.email.toLowerCase());
    if (!user) throw new DomainError("UNAUTHENTICATED", "Passkey sign in could not start.");
    const credentials = await this.repository.listCredentials(user.tenantId, user.userId);
    if (credentials.length === 0) throw new DomainError("UNAUTHENTICATED", "No passkeys are registered for this user.");
    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      allowCredentials: credentials.map((credential) => ({ id: credential.credentialId, transports: credential.transports as never })),
      userVerification: "required",
    });
    await this.repository.saveChallenge({ tenantId: user.tenantId, userId: user.userId, ceremony: "authentication", challenge: options.challenge, expiresAt: new Date(Date.now() + 300000).toISOString() });
    return { options, userHandle: { tenantId: user.tenantId, userId: user.userId } };
  }

  async verifyLogin(rawInput: unknown, rp: RelyingPartyInfo, context: { userAgent?: string; ipAddress?: string } = {}) {
    const input = parseOrThrow(verifyLoginSchema, rawInput, "Passkey response is invalid.");
    const response = input.response as unknown as AuthenticationResponseJSON;
    const credential = await this.repository.findCredentialByCredentialId(response.id);
    if (!credential || credential.tenantId !== input.tenantId || credential.userId !== input.userId) throw new DomainError("UNAUTHENTICATED", "Passkey sign in failed.");
    const challenge = await this.repository.consumeChallenge({ tenantId: input.tenantId, userId: input.userId, ceremony: "authentication" });
    if (!challenge) throw new DomainError("VALIDATION_FAILED", "Passkey sign in challenge expired.");
    const verification = await verifyAuthenticationResponse({ response, expectedChallenge: challenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, credential: credentialToWebAuthn(credential), requireUserVerification: true });
    if (!verification.verified) throw new DomainError("UNAUTHENTICATED", "Passkey sign in failed.");
    await this.repository.updateCredentialCounter(credential.credentialId, verification.authenticationInfo.newCounter);
    const user = await this.repository.findUserById(credential.tenantId, credential.userId);
    if (!user) throw new DomainError("UNAUTHENTICATED", "Passkey user was not found.");
    const expiresAt = new Date(Date.now() + accessTokenLifetimeSeconds * 1000).toISOString();
    const session = await this.repository.createSession({ tenantId: credential.tenantId, userId: credential.userId, expiresAt, ...(context.userAgent ? { userAgent: context.userAgent } : {}), ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}) });
    const accessToken = await new SignJWT({ tenant_id: user.tenantId, roles: user.roles, permissions: user.permissions, sid: session.id })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(credential.userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${accessTokenLifetimeSeconds}s`)
      .sign(new TextEncoder().encode(this.jwtSecret));
    await this.audit.append({ tenantId: credential.tenantId, actorUserId: credential.userId, action: "passkey.login", entityType: "user", entityId: credential.userId, result: "success" });
    return { accessToken, expiresAt, user: { id: user.userId, tenantId: user.tenantId, email: user.email, displayName: user.displayName, roles: user.roles, permissions: user.permissions } };
  }
}
