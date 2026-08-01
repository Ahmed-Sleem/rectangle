/**
 * Auth domain primitives keep authorization decisions explicit and reusable by
 * HTTP handlers, services, and future AI tools.
 */
import { z } from "zod";
import { DomainError } from "./errors.js";
import { allPermissions, permissionSchema, type Permission } from "./permissions.js";

/**
 * A person's standing in the company. Exactly one, never a set.
 *
 * There are only two, and only one of them grants anything. The account that
 * sets a company up owns it and holds every permission, because a company that
 * can be edited into having nobody able to administer it is a company locked
 * out of its own data with no way back. Everybody else holds exactly the
 * permissions somebody ticked for them, and `none` is that fact stated rather
 * than inferred from a missing row.
 *
 * `admin`, `member` and `guest` were removed in migration 018. Each of them
 * granted or withheld access invisibly: choosing "member" silently meant
 * "whatever their bundles happen to carry", and choosing "guest" silently
 * cancelled every company permission they had been given. Authority that is
 * not visible where it is granted is authority nobody can audit.
 *
 * Project roles — manager, viewer and so on — are deliberately absent here.
 * They live on `project_members` and apply to one project. Holding them
 * company-wide silently granted them on every project, which is exactly the
 * fault this replaced.
 */
export const companyStandingSchema = z.enum([
  /** Everything, including transferring ownership. At least one always exists. */
  "owner",
  /** No standing. Access is the permissions granted to them, and nothing else. */
  "none",
]);

export type CompanyStanding = z.infer<typeof companyStandingSchema>;

export const tenantRoleSchema = companyStandingSchema;
export type TenantRole = CompanyStanding;

/** The standing that owns the company and therefore holds every permission. */
const fullAccessStandings = new Set<CompanyStanding>(["owner"]);

export const userPrincipalSchema = z.object({
  tenantId: z.uuid(),
  userId: z.uuid(),
  /**
   * One standing, carried as an array for wire compatibility with tokens
   * already issued. `max(1)` is the schema refusing to let the old shape back.
   */
  roles: z.array(companyStandingSchema).min(1).max(1),
  permissions: z.array(permissionSchema).default([]),
  sessionId: z.uuid().optional(),
  /**
   * Who this is, not merely what they may do.
   *
   * Optional because a token alone cannot supply it — only the per-request
   * session lookup reads the user row. Absent means the request was not
   * session-backed, which the auth hook already refuses.
   */
  displayName: z.string().min(1).max(160).optional(),
  email: z.string().max(254).optional(),
});

export type UserPrincipal = z.infer<typeof userPrincipalSchema>;

/** The one standing a principal holds. */
export function standingOf(principal: UserPrincipal): CompanyStanding {
  return principal.roles[0] ?? "none";
}

export function isCompanyAdministrator(principal: UserPrincipal): boolean {
  return fullAccessStandings.has(standingOf(principal));
}

export function rolePermissions(roles: CompanyStanding[]): Permission[] {
  /*
   * Ownership is the only standing that grants anything at all. Everybody
   * else's access is the set of permissions granted to them directly, which is
   * the whole point of the model: what somebody may do is visible on the screen
   * where it was decided, not buried in the meaning of a word.
   */
  return roles.some((role) => fullAccessStandings.has(role)) ? allPermissions : [];
}

export function hasPermission(principal: UserPrincipal, permission: Permission): boolean {
  return principal.permissions.includes(permission) || rolePermissions(principal.roles).includes(permission);
}

/**
 * May this person act on projects they are not a member of?
 *
 * This is the head-office power, and it is deliberately narrow. It used to be
 * implied by `projects.manage`, which meant anybody who could create a project
 * could also edit and destroy every other project in the company — membership
 * was consulted only after this had already said yes. Reach and capability are
 * now separate questions, and this one answers only reach.
 */
export function canReachAllProjects(principal: UserPrincipal): boolean {
  return isCompanyAdministrator(principal) || hasPermission(principal, "projects.manage_all");
}

/**
 * May this person open the company-wide project register?
 *
 * Distinct from reaching one project. Somebody who was never granted
 * `projects.read` still reaches the projects they are a member of — see
 * `canReachProjects`. Conflating the two would either hide people's own work
 * from them or hand the whole register to anybody added to one project.
 */
export function canReadProjectRegistry(principal: UserPrincipal): boolean {
  return isCompanyAdministrator(principal) || hasPermission(principal, "projects.read");
}

/**
 * May this person reach project records at all, subject to membership?
 *
 * True for everyone, because membership is what actually
 * decides which projects they see. The register check above decides whether
 * they may browse beyond the ones they belong to.
 */
export function canReachProjects(_principal: UserPrincipal): boolean {
  return true;
}

export function requirePermission(principal: UserPrincipal, permission: Permission): void {
  if (!hasPermission(principal, permission)) {
    throw new DomainError("FORBIDDEN", "You do not have permission to perform this action.");
  }
}

/**
 * Surfaces that mix data from several registers ask this before including a
 * block, so a narrower user loses that block rather than the whole page.
 */
export function canReadUsers(principal: UserPrincipal): boolean {
  return hasPermission(principal, "users.read");
}

/** Guards the register. Reaching a single project is `resolveAccess`'s job. */
export function requireProjectRead(principal: UserPrincipal): void {
  if (!canReadProjectRegistry(principal)) {
    throw new DomainError("FORBIDDEN", "You do not have permission to view projects.");
  }
}
