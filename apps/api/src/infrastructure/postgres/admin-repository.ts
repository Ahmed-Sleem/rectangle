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
              ($1, 'Project office', 'project_manager', 'Run projects across the company.', $3, true),
              ($1, 'Read only', 'viewer', 'See the work, change nothing.', $4, true)
       on conflict (tenant_id, key) do nothing`,
      /*
       * Renamed, keys kept. "Viewer" as a user type sat beside `viewer` as a
       * project role and the two meant different things, which is how the
       * owner came to ask how a viewer could delete a project. The key is what
       * assignments point at, so renaming it would orphan them.
       */
      [
        tenantId,
        allPermissions,
        [
          "projects.read",
          "projects.create",
          "projects.edit",
          "projects.archive",
          "projects.manage_all",
          "project_team.read",
          "project_team.manage",
          "tasks.read",
          "tasks.create",
          "tasks.edit",
          "tasks.delete",
          "risks.read",
          "risks.create",
          "risks.edit",
          "risks.delete",
          "users.read",
          "user_types.read",
        ],
        ["projects.read", "project_team.read", "tasks.read", "risks.read"],
      ],
    );
  }

  /**
   * Counts people other than `excludingUserId` who can still administer the
   * company: either a tenant-level admin role, or a user type carrying
   * `users.edit`. Only active accounts count, since a disabled one cannot act.
   *
   * `users.edit` and not `users.create`, because being locked out is the fault
   * this prevents: somebody who can only add people cannot restore an account
   * that was wrongly disabled, so they are not a way back in.
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
            or 'users.edit' = any(t.permissions)
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
    const result = await this.pool.query<{ id: string; permission_a: string; permission_b: string; reason: string }>(
      // `id` is selected because the screen that lists these also removes them,
      // and a rule identified only by its pair cannot be addressed once the
      // same pair is legitimately re-added with a different reason.
      `select id, permission_a, permission_b, reason
         from tenant_separation_rules
        where tenant_id = $1
        order by permission_a, permission_b`,
      [tenantId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      a: row.permission_a as Permission,
      b: row.permission_b as Permission,
      reason: row.reason,
    }));
  }

  /**
   * People who currently hold both halves of a pair, and the types that carry
   * each half.
   *
   * Owners and administrators are excluded here rather than filtered later:
   * they hold every permission by standing, so every rule would name every
   * administrator and the list would be noise that hides the real violations.
   *
   * The two lateral aggregates are deliberately separate. Joining the same
   * assignment table twice in one query multiplies the rows against each other
   * and reports a person as holding a type several times.
   */
  async findSeparationViolators(
    tenantId: string,
    a: string,
    b: string,
  ): Promise<
    Array<{
      userId: string;
      displayName: string;
      email: string;
      typesGrantingA: Array<{ id: string; name: string }>;
      typesGrantingB: Array<{ id: string; name: string }>;
      totalTypes: number;
    }>
  > {
    const result = await this.pool.query<{
      user_id: string;
      display_name: string;
      email: string;
      types_a: Array<{ id: string; name: string }>;
      types_b: Array<{ id: string; name: string }>;
      total_types: number;
    }>(
      `select users.id as user_id,
              users.display_name,
              users.email,
              carries_a.types as types_a,
              carries_b.types as types_b,
              held.total_types
         from users
         left join tenant_user_roles standing
           on standing.tenant_id = users.tenant_id and standing.user_id = users.id
         cross join lateral (
           select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name)), '[]') as types
             from user_type_assignments asg
             join user_types t on t.id = asg.user_type_id
            where asg.tenant_id = users.tenant_id and asg.user_id = users.id
              and $2 = any(t.permissions)
         ) as carries_a
         cross join lateral (
           select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name)), '[]') as types
             from user_type_assignments asg
             join user_types t on t.id = asg.user_type_id
            where asg.tenant_id = users.tenant_id and asg.user_id = users.id
              and $3 = any(t.permissions)
         ) as carries_b
         cross join lateral (
           select count(*)::int as total_types
             from user_type_assignments asg
            where asg.tenant_id = users.tenant_id and asg.user_id = users.id
         ) as held
        where users.tenant_id = $1
          and coalesce(standing.role, 'member') not in ('owner', 'admin')
          and json_array_length(carries_a.types) > 0
          and json_array_length(carries_b.types) > 0
        order by users.display_name`,
      [tenantId, a, b],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      email: row.email,
      typesGrantingA: row.types_a,
      typesGrantingB: row.types_b,
      totalTypes: row.total_types,
    }));
  }

  /**
   * Saves a rule and removes the losing types from the people who break it, as
   * one transaction.
   *
   * One transaction because the two halves are the same decision. A rule saved
   * without the strip is a control that reads as enforced and is not; a strip
   * without the rule is access taken away for no recorded reason.
   *
   * Type *assignments* are removed from those people. The type definitions are
   * never edited — that would change access for everybody holding them,
   * including people who were never in violation, and it is a different act
   * with its own screen.
   */
  async createSeparationRule(
    tenantId: string,
    input: { a: string; b: string; reason: string },
    strip: Array<{ userId: string; userTypeIds: string[] }>,
  ): Promise<SeparationRule> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      const inserted = await client.query<{ id: string }>(
        `insert into tenant_separation_rules (tenant_id, permission_a, permission_b, reason)
         values ($1, $2, $3, $4)
         returning id`,
        [tenantId, input.a, input.b, input.reason],
      );

      for (const person of strip) {
        if (person.userTypeIds.length === 0) continue;
        await client.query(
          `delete from user_type_assignments
            where tenant_id = $1 and user_id = $2 and user_type_id = any($3::uuid[])`,
          [tenantId, person.userId, person.userTypeIds],
        );
      }

      await client.query("commit");
      return {
        id: String(inserted.rows[0]?.id),
        a: input.a as Permission,
        b: input.b as Permission,
        reason: input.reason,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteSeparationRule(tenantId: string, ruleId: string): Promise<boolean> {
    const result = await this.pool.query(
      "delete from tenant_separation_rules where tenant_id = $1 and id = $2",
      [tenantId, ruleId],
    );
    return (result.rowCount ?? 0) > 0;
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
