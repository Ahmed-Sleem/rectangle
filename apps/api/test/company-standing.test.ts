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
  canReachAllProjects,
  canReadProjectRegistry,
  companyStandingSchema,
  hasPermission,
  isCompanyAdministrator,
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
  it("offers exactly two standings and no project roles", () => {
    /*
     * project_manager and friends belong on a project. Holding one
     * company-wide silently granted it on every project, which is one fault
     * this replaced. `admin`, `member` and `guest` were the other: each
     * granted or cancelled access invisibly, so what somebody could do was not
     * visible on the screen where it was decided.
     */
    expect(companyStandingSchema.options).toEqual(["owner", "none"]);
  });

  it("refuses more than one standing", () => {
    // The schema is the second lock; the primary key in migration 012 is the
    // first. Being "viewer and owner at once" must be unrepresentable.
    const twoStandings = userPrincipalSchema.safeParse({
      tenantId,
      userId,
      roles: ["owner", "none"],
      permissions: [],
    });

    expect(twoStandings.success).toBe(false);
  });

  it("refuses a retired role name outright", () => {
    for (const retired of ["tenant_owner", "tenant_admin", "admin", "member", "guest", "manager", "viewer"]) {
      expect(userPrincipalSchema.safeParse({ tenantId, userId, roles: [retired], permissions: [] }).success).toBe(false);
    }
  });

  it("grants everything to the owner and nothing to anyone else by standing alone", () => {
    expect(rolePermissions(["owner"])).toEqual(allPermissions);
    // Everybody else's access is exactly what was granted to them, so standing
    // contributes nothing at all.
    expect(rolePermissions(["none"])).toEqual([]);
  });

  it("reads the single standing back", () => {
    expect(standingOf(principal("owner"))).toBe("owner");
    expect(isCompanyAdministrator(principal("owner"))).toBe(true);
    expect(isCompanyAdministrator(principal("none"))).toBe(false);
  });

  it("reaches the register only through a granted permission", () => {
    expect(canReadProjectRegistry(principal("none"))).toBe(false);
    expect(canReadProjectRegistry(principal("none", ["projects.read"]))).toBe(true);
  });

  it("gives head-office reach only to the person granted it", () => {
    expect(canReachAllProjects(principal("none"))).toBe(false);
    expect(canReachAllProjects(principal("none", ["projects.manage_all"]))).toBe(true);
    // The owner reaches everything without being granted it one key at a time.
    expect(canReachAllProjects(principal("owner"))).toBe(true);
  });

  it("honours a granted permission and only that one", () => {
    expect(hasPermission(principal("none", ["users.read"]), "users.read")).toBe(true);
    expect(hasPermission(principal("none", ["users.read"]), "users.edit")).toBe(false);
  });

  it("does not let anybody reach administration by standing", () => {
    // `settings.manage` can still be granted deliberately; what must not
    // happen is standing quietly conferring it.
    expect(hasPermission(principal("none"), "settings.manage")).toBe(false);
    expect(hasPermission(principal("none", ["settings.manage"]), "settings.manage")).toBe(true);
    expect(hasPermission(principal("owner"), "settings.manage")).toBe(true);
  });
});
