/** Encrypts tenant-provided operational secrets before database storage. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { DomainError } from "../domain/errors.js";

const prefix = "v1";

/**
 * Set once at startup from the validated config.
 *
 * This module used to read `process.env.APP_SECRET_KEY` itself, every call.
 * That is why a deployment without the variable booted happily and then failed
 * the first time somebody saved an SMTP password or an assistant key: the only
 * code that knew the key was missing ran hours or weeks after startup, in the
 * middle of a request, and could say nothing more useful than 503. Reading it
 * from the config instead means the process knows at boot whether it can keep
 * a secret, and says so then.
 */
let configuredKey: string | undefined;

export function configureSecretKey(secret: string): void {
  configuredKey = secret;
}

function getKey(secret = configuredKey ?? process.env.APP_SECRET_KEY): Buffer {
  if (!secret || secret.length < 32) {
    throw new DomainError(
      "CONFIGURATION_REQUIRED",
      "This deployment cannot store secrets yet: APP_SECRET_KEY is not configured.",
    );
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
