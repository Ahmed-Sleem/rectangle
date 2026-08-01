/**
 * The reference must describe the system that exists, not a copy of it.
 *
 * A page explaining who can do what is only worth having if it cannot drift.
 * The failure mode is quiet: somebody tightens a guard, the page keeps
 * describing the old rule, and a document that looks authoritative starts
 * misleading the person relying on it. That is worse than having no page.
 *
 * So these do not assert on hard-coded expectations. They put the reference
 * beside the functions the guards actually call — `hasPermission`,
 * `rolePermissions`, `roleGrantsOnProject` — and require the two to agree. If a
 * rule changes and the reference does not follow, this is what says so.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AdminService, type AdminRepository, type UserTypeRecord } from "../src/application/admin-service.js";
import { DomainError } from "../src/domain/errors.js";
import {
  companyStandingSchema,
  hasPermission,
  rolePermissions,
  type UserPrincipal,
} from "../src/domain/auth.js";
import { allPermissions, permissionDescriptions, type Permission } from "../src/domain/permissions.js";
import { projectMemberRoleSchema, roleGrantsOnProject } from "../src/domain/project-team.js";

const tenantId = "11111111-1111-4111-8111-111111111111";

const reader: UserPrincipal = {
  tenantId,
  userId: "22222222-2222-4222-8222-222222222222",
  roles: ["none"],
  permissions: ["settings.manage"],
};

const outsider: UserPrincipal = {
  tenantId,
  userId: "33333333-3333-4333-8333-333333333333",
  roles: ["none"],
  // Enough to edit roles, deliberately not enough to read the whole model.
  permissions: ["user_types.read", "user_types.edit", "users.read"],
};

class MemoryRepository {
  people: Array<{ id: string; name: string; permissions: Permission[] }> = [];

  addPerson(name: string, permissions: Permission[]) {
    const person = { id: randomUUID(), name, permissions };
    this.people.push(person);
    return person;
  }

  async listPermissionHolders(): Promise<Array<{ permission: string; id: string; name: string }>> {
    return this.people.flatMap((person) =>
      person.permissions.map((permission) => ({ permission, id: person.id, name: person.name })));
  }
}

function createService() {
  const repo = new MemoryRepository();
  const service = new AdminService(
    repo as unknown as AdminRepository,
    { async hash() { return "x"; }, async verify() { return true; } },
    { async append() {} },
  );
  return { service, repo };
}

describe("who may read the access model", () => {
  it("refuses somebody who administers roles but not the company", async () => {
    /*
     * Gated on `settings.manage` rather than `user_types.read`. Reading the map
     * of everything the company can grant is a configuration question; being
     * able to edit one role does not entitle somebody to the whole picture,
     * which is the same reasoning separation of duties rests on.
     */
    const { service } = createService();
    await expect(service.getPermissionReference(outsider)).rejects.toThrow(DomainError);
  });

  it("allows somebody who manages company settings", async () => {
    const { service } = createService();
    await expect(service.getPermissionReference(reader)).resolves.toBeDefined();
  });
});

describe("the permission list", () => {
  it("describes every permission the system defines, and no others", async () => {
    // A permission missing from the reference is one nobody can find out about;
    // one that does not exist is a promise the product cannot keep.
    const { service } = createService();
    const reference = await service.getPermissionReference(reader);
    expect(reference.permissions.map((entry) => entry.key).sort()).toEqual(
      [...allPermissions].sort(),
    );
  });

  it("carries the description and grouping the picker uses", async () => {
    // The same source, so the reference and the role editor cannot disagree
    // about what a permission means.
    const { service } = createService();
    const reference = await service.getPermissionReference(reader);
    for (const entry of reference.permissions) {
      const canonical = permissionDescriptions.find((option) => option.key === entry.key);
      expect(entry.label).toBe(canonical?.label);
      expect(entry.description).toBe(canonical?.description);
      expect(entry.group).toBe(canonical?.group);
    }
  });

  it("names the people who hold each permission", async () => {
    const { service, repo } = createService();
    repo.addPerson("Mona Adel", ["users.read", "users.edit"]);
    repo.addPerson("Sara Fouad", ["projects.read"]);

    const reference = await service.getPermissionReference(reader);
    const usersEdit = reference.permissions.find((entry) => entry.key === "users.edit");
    expect(usersEdit?.heldBy.map((person) => person.name)).toEqual(["Mona Adel"]);

    const settings = reference.permissions.find((entry) => entry.key === "settings.manage");
    expect(settings?.heldBy).toEqual([]);
  });

  it("does not claim somebody holds a permission they do not", async () => {
    /*
     * Checked against every permission rather than a sample: the holding list
     * is the part somebody will read to answer "who can do this", and being
     * wrong in one row is enough to make the page untrustworthy.
     */
    const { service, repo } = createService();
    const office = repo.addPerson("Karim Adel", ["projects.read", "projects.create"]);

    const reference = await service.getPermissionReference(reader);
    for (const entry of reference.permissions) {
      const claimed = entry.heldBy.some((person) => person.id === office.id);
      expect(claimed).toBe(office.permissions.includes(entry.key));
    }
  });
});

