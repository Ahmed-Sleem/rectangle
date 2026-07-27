/**
 * Guards the company standing model.
 *
 * The authorization model used to be two half-built models. `tenant_user_roles`
 * had a primary key of (tenant_id, user_id, role), so somebody could hold
 * several company roles at once; every user created through the Team page was
 * inserted as 'viewer' literally and no screen could ever change it; and the
 * seeded "Owner" user type carried every permission, so a person whose company
 * role read viewer had, in effect, full access.
 *
 * These tests hold the replacement in place: one standing per person, standing
 * granting nothing unless it is owner or admin, and ownership changeable only
 * by an owner.
 */
import { describe, expect, it } from "vitest";
import {
  canManageProjects,
  canReadProjectRegistry,
  companyStandingSchema,
  hasPermission,
  isCompanyAdministrator,
  isGuest,
  rolePermissions,
  standingOf,
  userPrincipalSchema,
  type UserPrincipal,
} from "../src/domain/auth.js";
import { allPermissions } from "../src/domain/permissions.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

function principal(standing: string, permissions: string[] = []): UserPrincipal {
  return userPrincipalSchema.parse({ tenantId, userId, roles: [standing], permissions });
}

describe("company standing", () => {
  it("offers exactly the four standings and no project roles", () => {
    // project_manager and friends belong on a project. Holding one company-wide
    // silently granted it on every project, which is the fault this replaced.
    expect(companyStandingSchema.options).toEqual(["owner", "admin", "member", "guest"]);
  });

  it("refuses more than one standing", () => {
    // The schema is the second lock; the primary key in migration 012 is the
    // first. Being "viewer and owner at once" must be unrepresentable.
    const twoStandings = userPrincipalSchema.safeParse({
      tenantId,
      userId,
      roles: ["owner", "member"],
      permissions: [],
    });

    expect(twoStandings.success).toBe(false);
  });

  it("refuses a retired role name outright", () => {
    for (const retired of ["tenant_owner", "tenant_admin", "project_manager", "viewer", "external_collaborator"]) {
      expect(userPrincipalSchema.safeParse({ tenantId, userId, roles: [retired], permissions: [] }).success).toBe(false);
    }
  });

  it("grants everything to owners and admins, and nothing to anyone else by standing alone", () => {
    expect(rolePermissions(["owner"])).toEqual(allPermissions);
    expect(rolePermissions(["admin"])).toEqual(allPermissions);
    // A member's access comes from their user types, a guest's from the
    // projects they belong to. Neither is granted anything company-wide.
    expect(rolePermissions(["member"])).toEqual([]);
    expect(rolePermissions(["guest"])).toEqual([]);
  });

  it("reads the single standing back", () => {
    expect(standingOf(principal("owner"))).toBe("owner");
    expect(isCompanyAdministrator(principal("admin"))).toBe(true);
    expect(isCompanyAdministrator(principal("member"))).toBe(false);
    expect(isGuest(principal("guest"))).toBe(true);
  });

  it("lets a member reach the register only through a granted permission", () => {
    expect(canReadProjectRegistry(principal("member"))).toBe(false);
    expect(canReadProjectRegistry(principal("member", ["projects.read"]))).toBe(true);
  });

  it("keeps a guest out of the company-wide register whatever they are granted", () => {
    // A guest is external. Even a user type carrying projects.read must not
    // hand them the whole company's project list; they see what they are added
    // to, which membership decides.
    expect(canReadProjectRegistry(principal("guest", ["projects.read"]))).toBe(false);
    expect(canManageProjects(principal("guest", ["projects.manage"]))).toBe(false);
  });

  it("still lets a user type carry a permission a member needs", () => {
    expect(hasPermission(principal("member", ["users.read"]), "users.read")).toBe(true);
    expect(hasPermission(principal("member", ["users.read"]), "users.manage")).toBe(false);
  });

  it("does not let a member reach administration by standing", () => {
    // The seeded full-access user type can still grant this deliberately; what
    // must not happen is standing quietly conferring it.
    expect(hasPermission(principal("member"), "settings.manage")).toBe(false);
    expect(hasPermission(principal("owner"), "settings.manage")).toBe(true);
  });
});
