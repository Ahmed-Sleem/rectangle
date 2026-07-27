/** Permission keys define what tenant administrators can grant to user types. */
import { z } from "zod";

export const permissionSchema = z.enum([
  "projects.read",
  "projects.manage",
  "users.read",
  "users.manage",
  "user_types.read",
  "user_types.manage",
  "settings.manage",
  "activity.read_team",
  "activity.read_all",
]);

export type Permission = z.infer<typeof permissionSchema>;

export const allPermissions: Permission[] = [
  "projects.read",
  "projects.manage",
  "users.read",
  "users.manage",
  "user_types.read",
  "user_types.manage",
  "settings.manage",
  "activity.read_team",
  "activity.read_all",
];

/**
 * Permission pairs a company has declared must never be held by one person.
 *
 * Static separation of duty, in the NIST sense: some combinations are a control
 * failure however trustworthy the individual, because they let one person both
 * commit the company and approve having done so.
 *
 * **Ships empty, deliberately.** The obvious candidates — inventing a role and
 * assigning it, or configuring the company and being the only reader of the
 * record — are all held together by the seeded full-access type and by every
 * owner. A rule shipped on by default would make administration itself
 * unassignable, which is how a control nobody asked for becomes a control
 * everybody disables. A company opts in to the pairs that matter to it.
 */
export interface SeparationRule {
  a: Permission;
  b: Permission;
  /** Shown when an assignment is refused, so the refusal is arguable. */
  reason: string;
}

/**
 * The conflicting pair a permission set contains, if any.
 *
 * Owners and administrators are exempt at the call site rather than here: the
 * rule is about what a *user type* may combine, and somebody who administers
 * the company necessarily holds everything. Enforcing it against them would
 * lock the company out of its own administration.
 */
export function findSeparationConflict(
  permissions: readonly Permission[],
  rules: readonly SeparationRule[],
): SeparationRule | null {
  const held = new Set(permissions);
  return rules.find((rule) => held.has(rule.a) && held.has(rule.b)) ?? null;
}

export const permissionDescriptions: Array<{ key: Permission; label: string; description: string }> = [
  { key: "projects.read", label: "View projects", description: "Open the project register and project detail pages." },
  { key: "projects.manage", label: "Manage projects", description: "Create and edit project records." },
  { key: "users.read", label: "View users", description: "View company users and user type assignments." },
  { key: "users.manage", label: "Manage users", description: "Create users and assign user types." },
  { key: "user_types.read", label: "View user types", description: "View company user types and permissions." },
  { key: "user_types.manage", label: "Manage user types", description: "Create and update user types and permissions." },
  { key: "settings.manage", label: "Manage settings", description: "Manage company-level configuration." },
  { key: "activity.read_team", label: "View team activity", description: "See what people in teams you manage did to the work." },
  { key: "activity.read_all", label: "View all activity", description: "See the company's full activity and security history." },
];
