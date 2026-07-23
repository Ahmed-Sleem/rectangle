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
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
});

export type ApiConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return envSchema.parse(env);
}
