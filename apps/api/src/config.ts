/**
 * Runtime configuration validation fails closed when required production API
 * settings are missing or unsafe.
 */
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
