/** Tenant admin service manages user types and users through real permissions. */
import { parseCreateSeparationRule, parsePreviewSeparationRule, parseCreateUser, parseCreateUserType, parseUpdateUser, parseUpdateUserType, type CreateUserInput, type CreateUserTypeInput, type UpdateUserInput, type UpdateUserTypeInput } from "../domain/admin.js";
import { companyStandingSchema, hasPermission, requirePermission, rolePermissions, standingOf, type CompanyStanding, type UserPrincipal } from "../domain/auth.js";
import { allPermissions, findSeparationConflict, orderSeparationPair, permissionDescriptions, type Permission, type PermissionDescriptor, type SeparationRule } from "../domain/permissions.js";
import { projectRoleGrants } from "../domain/project-team.js";
import { DomainError } from "../domain/errors.js";
import type { PasswordHasher } from "../infrastructure/password.js";
import type { AuditRepository } from "./project-service.js";

export interface UserTypeRecord {
  id: string;
  tenantId: string;
  name: string;
  key: string;
  description?: string;
  permissions: Permission[];
  systemType: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserRecord {
  /** Company standing: exactly one, never a set. */
  standing: CompanyStanding;
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  status: "active" | "invited" | "disabled";
  /** Everything this person may do company-wide. The whole truth, not a hint. */
  permissions: Permission[];
  /** How many projects this person is a member of. Real membership, not a guess. */
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Withdrawing access has to reach live sessions, not just future logins.
 * Kept as a narrow port so the admin service does not depend on all of auth.
 */
/**
 * Sends an invitation once the account exists.
 *
 * A narrow port rather than the whole lifecycle service, so administration
 * does not depend on password resets and email changes to add a person.
 */
export interface InvitationSender {
  sendInvitation(
    actor: UserPrincipal,
    userId: string,
    email: string,
    displayName: string,
  ): Promise<void>;
}

export interface SessionRevoker {
  revokeAllSessionsForUser(tenantId: string, userId: string): Promise<void>;
}

/**
 * Somebody who holds both halves of a proposed rule.
 *
 * Which bundle carried each half used to be part of this, because a bundle was
 * the only way to hold anything and the fix was to take the bundle away. Now
 * that grants are made to the person, the half being given up is simply
 * revoked from them, so there is nothing further to name.
 */
export interface SeparationViolator {
  userId: string;
  displayName: string;
  email: string;
}

export interface AdminRepository {
  /**
   * How many people can still administer this company, excluding one user.
   * Used to refuse the change that would leave nobody able to administer it.
   */
  countOtherActiveAdmins(tenantId: string, excludingUserId: string): Promise<number>;
  /** Pairs this company has declared must never be held by one person. */
  listSeparationRules(tenantId: string): Promise<SeparationRule[]>;
  /** People holding both halves of a pair, and the types carrying each half. */
  findSeparationViolators(
    tenantId: string,
    a: string,
    b: string,
  ): Promise<SeparationViolator[]>;
  /** Who holds each permission directly, for the reference page. */
  listPermissionHolders(tenantId: string): Promise<Array<{ permission: string; id: string; name: string }>>;
  /** Saves a rule and revokes the losing permission from violators, atomically. */
  createSeparationRule(
    tenantId: string,
    input: { a: string; b: string; reason: string },
    revoke: { permission: string; userIds: string[] },
  ): Promise<SeparationRule>;
  deleteSeparationRule(tenantId: string, ruleId: string): Promise<boolean>;
  /** Someone's current standing, so a change can be judged against it. */
  findStanding(tenantId: string, userId: string): Promise<string | null>;
  /** Active owners other than this person, guarding the last-owner case. */
  countOtherOwners(tenantId: string, excludingUserId: string): Promise<number>;
  listUserTypes(tenantId: string): Promise<UserTypeRecord[]>;
  findUserTypeByKey(tenantId: string, key: string): Promise<UserTypeRecord | null>;
  findUserTypesByIds(tenantId: string, ids: string[]): Promise<UserTypeRecord[]>;
  createUserType(tenantId: string, input: CreateUserTypeInput): Promise<UserTypeRecord>;
  updateUserType(tenantId: string, id: string, input: UpdateUserTypeInput): Promise<UserTypeRecord | null>;
  listUsers(tenantId: string): Promise<AdminUserRecord[]>;
  findUserByEmail(tenantId: string, email: string): Promise<AdminUserRecord | null>;
  createUser(
    tenantId: string,
    input: Omit<CreateUserInput, "password"> & { passwordHash: string | null; status: "active" | "invited" },
    /** Recorded against each grant, so an access review can ask who gave it. */
    actorUserId: string,
  ): Promise<AdminUserRecord>;
  updateUser(
    tenantId: string,
    userId: string,
    input: Omit<UpdateUserInput, "password"> & { passwordHash?: string },
    actorUserId: string,
  ): Promise<AdminUserRecord | null>;
}

export class AdminService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly audit: AuditRepository,
    private readonly sessions?: SessionRevoker,
    /** Absent in deployments that add people without email. */
    private readonly invitations?: InvitationSender,
  ) {}

