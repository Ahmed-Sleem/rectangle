/** Tests tenant administration service permissions, user types, and user creation. */
import { describe, expect, it } from "vitest";
import type { Permission, SeparationRule } from "../src/domain/permissions.js";
import { AdminService, type AdminRepository, type AdminUserRecord, type UserTypeRecord } from "../src/application/admin-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";
import type { CreateUserInput, CreateUserTypeInput, UpdateUserTypeInput } from "../src/domain/admin.js";
import type { PasswordHasher } from "../src/infrastructure/password.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const admin: UserPrincipal = { tenantId, userId: "22222222-2222-4222-8222-222222222222", roles: ["admin"], permissions: [] };
const viewer: UserPrincipal = { tenantId, userId: "33333333-3333-4333-8333-333333333333", roles: ["member"], permissions: [] };

class MemoryAuditRepository implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> { this.events.push(event); }
}

class TestPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> { return `hashed:${password}`; }
  async verify(password: string, encodedHash: string): Promise<boolean> { return encodedHash === `hashed:${password}`; }
}

class MemoryAdminRepository implements AdminRepository {
  userTypes: UserTypeRecord[] = [];
  users: AdminUserRecord[] = [];
  /** Overridden per test to describe how much administrative cover remains. */
  otherAdmins = 1;
  separationRules: SeparationRule[] = [];
  async listSeparationRules(): Promise<SeparationRule[]> { return this.separationRules; }

  /*
   * Implemented against the same state the rest of this double holds rather
   * than returning something convenient. A stub that reported no violators
   * would make every test about stripping pass regardless of what the service
   * did, which is worse than having no test.
   */
  async findSeparationViolators(_tenantId: string, a: string, b: string) {
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
      .filter((violator) => violator.typesGrantingA.length > 0 && violator.typesGrantingB.length > 0);
  }

  async createSeparationRule(
    _tenantId: string,
    input: { a: string; b: string; reason: string },
    strip: Array<{ userId: string; userTypeIds: string[] }>,
  ): Promise<SeparationRule> {
    const rule: SeparationRule = {
      id: crypto.randomUUID(),
      a: input.a as Permission,
      b: input.b as Permission,
      reason: input.reason,
    };
    this.separationRules.push(rule);
    // The strip is applied here too, so a test can observe that the service
    // asked for the right people to lose the right types.
    for (const person of strip) {
      const user = this.users.find((candidate) => candidate.id === person.userId);
      if (!user) continue;
      user.userTypes = user.userTypes.filter((type) => !person.userTypeIds.includes(type.id));
    }
    return rule;
  }

  async deleteSeparationRule(_tenantId: string, ruleId: string): Promise<boolean> {
    const before = this.separationRules.length;
    this.separationRules = this.separationRules.filter((rule) => rule.id !== ruleId);
    return this.separationRules.length < before;
  }

  async findStanding(_tenantId: string, userId: string): Promise<string | null> {
    return this.users.find((user) => user.id === userId)?.standing ?? null;
  }

  async countOtherOwners(_tenantId: string, excludingUserId: string): Promise<number> {
    return this.users.filter((user) => user.id !== excludingUserId && user.standing === "owner").length;
  }

