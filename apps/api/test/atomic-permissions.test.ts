/**
 * The rules the atomic permission model actually rests on.
 *
 * The tests migrated alongside the split prove that nothing broke. These prove
 * the thing the split was for: that reach and capability are separate
 * questions, that a company-wide grant no longer reaches past membership, and
 * that destroying a project is harder than changing one. Each of these was
 * possible before and is the fault being closed, so each is written as the
 * abuse rather than as the happy path.
 */
import { describe, expect, it } from "vitest";
import {
  canReachAllProjects,
  hasPermission,
  type UserPrincipal,
} from "../src/domain/auth.js";
import { DomainError } from "../src/domain/errors.js";
import {
  allPermissions,
  permissionDescriptions,
  withImpliedPermissions,
  type Permission,
} from "../src/domain/permissions.js";
import { roleGrantsOnProject } from "../src/domain/project-team.js";
import { ProjectService, type ProjectsRepository } from "../src/application/project-service.js";
import { ProjectTeamService } from "../src/application/project-team-service.js";
import { MemoryProjectTeamRepository } from "./support/memory-project-team-repository.js";
import type { ProjectRecord } from "../src/domain/project.js";
import type { ProjectMemberRole } from "../src/domain/project-team.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";

function person(
  userId: string,
  permissions: Permission[],
  standing: "owner" | "admin" | "member" | "guest" = "member",
): UserPrincipal {
  return { tenantId: TENANT, userId, roles: [standing], permissions };
}

const HEAD_OFFICE = person("aaaaaaaa-1111-4111-8111-111111111111", [
  "projects.read", "projects.edit", "projects.delete", "projects.manage_all",
]);
const SITE_ADMIN = person("aaaaaaaa-2222-4222-8222-222222222222", ["projects.read", "projects.delete"]);
const OUTSIDER = person("aaaaaaaa-3333-4333-8333-333333333333", [
  "projects.read", "projects.edit", "projects.delete",
]);

class OneProjectRepository implements ProjectsRepository {
  deleted = false;
  private readonly record: ProjectRecord = {
    id: PROJECT,
    tenantId: TENANT,
    name: "Tower",
    code: "TWR-1",
    status: "active",
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
  };

  async findByIdForTenant(tenantId: string, id: string): Promise<ProjectRecord | null> {
    return tenantId === TENANT && id === PROJECT ? this.record : null;
  }
  async deleteForTenant(): Promise<boolean> {
    this.deleted = true;
    return true;
  }
  async create(): Promise<ProjectRecord> {
    throw new Error("not used");
  }
  async findByTenantAndCode(): Promise<ProjectRecord | null> {
    return null;
  }
  async listForTenant(): Promise<ProjectRecord[]> {
    return [];
  }
  async updateForTenant(): Promise<ProjectRecord | null> {
    return this.record;
  }
}

/**
 * The real services, wired to each other exactly as production wires them.
 *
 * An earlier draft of this file used a hand-written stand-in for the reach
 * rules, and it was worthless: breaking the real deletion rule left every test
 * green, because the tests were asking the stand-in. The rule under test has to
 * be the rule that ships.
 */
function build(memberships: Array<[string, ProjectMemberRole]> = []) {
  const projects = new OneProjectRepository();
  const team = new MemoryProjectTeamRepository();
  const audit = { async append() {} };

  for (const [userId] of memberships) {
    team.addTenantUser({ id: userId, tenantId: TENANT, displayName: "Person", email: `${userId}@example.com` });
  }

  const projectTeam = new ProjectTeamService(projects, team, audit);
  const service = new ProjectService(projects, audit, projectTeam);
  return { service, projectTeam, projects, team, memberships };
}

async function buildWith(memberships: Array<[string, ProjectMemberRole]> = []) {
  const context = build(memberships);
  for (const [userId, role] of memberships) {
    await context.team.addMember(TENANT, PROJECT, { userId, role });
  }
  return context;
}

describe("every permission is one action", () => {
  it("describes every key it defines, and defines every key it describes", () => {
    // A key with no description is invisible in the picker, so a company can
    // hold a permission it was never offered the chance to understand.
    expect(permissionDescriptions.map((entry) => entry.key).sort()).toEqual([...allPermissions].sort());
  });

  it("keeps no bundle that grants two unrelated powers at once", () => {
    // The fault this model replaced: `projects.manage` meant both "may start a
    // project" and "may destroy any project in the company".
    for (const retired of ["projects.manage", "users.manage", "user_types.manage"]) {
      expect(allPermissions).not.toContain(retired);
    }
  });

  it("adds the read a write implies rather than granting a blind write", () => {
    expect(withImpliedPermissions(["projects.edit"])).toContain("projects.read");
    expect(withImpliedPermissions(["users.disable"])).toContain("users.read");
    // Already complete sets come back unchanged, and in a stable order so two
    // equal sets compare equal.
    expect(withImpliedPermissions(["tasks.read"])).toEqual(["tasks.read"]);
  });
});

