/**
 * Authentication input schemas validate login requests before credential lookup
 * or password verification occurs.
 */
import { z } from "zod";
import { DomainError } from "./errors.js";

export const loginInputSchema = z.object({
  tenantSlug: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u),
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(12).max(256),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export function parseLoginInput(input: unknown): LoginInput {
  const parsed = loginInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("VALIDATION_FAILED", "Login input is invalid.", z.treeifyError(parsed.error));
  }
  return parsed.data;
}