  listPermissions(actor: UserPrincipal) {
    requirePermission(actor, "user_types.read");
    return { permissions: permissionDescriptions };
  }

  async listUserTypes(actor: UserPrincipal): Promise<{ userTypes: UserTypeRecord[] }> {
    requirePermission(actor, "user_types.read");
    return { userTypes: await this.repository.listUserTypes(actor.tenantId) };
  }

  async createUserType(actor: UserPrincipal, rawInput: unknown): Promise<{ userType: UserTypeRecord }> {
    requirePermission(actor, "user_types.create");
    const input = parseCreateUserType(rawInput);
    const invalid = input.permissions.filter((permission) => !allPermissions.includes(permission));
    if (invalid.length > 0) throw new DomainError("VALIDATION_FAILED", "Unknown permission.");
    const existing = await this.repository.findUserTypeByKey(actor.tenantId, input.key);
    if (existing) throw new DomainError("CONFLICT", "A user type with this key already exists.");
    const userType = await this.repository.createUserType(actor.tenantId, input);
    await this.audit.append({ tenantId: actor.tenantId, actorUserId: actor.userId, action: "user_type.create", entityType: "user_type", entityId: userType.id, result: "success", metadata: { key: userType.key } });
    return { userType };
  }

  async updateUserType(actor: UserPrincipal, id: string, rawInput: unknown): Promise<{ userType: UserTypeRecord }> {
    requirePermission(actor, "user_types.edit");
    const input = parseUpdateUserType(rawInput);
    const userType = await this.repository.updateUserType(actor.tenantId, id, input);
    if (!userType) throw new DomainError("NOT_FOUND", "User type was not found.");
    await this.audit.append({ tenantId: actor.tenantId, actorUserId: actor.userId, action: "user_type.update", entityType: "user_type", entityId: userType.id, result: "success", metadata: { changedFields: Object.keys(input) } });
    return { userType };
  }

  async listUsers(actor: UserPrincipal): Promise<{ users: AdminUserRecord[] }> {
    requirePermission(actor, "users.read");
    return { users: await this.repository.listUsers(actor.tenantId) };
  }

  async createUser(actor: UserPrincipal, rawInput: unknown): Promise<{ user: AdminUserRecord }> {
    requirePermission(actor, "users.create");
    const input = parseCreateUser(rawInput);
    const existing = await this.repository.findUserByEmail(actor.tenantId, input.email);
    if (existing) throw new DomainError("CONFLICT", "A user with this email already exists.");
    if (input.standing === "owner" && standingOf(actor) !== "owner") {
      throw new DomainError("FORBIDDEN", "Only an owner can create another owner.");
    }

    /*
     * Nobody may grant what they do not themselves hold. Without this, anyone
     * with `users.create` could make an account carrying `settings.manage`,
     * sign into it, and hold a permission the company never gave them —
     * privilege escalation dressed up as administration.
     */
    this.assertGrantable(actor, input.permissions);
    await this.assertSeparationOfDuties(actor, input.standing, input.permissions);
    // No password means the person is being invited to choose one. They stay
    // `invited` until they do, and login already refuses anyone not active.
    const invited = !input.password;
    const passwordHash = input.password ? await this.passwordHasher.hash(input.password) : null;
    const user = await this.repository.createUser(actor.tenantId, {
      ...input,
      passwordHash,
      status: invited ? "invited" : "active",
    }, actor.userId);

    await this.audit.append({ tenantId: actor.tenantId, actorUserId: actor.userId, action: "user.create", entityType: "user", entityId: user.id, result: "success", metadata: { email: user.email, permissions: input.permissions, invited } });

    if (invited) {
      if (!this.invitations) {
        throw new DomainError(
          "CONFIGURATION_REQUIRED",
          "Invitations are unavailable. Set a temporary password instead.",
        );
      }
      // Deliberately after the audit entry: if delivery fails the account
      // still exists and can be invited again, and the record shows why it is
      // sitting unactivated.
      await this.invitations.sendInvitation(actor, user.id, user.email, user.displayName);
    }

    return { user };
  }


