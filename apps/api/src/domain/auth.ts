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
 * This replaced a table that allowed several company roles at once, which let
 * somebody be a viewer and an owner simultaneously and resolved to full access.
 * The single value is enforced by the primary key in migration 012, so the
 * contradiction is unrepresentable rather than merely discouraged.
 *
 * Project roles — manager, controls manager and so on — are deliberately absent
 * here. They live on `project_members` and apply to one project. Holding them
 * company-wide silently granted them on every project, which is exactly the
 * fault this replaced.
 */
export const companyStandingSchema = z.enum([
  /** Everything, including transferring ownership. At least one always exists. */
  "owner",
  /** Everything except transferring ownership. */
  "admin",
  /** A normal employee. Access comes from user types and project membership. */
  "member",
  /** External. Only the projects they are explicitly added to. */
  "guest",
]);

export type CompanyStanding = z.infer<typeof companyStandingSchema>;

/**
 * Retained as an alias because the principal still carries `roles` as an array
 * on the wire, and every issued token does too. The array now holds exactly one
 * standing; widening it again would reintroduce the fault.
 */
export const tenantRoleSchema = companyStandingSchema;
export type TenantRole = CompanyStanding;

/** Standings that administer the company and therefore hold every permission. */
const fullAccessStandings = new Set<CompanyStanding>(["owner", "admin"]);

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
  return principal.roles[0] ?? "member";
}

export function isCompanyAdministrator(principal: UserPrincipal): boolean {
  return fullAccessStandings.has(standingOf(principal));
}

export function rolePermissions(roles: CompanyStanding[]): Permission[] {
  /*
   * Only owners and admins gain permissions from standing alone. A member's
   * access comes entirely from their user types, and a guest's from the
   * projects they belong to — neither is granted anything company-wide by
   * being a member or a guest.
   */
  return roles.some((role) => fullAccessStandings.has(role)) ? allPermissions : [];
}

/**
 * A guest reaches only the projects they were added to, so no company-wide
 * capability applies to them however their user types are configured.
 */
export function isGuest(principal: UserPrincipal): boolean {
  return standingOf(principal) === "guest";
}

export function hasPermission(principal: UserPrincipal, permission: Permission): boolean {
  /*
   * A guest holds no company-wide capability, whatever their user types say.
   * They are external: they reach the projects they were added to and nothing
   * else. Without this a guest assigned a type carrying `settings.manage` could
   * open the company's mail configuration, which is the opposite of what
   * "guest" is for. The web helper already refused this; the server did not,
   * and the server is the one that decides.
   */
  if (isGuest(principal)) return false;
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
  if (isGuest(principal)) return false;
  return isCompanyAdministrator(principal) || hasPermission(principal, "projects.manage_all");
}

/**
 * May this person open the company-wide project register?
 *
 * Distinct from reaching one project. A guest, and a member with no user type
 * granting `projects.read`, still reach the projects they belong to — see
 * `canReachProjects`. Conflating the two would either lock members out of their
 * own work or hand guests the whole register.
 */
export function canReadProjectRegistry(principal: UserPrincipal): boolean {
  if (isGuest(principal)) return false;
  return isCompanyAdministrator(principal) || hasPermission(principal, "projects.read");
}

/**
 * May this person reach project records at all, subject to membership?
 *
 * True for everyone with a standing, because membership is what actually
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
