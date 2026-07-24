/** Tests tenant administration service permissions, user types, and user creation. */
import { describe, expect, it } from "vitest";
import { AdminService, type AdminRepository, type AdminUserRecord, type UserTypeRecord } from "../src/application/admin-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";
import type { CreateUserInput, CreateUserTypeInput, UpdateUserTypeInput } from "../src/domain/admin.js";
import type { PasswordHasher } from "../src/infrastructure/password.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const admin: UserPrincipal = { tenantId, userId: "22222222-2222-4222-8222-222222222222", roles: ["tenant_admin"], permissions: [] };
const viewer: UserPrincipal = { tenantId, userId: "33333333-3333-4333-8333-333333333333", roles: ["viewer"], permissions: [] };

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
  async ensureSystemUserTypes(): Promise<void> {
    if (!this.userTypes.find((type) => type.key === "owner")) {
      this.userTypes.push({ id: "44444444-4444-4444-8444-444444444444", tenantId, name: "Owner", key: "owner", permissions: ["projects.read", "projects.manage", "users.read", "users.manage", "user_types.read", "user_types.manage", "settings.manage"], systemType: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
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
  async createUser(inputTenantId: string, input: Omit<CreateUserInput, "password"> & { passwordHash: string }): Promise<AdminUserRecord> {
    const types = this.userTypes.filter((type) => input.userTypeIds.includes(type.id));
    const user: AdminUserRecord = { id: crypto.randomUUID(), tenantId: inputTenantId, email: input.email, displayName: input.displayName, status: "active", userTypes: types.map((type) => ({ id: type.id, name: type.name, key: type.key })), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.users.push(user);
    return user;
  }
  async updateUser(inputTenantId: string, userId: string, input: { displayName?: string; status?: "active" | "disabled"; passwordHash?: string; userTypeIds?: string[] }): Promise<AdminUserRecord | null> {
    const user = this.users.find((item) => item.tenantId === inputTenantId && item.id === userId);
    if (!user) return null;
    if (input.displayName) user.displayName = input.displayName;
    if (input.status) user.status = input.status;
    if (input.userTypeIds) user.userTypes = this.userTypes.filter((type) => input.userTypeIds?.includes(type.id)).map((type) => ({ id: type.id, name: type.name, key: type.key }));
    user.updatedAt = new Date().toISOString();
    return user;
  }
}

function createService() {
  const repo = new MemoryAdminRepository();
  const audit = new MemoryAuditRepository();
  return { service: new AdminService(repo, new TestPasswordHasher(), audit), repo, audit };
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
});
