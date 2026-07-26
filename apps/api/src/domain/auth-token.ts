/**
 * Single-use tokens for invitations, password resets, and email changes.
 *
 * The security properties live here rather than in the service, so every
 * caller inherits them and none can opt out by accident.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const tokenPurposeSchema = z.enum([
  "invitation",
  "password_reset",
  "email_change",
  "email_revert",
]);

export type TokenPurpose = z.infer<typeof tokenPurposeSchema>;

/**
 * How long each kind of token stays usable.
 *
 * An invitation is an onboarding step and people are slow to act on those. A
 * password reset and an email change are credential operations, so they get
 * the shortest window that is still usable. A revert is a safety net for
 * somebody who may not read their mail for a fortnight, so it outlives them
 * all deliberately.
 */
export const TOKEN_LIFETIMES_MS: Record<TokenPurpose, number> = {
  invitation: 7 * 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
  email_change: 60 * 60 * 1000,
  email_revert: 14 * 24 * 60 * 60 * 1000,
};

/**
 * 32 bytes of CSPRNG output, base64url encoded.
 *
 * 256 bits is far past guessable, which is what allows the stored form to be
 * a plain hash rather than a slow KDF.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The stored form. Only ever this — never the token itself. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Compares two hashes without leaking where they first differ.
 *
 * Lookup is by hash, so a naive comparison would expose a timing oracle that
 * lets an attacker walk a valid hash out of the database one byte at a time.
 */
export function tokensMatch(candidateHash: string, storedHash: string): boolean {
  const candidate = Buffer.from(candidateHash, "utf8");
  const stored = Buffer.from(storedHash, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // signal, so unequal lengths are rejected before it is called.
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

export interface AuthTokenRecord {
  id: string;
  tenantId: string;
  userId: string;
  purpose: TokenPurpose;
  tokenHash: string;
  metadata: Record<string, unknown>;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
}

export function expiryFor(purpose: TokenPurpose, now = Date.now()): Date {
  return new Date(now + TOKEN_LIFETIMES_MS[purpose]);
}

/** A token is usable only if it has never been used and has not lapsed. */
export function isTokenUsable(record: AuthTokenRecord, now = Date.now()): boolean {
  if (record.consumedAt) return false;
  return new Date(record.expiresAt).getTime() > now;
}

export const passwordSchema = z
  .string()
  .min(12)
  .max(256)
  .regex(/[a-z]/u, "Include a lowercase letter.")
  .regex(/[A-Z]/u, "Include an uppercase letter.")
  .regex(/[0-9]/u, "Include a digit.");

export const requestResetSchema = z.object({
  tenantSlug: z.string().trim().min(1).max(63),
  email: z.string().trim().email().max(254),
});

export const confirmResetSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: passwordSchema,
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(160).optional(),
});

export const requestEmailChangeSchema = z.object({
  newEmail: z.string().trim().email().max(254),
  currentPassword: z.string().min(1).max(256),
});

export const consumeTokenSchema = z.object({
  token: z.string().min(20).max(200),
});
