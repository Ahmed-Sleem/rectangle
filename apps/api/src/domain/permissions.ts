/**
 * Permission keys define what a company may grant to a user type.
 *
 * Every permission is one action on one kind of record. Nothing here bundles
 * two powers together, because a bundle cannot be taken apart later: the nine
 * coarse keys this replaced made "may create a project" and "may destroy any
 * project in the company" the same grant, which is how a user type named
 * Viewer could delete real work.
 *
 * The naming is `area.action`, the resource-action convention every mainstream
 * RBAC implementation converges on, so a key reads as a sentence and a new area
 * has an obvious shape to follow.
 *
 * Granularity has a cost — too many keys and every company builds thirty user
 * types to cope — so the answer is that the *list* is atomic while the *screen*
 * is grouped, and the groups are declared here rather than in the UI so server
 * and client cannot disagree about which area a key belongs to.
 */
import { z } from "zod";

export const permissionSchema = z.enum([
  // Projects
  "projects.read",
  "projects.create",
  "projects.edit",
  "projects.archive",
  "projects.delete",
  "projects.manage_all",
  // A project's own team
  "project_team.read",
  "project_team.manage",
  // Tasks
  "tasks.read",
  "tasks.create",
  "tasks.edit",
  "tasks.delete",
  // Risks
  "risks.read",
  "risks.create",
  "risks.edit",
  "risks.delete",
  // People
  "users.read",
  "users.create",
  "users.edit",
  "users.disable",
  // User types
  "user_types.read",
  "user_types.create",
  "user_types.edit",
  "user_types.delete",
  // The company itself
  "settings.manage",
  "activity.read_team",
  "activity.read_all",
  /*
   * The assistant is a capability, not a source of authority. Holding this
   * lets somebody open it and ask questions; every answer it gives and every
   * action it proposes is still bounded by the rest of their permissions,
   * because each tool runs through the same service the interface uses.
   */
  "ai.use",
]);

export type Permission = z.infer<typeof permissionSchema>;

export const allPermissions: Permission[] = permissionSchema.options;

/**
 * Areas exist so a screen can show twenty-seven checkboxes without reading as
 * twenty-seven unrelated decisions. Declared server-side and shipped to the
 * client so the grouping is one fact in one place.
 */
export const permissionGroupSchema = z.enum([
  "projects",
  "project_team",
  "tasks",
  "risks",
  "users",
  "user_types",
  "company",
]);

export type PermissionGroup = z.infer<typeof permissionGroupSchema>;

export interface PermissionDescriptor {
  key: Permission;
  group: PermissionGroup;
  label: string;
  description: string;
  /**
   * Reading a record is what every other action on it implies, so a screen can
   * offer "edit" and quietly ensure "read" rather than letting somebody grant a
   * write they cannot see the result of.
   */
  implies?: Permission[];
}

