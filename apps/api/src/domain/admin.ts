/** Schemas for tenant admin user type and user management. */
import { z } from "zod";
import { DomainError } from "./errors.js";
import { companyStandingSchema } from "./auth.js";
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

/**
 * Access has to come from somewhere.
 *
 * Owners and administrators hold everything by standing. For everyone else a
 * user type is the only source of company-wide permission, so a person created
 * without one could sign in and reach nothing — an account that looks real and
 * is not.
 */
function requireTypesUnlessAdministering(
  value: { standing: string; userTypeIds: string[] },
  context: z.RefinementCtx,
): void {
  if (value.standing === "owner" || value.standing === "admin") return;
  if (value.userTypeIds.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["userTypeIds"],
      message: "At least one user type is required.",
    });
  }
}

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
   * Company standing. Defaults to member, which is what almost everyone is.
   * Previously hardcoded with no way to change it, so an owner could not
   * promote anybody through any screen.
   */
  standing: companyStandingSchema.default("member"),
  /*
   * Not `min(1)`. An owner or administrator holds every permission by standing,
   * so demanding a user type of them was a required choice that changed
   * nothing. Everyone else must still have one, which is asserted below where
   * the standing is in scope.
   */
  userTypeIds: z.array(z.uuid()).max(10),
}).superRefine(requireTypesUnlessAdministering);

export const updateUserSchema = z.object({
  displayName: z.string().trim().min(2).max(160).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  password: z.string().min(12).max(256).regex(/[a-z]/u).regex(/[A-Z]/u).regex(/[0-9]/u).optional(),
  standing: companyStandingSchema.optional(),
  /*
   * An edit may set an empty list only when it is also making the person an
   * owner or administrator, who need none. Left undefined the field is simply
   * not being changed.
   */
  userTypeIds: z.array(z.uuid()).max(10).optional(),
})
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.")
  .superRefine((value, context) => {
    if (value.userTypeIds === undefined) return;
    requireTypesUnlessAdministering(
      { standing: value.standing ?? "member", userTypeIds: value.userTypeIds },
      context,
    );
  });

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
