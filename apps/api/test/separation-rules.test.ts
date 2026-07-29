/**
 * Declaring and retiring separation-of-duties rules.
 *
 * The enforcement side of this control already existed and is covered in
 * admin-service.test.ts: a rule refuses an assignment that would combine the
 * pair. What was missing was any way for a company to declare a rule without a
 * DBA, which is what these cover.
 *
 * The interesting half is not the insert. It is what happens when a rule is
 * declared that people already break. A rule saved while three people violate
 * it reads as enforced and is not, which is worse than having no rule at all,
 * so declaring one and resolving the existing violations are the same act.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AdminService, type AdminRepository, type AdminUserRecord, type UserTypeRecord } from "../src/application/admin-service.js";
import type { AuditEventInput } from "../src/application/project-service.js";
import { DomainError } from "../src/domain/errors.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import type { Permission, SeparationRule } from "../src/domain/permissions.js";

const tenantId = "11111111-1111-4111-8111-111111111111";

const settingsAdmin: UserPrincipal = {
  tenantId,
  userId: "22222222-2222-4222-8222-222222222222",
  roles: ["member"],
  permissions: ["settings.manage"],
};

/** Holds no `settings.manage`, so every call here must be refused. */
const outsider: UserPrincipal = {
  tenantId,
  userId: "33333333-3333-4333-8333-333333333333",
  roles: ["member"],
  permissions: ["users.read", "user_types.read"],
};

/**
 * The same in-memory repository shape the admin tests use, narrowed to what
 * this file exercises. Implemented against real state rather than returning
 * fixed answers: a double that reported no violators would let every test here
 * pass whatever the service did.
 */
class MemoryRepository {
  userTypes: UserTypeRecord[] = [];
  users: AdminUserRecord[] = [];
  rules: SeparationRule[] = [];

