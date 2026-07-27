/** PostgreSQL implementation for tenant user type and user administration. */
import type pg from "pg";
import type { AdminRepository, AdminUserRecord, UserTypeRecord } from "../../application/admin-service.js";
import type { CreateUserInput, CreateUserTypeInput, UpdateUserInput, UpdateUserTypeInput } from "../../domain/admin.js";
import { allPermissions, type Permission, type SeparationRule } from "../../domain/permissions.js";

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
    standing: (row.standing ? String(row.standing) : "member") as AdminUserRecord["standing"],
    email: String(row.email),
    displayName: String(row.display_name),
    status: row.status as AdminUserRecord["status"],
    userTypes: Array.isArray(row.user_types) ? row.user_types as AdminUserRecord["userTypes"] : [],
    projectCount: Number(row.project_count ?? 0),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export class PostgresAdminRepository implements AdminRepository {
  constructor(private readonly pool: pg.Pool) {}

  async ensureSystemUserTypes(tenantId: string): Promise<void> {
    await this.pool.query(
      /*
       * Named "Full access" rather than "Owner". A user *type* called Owner
       * competing with a company *standing* called owner is the confusion that
       * let somebody be a viewer and an owner at once: the standing said
       * viewer, the type granted everything, and the union resolved to full
       * access. Ownership is a standing; this is a permission bundle.
       */
      `insert into user_types (tenant_id, name, key, description, permissions, system_type)
       values ($1, 'Full access', 'full_access', 'Every permission in the product.', $2, true),
              ($1, 'Project Manager', 'project_manager', 'Manage projects and view users.', $3, true),
              ($1, 'Viewer', 'viewer', 'Read-only project access.', $4, true)
       on conflict (tenant_id, key) do nothing`,
      [tenantId, allPermissions, ["projects.read", "projects.manage", "users.read", "user_types.read"], ["projects.read"]],
    );
  }

  /**
   * Counts people other than `excludingUserId` who can still administer the
   * company: either a tenant-level admin role, or a user type carrying
   * `users.manage`. Only active accounts count, since a disabled one cannot act.
   */
  async countOtherActiveAdmins(tenantId: string, excludingUserId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `select count(distinct users.id)::text as count
         from users
         left join tenant_user_roles r
           on r.tenant_id = users.tenant_id and r.user_id = users.id
         left join user_type_assignments a
           on a.tenant_id = users.tenant_id and a.user_id = users.id
         left join user_types t on t.id = a.user_type_id
        where users.tenant_id = $1
          and users.id <> $2
          and users.status = 'active'
          and (
            r.role in ('owner', 'admin')
            or 'users.manage' = any(t.permissions)
          )`,
      [tenantId, excludingUserId],
    );
    return Number(result.rows[0]?.count ?? 0);
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

  async listSeparationRules(tenantId: string): Promise<SeparationRule[]> {
    const result = await this.pool.query<{ permission_a: string; permission_b: string; reason: string }>(
      `select permission_a, permission_b, reason
         from tenant_separation_rules
        where tenant_id = $1
        order by permission_a, permission_b`,
      [tenantId],
    );
    return result.rows.map((row) => ({
      a: row.permission_a as Permission,
      b: row.permission_b as Permission,
      reason: row.reason,
    }));
  }

  async findStanding(tenantId: string, userId: string): Promise<string | null> {
    const result = await this.pool.query<{ role: string }>(
      "select role from tenant_user_roles where tenant_id = $1 and user_id = $2 limit 1",
      [tenantId, userId],
    );
    return result.rows[0]?.role ?? null;
  }

  /** Only active accounts count: a disabled owner cannot rescue a company. */
  async countOtherOwners(tenantId: string, excludingUserId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `select count(*)::text as count
         from tenant_user_roles r
         join users u on u.tenant_id = r.tenant_id and u.id = r.user_id
        where r.tenant_id = $1 and r.user_id <> $2
          and r.role = 'owner' and u.status = 'active'`,
      [tenantId, excludingUserId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async listUsers(tenantId: string): Promise<AdminUserRecord[]> {
    // Project membership is counted in a lateral subquery rather than another
    // join: joining it alongside the user-type join would multiply the rows and
    // inflate both aggregates against each other.
    const result = await this.pool.query(
      `select users.*,
              coalesce(json_agg(json_build_object('id', user_types.id, 'name', user_types.name, 'key', user_types.key)) filter (where user_types.id is not null), '[]') as user_types,
              membership.project_count,
              -- One row per person since migration 012, so this cannot multiply
              -- the aggregate the way a second user-type join would.
              coalesce(standing.role, 'member') as standing
       from users
       left join user_type_assignments on user_type_assignments.tenant_id = users.tenant_id and user_type_assignments.user_id = users.id
       left join user_types on user_types.id = user_type_assignments.user_type_id
       left join tenant_user_roles standing
         on standing.tenant_id = users.tenant_id and standing.user_id = users.id
       cross join lateral (
         select count(*)::int as project_count
           from project_members
          where project_members.tenant_id = users.tenant_id
            and project_members.user_id = users.id
       ) as membership
       where users.tenant_id = $1
       group by users.id, membership.project_count, standing.role
       order by users.display_name asc`,
      [tenantId],
    );
    return result.rows.map((row) => mapUser(row));
  }

  async findUserByEmail(tenantId: string, email: string): Promise<AdminUserRecord | null> {
    const users = await this.listUsers(tenantId);
    return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async createUser(
    tenantId: string,
    input: Omit<CreateUserInput, "password"> & { passwordHash: string | null; status: "active" | "invited" },
  ): Promise<AdminUserRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const userResult = await client.query(
        `insert into users (tenant_id, email, display_name, password_hash, status)
         values ($1,$2,$3,$4,$5) returning id`,
        [tenantId, input.email, input.displayName, input.passwordHash, input.status],
      );
      const userId = String(userResult.rows[0].id);
      /*
       * Standing is chosen by whoever creates the person. It was previously
       * hardcoded to 'viewer' with no way to change it afterwards, so an owner
       * could not promote anybody through any screen.
       */
      await client.query(
        "insert into tenant_user_roles (tenant_id, user_id, role) values ($1,$2,$3)",
        [tenantId, userId, input.standing ?? "member"],
      );
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
      if (input.standing !== undefined) {
        /*
         * Upsert rather than delete-then-insert: the row is the person's single
         * standing since migration 012, and briefly having none would leave a
         * concurrent authority read seeing a user with no standing at all.
         */
        await client.query(
          `insert into tenant_user_roles (tenant_id, user_id, role) values ($1,$2,$3)
           on conflict (tenant_id, user_id) do update set role = excluded.role`,
          [tenantId, userId, input.standing],
        );
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
