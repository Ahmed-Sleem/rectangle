/**
 * Setup schemas validate the one-time company/admin bootstrap without allowing
 * fake users or bypassing production password rules.
 */
import { z } from "zod";
import { DomainError } from "./errors.js";

export const firstAdminSetupInputSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  companySlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u),
  adminName: z.string().trim().min(2).max(160),
  adminEmail: z.email().trim().toLowerCase().max(254),
  password: z
    .string()
    .min(12)
    .max(256)
    .regex(/[a-z]/u, "Use at least one lowercase letter.")
    .regex(/[A-Z]/u, "Use at least one uppercase letter.")
    .regex(/[0-9]/u, "Use at least one number."),
});

export type FirstAdminSetupInput = z.infer<typeof firstAdminSetupInputSchema>;

export function parseFirstAdminSetupInput(input: unknown): FirstAdminSetupInput {
  const parsed = firstAdminSetupInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("VALIDATION_FAILED", "Setup input is invalid.", z.treeifyError(parsed.error));
  }
  return parsed.data;
}