export const permissionDescriptions: PermissionDescriptor[] = [
  {
    key: "projects.read",
    group: "projects",
    label: "View projects",
    description: "Open the project register and see project records.",
  },
  {
    key: "projects.create",
    group: "projects",
    label: "Start projects",
    description: "Create a new project record.",
    implies: ["projects.read"],
  },
  {
    key: "projects.edit",
    group: "projects",
    label: "Edit projects",
    description: "Change the details of a project they can reach.",
    implies: ["projects.read"],
  },
  {
    key: "projects.archive",
    group: "projects",
    label: "Archive projects",
    description: "Close a project without destroying it. Reversible.",
    implies: ["projects.read"],
  },
  {
    key: "projects.delete",
    group: "projects",
    label: "Delete projects",
    description:
      "Permanently destroy a project and everything in it. Also requires being a project administrator on that project.",
    implies: ["projects.read"],
  },
  {
    key: "projects.manage_all",
    group: "projects",
    label: "Reach every project",
    description:
      "Act on projects they are not a member of. For head office and the project management office.",
    implies: ["projects.read"],
  },
  {
    key: "project_team.read",
    group: "project_team",
    label: "View project teams",
    description: "See who is on a project and in what role.",
  },
  {
    key: "project_team.manage",
    group: "project_team",
    label: "Manage project teams",
    description: "Add and remove project members and stakeholders, and change their roles.",
    implies: ["project_team.read"],
  },
  { key: "tasks.read", group: "tasks", label: "View tasks", description: "See the work on projects they can reach." },
  {
    key: "tasks.create",
    group: "tasks",
    label: "Create tasks",
    description: "Add work to a project.",
    implies: ["tasks.read"],
  },
  {
    key: "tasks.edit",
    group: "tasks",
    label: "Edit tasks",
    description: "Change any task, including reassigning it. Anyone assigned a task may progress their own without this.",
    implies: ["tasks.read"],
  },
  {
    key: "tasks.delete",
    group: "tasks",
    label: "Delete tasks",
    description: "Permanently remove a task.",
    implies: ["tasks.read"],
  },
  { key: "risks.read", group: "risks", label: "View risks", description: "See the risk register." },
  {
    key: "risks.create",
    group: "risks",
    label: "Raise risks",
    description: "Add a risk to the register.",
    implies: ["risks.read"],
  },
  {
    key: "risks.edit",
    group: "risks",
    label: "Edit risks",
    description: "Change a risk, its scoring or its response.",
    implies: ["risks.read"],
  },
  {
    key: "risks.delete",
    group: "risks",
    label: "Delete risks",
    description: "Permanently remove a risk from the register.",
    implies: ["risks.read"],
  },
  { key: "users.read", group: "users", label: "View people", description: "See the company's people and what they hold." },
  {
    key: "users.create",
    group: "users",
    label: "Add people",
    description: "Invite or create a person in the company.",
    implies: ["users.read"],
  },
  {
    key: "users.edit",
    group: "users",
    label: "Edit people",
    description: "Change a person's name, standing or user types.",
    implies: ["users.read"],
  },
  {
    key: "users.disable",
    group: "users",
    label: "Disable people",
    description: "Revoke someone's access without deleting their history.",
    implies: ["users.read"],
  },
  {
    key: "user_types.read",
    group: "user_types",
    label: "View user types",
    description: "See the company's user types and what each one grants.",
  },
  {
    key: "user_types.create",
    group: "user_types",
    label: "Create user types",
    description: "Define a new user type.",
    implies: ["user_types.read"],
  },
  {
    key: "user_types.edit",
    group: "user_types",
    label: "Edit user types",
    description: "Change what an existing user type grants.",
    implies: ["user_types.read"],
  },
  {
    key: "user_types.delete",
    group: "user_types",
    label: "Delete user types",
    description: "Remove a user type that is no longer used.",
    implies: ["user_types.read"],
  },
  {
    key: "settings.manage",
    group: "company",
    label: "Manage company settings",
    description: "Company-level configuration, including outgoing mail.",
  },
  {
    key: "activity.read_team",
    group: "company",
    label: "View team activity",
    description: "See what people on projects they manage did to the work.",
  },
  {
    key: "activity.read_all",
    group: "company",
    label: "View all activity",
    description: "See the company's full activity and security history.",
  },
  {
    key: "ai.use",
    group: "company",
    label: "Use the assistant",
    description:
      "Ask the AI assistant about this company's work. It can only see and do what the person using it already can.",
  },
];

/**
 * Adds whatever a permission implies.
 *
 * Granting "edit" without "read" is a set nobody means to ask for — the holder
 * could change a record and not see the result. Closing the set at the boundary
 * means every layer above can treat the stored list as complete rather than
 * each re-deriving it.
 */
export function withImpliedPermissions(permissions: readonly Permission[]): Permission[] {
  const held = new Set<Permission>(permissions);
  for (const permission of permissions) {
    const descriptor = permissionDescriptions.find((entry) => entry.key === permission);
    for (const implied of descriptor?.implies ?? []) held.add(implied);
  }
  // Declaration order, so a stored set is stable and two equal sets compare equal.
  return allPermissions.filter((permission) => held.has(permission));
}

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
  /** Absent on the pure value used by the matcher; present on a stored rule. */
  id?: string;
  a: Permission;
  b: Permission;
  /** Shown when an assignment is refused, so the refusal is arguable. */
  reason: string;
}

/**
 * A pair is unordered, so it is stored in one fixed order.
 *
 * Without this the same rule could be entered twice, once each way round, and
 * the second would be enforced as if it were a different control. The database
 * has a constraint saying the same thing; ordering here is what turns a caller
 * getting it backwards into a saved rule rather than a failed insert.
 */
export function orderSeparationPair(
  a: Permission,
  b: Permission,
): { a: Permission; b: Permission } {
  return a < b ? { a, b } : { a: b, b: a };
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
