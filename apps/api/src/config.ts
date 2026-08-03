/**
 * Runtime configuration validation fails closed when required production API
 * settings are missing or unsafe.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().url(),
  SESSION_JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url().optional(),
  /**
   * Absolute origin used to build links inside transactional email.
   *
   * A relative link is useless in an inbox, and deriving one from the
   * incoming request would let a forged Host header point a password reset at
   * an attacker's site. It therefore comes from the environment or not at all.
   */
  APP_BASE_URL: z.string().url().optional(),
  /**
   * The key that encrypts stored third-party secrets: SMTP passwords and the
   * assistant's API keys.
   *
   * Optional here, and that is a deliberate compromise rather than an
   * oversight. It was read directly from `process.env` by the crypto module and
   * declared nowhere, so a deployment without it booted perfectly, served every
   * page, and then answered "Service Unavailable" the first time somebody
   * finished the mail or assistant wizard — with nothing on the screen or in
   * the config to say why. Making it required would surface that honestly but
   * would also stop an already-running deployment from booting at all on the
   * next release, which trades a confusing failure for an outage.
   *
   * So it is declared, validated when present, and falls back to a value
   * derived from the session secret when absent, with a warning at startup.
   * `resolveSecretKey` below owns that decision so there is one answer to it.
   */
  APP_SECRET_KEY: z.string().min(32).optional(),
});

export type ApiConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return envSchema.parse(env);
}

/**
 * Where emailed links should point.
 *
 * Falls back to the configured browser origin, which is the same host in a
 * single-service deployment, and finally to localhost for development.
 */
export function resolveAppBaseUrl(config: ApiConfig): string {
  return config.APP_BASE_URL ?? config.CORS_ORIGIN ?? "http://localhost:5173";
}

/**
 * The key used to encrypt stored third-party secrets.
 *
 * Prefers the dedicated variable. Falls back to a value derived from the
 * session secret so that a deployment which never set one keeps working
 * instead of failing at the moment somebody saves a password — but the derived
 * key is tied to the session secret, so rotating that would make previously
 * stored secrets undecryptable. That is the reason for the warning, and the
 * reason a real deployment should set `APP_SECRET_KEY` explicitly.
 *
 * Derived rather than reused verbatim: the two keys protect different things,
 * and a signing secret that is also an encryption key means one disclosure
 * costs both.
 */
export function resolveSecretKey(config: ApiConfig): string {
  if (config.APP_SECRET_KEY) return config.APP_SECRET_KEY;
  return createHash("sha256")
    .update(`rectangle:secret-at-rest:${config.SESSION_JWT_SECRET}`)
    .digest("hex");
}

/** True when the fallback is in use, so startup can say so once. */
export function isDerivedSecretKey(config: ApiConfig): boolean {
  return !config.APP_SECRET_KEY;
}
