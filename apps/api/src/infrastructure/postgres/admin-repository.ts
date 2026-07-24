/** PostgreSQL implementation for tenant user type and user administration. */
import type pg from "pg";
import type { AdminRepository, AdminUserRecord, UserTypeRecord } from "../../application/admin-service.js";
import type { CreateUserInput, CreateUserTypeInput, UpdateUserInput, UpdateUserTypeInput } from "../../domain/admin.js";
import { allPermissions, type Permission } from "../../domain/permissions.js";

function mapUserType(row: Record<string, unknown>): UserTypeRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    key: String(row.key),
    ...(row.description == null ? {} : { description: String(row.description) }),
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) as Permission[] : [],
    systemType: Boolean(row.system_type),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapUser(row: Record<string, unknown>): AdminUserRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    email: String(row.email),
    displayName: String(row.display_name),
    status: row.status as AdminUserRecord["status"],
    userTypes: Array.isArray(row.user_types) ? row.user_types as AdminUserRecord["userTypes"] : [],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export class PostgresAdminRepository implements AdminRepository {
  constructor(private readonly pool: pg.Pool) {}

  async ensureSystemUserTypes(tenantId: string): Promise<void> {
    await this.pool.query(
      `insert into user_types (tenant_id, name, key, description, permissions, system_type)
       values ($1, 'Owner', 'owner', 'Full company administration access.', $2, true),
              ($1, 'Project Manager', 'project_manager', 'Manage projects and view users.', $3, true),
              ($1, 'Viewer', 'viewer', 'Read-only project access.', $4, true)
       on conflict (tenant_id, key) do nothing`,
      [tenantId, allPermissions, ["projects.read", "projects.manage", "users.read", "user_types.read"], ["projects.read"]],
    );
  }

  async listUserTypes(tenantId: string): Promise<UserTypeRecord[]> {
    const result = await this.pool.query("select * from user_types where tenant_id = $1 order by system_type desc, name asc", [tenantId]);
    return result.rows.map((row) => mapUserType(row));
  }

  async findUserTypeByKey(tenantId: string, key: string): Promise<UserTypeRecord | null> {
    const result = await this.pool.query("select * from user_types where tenant_id = $1 and key = $2 limit 1", [tenantId, key]);
    return result.rows[0] ? mapUserType(result.rows[0]) : null;
  }

  async findUserTypesByIds(tenantId: string, ids: string[]): Promise<UserTypeRecord[]> {
    const result = await this.pool.query("select * from user_types where tenant_id = $1 and id = any($2::uuid[])", [tenantId, ids]);
    return result.rows.map((row) => mapUserType(row));
  }

  async createUserType(tenantId: string, input: CreateUserTypeInput): Promise<UserTypeRecord> {
    const result = await this.pool.query(
      `insert into user_types (tenant_id, name, key, description, permissions)
       values ($1,$2,$3,$4,$5) returning *`,
      [tenantId, input.name, input.key, input.description ?? null, input.permissions],
    );
    return mapUserType(result.rows[0]);
  }

  async updateUserType(tenantId: string, id: string, input: UpdateUserTypeInput): Promise<UserTypeRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => { values.push(value); fields.push(`${column} = $${values.length}`); };
    if (input.name !== undefined) add("name", input.name);
    if (input.description !== undefined) add("description", input.description || null);
    if (input.permissions !== undefined) add("permissions", input.permissions);
    values.push(tenantId, id);
    const result = await this.pool.query(
      `update user_types set ${fields.join(", ")}, updated_at = now()
       where tenant_id = $${values.length - 1} and id = $${values.length}
       returning *`,
      values,
    );
    return result.rows[0] ? mapUserType(result.rows[0]) : null;
  }

  async listUsers(tenantId: string): Promise<AdminUserRecord[]> {
    const result = await this.pool.query(
      `select users.*, coalesce(json_agg(json_build_object('id', user_types.id, 'name', user_types.name, 'key', user_types.key)) filter (where user_types.id is not null), '[]') as user_types
       from users
       left join user_type_assignments on user_type_assignments.tenant_id = users.tenant_id and user_type_assignments.user_id = users.id
       left join user_types on user_types.id = user_type_assignments.user_type_id
       where users.tenant_id = $1
       group by users.id
       order by users.display_name asc`,
      [tenantId],
    );
    return result.rows.map((row) => mapUser(row));
  }

  async findUserByEmail(tenantId: string, email: string): Promise<AdminUserRecord | null> {
    const users = await this.listUsers(tenantId);
    return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async createUser(tenantId: string, input: Omit<CreateUserInput, "password"> & { passwordHash: string }): Promise<AdminUserRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const userResult = await client.query(
        `insert into users (tenant_id, email, display_name, password_hash, status)
         values ($1,$2,$3,$4,'active') returning id`,
        [tenantId, input.email, input.displayName, input.passwordHash],
      );
      const userId = String(userResult.rows[0].id);
      await client.query("insert into tenant_user_roles (tenant_id, user_id, role) values ($1,$2,'viewer')", [tenantId, userId]);
      for (const typeId of input.userTypeIds) {
        await client.query("insert into user_type_assignments (tenant_id, user_id, user_type_id) values ($1,$2,$3)", [tenantId, userId, typeId]);
      }
      await client.query("commit");
      const created = await this.listUsers(tenantId);
      return created.find((user) => user.id === userId)!;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateUser(tenantId: string, userId: string, input: Omit<UpdateUserInput, "password"> & { passwordHash?: string }): Promise<AdminUserRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const fields: string[] = [];
      const values: unknown[] = [];
      const add = (column: string, value: unknown) => { values.push(value); fields.push(`${column} = $${values.length}`); };
      if (input.displayName !== undefined) add("display_name", input.displayName);
      if (input.status !== undefined) add("status", input.status);
      if (input.passwordHash !== undefined) add("password_hash", input.passwordHash);
      if (fields.length > 0) {
        values.push(tenantId, userId);
        const updated = await client.query(`update users set ${fields.join(", ")}, updated_at = now() where tenant_id = $${values.length - 1} and id = $${values.length}`, values);
        if (updated.rowCount === 0) { await client.query("rollback"); return null; }
      }
      if (input.userTypeIds !== undefined) {
        await client.query("delete from user_type_assignments where tenant_id = $1 and user_id = $2", [tenantId, userId]);
        for (const typeId of input.userTypeIds) {
          await client.query("insert into user_type_assignments (tenant_id, user_id, user_type_id) values ($1,$2,$3)", [tenantId, userId, typeId]);
        }
      }
      await client.query("commit");
      const users = await this.listUsers(tenantId);
      return users.find((user) => user.id === userId) ?? null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