  /**
   * Refuses a set of user types whose combined permissions break a rule the
   * company declared.
   *
   * Checked against the union rather than each type, because the whole point is
   * that two individually reasonable roles can be a control failure together —
   * which is exactly what the effective-permissions panel exists to make
   * visible before somebody saves.
   *
   * Owners and administrators are exempt. They hold every permission by
   * standing, so enforcing this against them would lock a company out of its
   * own administration rather than separating anything.
   */
  /**
   * Everything that decides access, assembled in one place for the reference.
   *
   * Composed here rather than in the browser because a page that computes its
   * own answer is a second implementation of the permission model, and the
   * moment it disagrees with the enforcer it becomes documentation that lies.
   * Every field below is read from the same modules the guards read.
   *
   * Deliberately more than a permission-to-user-type matrix. Four rules decide
   * access without appearing in such a table at all — standing overriding
   * everything, guests being refused company-wide permissions whatever they
   * hold, per-project actions needing reach as well as capability, and deletion
   * being stricter than any permission. A matrix alone reads as authoritative
   * and would be wrong.
   */
  async getPermissionReference(actor: UserPrincipal): Promise<{
    permissions: Array<PermissionDescriptor & { heldBy: Array<{ id: string; name: string }> }>;
    projectRoles: Array<{ role: string; grants: string[] }>;
    standings: Array<{ standing: string; holdsEverything: boolean }>;
    deletionRule: { requiresProjectAdmin: boolean; manageAllInsufficient: boolean };
  }> {
    /*
     * `settings.manage`, the same gate as the other company-level sections.
     * Reading the whole access model is a company-configuration question, not
     * a user-type one — somebody who may edit roles is not automatically
     * entitled to the map of everything the company can grant.
     */
    requirePermission(actor, "settings.manage");

    const holders = await this.repository.listPermissionHolders(actor.tenantId);

    return {
      /*
       * Who actually holds each permission, person by person. This used to name
       * the bundles carrying it, which answered a question nobody was asking:
       * an access review needs to know which people can do a thing, and a
       * bundle grants nothing.
       */
      permissions: permissionDescriptions.map((descriptor) => ({
        ...descriptor,
        heldBy: holders
          .filter((holder) => holder.permission === descriptor.key)
          .map((holder) => ({ id: holder.id, name: holder.name })),
      })),

      /*
       * Read from the same table `roleGrantsOnProject` consults, so a role that
       * gains or loses a grant changes here in the same commit. Restating the
       * list would be the drift this method exists to prevent.
       */
      projectRoles: Object.entries(projectRoleGrants).map(([role, grants]) => ({
        role,
        grants: [...grants],
      })),

      standings: companyStandingSchema.options.map((standing) => ({
        standing,
        // Both derived from the domain rather than asserted, so the page cannot
        // describe a standing the guards treat differently.
        holdsEverything: rolePermissions([standing]).length === allPermissions.length,
      })),

      /*
       * Stated as facts rather than prose so the page cannot describe a rule
       * that has since changed. Both are true of `requireProjectDeletion`.
       */
      deletionRule: { requiresProjectAdmin: true, manageAllInsufficient: true },
    };
  }

  /**
   * The rules this company has declared, for the screen that manages them.
   *
   * Gated on `settings.manage` rather than on the user-type permissions: this
   * is company policy about what roles may combine, not the roles themselves,
   * and it lives with the rest of company configuration.
   */
  async listSeparationRules(actor: UserPrincipal): Promise<{ rules: SeparationRule[] }> {
    requirePermission(actor, "settings.manage");
    return { rules: await this.repository.listSeparationRules(actor.tenantId) };
  }

