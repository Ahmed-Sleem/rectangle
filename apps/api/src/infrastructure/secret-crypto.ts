/** Encrypts tenant-provided operational secrets before database storage. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { DomainError } from "../domain/errors.js";

const prefix = "v1";

function getKey(secret = process.env.APP_SECRET_KEY): Buffer {
  if (!secret || secret.length < 32) {
    throw new DomainError("CONFIGURATION_REQUIRED", "APP_SECRET_KEY must be configured before saving or using encrypted settings.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [prefix, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptSecret(value: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(":");
  if (version !== prefix || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new DomainError("VALIDATION_FAILED", "Encrypted secret format is invalid.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}
