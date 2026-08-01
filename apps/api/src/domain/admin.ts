/** Schemas for tenant admin user type and user management. */
import { z } from "zod";
import { DomainError } from "./errors.js";
import { companyStandingSchema } from "./auth.js";
import { allPermissions, permissionSchema } from "./permissions.js";

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
  /**
   * Omitted when the person is being invited to choose their own.
   *
   * A password set by an administrator is known to two people from the moment
   * it exists, so inviting is the better path wherever email works. It stays
   * available because a company without SMTP configured still has to be able
   * to add somebody.
   */
  password: z.string().min(12).max(256).regex(/[a-z]/u).regex(/[A-Z]/u).regex(/[0-9]/u).optional(),
  /**
   * Company standing. Almost nobody is an owner, so `none` is the default and
   * ownership has to be asked for deliberately.
   */
  standing: companyStandingSchema.default("none"),
  /*
   * What this person may do, in full. Deliberately not `min(1)`: somebody added
   * so they can be put on a project holds no company-wide permission at all,
   * and their project membership is what gives them work to do. Forcing a tick
   * would mean granting access nobody asked for.
   *
   * The ceiling is the size of the catalogue, because granting every permission
   * is a legitimate thing to do and any lower number would refuse it.
   */
  permissions: z.array(permissionSchema).max(allPermissions.length),
});

export const updateUserSchema = z.object({
  displayName: z.string().trim().min(2).max(160).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  password: z.string().min(12).max(256).regex(/[a-z]/u).regex(/[A-Z]/u).regex(/[0-9]/u).optional(),
  standing: companyStandingSchema.optional(),
  /*
   * The complete set the person should hold afterwards, not a delta. An empty
   * array is a meaningful instruction — take everything away — and is
   * distinguishable from `undefined`, which leaves the grants untouched.
   */
  permissions: z.array(permissionSchema).max(allPermissions.length).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required.");

/**
 * A pair this company declares one person may never hold at once.
 *
 * `reason` is required and has a floor, because the only thing a refused
 * assignment can offer the person refused is the sentence explaining it. The
 * bounds match the database constraint exactly — a mismatch would turn a
 * validation message into a 500 from the check constraint underneath.
 *
 * `losing` is which half of the pair existing violators give up. One choice for
 * the whole rule rather than one per person: per-person choice multiplies the
 * decision by however many people are affected and produces a policy applied
 * inconsistently, which is the thing this control exists to prevent.
 */
export const createSeparationRuleSchema = z
  .object({
    a: permissionSchema,
    b: permissionSchema,
    reason: z.string().trim().min(10).max(500),
    losing: permissionSchema,
  })
  .refine((value) => value.a !== value.b, {
    message: "A rule must name two different permissions.",
    path: ["b"],
  })
  .refine((value) => value.losing === value.a || value.losing === value.b, {
    message: "The permission to give up must be one of the two in the rule.",
    path: ["losing"],
  });

export type CreateSeparationRuleInput = z.infer<typeof createSeparationRuleSchema>;

export function parseCreateSeparationRule(input: unknown): CreateSeparationRuleInput {
  return parseWithDomainError(createSeparationRuleSchema, input, "Separation rule is invalid.");
}

/** The same pair without a decision, for asking what a rule would cost. */
export const previewSeparationRuleSchema = z
  .object({ a: permissionSchema, b: permissionSchema })
  .refine((value) => value.a !== value.b, {
    message: "A rule must name two different permissions.",
    path: ["b"],
  });

export type PreviewSeparationRuleInput = z.infer<typeof previewSeparationRuleSchema>;

export function parsePreviewSeparationRule(input: unknown): PreviewSeparationRuleInput {
  return parseWithDomainError(previewSeparationRuleSchema, input, "Separation rule is invalid.");
}

export type CreateUserTypeInput = z.infer<typeof createUserTypeSchema>;
export type UpdateUserTypeInput = z.infer<typeof updateUserTypeSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

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

export function parseUpdateUser(input: unknown): UpdateUserInput {
  return parseWithDomainError(updateUserSchema, input, "User update is invalid.");
}