  addType(name: string, permissions: Permission[]): UserTypeRecord {
    const type: UserTypeRecord = {
      id: randomUUID(),
      tenantId,
      name,
      key: name.toLowerCase().replace(/\s+/gu, "_"),
      permissions,
      systemType: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.userTypes.push(type);
    return type;
  }

  addUser(displayName: string, types: UserTypeRecord[], standing: AdminUserRecord["standing"] = "member"): AdminUserRecord {
    const user: AdminUserRecord = {
      id: randomUUID(),
      tenantId,
      email: `${displayName.toLowerCase().replace(/\s+/gu, ".")}@example.com`,
      displayName,
      status: "active",
      standing,
      userTypes: types.map((type) => ({ id: type.id, name: type.name, key: type.key })),
      projectCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.users.push(user);
    return user;
  }

  async listSeparationRules(): Promise<SeparationRule[]> {
    return this.rules;
  }

  async findSeparationViolators(_tenant: string, a: string, b: string) {
    const carrying = (user: AdminUserRecord, permission: string) =>
      user.userTypes
        .map((assigned) => this.userTypes.find((type) => type.id === assigned.id))
        .filter((type): type is UserTypeRecord =>
          Boolean(type?.permissions.includes(permission as Permission)))
        .map((type) => ({ id: type.id, name: type.name }));

    return this.users
      .filter((user) => user.standing !== "owner" && user.standing !== "admin")
      .map((user) => ({
        userId: user.id,
        displayName: user.displayName,
        email: user.email,
        typesGrantingA: carrying(user, a),
        typesGrantingB: carrying(user, b),
        totalTypes: user.userTypes.length,
      }))
      .filter((row) => row.typesGrantingA.length > 0 && row.typesGrantingB.length > 0);
  }

  async createSeparationRule(
    _tenant: string,
    input: { a: string; b: string; reason: string },
    strip: Array<{ userId: string; userTypeIds: string[] }>,
  ): Promise<SeparationRule> {
    const rule: SeparationRule = {
      id: randomUUID(),
      a: input.a as Permission,
      b: input.b as Permission,
      reason: input.reason,
    };
    this.rules.push(rule);
    for (const person of strip) {
      const user = this.users.find((candidate) => candidate.id === person.userId);
      if (!user) continue;
      user.userTypes = user.userTypes.filter((type) => !person.userTypeIds.includes(type.id));
    }
    return rule;
  }

  async deleteSeparationRule(_tenant: string, ruleId: string): Promise<boolean> {
    const before = this.rules.length;
    this.rules = this.rules.filter((rule) => rule.id !== ruleId);
    return this.rules.length < before;
  }
}

function createService() {
  const repo = new MemoryRepository();
  const audit = {
    events: [] as AuditEventInput[],
    async append(event: AuditEventInput) { this.events.push(event); },
  };
  const service = new AdminService(
    repo as unknown as AdminRepository,
    { async hash() { return "x"; }, async verify() { return true; } },
    audit,
  );
  return { service, repo, audit };
}

const REASON = "Inventing a role and assigning it must not be one person's job.";

describe("who may manage separation rules", () => {
  it("refuses somebody without settings.manage", async () => {
    /*
     * Gated on company settings rather than on the user-type permissions. This
     * is policy about what roles may combine, not a role itself, so somebody
     * who administers roles is not automatically entitled to change the rules
     * constraining them — which is the same reasoning the control embodies.
     */
    const { service } = createService();
    await expect(service.listSeparationRules(outsider)).rejects.toThrow(DomainError);
    await expect(service.previewSeparationRule(outsider, { a: "users.edit", b: "user_types.create" }))
      .rejects.toThrow(DomainError);
    await expect(
      service.createSeparationRule(outsider, {
        a: "users.edit", b: "user_types.create", reason: REASON, losing: "users.edit",
      }),
    ).rejects.toThrow(DomainError);
    await expect(service.deleteSeparationRule(outsider, randomUUID())).rejects.toThrow(DomainError);
  });
});

describe("declaring a rule", () => {
  it("refuses a pair naming the same permission twice", async () => {
    // The database constraint would reject this too, but as a 500. A rule
    // saying somebody may not hold a permission alongside itself is a typo.
    const { service } = createService();
    await expect(
      service.createSeparationRule(settingsAdmin, {
        a: "users.edit", b: "users.edit", reason: REASON, losing: "users.edit",
      }),
    ).rejects.toThrow(DomainError);
  });

  it("refuses giving up a permission that is not in the pair", async () => {
    const { service } = createService();
    await expect(
      service.createSeparationRule(settingsAdmin, {
        a: "users.edit", b: "user_types.create", reason: REASON, losing: "settings.manage",
      }),
    ).rejects.toThrow(DomainError);
  });

  it("refuses a reason too short to explain the refusal it will cause", async () => {
    // The only thing a blocked assignment can offer the person blocked is this
    // sentence, so "no" on its own is not a reason.
    const { service } = createService();
    await expect(
      service.createSeparationRule(settingsAdmin, {
        a: "users.edit", b: "user_types.create", reason: "no", losing: "users.edit",
      }),
    ).rejects.toThrow(DomainError);
  });

  it("stores the pair in one order however it was given", async () => {
    /*
     * A pair is unordered. Stored both ways round it would be two rules
     * enforcing one control, and the second would read as a different policy.
     *
     * Given here in the WRONG order deliberately. An earlier version of this
     * passed a pair that was already sorted, so removing the sort entirely left
     * it green — it was asserting that a no-op had not changed anything.
     * `users.edit` sorts after `user_types.create`, so passing it as `a` is the
     * only arrangement that exercises the swap.
     */
    const { service, repo } = createService();
    await service.createSeparationRule(settingsAdmin, {
      a: "users.edit", b: "user_types.create", reason: REASON, losing: "users.edit",
    });
    expect(repo.rules[0]?.a).toBe("user_types.create");
    expect(repo.rules[0]?.b).toBe("users.edit");
  });

  it("records who lost what, because that is what somebody reconstructs later", async () => {
    const { service, repo, audit } = createService();
    const assigner = repo.addType("People Admin", ["users.read", "users.edit"]);
    const author = repo.addType("Role Author", ["user_types.read", "user_types.create"]);
    const person = repo.addUser("Mona Adel", [assigner, author]);

    await service.createSeparationRule(settingsAdmin, {
      a: "users.edit", b: "user_types.create", reason: REASON, losing: "users.edit",
    });

    const entry = audit.events.find((event) => event.action === "separation_rule.create");
    expect(entry).toBeDefined();
    expect(entry?.metadata?.strippedFrom).toEqual([person.id]);
    expect(entry?.metadata?.losing).toBe("users.edit");
  });
});

describe("what a rule would cost, before it is declared", () => {
  it("names the people who already hold both halves", async () => {
    const { service, repo } = createService();
    const assigner = repo.addType("People Admin", ["users.read", "users.edit"]);
    const author = repo.addType("Role Author", ["user_types.read", "user_types.create"]);
    repo.addUser("Mona Adel", [assigner, author]);
    repo.addUser("Omar Fathy", [assigner]);

    const preview = await service.previewSeparationRule(settingsAdmin, {
      a: "users.edit", b: "user_types.create",
    });
    expect(preview.violators.map((violator) => violator.displayName)).toEqual(["Mona Adel"]);
  });

  it("changes nothing", async () => {
    // A preview that quietly applied would be the opposite of what it is for.
    const { service, repo } = createService();
    const assigner = repo.addType("People Admin", ["users.read", "users.edit"]);
    const author = repo.addType("Role Author", ["user_types.read", "user_types.create"]);
    const person = repo.addUser("Mona Adel", [assigner, author]);

    await service.previewSeparationRule(settingsAdmin, { a: "users.edit", b: "user_types.create" });
    expect(person.userTypes).toHaveLength(2);
    expect(repo.rules).toHaveLength(0);
  });

  it("exempts owners and administrators, who hold everything by standing", async () => {
    /*
     * Otherwise every rule names every administrator and the list is noise
     * hiding the violations that can actually be acted on.
     */
    const { service, repo } = createService();
    const assigner = repo.addType("People Admin", ["users.read", "users.edit"]);
    const author = repo.addType("Role Author", ["user_types.read", "user_types.create"]);
    repo.addUser("An Owner", [assigner, author], "owner");
    repo.addUser("An Admin", [assigner, author], "admin");

    const preview = await service.previewSeparationRule(settingsAdmin, {
      a: "users.edit", b: "user_types.create",
    });
    expect(preview.violators).toHaveLength(0);
  });

  it("says which side cannot be given up without emptying somebody", async () => {
    // Flagged per side so the screen can rule out a choice before it is made,
    // rather than refusing after the administrator has committed to one.
    const { service, repo } = createService();
    const both = repo.addType("Office Manager", [
      "users.read", "users.edit", "user_types.read", "user_types.create",
    ]);
    repo.addUser("Sole Type", [both]);

    const preview = await service.previewSeparationRule(settingsAdmin, {
      a: "users.edit", b: "user_types.create",
    });
    expect(preview.violators[0]?.losesEverythingIfA).toBe(true);
    expect(preview.violators[0]?.losesEverythingIfB).toBe(true);
  });
});

describe("resolving the people who already break it", () => {
  it("takes the losing type off the violator and leaves their other access", async () => {
    const { service, repo } = createService();
    const assigner = repo.addType("People Admin", ["users.read", "users.edit"]);
    const author = repo.addType("Role Author", ["user_types.read", "user_types.create"]);
    const person = repo.addUser("Mona Adel", [assigner, author]);

    const result = await service.createSeparationRule(settingsAdmin, {
      a: "users.edit", b: "user_types.create", reason: REASON, losing: "users.edit",
    });

    expect(result.strippedFrom).toBe(1);
    expect(person.userTypes.map((type) => type.name)).toEqual(["Role Author"]);
  });

  it("gives up the other side when that is what was chosen", async () => {
    const { service, repo } = createService();
    const assigner = repo.addType("People Admin", ["users.read", "users.edit"]);
    const author = repo.addType("Role Author", ["user_types.read", "user_types.create"]);
    const person = repo.addUser("Mona Adel", [assigner, author]);

    await service.createSeparationRule(settingsAdmin, {
      a: "users.edit", b: "user_types.create", reason: REASON, losing: "user_types.create",
    });
    expect(person.userTypes.map((type) => type.name)).toEqual(["People Admin"]);
  });

  it("never edits the user type itself", async () => {
    /*
     * The whole reason removal is per person. Editing "People Admin" to drop
     * the permission would change access for everybody holding it, including
     * people who were never in violation — a far larger act than the one being
     * asked for, and one that already has its own screen.
     */
    const { service, repo } = createService();
    const assigner = repo.addType("People Admin", ["users.read", "users.edit"]);
    const author = repo.addType("Role Author", ["user_types.read", "user_types.create"]);
    repo.addUser("Mona Adel", [assigner, author]);
    const bystander = repo.addUser("Omar Fathy", [assigner]);

    await service.createSeparationRule(settingsAdmin, {
      a: "users.edit", b: "user_types.create", reason: REASON, losing: "users.edit",
    });

    expect(assigner.permissions).toContain("users.edit");
    expect(bystander.userTypes).toHaveLength(1);
  });

  it("refuses when somebody would be left with no user type at all", async () => {
    /*
     * They could still sign in and would reach nothing — an account that looks
     * real and is not, created as a side effect of switching a control on. The
     * names come back so the administrator can give them another type first,
     * which is a thing they can actually do.
     */
    const { service, repo } = createService();
    const both = repo.addType("Office Manager", [
      "users.read", "users.edit", "user_types.read", "user_types.create",
    ]);
    const person = repo.addUser("Sole Type", [both]);

    await expect(
      service.createSeparationRule(settingsAdmin, {
        a: "users.edit", b: "user_types.create", reason: REASON, losing: "users.edit",
      }),
    ).rejects.toThrow(/no access at all/iu);

    // Nothing half-applied: no rule, and the person keeps what they had.
    expect(repo.rules).toHaveLength(0);
    expect(person.userTypes).toHaveLength(1);
  });

  it("refuses a pair that is already separated, whichever way round", async () => {
    /*
     * The unique index would catch this, but as a 500. And because the pair is
     * ordered before the check, entering it backwards is the same rule rather
     * than a second control saying the same thing.
     */
    const { service } = createService();
    await service.createSeparationRule(settingsAdmin, {
      a: "users.edit", b: "user_types.create", reason: REASON, losing: "users.edit",
    });
    await expect(
      service.createSeparationRule(settingsAdmin, {
        a: "user_types.create", b: "users.edit", reason: REASON, losing: "users.edit",
      }),
    ).rejects.toThrow(/already separated/iu);
  });

  it("saves cleanly when nobody is in violation", async () => {
    const { service, repo } = createService();
    repo.addUser("Nobody Special", [repo.addType("Read Only", ["projects.read"])]);

    const result = await service.createSeparationRule(settingsAdmin, {
      a: "users.edit", b: "user_types.create", reason: REASON, losing: "users.edit",
    });
    expect(result.strippedFrom).toBe(0);
    expect(repo.rules).toHaveLength(1);
  });
});

describe("retiring a rule", () => {
  it("removes it and records that it was removed", async () => {
    const { service, repo, audit } = createService();
    const { rule } = await service.createSeparationRule(settingsAdmin, {
      a: "users.edit", b: "user_types.create", reason: REASON, losing: "users.edit",
    });

    await service.deleteSeparationRule(settingsAdmin, String(rule.id));
    expect(repo.rules).toHaveLength(0);
    expect(audit.events.some((event) => event.action === "separation_rule.delete")).toBe(true);
  });

  it("does not hand back the access declaring it took away", async () => {
    /*
     * Access removed for a reason should be granted back by somebody choosing
     * to, not reappear because a policy was retired. Restoring silently would
     * also be guesswork: the person may have been given something else since.
     */
    const { service, repo } = createService();
    const assigner = repo.addType("People Admin", ["users.read", "users.edit"]);
    const author = repo.addType("Role Author", ["user_types.read", "user_types.create"]);
    const person = repo.addUser("Mona Adel", [assigner, author]);

    const { rule } = await service.createSeparationRule(settingsAdmin, {
      a: "users.edit", b: "user_types.create", reason: REASON, losing: "users.edit",
    });
    await service.deleteSeparationRule(settingsAdmin, String(rule.id));

    expect(person.userTypes.map((type) => type.name)).toEqual(["Role Author"]);
  });

  it("reports a rule that was never there rather than succeeding quietly", async () => {
    const { service } = createService();
    await expect(service.deleteSeparationRule(settingsAdmin, randomUUID())).rejects.toThrow(DomainError);
  });
});