describe("reach is separate from capability", () => {
  it("does not let a company-wide edit reach a project the person is not on", async () => {
    // The whole point. Before the split, holding the wide permission answered
    // this on its own and membership was never consulted.
    const { service } = await buildWith();
    await expect(service.updateProject(OUTSIDER, PROJECT, { name: "Renamed" })).rejects.toThrow(
      DomainError,
    );
  });

  it("lets head office reach a project it is not a member of", async () => {
    const { service } = await buildWith();
    await expect(service.updateProject(HEAD_OFFICE, PROJECT, { name: "Renamed" })).resolves.toBeDefined();
  });

  it("refuses somebody who can reach the project but lacks the action", async () => {
    /*
     * Reach without capability. A controls manager is on the project and can
     * see all of it, but nothing in their project role or their user types
     * lets them rewrite the project record itself.
     *
     * A project administrator would pass here, and correctly so: the role
     * grants editing on its own project, which is what appointing somebody to
     * run a project has to mean.
     */
    const controls = person("aaaaaaaa-4444-4444-8444-444444444444", ["projects.read"]);
    const { service } = await buildWith([[controls.userId, "controls_manager"]]);
    await expect(service.updateProject(controls, PROJECT, { name: "Renamed" })).rejects.toThrow(
      DomainError,
    );
  });

  it("treats archiving as its own capability, smaller than editing", async () => {
    /*
     * A company can let somebody close out work without letting them rewrite
     * the contract details, so the two cannot be one grant. Shown here on
     * somebody whose reach comes from head office rather than from a project
     * role, because a project administrator is granted both by the role and
     * the distinction would be invisible.
     */
    const closer = person("aaaaaaaa-5555-4555-8555-555555555555", [
      "projects.read", "projects.archive", "projects.manage_all",
    ]);
    const { service } = await buildWith();

    await expect(service.updateProject(closer, PROJECT, { status: "archived" })).resolves.toBeDefined();
    await expect(service.updateProject(closer, PROJECT, { name: "Renamed" })).rejects.toThrow(DomainError);
  });
});

describe("deleting a project is stricter than changing one", () => {
  it("refuses head office, which can edit every project", async () => {
    // The rule the owner asked for: reaching every project is enough to change
    // one and deliberately not enough to destroy one.
    const { service, projects } = await buildWith();
    await expect(service.deleteProject(HEAD_OFFICE, PROJECT)).rejects.toThrow(DomainError);
    expect(projects.deleted).toBe(false);
  });

  it("refuses a project manager on that very project", async () => {
    const { service, projects } = await buildWith([[SITE_ADMIN.userId, "project_manager"]]);
    await expect(service.deleteProject(SITE_ADMIN, PROJECT)).rejects.toThrow(/project administrator/iu);
    expect(projects.deleted).toBe(false);
  });

  it("allows the project's own administrator holding the permission", async () => {
    const { service, projects } = await buildWith([[SITE_ADMIN.userId, "project_admin"]]);
    await expect(service.deleteProject(SITE_ADMIN, PROJECT)).resolves.toBeUndefined();
    expect(projects.deleted).toBe(true);
  });

  it("refuses a project administrator who was never granted the permission", async () => {
    // Appointment alone must not carry the power to destroy, or the strict rule
    // is only as strict as who can edit a project's team.
    const appointed = person("aaaaaaaa-6666-4666-8666-666666666666", ["projects.read"]);
    const { service, projects } = await buildWith([[appointed.userId, "project_admin"]]);
    await expect(service.deleteProject(appointed, PROJECT)).rejects.toThrow(DomainError);
    expect(projects.deleted).toBe(false);
  });

  it("still allows a company administrator", async () => {
    const { service, projects } = await buildWith();
    await expect(service.deleteProject(person("aaaaaaaa-7777-4777-8777-777777777777", [], "owner"), PROJECT))
      .resolves.toBeUndefined();
    expect(projects.deleted).toBe(true);
  });
});

describe("a project role means something on its own project", () => {
  it("lets a project administrator run their own team without a company grant", () => {
    // Otherwise the appointment is decorative: a site team would have to ask
    // head office before adding its own people.
    expect(roleGrantsOnProject("project_admin", "project_team.manage")).toBe(true);
    expect(roleGrantsOnProject("project_admin", "tasks.create")).toBe(true);
  });

  it("never lets a project role carry the power to destroy the project", () => {
    // Deletion is checked separately and needs the company grant as well, so
    // this must not be reachable by appointment.
    for (const role of ["project_admin", "project_manager", "controls_manager", "viewer", "external_collaborator"] as const) {
      expect(roleGrantsOnProject(role, "projects.delete")).toBe(false);
    }
  });

  it("gives a project viewer reads and nothing that writes", () => {
    expect(roleGrantsOnProject("viewer", "tasks.read")).toBe(true);
    expect(roleGrantsOnProject("viewer", "tasks.edit")).toBe(false);
    expect(roleGrantsOnProject("viewer", "project_team.manage")).toBe(false);
  });

  it("keeps a project role from granting anything company-wide", () => {
    // A role held on one project must never reach company administration.
    for (const role of ["project_admin", "project_manager"] as const) {
      for (const companyWide of ["settings.manage", "users.create", "user_types.create", "activity.read_all"]) {
        expect(roleGrantsOnProject(role, companyWide)).toBe(false);
      }
    }
  });
});

describe("guests stay external whatever they are granted", () => {
  it("refuses a guest the head-office reach even if a user type carries it", () => {
    expect(canReachAllProjects(person("aaaaaaaa-8888-4888-8888-888888888888", ["projects.manage_all"], "guest")))
      .toBe(false);
  });

  it("refuses a guest every one of the new keys", () => {
    // Written as a loop over the whole set so a permission added later cannot
    // quietly become the one a guest is allowed to hold.
    const guest = person("aaaaaaaa-9999-4999-8999-999999999999", [...allPermissions], "guest");
    for (const permission of allPermissions) {
      expect(hasPermission(guest, permission)).toBe(false);
    }
  });
});
