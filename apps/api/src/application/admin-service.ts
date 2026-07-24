/** Tenant admin service manages user types and users through real permissions. */
import { parseCreateUser, parseCreateUserType, parseUpdateUserType, type CreateUserInput, type CreateUserTypeInput, type UpdateUserTypeInput } from "../domain/admin.js";
import { requirePermission, type UserPrincipal } from "../domain/auth.js";
import { allPermissions, permissionDescriptions, type Permission } from "../domain/permissions.js";
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
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  status: "active" | "invited" | "disabled";
  userTypes: Array<{ id: string; name: string; key: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRepository {
  ensureSystemUserTypes(tenantId: string): Promise<void>;
  listUserTypes(tenantId: string): Promise<UserTypeRecord[]>;
  findUserTypeByKey(tenantId: string, key: string): Promise<UserTypeRecord | null>;
  findUserTypesByIds(tenantId: string, ids: string[]): Promise<UserTypeRecord[]>;
  createUserType(tenantId: string, input: CreateUserTypeInput): Promise<UserTypeRecord>;
  updateUserType(tenantId: string, id: string, input: UpdateUserTypeInput): Promise<UserTypeRecord | null>;
  listUsers(tenantId: string): Promise<AdminUserRecord[]>;
  findUserByEmail(tenantId: string, email: string): Promise<AdminUserRecord | null>;
  createUser(tenantId: string, input: Omit<CreateUserInput, "password"> & { passwordHash: string }): Promise<AdminUserRecord>;
}

export class AdminService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly audit: AuditRepository,
  ) {}

  listPermissions(actor: UserPrincipal) {
    requirePermission(actor, "user_types.read");
    return { permissions: permissionDescriptions };
  }

  async listUserTypes(actor: UserPrincipal): Promise<{ userTypes: UserTypeRecord[] }> {
    requirePermission(actor, "user_types.read");
    await this.repository.ensureSystemUserTypes(actor.tenantId);
    return { userTypes: await this.repository.listUserTypes(actor.tenantId) };
  }

  async createUserType(actor: UserPrincipal, rawInput: unknown): Promise<{ userType: UserTypeRecord }> {
    requirePermission(actor, "user_types.manage");
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
    requirePermission(actor, "user_types.manage");
    const input = parseUpdateUserType(rawInput);
    const userType = await this.repository.updateUserType(actor.tenantId, id, input);
    if (!userType) throw new DomainError("NOT_FOUND", "User type was not found.");
    await this.audit.append({ tenantId: actor.tenantId, actorUserId: actor.userId, action: "user_type.update", entityType: "user_type", entityId: userType.id, result: "success", metadata: { changedFields: Object.keys(input) } });
    return { userType };
  }

  async listUsers(actor: UserPrincipal): Promise<{ users: AdminUserRecord[] }> {
    requirePermission(actor, "users.read");
    await this.repository.ensureSystemUserTypes(actor.tenantId);
    return { users: await this.repository.listUsers(actor.tenantId) };
  }

  async createUser(actor: UserPrincipal, rawInput: unknown): Promise<{ user: AdminUserRecord }> {
    requirePermission(actor, "users.manage");
    const input = parseCreateUser(rawInput);
    const existing = await this.repository.findUserByEmail(actor.tenantId, input.email);
    if (existing) throw new DomainError("CONFLICT", "A user with this email already exists.");
    const userTypes = await this.repository.findUserTypesByIds(actor.tenantId, input.userTypeIds);
    if (userTypes.length !== input.userTypeIds.length) throw new DomainError("VALIDATION_FAILED", "One or more user types are invalid.");
    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.repository.createUser(actor.tenantId, { ...input, passwordHash });
    await this.audit.append({ tenantId: actor.tenantId, actorUserId: actor.userId, action: "user.create", entityType: "user", entityId: user.id, result: "success", metadata: { email: user.email, userTypeIds: input.userTypeIds } });
    return { user };
  }
}
