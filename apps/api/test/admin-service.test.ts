/** Tests tenant administration service permissions, user types, and user creation. */
import { describe, expect, it } from "vitest";
import type { Permission, SeparationRule } from "../src/domain/permissions.js";
import { AdminService, type AdminRepository, type AdminUserRecord, type UserTypeRecord } from "../src/application/admin-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";
import type { CreateUserInput, CreateUserTypeInput, UpdateUserTypeInput } from "../src/domain/admin.js";
import type { PasswordHasher } from "../src/infrastructure/password.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const admin: UserPrincipal = { tenantId, userId: "22222222-2222-4222-8222-222222222222", roles: ["owner"], permissions: [] };
const viewer: UserPrincipal = { tenantId, userId: "33333333-3333-4333-8333-333333333333", roles: ["none"], permissions: [] };

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
    return this.users
      .filter((user) => user.standing !== "owner")
      .filter((user) =>
        user.permissions.includes(a as Permission) && user.permissions.includes(b as Permission))
      .map((user) => ({ userId: user.id, displayName: user.displayName, email: user.email }));
  }

  async listPermissionHolders(): Promise<Array<{ permission: string; id: string; name: string }>> {
    return this.users.flatMap((user) =>
      user.permissions.map((permission) => ({ permission, id: user.id, name: user.displayName })));
  }

  async createSeparationRule(
    _tenantId: string,
    input: { a: string; b: string; reason: string },
    revoke: { permission: string; userIds: string[] },
  ): Promise<SeparationRule> {
    const rule: SeparationRule = {
      id: crypto.randomUUID(),
      a: input.a as Permission,
      b: input.b as Permission,
      reason: input.reason,
    };
    this.separationRules.push(rule);
    // The revocation is applied here too, so a test can observe that the
    // service asked for the right people to lose the right permission.
    for (const userId of revoke.userIds) {
      const user = this.users.find((candidate) => candidate.id === userId);
      if (!user) continue;
      user.permissions = user.permissions.filter((permission) => permission !== revoke.permission);
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
    const user: AdminUserRecord = { id: crypto.randomUUID(), tenantId: inputTenantId, email: input.email, displayName: input.displayName, status: input.status, standing: input.standing ?? "none", permissions: [...input.permissions], projectCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.users.push(user);
    return user;
  }
  async updateUser(inputTenantId: string, userId: string, input: { displayName?: string; status?: "active" | "disabled"; passwordHash?: string; permissions?: Permission[]; standing?: AdminUserRecord["standing"] }): Promise<AdminUserRecord | null> {
    const user = this.users.find((item) => item.tenantId === inputTenantId && item.id === userId);
    if (!user) return null;
    if (input.displayName) user.displayName = input.displayName;
    if (input.status) user.status = input.status;
    if (input.standing) user.standing = input.standing;
    if (input.permissions !== undefined) user.permissions = [...input.permissions];
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
    const { user } = await service.createUser(admin, { displayName: "Cost Lead", email: "cost@example.com", password: "VeryStrongPassword123", permissions: userType.permissions });

    expect(user.permissions).toEqual(["projects.read", "users.read"]);
    expect(audit.events.map((event) => event.action)).toEqual(["user_type.create", "user.create"]);
  });

  it("blocks users without admin permissions", async () => {
    const { service } = createService();
    await expect(service.createUserType(viewer, { name: "Blocked", key: "blocked", permissions: ["projects.read"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("ends live sessions the moment someone is disabled", async () => {
    const { service, repo, sessions } = createService();
    const { user } = await service.createUser(admin, { displayName: "Site Lead", email: "site@example.com", password: "VeryStrongPassword123", permissions: ["projects.read"] });

    await service.updateUser(admin, user.id, { status: "disabled" });

    expect(sessions.revoked).toEqual([{ tenantId, userId: user.id }]);
  });

  it("leaves sessions alone for changes that are not a withdrawal of access", async () => {
    const { service, repo, sessions } = createService();
    const { user } = await service.createUser(admin, { displayName: "Site Lead", email: "site2@example.com", password: "VeryStrongPassword123", permissions: ["projects.read"] });

    await service.updateUser(admin, user.id, { displayName: "Site Leader" });

    expect(sessions.revoked).toEqual([]);
  });

  it("refuses to disable the last remaining administrator", async () => {
    const { service, repo } = createService();
    const { user } = await service.createUser(admin, { displayName: "Only Admin", email: "only@example.com", password: "VeryStrongPassword123", permissions: ["projects.read"] });
    // Nobody else could administer the company once this account is disabled.
    repo.otherAdmins = 0;

    await expect(service.updateUser(admin, user.id, { status: "disabled" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(repo.users.find((item) => item.id === user.id)?.status).toBe("active");
  });

  it("allows disabling an administrator while others remain", async () => {
    const { service, repo } = createService();
    const { user } = await service.createUser(admin, { displayName: "Second Admin", email: "second@example.com", password: "VeryStrongPassword123", permissions: ["projects.read"] });
    repo.otherAdmins = 2;

    const result = await service.updateUser(admin, user.id, { status: "disabled" });

    expect(result.user.status).toBe("disabled");
  });

  it("refuses to let an administrator disable their own account", async () => {
    const { service, repo } = createService();
    repo.otherAdmins = 5;

    await expect(service.updateUser(admin, admin.userId, { status: "disabled" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("invites a person when no password is set, instead of inventing one", async () => {
    const { service, repo, invitations } = createService();

    const { user } = await service.createUser(admin, {
      displayName: "New Person",
      email: "new@example.com",
      permissions: ["projects.read"],
    });

    // A password chosen by an administrator is known to two people from the
    // moment it exists, so the invited path leaves the account without one.
    expect(user.status).toBe("invited");
    expect(invitations.invited).toEqual([{ userId: user.id, email: "new@example.com" }]);
  });

  it("still allows a temporary password where email is not available", async () => {
    const { service, repo, invitations } = createService();

    const { user } = await service.createUser(admin, {
      displayName: "Offline Person",
      email: "offline@example.com",
      password: "VeryStrongPassword123",
      permissions: ["projects.read"],
    });

    expect(user.status).toBe("active");
    expect(invitations.invited).toHaveLength(0);
  });

  it("records the account before the invitation is sent", async () => {
    const { service, repo, audit, invitations } = createService();
    invitations.failing = true;

    await expect(
      service.createUser(admin, {
        displayName: "New Person",
        email: "new@example.com",
        permissions: ["projects.read"],
      }),
    ).rejects.toThrow();

    // The account exists and can be invited again; the audit entry explains
    // why it is sitting unactivated.
    expect(audit.events.some((event) => event.action === "user.create")).toBe(true);
    expect(repo.users).toHaveLength(1);
  });

  it("refuses to let a non-owner create an owner", async () => {
    const { service } = createService();
    // Everything an owner has, except the standing itself. Without the guard,
    // `users.create` would quietly be the power to mint owners.
    const deputy: UserPrincipal = {
      ...admin,
      roles: ["none"],
      permissions: ["users.create", "users.edit"],
    };

    await expect(
      service.createUser(deputy, {
        displayName: "Would-be Owner",
        email: "owner2@example.com",
        standing: "owner",
        permissions: [],
      }),
    ).rejects.toThrow(/owner/iu);
  });

  it("lets an owner create another owner", async () => {
    const { service, repo } = createService();
    const owner: UserPrincipal = { ...admin, roles: ["owner"] };

    const { user } = await service.createUser(owner, {
      displayName: "Second Owner",
      email: "owner3@example.com",
      standing: "owner",
      permissions: ["projects.read"],
    });

    expect(user.standing).toBe("owner");
  });

  it("gives a new person no standing unless ownership is asked for", async () => {
    const { service } = createService();

    const { user } = await service.createUser(admin, {
      displayName: "Ordinary Person",
      email: "person@example.com",
      permissions: ["projects.read"],
    });

    // Their access is the permissions ticked for them and nothing else, which
    // is the whole model in one assertion.
    expect(user.standing).toBe("none");
    expect(user.permissions).toEqual(["projects.read"]);
  });

  it("refuses to grant a permission the grantor does not hold", async () => {
    const { service } = createService();
    const deputy: UserPrincipal = {
      ...admin,
      roles: ["none"],
      permissions: ["users.create"],
    };

    // Otherwise anybody who can add people can add themselves a second account
    // holding permissions the company never gave them.
    await expect(
      service.createUser(deputy, {
        displayName: "Escalation",
        email: "escalation@example.com",
        permissions: ["settings.manage"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses to let a non-owner demote an owner", async () => {
    const { service } = createService();
    const { user } = await service.createUser(admin, {
      displayName: "The Owner",
      email: "theowner@example.com",
      standing: "owner",
      permissions: [],
    });
    const deputy: UserPrincipal = {
      ...admin,
      roles: ["none"],
      permissions: ["users.edit"],
    };

    await expect(
      service.updateUser(deputy, user.id, { standing: "none" }),
    ).rejects.toThrow(/owner/iu);
  });

  it("refuses to let the last owner step down", async () => {
    const { service, repo } = createService();
    const { user } = await service.createUser(
      { ...admin, roles: ["owner"] },
      { displayName: "Sole Owner", email: "sole@example.com", standing: "owner", permissions: ["projects.read"] },
    );
    const asThemselves: UserPrincipal = { ...admin, userId: user.id, roles: ["owner"] };

    // A company with nobody who owns it cannot be repaired from inside.
    await expect(
      service.updateUser(asThemselves, user.id, { standing: "none" }),
    ).rejects.toThrow(/last owner/iu);
  });

  it("lets an owner step down once another owner exists", async () => {
    const { service, repo } = createService();
    const owner: UserPrincipal = { ...admin, roles: ["owner"] };
    const first = await service.createUser(owner, {
      displayName: "First Owner", email: "first@example.com", standing: "owner", permissions: ["projects.read"],
    });
    await service.createUser(owner, {
      displayName: "Second Owner", email: "second@example.com", standing: "owner", permissions: ["projects.read"],
    });

    const asThemselves: UserPrincipal = { ...admin, userId: first.user.id, roles: ["owner"] };
    const { user } = await service.updateUser(asThemselves, first.user.id, { standing: "none" });

    expect(user.standing).toBe("none");
  });

  it("allows a person with no company permissions at all", async () => {
    const { service } = createService();

    /*
     * Somebody added so they can be put on a project holds nothing
     * company-wide, and their project membership is what gives them their
     * work. Demanding a tick here would grant access nobody asked for.
     */
    const { user } = await service.createUser(admin, {
      displayName: "Site Only",
      email: "siteonly@example.com",
      permissions: [],
    });

    expect(user.permissions).toEqual([]);
  });

  it("takes every permission away when an edit sends an empty set", async () => {
    const { service, repo } = createService();
    const { user } = await service.createUser(admin, {
      displayName: "Had Access",
      email: "hadaccess@example.com",
      permissions: ["projects.read"],
    });

    // An empty array is an instruction, not an omission. Treating it as "no
    // change" would make unticking every box silently do nothing.
    await service.updateUser(admin, user.id, { permissions: [] });

    expect(repo.users.find((item) => item.id === user.id)?.permissions).toEqual([]);
  });

  it("requires users.manage to create a person", async () => {
    const { service, repo } = createService();

    // A member holds nothing by standing, so creating people is refused.
    await expect(
      service.createUser(viewer, {
        displayName: "Someone",
        email: "someone@example.com",
        permissions: ["projects.read"],
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
        permissions: ["projects.read"],
      }),
    ).resolves.toBeDefined();
  });

  it("refuses a combination the company declared incompatible", async () => {
    const { service, repo } = createService();
    repo.separationRules = [{
      a: "user_types.create",
      b: "users.edit",
      reason: "Inventing a role and assigning it must not be one person's job.",
    }];

    await expect(
      service.createUser(admin, {
        displayName: "Too Powerful",
        email: "toopowerful@example.com",
        permissions: ["user_types.create", "users.edit"],
      }),
    ).rejects.toThrow(/one person/iu);
  });

  it("checks the combination rather than each permission on its own", async () => {
    const { service, repo } = createService();
    repo.separationRules = [{
      a: "user_types.create", b: "users.edit",
      reason: "Inventing a role and assigning it must not be one person's job.",
    }];

    // Either alone is fine; the pair is the control failure. That is the whole
    // point of checking the set rather than each grant.
    await expect(service.createUser(admin, {
      displayName: "Author Only", email: "author@example.com",
      permissions: ["user_types.create"],
    })).resolves.toBeDefined();

    await expect(service.createUser(admin, {
      displayName: "Both", email: "both@example.com",
      permissions: ["user_types.create", "users.edit"],
    })).rejects.toThrow(/one person/iu);
  });

  it("exempts owners, who hold everything by standing", async () => {
    const { service, repo } = createService();
    repo.separationRules = [{
      a: "user_types.create", b: "users.edit",
      reason: "Inventing a role and assigning it must not be one person's job.",
    }];

    // Enforcing this against an owner would lock a company out of its own
    // administration rather than separating anything.
    await expect(
      service.createUser({ ...admin, roles: ["owner"] }, {
        displayName: "Another Owner", email: "anotherowner@example.com",
        standing: "owner", permissions: ["user_types.create", "users.edit"],
      }),
    ).resolves.toBeDefined();
  });

  it("refuses the combination when it is reached by an edit", async () => {
    const { service, repo } = createService();
    const { user } = await service.createUser(admin, {
      displayName: "Grows Into It", email: "grows@example.com",
      permissions: ["user_types.create"],
    });

    repo.separationRules = [{
      a: "user_types.create", b: "users.edit",
      reason: "Inventing a role and assigning it must not be one person's job.",
    }];

    // Adding the second permission later must be refused as firmly as asking
    // for both at once.
    await expect(
      service.updateUser(admin, user.id, {
        permissions: ["user_types.create", "users.edit"],
      }),
    ).rejects.toThrow(/one person/iu);
  });
});
