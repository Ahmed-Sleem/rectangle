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
    standing: (row.standing ? String(row.standing) : "none") as AdminUserRecord["standing"],
    email: String(row.email),
    displayName: String(row.display_name),
    status: row.status as AdminUserRecord["status"],
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) as Permission[] : [],
    projectCount: Number(row.project_count ?? 0),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export class PostgresAdminRepository implements AdminRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Counts people other than `excludingUserId` who can still administer the
   * company: either the owner, or somebody granted `users.edit`. Only active
   * accounts count, since a disabled one cannot act.
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
         left join user_permissions p
           on p.tenant_id = users.tenant_id and p.user_id = users.id
           and p.permission = 'users.edit'
        where users.tenant_id = $1
          and users.id <> $2
          and users.status = 'active'
          and (r.role = 'owner' or p.permission is not null)`,
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
   * People who hold both halves of a pair directly.
   *
   * The owner is excluded rather than filtered afterwards: they hold every
   * permission by standing, so every rule would name them and the real
   * violations would be lost in the noise.
   */
  async findSeparationViolators(
    tenantId: string,
    a: string,
    b: string,
  ): Promise<Array<{ userId: string; displayName: string; email: string }>> {
    const result = await this.pool.query<{ user_id: string; display_name: string; email: string }>(
      `select users.id as user_id, users.display_name, users.email
         from users
         left join tenant_user_roles standing
           on standing.tenant_id = users.tenant_id and standing.user_id = users.id
        where users.tenant_id = $1
          and coalesce(standing.role, 'none') <> 'owner'
          and exists (
            select 1 from user_permissions p
             where p.tenant_id = users.tenant_id and p.user_id = users.id and p.permission = $2
          )
          and exists (
            select 1 from user_permissions p
             where p.tenant_id = users.tenant_id and p.user_id = users.id and p.permission = $3
          )
        order by users.display_name`,
      [tenantId, a, b],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      email: row.email,
    }));
  }

  /** Every direct grant in the company, paired with the person holding it. */
  async listPermissionHolders(
    tenantId: string,
  ): Promise<Array<{ permission: string; id: string; name: string }>> {
    const result = await this.pool.query<{ permission: string; id: string; name: string }>(
      `select p.permission, users.id, users.display_name as name
         from user_permissions p
         join users on users.tenant_id = p.tenant_id and users.id = p.user_id
        where p.tenant_id = $1
        order by p.permission, users.display_name`,
      [tenantId],
    );
    return result.rows.map((row) => ({ permission: row.permission, id: row.id, name: row.name }));
  }

  /**
   * Saves a rule and revokes the losing permission from the people who break
   * it, as one transaction.
   *
   * One transaction because the two halves are the same decision. A rule saved
   * without the revocation is a control that reads as enforced and is not; a
   * revocation without the rule is access taken away for no recorded reason.
   */
  async createSeparationRule(
    tenantId: string,
    input: { a: string; b: string; reason: string },
    revoke: { permission: string; userIds: string[] },
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

      if (revoke.userIds.length > 0) {
        await client.query(
          `delete from user_permissions
            where tenant_id = $1 and permission = $2 and user_id = any($3::uuid[])`,
          [tenantId, revoke.permission, revoke.userIds],
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
              coalesce(array_agg(distinct granted.permission) filter (where granted.permission is not null), '{}') as permissions,
              membership.project_count,
              -- One row per person since migration 012, so this cannot multiply
              -- the aggregate the way a second user-type join would.
              coalesce(standing.role, 'none') as standing
       from users
       left join user_permissions granted on granted.tenant_id = users.tenant_id and granted.user_id = users.id
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

  /**
   * Makes the person's grants exactly the set given.
   *
   * Replace rather than merge, because the form sends the complete answer to
   * "what may this person do" and a merge would make unticking a box do
   * nothing. `granted_at` and `granted_by_user_id` on the surviving rows are
   * deliberately rewritten too: the answer to "who gave them this, and when"
   * should be the last person who confirmed it, not the first.
   */
  private async replaceGrants(
    client: pg.PoolClient,
    tenantId: string,
    userId: string,
    permissions: readonly string[],
    actorUserId: string | null,
  ): Promise<void> {
    await client.query("delete from user_permissions where tenant_id = $1 and user_id = $2", [tenantId, userId]);
    if (permissions.length === 0) return;
    await client.query(
      `insert into user_permissions (tenant_id, user_id, permission, granted_by_user_id)
       select $1, $2, permission, $4 from unnest($3::text[]) as permission`,
      [tenantId, userId, [...permissions], actorUserId],
    );
  }

  async createUser(
    tenantId: string,
    input: Omit<CreateUserInput, "password"> & { passwordHash: string | null; status: "active" | "invited" },
    actorUserId: string,
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
       * Only ownership is recorded. `none` is the absence of a standing, so
       * writing a row saying so would be storing the default — and the table's
       * constraint permits only 'owner' precisely to keep that unrepresentable.
       */
      if (input.standing === "owner") {
        await client.query(
          "insert into tenant_user_roles (tenant_id, user_id, role) values ($1,$2,'owner')",
          [tenantId, userId],
        );
      }
      await this.replaceGrants(client, tenantId, userId, input.permissions, actorUserId);
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

  async updateUser(
    tenantId: string,
    userId: string,
    input: Omit<UpdateUserInput, "password"> & { passwordHash?: string },
    actorUserId: string,
  ): Promise<AdminUserRecord | null> {
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
      if (input.standing === "owner") {
        /*
         * Upsert rather than delete-then-insert: briefly having no row would
         * leave a concurrent authority read seeing an owner with no standing.
         */
        await client.query(
          `insert into tenant_user_roles (tenant_id, user_id, role) values ($1,$2,'owner')
           on conflict (tenant_id, user_id) do update set role = 'owner'`,
          [tenantId, userId],
        );
      } else if (input.standing === "none") {
        await client.query(
          "delete from tenant_user_roles where tenant_id = $1 and user_id = $2",
          [tenantId, userId],
        );
      }
      if (input.permissions !== undefined) {
        await this.replaceGrants(client, tenantId, userId, input.permissions, actorUserId);
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
