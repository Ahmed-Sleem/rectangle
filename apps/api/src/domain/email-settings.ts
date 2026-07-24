/** Validation schemas for tenant SMTP settings and email tests. */
import { z } from "zod";
import { DomainError } from "./errors.js";

export const emailSettingsInputSchema = z.object({
  enabled: z.boolean().default(true),
  host: z.string().trim().min(2).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  username: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(512).optional(),
  fromEmail: z.email().max(254),
  fromName: z.string().trim().min(1).max(160),
});

export const testEmailInputSchema = z.object({
  recipientEmail: z.email().max(254),
});

export type EmailSettingsInput = z.infer<typeof emailSettingsInputSchema>;
export type TestEmailInput = z.infer<typeof testEmailInputSchema>;

export function parseEmailSettings(input: unknown): EmailSettingsInput {
  const parsed = emailSettingsInputSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("VALIDATION_FAILED", "Email settings input is invalid.", z.treeifyError(parsed.error));
  return parsed.data;
}

export function parseTestEmail(input: unknown): TestEmailInput {
  const parsed = testEmailInputSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("VALIDATION_FAILED", "Test email input is invalid.", z.treeifyError(parsed.error));
  return parsed.data;
}