describe("standings, read from the guards rather than restated", () => {
  it("agrees with rolePermissions about who holds everything", async () => {
    /*
     * The rule a matrix cannot show. An owner holds every permission without a
     * single grant recorded against them, so a table built from grants alone
     * would render them as having nothing.
     */
    const { service } = createService();
    const reference = await service.getPermissionReference(reader);

    for (const standing of companyStandingSchema.options) {
      const entry = reference.standings.find((row) => row.standing === standing);
      const everything = rolePermissions([standing]).length === allPermissions.length;
      expect(entry?.holdsEverything).toBe(everything);
    }
  });

  it("does not claim a standing grants what the guard refuses", async () => {
    /*
     * Stated as the property rather than as two expected rows: whatever the
     * standings are, the reference must agree with the guard about each one, so
     * adding a standing later cannot make the page describe access the product
     * denies.
     */
    const { service } = createService();
    const reference = await service.getPermissionReference(reader);

    for (const standing of companyStandingSchema.options) {
      const withoutGrants: UserPrincipal = {
        tenantId,
        userId: reader.userId,
        roles: [standing],
        permissions: [],
      };
      const entry = reference.standings.find((row) => row.standing === standing);
      expect(entry?.holdsEverything).toBe(hasPermission(withoutGrants, "settings.manage"));
    }
  });
});

describe("project roles, read from the table the guard consults", () => {
  it("lists every membership role", async () => {
    const { service } = createService();
    const reference = await service.getPermissionReference(reader);
    expect(reference.projectRoles.map((entry) => entry.role).sort()).toEqual(
      [...projectMemberRoleSchema.options].sort(),
    );
  });

  it("agrees with roleGrantsOnProject for every role and permission", async () => {
    /*
     * Every pair, not a sample. This is the check that makes the page safe to
     * trust: if a role gains or loses a grant and the reference is not
     * regenerated from the same table, one of these five hundred comparisons
     * fails immediately.
     */
    const { service } = createService();
    const reference = await service.getPermissionReference(reader);

    for (const role of projectMemberRoleSchema.options) {
      const listed = reference.projectRoles.find((entry) => entry.role === role);
      expect(listed).toBeDefined();
      for (const permission of allPermissions) {
        expect(listed?.grants.includes(permission)).toBe(roleGrantsOnProject(role, permission));
      }
    }
  });

  it("shows no project role granting the power to destroy a project", async () => {
    // Appointment alone must never carry deletion; it is checked separately and
    // needs the company grant as well.
    const { service } = createService();
    const reference = await service.getPermissionReference(reader);
    for (const entry of reference.projectRoles) {
      expect(entry.grants).not.toContain("projects.delete");
    }
  });
});

describe("the deletion rule", () => {
  it("states that reaching every project is not enough to destroy one", async () => {
    // The rule the owner asked for, and the one most likely to surprise: a
    // company-wide grant edits any project and deletes none.
    const { service } = createService();
    const reference = await service.getPermissionReference(reader);
    expect(reference.deletionRule.requiresProjectAdmin).toBe(true);
    expect(reference.deletionRule.manageAllInsufficient).toBe(true);
  });
});
