/** Schemas for tenant admin user type and user management. */
import { z } from "zod";
import { DomainError } from "./errors.js";
import { permissionSchema } from "./permissions.js";

const roleKeySchema = z.string().trim().toLowerCase().min(2).max(64).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/u);

export const createUserTypeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  key: roleKeySchema,
  description: z.string().trim().max(500).optional(),
  permissions: z.array(permissionSchema).min(1).max(50),
});

export const updateUserTypeSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(permissionSchema).min(1).max(50).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const createUserSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(12).max(256).regex(/[a-z]/u).regex(/[A-Z]/u).regex(/[0-9]/u),
  userTypeIds: z.array(z.uuid()).min(1).max(10),
});

export type CreateUserTypeInput = z.infer<typeof createUserTypeSchema>;
export type UpdateUserTypeInput = z.infer<typeof updateUserTypeSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;

function parseWithDomainError<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new DomainError("VALIDATION_FAILED", message, z.treeifyError(parsed.error));
  return parsed.data;
}

export function parseCreateUserType(input: unknown): CreateUserTypeInput {
  return parseWithDomainError(createUserTypeSchema, input, "User type input is invalid.");
}

export function parseUpdateUserType(input: unknown): UpdateUserTypeInput {
  return parseWithDomainError(updateUserTypeSchema, input, "User type update is invalid.");
}

export function parseCreateUser(input: unknown): CreateUserInput {
  return parseWithDomainError(createUserSchema, input, "User input is invalid.");
}