  /**
   * What declaring a pair would cost, changing nothing.
   *
   * Separate from creating it because the answer decides whether the rule is
   * worth declaring at all. Applying a control that silently removes access
   * from people the administrator has not seen is how a safety feature becomes
   * the thing everybody is frightened of.
   */
  async previewSeparationRule(
    actor: UserPrincipal,
    rawInput: unknown,
  ): Promise<{
    violators: SeparationViolator[];
  }> {
    requirePermission(actor, "settings.manage");
    const input = parsePreviewSeparationRule(rawInput);
    const { a, b } = orderSeparationPair(input.a, input.b);

    return { violators: await this.repository.findSeparationViolators(actor.tenantId, a, b) };
  }

  /**
   * Declares a rule, and removes the losing half from whoever already breaks it.
   *
   * A rule that is declared while people already violate it is worse than no
   * rule, because it reads as enforced and is not. So the two happen together
   * or not at all.
   *
   * Removal is per person: the losing permission is revoked from the people in
   * violation and from nobody else. Saved permission lists are not touched,
   * because a list grants nothing and editing one would change nothing about
   * who currently holds what.
   */
  async createSeparationRule(
    actor: UserPrincipal,
    rawInput: unknown,
  ): Promise<{ rule: SeparationRule; strippedFrom: number }> {
    requirePermission(actor, "settings.manage");
    const input = parseCreateSeparationRule(rawInput);
    const { a, b } = orderSeparationPair(input.a, input.b);

    /*
     * Checked before the insert rather than left to the unique index, which
     * would surface as a 500. The pair is already ordered, so a rule entered
     * the other way round is caught here too.
     */
    const existing = await this.repository.listSeparationRules(actor.tenantId);
    if (existing.some((rule) => rule.a === a && rule.b === b)) {
      throw new DomainError("CONFLICT", "This pair is already separated.");
    }

    const violators = await this.repository.findSeparationViolators(actor.tenantId, a, b);
    const userIds = violators.map((violator) => violator.userId);

    const rule = await this.repository.createSeparationRule(
      actor.tenantId,
      { a, b, reason: input.reason },
      { permission: input.losing, userIds },
    );

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "separation_rule.create",
      entityType: "separation_rule",
      entityId: String(rule.id),
      result: "success",
      // Who lost what is the part somebody will need to reconstruct later.
      metadata: {
        pair: [a, b],
        losing: input.losing,
        strippedFrom: userIds,
      },
    });

    return { rule, strippedFrom: userIds.length };
  }

  /**
   * Removes a rule.
   *
   * Deliberately does not restore what declaring it took away. Access that was
   * removed for a reason should be granted back deliberately, by somebody
   * choosing to, rather than reappearing because a policy was retired.
   */
  async deleteSeparationRule(actor: UserPrincipal, ruleId: string): Promise<void> {
    requirePermission(actor, "settings.manage");
    const removed = await this.repository.deleteSeparationRule(actor.tenantId, ruleId);
    if (!removed) throw new DomainError("NOT_FOUND", "Separation rule was not found.");

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "separation_rule.delete",
      entityType: "separation_rule",
      entityId: ruleId,
      result: "success",
    });
  }

  /**
   * Refuses a grant the actor does not hold themselves.
   *
   * Administration is delegation, and nobody can delegate what they were never
   * given. An owner holds everything, so this never obstructs them; anybody
   * else is bounded by their own access, which is what stops `users.create`
   * from quietly being every permission in the product.
   */
  private assertGrantable(actor: UserPrincipal, permissions: Permission[]): void {
    const beyond = permissions.filter((permission) => !hasPermission(actor, permission));
    if (beyond.length > 0) {
      throw new DomainError(
        "FORBIDDEN",
        "You cannot grant permissions you do not hold yourself.",
        { permissions: beyond },
      );
    }
  }

  /**
   * Refuses a set of permissions that breaks a pair the company separated.
   *
   * Checked against the whole set the person will hold, because the control
   * exists precisely for two individually reasonable permissions that must not
   * meet on one person. An owner is exempt: they hold everything by standing,
   * so enforcing it against them would lock the company out of its own
   * administration rather than separating anything.
   */
  private async assertSeparationOfDuties(
    actor: UserPrincipal,
    standing: string,
    permissions: Permission[],
  ): Promise<void> {
    if (standing === "owner") return;

    const rules = await this.repository.listSeparationRules(actor.tenantId);
    if (rules.length === 0) return;

    const conflict = findSeparationConflict(permissions, rules);
    if (conflict) {
      throw new DomainError("VALIDATION_FAILED", conflict.reason, {
        conflict: [conflict.a, conflict.b],
      });
    }
  }

  async updateUser(actor: UserPrincipal, userId: string, rawInput: unknown): Promise<{ user: AdminUserRecord }> {
    const input = parseUpdateUser(rawInput);

    /*
     * Revoking somebody's access is a heavier act than correcting their name,
     * so it is its own permission. A change that only disables or re-enables
     * asks for that one; anything else asks to edit. A request that does both
     * has to satisfy both, because it is doing both.
     */
    const changesStatus = input.status !== undefined;
    const changesAnythingElse = Object.keys(input).some((field) => field !== "status");
    if (changesStatus) requirePermission(actor, "users.disable");
    if (changesAnythingElse) requirePermission(actor, "users.edit");

    if (input.status === "disabled") {
      // Disabling yourself ends the session performing the action, which is
      // never what the administrator meant to do.
      if (userId === actor.userId) {
        throw new DomainError("VALIDATION_FAILED", "You cannot disable your own account.");
      }

      // Without this a company can be left with nobody able to administer it,
      // which cannot be undone from inside the product.
      const remaining = await this.repository.countOtherActiveAdmins(actor.tenantId, userId);
      if (remaining === 0) {
        throw new DomainError(
          "VALIDATION_FAILED",
          "This is the last active administrator. Give someone else administrator access first.",
        );
      }
    }
    if (input.standing !== undefined) {
      /*
       * Only an owner may create or unmake another owner. An admin holds every
       * permission, so without this an admin could promote themselves and then
       * remove the owner — `users.edit` would silently be ownership.
       */
      if ((input.standing === "owner" || (await this.repository.findStanding(actor.tenantId, userId)) === "owner")
        && standingOf(actor) !== "owner") {
        throw new DomainError("FORBIDDEN", "Only an owner can change who owns the company.");
      }

      // Demoting yourself out of ownership can leave a company nobody owns.
      if (userId === actor.userId && standingOf(actor) === "owner" && input.standing !== "owner") {
        const otherOwners = await this.repository.countOtherOwners(actor.tenantId, userId);
        if (otherOwners === 0) {
          throw new DomainError(
            "VALIDATION_FAILED",
            "You are the last owner. Make someone else an owner first.",
          );
        }
      }
    }

    if (input.permissions) {
      this.assertGrantable(actor, input.permissions);

      // Against the standing the person will have after this change, not the
      // one they had before it.
      const standing = input.standing ?? (await this.repository.findStanding(actor.tenantId, userId)) ?? "none";
      await this.assertSeparationOfDuties(actor, standing, input.permissions);
    }
    const passwordHash = input.password ? await this.passwordHasher.hash(input.password) : undefined;
    const user = await this.repository.updateUser(actor.tenantId, userId, {
      ...(input.displayName ? { displayName: input.displayName } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.standing ? { standing: input.standing } : {}),
      // Presence, not truthiness: an empty array means "take everything away"
      // and must reach the repository, where `[]` and `undefined` differ.
      ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
      ...(passwordHash ? { passwordHash } : {}),
    }, actor.userId);
    if (!user) throw new DomainError("NOT_FOUND", "User was not found.");

    // Access is withdrawn immediately rather than whenever the token expires.
    if (input.status === "disabled") {
      await this.sessions?.revokeAllSessionsForUser(actor.tenantId, user.id);
    }

    await this.audit.append({ tenantId: actor.tenantId, actorUserId: actor.userId, action: "user.update", entityType: "user", entityId: user.id, result: "success", metadata: { changedFields: Object.keys(input) } });
    return { user };
  }
}