  async countOtherActiveAdmins(): Promise<number> { return this.otherAdmins; }
  async ensureSystemUserTypes(): Promise<void> {
    if (!this.userTypes.find((type) => type.key === "owner")) {
      this.userTypes.push({ id: "44444444-4444-4444-8444-444444444444", tenantId, name: "Owner", key: "owner", permissions: ["projects.read", "projects.manage_all", "users.read", "users.create", "users.edit", "users.disable", "user_types.read", "user_types.create", "user_types.edit", "settings.manage"], systemType: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
  }
  async listUserTypes(): Promise<UserTypeRecord[]> { return this.userTypes; }
  async findUserTypeByKey(_tenantId: string, key: string): Promise<UserTypeRecord | null> { return this.userTypes.find((type) => type.key === key) ?? null; }
  async findUserTypesByIds(_tenantId: string, ids: string[]): Promise<UserTypeRecord[]> { return this.userTypes.filter((type) => ids.includes(type.id)); }
  async createUserType(inputTenantId: string, input: CreateUserTypeInput): Promise<UserTypeRecord> {
    const userType: UserTypeRecord = { id: crypto.randomUUID(), tenantId: inputTenantId, name: input.name, key: input.key, ...(input.description ? { description: input.description } : {}), permissions: input.permissions, systemType: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.userTypes.push(userType);
    return userType;
  }
  async updateUserType(_tenantId: string, id: string, input: UpdateUserTypeInput): Promise<UserTypeRecord | null> {
    const existing = this.userTypes.find((type) => type.id === id);
    if (!existing) return null;
    Object.assign(existing, input, { updatedAt: new Date().toISOString() });
    return existing;
  }
  async listUsers(): Promise<AdminUserRecord[]> { return this.users; }
  async findUserByEmail(_tenantId: string, email: string): Promise<AdminUserRecord | null> { return this.users.find((user) => user.email === email) ?? null; }
  async createUser(
    inputTenantId: string,
    input: Omit<CreateUserInput, "password"> & { passwordHash: string | null; status: "active" | "invited" },
  ): Promise<AdminUserRecord> {
    const types = this.userTypes.filter((type) => input.userTypeIds.includes(type.id));
    const user: AdminUserRecord = { id: crypto.randomUUID(), tenantId: inputTenantId, email: input.email, displayName: input.displayName, status: input.status, standing: input.standing ?? "member", userTypes: types.map((type) => ({ id: type.id, name: type.name, key: type.key })), projectCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.users.push(user);
    return user;
  }
  async updateUser(inputTenantId: string, userId: string, input: { displayName?: string; status?: "active" | "disabled"; passwordHash?: string; userTypeIds?: string[]; standing?: AdminUserRecord["standing"] }): Promise<AdminUserRecord | null> {
    const user = this.users.find((item) => item.tenantId === inputTenantId && item.id === userId);
    if (!user) return null;
    if (input.displayName) user.displayName = input.displayName;
    if (input.status) user.status = input.status;
    if (input.standing) user.standing = input.standing;
    if (input.userTypeIds) user.userTypes = this.userTypes.filter((type) => input.userTypeIds?.includes(type.id)).map((type) => ({ id: type.id, name: type.name, key: type.key }));
    user.updatedAt = new Date().toISOString();
    return user;
  }
}

class MemorySessionRevoker {
  readonly revoked: Array<{ tenantId: string; userId: string }> = [];
  async revokeAllSessionsForUser(revokeTenantId: string, userId: string): Promise<void> {
    this.revoked.push({ tenantId: revokeTenantId, userId });
  }
}

class MemoryInvitationSender {
  readonly invited: Array<{ userId: string; email: string }> = [];
  failing = false;
  async sendInvitation(_actor: unknown, userId: string, email: string): Promise<void> {
    if (this.failing) throw new Error("smtp down");
    this.invited.push({ userId, email });
  }
}

function createService() {
  const repo = new MemoryAdminRepository();
  const audit = new MemoryAuditRepository();
  const sessions = new MemorySessionRevoker();
  const invitations = new MemoryInvitationSender();
  return {
    service: new AdminService(repo, new TestPasswordHasher(), audit, sessions, invitations),
    repo,
    audit,
    sessions,
    invitations,
  };
}

describe("AdminService", () => {
  it("lets tenant admins create user types and users", async () => {
    const { service, audit } = createService();
    const { userType } = await service.createUserType(admin, { name: "Cost Controller", key: "cost_controller", permissions: ["projects.read", "users.read"] });
    const { user } = await service.createUser(admin, { displayName: "Cost Lead", email: "cost@example.com", password: "VeryStrongPassword123", userTypeIds: [userType.id] });

    expect(user.userTypes[0]?.key).toBe("cost_controller");
    expect(audit.events.map((event) => event.action)).toEqual(["user_type.create", "user.create"]);
  });

  it("blocks users without admin permissions", async () => {
    const { service } = createService();
    await expect(service.createUserType(viewer, { name: "Blocked", key: "blocked", permissions: ["projects.read"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("ends live sessions the moment someone is disabled", async () => {
    const { service, repo, sessions } = createService();
    await repo.ensureSystemUserTypes();
    const { user } = await service.createUser(admin, { displayName: "Site Lead", email: "site@example.com", password: "VeryStrongPassword123", userTypeIds: [repo.userTypes[0]!.id] });

    await service.updateUser(admin, user.id, { status: "disabled" });

    expect(sessions.revoked).toEqual([{ tenantId, userId: user.id }]);
  });

  it("leaves sessions alone for changes that are not a withdrawal of access", async () => {
    const { service, repo, sessions } = createService();
    await repo.ensureSystemUserTypes();
    const { user } = await service.createUser(admin, { displayName: "Site Lead", email: "site2@example.com", password: "VeryStrongPassword123", userTypeIds: [repo.userTypes[0]!.id] });

    await service.updateUser(admin, user.id, { displayName: "Site Leader" });

    expect(sessions.revoked).toEqual([]);
  });

  it("refuses to disable the last remaining administrator", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();
    const { user } = await service.createUser(admin, { displayName: "Only Admin", email: "only@example.com", password: "VeryStrongPassword123", userTypeIds: [repo.userTypes[0]!.id] });
    // Nobody else could administer the company once this account is disabled.
    repo.otherAdmins = 0;

    await expect(service.updateUser(admin, user.id, { status: "disabled" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(repo.users.find((item) => item.id === user.id)?.status).toBe("active");
  });

  it("allows disabling an administrator while others remain", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();
    const { user } = await service.createUser(admin, { displayName: "Second Admin", email: "second@example.com", password: "VeryStrongPassword123", userTypeIds: [repo.userTypes[0]!.id] });
    repo.otherAdmins = 2;

    const result = await service.updateUser(admin, user.id, { status: "disabled" });

    expect(result.user.status).toBe("disabled");
  });

  it("refuses to let an administrator disable their own account", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();
    repo.otherAdmins = 5;

    await expect(service.updateUser(admin, admin.userId, { status: "disabled" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("invites a person when no password is set, instead of inventing one", async () => {
    const { service, repo, invitations } = createService();
    await repo.ensureSystemUserTypes();

    const { user } = await service.createUser(admin, {
      displayName: "New Person",
      email: "new@example.com",
      userTypeIds: [repo.userTypes[0]!.id],
    });

    // A password chosen by an administrator is known to two people from the
    // moment it exists, so the invited path leaves the account without one.
    expect(user.status).toBe("invited");
    expect(invitations.invited).toEqual([{ userId: user.id, email: "new@example.com" }]);
  });

  it("still allows a temporary password where email is not available", async () => {
    const { service, repo, invitations } = createService();
    await repo.ensureSystemUserTypes();

    const { user } = await service.createUser(admin, {
      displayName: "Offline Person",
      email: "offline@example.com",
      password: "VeryStrongPassword123",
      userTypeIds: [repo.userTypes[0]!.id],
    });

    expect(user.status).toBe("active");
    expect(invitations.invited).toHaveLength(0);
  });

  it("records the account before the invitation is sent", async () => {
    const { service, repo, audit, invitations } = createService();
    await repo.ensureSystemUserTypes();
    invitations.failing = true;

    await expect(
      service.createUser(admin, {
        displayName: "New Person",
        email: "new@example.com",
        userTypeIds: [repo.userTypes[0]!.id],
      }),
    ).rejects.toThrow();

    // The account exists and can be invited again; the audit entry explains
    // why it is sitting unactivated.
    expect(audit.events.some((event) => event.action === "user.create")).toBe(true);
    expect(repo.users).toHaveLength(1);
  });

  it("refuses to let an admin create an owner", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();

    // An admin holds every permission, so without this guard `users.manage`
    // would quietly be the power to mint owners.
    await expect(
      service.createUser(admin, {
        displayName: "Would-be Owner",
        email: "owner2@example.com",
        standing: "owner",
        userTypeIds: [repo.userTypes[0]!.id],
      }),
    ).rejects.toThrow(/owner/iu);
  });

  it("lets an owner create another owner", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();
    const owner: UserPrincipal = { ...admin, roles: ["owner"] };

    const { user } = await service.createUser(owner, {
      displayName: "Second Owner",
      email: "owner3@example.com",
      standing: "owner",
      userTypeIds: [repo.userTypes[0]!.id],
    });

    expect(user.standing).toBe("owner");
  });

  it("creates people as members unless told otherwise", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();

    const { user } = await service.createUser(admin, {
      displayName: "Ordinary Person",
      email: "person@example.com",
      userTypeIds: [repo.userTypes[0]!.id],
    });

    // Previously every user was inserted as 'viewer' literally, with no way to
    // change it afterwards through any screen.
    expect(user.standing).toBe("member");
  });

  it("refuses to let an admin demote an owner", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();
    const owner: UserPrincipal = { ...admin, roles: ["owner"] };
    const { user } = await service.createUser(owner, {
      displayName: "The Owner",
      email: "theowner@example.com",
      standing: "owner",
      userTypeIds: [repo.userTypes[0]!.id],
    });

    await expect(
      service.updateUser(admin, user.id, { standing: "member" }),
    ).rejects.toThrow(/owner/iu);
  });

  it("refuses to let the last owner step down", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();
    const { user } = await service.createUser(
      { ...admin, roles: ["owner"] },
      { displayName: "Sole Owner", email: "sole@example.com", standing: "owner", userTypeIds: [repo.userTypes[0]!.id] },
    );
    const asThemselves: UserPrincipal = { ...admin, userId: user.id, roles: ["owner"] };

    // A company with nobody who owns it cannot be repaired from inside.
    await expect(
      service.updateUser(asThemselves, user.id, { standing: "admin" }),
    ).rejects.toThrow(/last owner/iu);
  });

  it("lets an owner step down once another owner exists", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();
    const owner: UserPrincipal = { ...admin, roles: ["owner"] };
    const first = await service.createUser(owner, {
      displayName: "First Owner", email: "first@example.com", standing: "owner", userTypeIds: [repo.userTypes[0]!.id],
    });
    await service.createUser(owner, {
      displayName: "Second Owner", email: "second@example.com", standing: "owner", userTypeIds: [repo.userTypes[0]!.id],
    });

    const asThemselves: UserPrincipal = { ...admin, userId: first.user.id, roles: ["owner"] };
    const { user } = await service.updateUser(asThemselves, first.user.id, { standing: "admin" });

    expect(user.standing).toBe("admin");
  });

  it("refuses to create a person with no role", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();

    // Nobody may exist without a role: with none, their access is undefined
    // rather than empty, and every screen has to guess what to do with them.
    await expect(
      service.createUser(admin, {
        displayName: "Roleless",
        email: "roleless@example.com",
        userTypeIds: [],
      }),
    ).rejects.toThrow();
  });

  it("refuses to strip somebody's last role", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();
    const { user } = await service.createUser(admin, {
      displayName: "Has A Role",
      email: "hasrole@example.com",
      userTypeIds: [repo.userTypes[0]!.id],
    });

    await expect(service.updateUser(admin, user.id, { userTypeIds: [] })).rejects.toThrow();
  });

  it("requires users.manage to create a person", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();

    // A member holds nothing by standing, so creating people is refused.
    await expect(
      service.createUser(viewer, {
        displayName: "Someone",
        email: "someone@example.com",
        userTypeIds: [repo.userTypes[0]!.id],
      }),
    ).rejects.toThrow(/permission/iu);
  });

  it("requires user_types.manage to create a role", async () => {
    const { service } = createService();

    await expect(
      service.createUserType(viewer, {
        name: "Invented",
        key: "invented",
        permissions: ["projects.read"],
      }),
    ).rejects.toThrow(/permission/iu);
  });

  it("ships with no separation rules, so nothing changes until a company adds one", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();

    /*
     * The obvious candidate pairs are all held together by the full-access
     * type and by every owner. A rule enabled by default would make
     * administration itself unassignable, which is how a control nobody asked
     * for becomes a control everybody switches off.
     */
    expect(repo.separationRules).toEqual([]);
    await expect(
      service.createUser(admin, {
        displayName: "Anyone",
        email: "anyone@example.com",
        userTypeIds: [repo.userTypes[0]!.id],
      }),
    ).resolves.toBeDefined();
  });

  it("refuses a combination the company declared incompatible", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();
    repo.separationRules = [{
      a: "user_types.create",
      b: "users.edit",
      reason: "Inventing a role and assigning it must not be one person's job.",
    }];

    // The seeded full-access type carries both halves.
    await expect(
      service.createUser(admin, {
        displayName: "Too Powerful",
        email: "toopowerful@example.com",
        userTypeIds: [repo.userTypes[0]!.id],
      }),
    ).rejects.toThrow(/one person/iu);
  });

  it("checks the combination rather than each role on its own", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();
    const inventor = await service.createUserType(admin, {
      name: "Role Author", key: "role_author", permissions: ["user_types.create"],
    });
    const assigner = await service.createUserType(admin, {
      name: "People Admin", key: "people_admin", permissions: ["users.edit"],
    });
    repo.separationRules = [{
      a: "user_types.create", b: "users.edit",
      reason: "Inventing a role and assigning it must not be one person's job.",
    }];

    // Either alone is fine; the pair is the control failure. That is the whole
    // point of checking the union.
    await expect(service.createUser(admin, {
      displayName: "Author Only", email: "author@example.com",
      userTypeIds: [inventor.userType.id],
    })).resolves.toBeDefined();

    await expect(service.createUser(admin, {
      displayName: "Both", email: "both@example.com",
      userTypeIds: [inventor.userType.id, assigner.userType.id],
    })).rejects.toThrow(/one person/iu);
  });

  it("exempts owners and admins, who hold everything by standing", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();
    repo.separationRules = [{
      a: "user_types.create", b: "users.edit",
      reason: "Inventing a role and assigning it must not be one person's job.",
    }];

    // Enforcing this against an administrator would lock a company out of its
    // own administration rather than separating anything.
    await expect(
      service.createUser({ ...admin, roles: ["owner"] }, {
        displayName: "An Admin", email: "anadmin@example.com",
        standing: "admin", userTypeIds: [repo.userTypes[0]!.id],
      }),
    ).resolves.toBeDefined();
  });

  it("refuses the combination when it is reached by an edit", async () => {
    const { service, repo } = createService();
    await repo.ensureSystemUserTypes();
    const inventor = await service.createUserType(admin, {
      name: "Role Author", key: "role_author", permissions: ["user_types.create"],
    });
    const assigner = await service.createUserType(admin, {
      name: "People Admin", key: "people_admin", permissions: ["users.edit"],
    });
    const { user } = await service.createUser(admin, {
      displayName: "Grows Into It", email: "grows@example.com",
      userTypeIds: [inventor.userType.id],
    });

    repo.separationRules = [{
      a: "user_types.create", b: "users.edit",
      reason: "Inventing a role and assigning it must not be one person's job.",
    }];

    // Adding the second role later must be refused as firmly as asking for
    // both at once.
    await expect(
      service.updateUser(admin, user.id, {
        userTypeIds: [inventor.userType.id, assigner.userType.id],
      }),
    ).rejects.toThrow(/one person/iu);
  });
});
