/**
 * PostgreSQL persistence for project members, stakeholders, and project activity.
 *
 * Every statement filters by tenant_id. Tenant scoping is enforced here as well
 * as in the service layer so a future caller cannot reach across tenants by
 * skipping a use case.
 */
import type { Pool } from "pg";
import { redactMetadata } from "../../domain/activity.js";
import type {
  AddProjectMemberInput,
  CreateStakeholderInput,
  ProjectActivityRecord,
  ProjectMemberRecord,
  ProjectMemberRole,
  StakeholderRecord,
  UpdateStakeholderInput,
} from "../../domain/project-team.js";

interface MemberRow {
  project_id: string;
  tenant_id: string;
  user_id: string;
  role: ProjectMemberRole;
  display_name: string;
  email: string;
  created_at: Date;
  updated_at: Date;
}

function mapMember(row: MemberRow): ProjectMemberRecord {
  return {
    projectId: row.project_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name,
    email: row.email,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

interface StakeholderRow {
  id: string;
  project_id: string;
  tenant_id: string;
  name: string;
  organization: string | null;
  category: StakeholderRecord["category"];
  influence: StakeholderRecord["influence"];
  interest: StakeholderRecord["interest"];
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapStakeholder(row: StakeholderRow): StakeholderRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    tenantId: row.tenant_id,
    name: row.name,
    ...(row.organization ? { organization: row.organization } : {}),
    category: row.category,
    influence: row.influence,
    interest: row.interest,
    ...(row.email ? { email: row.email } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresProjectTeamRepository {
  constructor(private readonly pool: Pool) {}

  async listMembers(tenantId: string, projectId: string): Promise<ProjectMemberRecord[]> {
    const result = await this.pool.query<MemberRow>(
      `select m.project_id, m.tenant_id, m.user_id, m.role, m.created_at, m.updated_at,
              u.display_name, u.email
         from project_members m
         join users u on u.id = m.user_id and u.tenant_id = m.tenant_id
        where m.tenant_id = $1 and m.project_id = $2
        order by m.created_at asc`,
      [tenantId, projectId],
    );
    return result.rows.map(mapMember);
  }

  async filterExistingProjectIds(
    tenantId: string,
    projectIds: readonly string[],
  ): Promise<string[]> {
    if (projectIds.length === 0) return [];
    // Answering for an id that is not a project told the caller something
    // untrue and disagreed with `/access`, which reports it as not found.
    const result = await this.pool.query<{ id: string }>(
      `select id from projects where tenant_id = $1 and id = any($2::uuid[])`,
      [tenantId, projectIds],
    );
    return result.rows.map((row) => row.id);
  }

  async findMembershipsForUser(
    tenantId: string,
    userId: string,
  ): Promise<Array<{ projectId: string; role: ProjectMemberRecord["role"] }>> {
    // One query for every project this person is on, so a register spanning
    // dozens of projects costs one round trip rather than one per row.
    const result = await this.pool.query<{ project_id: string; role: ProjectMemberRecord["role"] }>(
      `select project_id, role
         from project_members
        where tenant_id = $1 and user_id = $2`,
      [tenantId, userId],
    );
    return result.rows.map((row) => ({ projectId: row.project_id, role: row.role }));
  }

  async findMember(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<ProjectMemberRecord | null> {
    const result = await this.pool.query<MemberRow>(
      `select m.project_id, m.tenant_id, m.user_id, m.role, m.created_at, m.updated_at,
              u.display_name, u.email
         from project_members m
         join users u on u.id = m.user_id and u.tenant_id = m.tenant_id
        where m.tenant_id = $1 and m.project_id = $2 and m.user_id = $3`,
      [tenantId, projectId, userId],
    );
    const row = result.rows[0];
    return row ? mapMember(row) : null;
  }

  /** Confirms the target user exists inside the same tenant before membership is granted. */
  async tenantUserExists(tenantId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      "select true as exists from users where tenant_id = $1 and id = $2",
      [tenantId, userId],
    );
    return result.rows.length > 0;
  }

  async addMember(
    tenantId: string,
    projectId: string,
    input: AddProjectMemberInput,
  ): Promise<ProjectMemberRecord | null> {
    await this.pool.query(
      `insert into project_members (project_id, tenant_id, user_id, role)
       values ($1, $2, $3, $4)
       on conflict (project_id, user_id)
       do update set role = excluded.role, updated_at = now()`,
      [projectId, tenantId, input.userId, input.role],
    );
    return this.findMember(tenantId, projectId, input.userId);
  }

  async updateMemberRole(
    tenantId: string,
    projectId: string,
    userId: string,
    role: ProjectMemberRole,
  ): Promise<ProjectMemberRecord | null> {
    const result = await this.pool.query(
      `update project_members set role = $4, updated_at = now()
        where tenant_id = $1 and project_id = $2 and user_id = $3`,
      [tenantId, projectId, userId, role],
    );
    if (result.rowCount === 0) return null;
    return this.findMember(tenantId, projectId, userId);
  }

  /**
   * Removes a membership and releases that person's work on the project in the
   * same transaction.
   *
   * Tasks may only be assigned to project members, and that rule is checked on
   * every write. Deleting the membership without touching the tasks would leave
   * rows the service considers impossible: an assignee who cannot open the
   * project, on a task that then fails validation the next time anyone edits an
   * unrelated field. Doing both in one transaction means the invariant is never
   * observably broken.
   */
  async removeMember(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<{ removed: boolean; unassignedTasks: number; unassignedRisks: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      const result = await client.query(
        "delete from project_members where tenant_id = $1 and project_id = $2 and user_id = $3",
        [tenantId, projectId, userId],
      );

      if ((result.rowCount ?? 0) === 0) {
        await client.query("rollback");
        return { removed: false, unassignedTasks: 0, unassignedRisks: 0 };
      }

      // Finished work keeps its assignee: it is a record of who did it, and
      // rewriting history to say nobody did would be worse than the dangling
      // reference. Only open work is released back to the project.
      const released = await client.query(
        `update tasks set assignee_user_id = null, updated_at = now()
          where tenant_id = $1 and project_id = $2 and assignee_user_id = $3
            and status not in ('done', 'cancelled')`,
        [tenantId, projectId, userId],
      );

      // Risks carry an owner under the same rule as tasks carry an assignee,
      // so they need releasing for the same reason: leaving them would store
      // an owner the service considers impossible. Settled entries keep their
      // owner, since that is the record of who handled them.
      const releasedRisks = await client.query(
        `update risks set owner_user_id = null, updated_at = now()
          where tenant_id = $1 and project_id = $2 and owner_user_id = $3
            and status not in ('closed', 'accepted')`,
        [tenantId, projectId, userId],
      );

      await client.query("commit");
      return {
        removed: true,
        unassignedTasks: released.rowCount ?? 0,
        unassignedRisks: releasedRisks.rowCount ?? 0,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Number of remaining project administrators, used to keep at least one in place. */
  async countAdmins(tenantId: string, projectId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `select count(*)::text as count from project_members
        where tenant_id = $1 and project_id = $2 and role in ('project_admin','project_manager')`,
      [tenantId, projectId],
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async listStakeholders(tenantId: string, projectId: string): Promise<StakeholderRecord[]> {
    const result = await this.pool.query<StakeholderRow>(
      `select * from project_stakeholders
        where tenant_id = $1 and project_id = $2
        order by created_at desc`,
      [tenantId, projectId],
    );
    return result.rows.map(mapStakeholder);
  }

  async createStakeholder(
    tenantId: string,
    projectId: string,
    input: CreateStakeholderInput,
  ): Promise<StakeholderRecord> {
    const result = await this.pool.query<StakeholderRow>(
      `insert into project_stakeholders
         (project_id, tenant_id, name, organization, category, influence, interest, email, phone, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning *`,
      [
        projectId,
        tenantId,
        input.name,
        input.organization ?? null,
        input.category,
        input.influence,
        input.interest,
        input.email ?? null,
        input.phone ?? null,
        input.notes ?? null,
      ],
    );
    return mapStakeholder(result.rows[0]!);
  }

  async updateStakeholder(
    tenantId: string,
    projectId: string,
    stakeholderId: string,
    input: UpdateStakeholderInput,
  ): Promise<StakeholderRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };

    if (input.name !== undefined) add("name", input.name);
    if (input.organization !== undefined) add("organization", input.organization ?? null);
    if (input.category !== undefined) add("category", input.category);
    if (input.influence !== undefined) add("influence", input.influence);
    if (input.interest !== undefined) add("interest", input.interest);
    if (input.email !== undefined) add("email", input.email ?? null);
    if (input.phone !== undefined) add("phone", input.phone ?? null);
    if (input.notes !== undefined) add("notes", input.notes ?? null);

    if (fields.length === 0) {
      return this.findStakeholder(tenantId, projectId, stakeholderId);
    }

    fields.push("updated_at = now()");
    values.push(tenantId, projectId, stakeholderId);

    const result = await this.pool.query<StakeholderRow>(
      `update project_stakeholders set ${fields.join(", ")}
        where tenant_id = $${values.length - 2}
          and project_id = $${values.length - 1}
          and id = $${values.length}
        returning *`,
      values,
    );
    const row = result.rows[0];
    return row ? mapStakeholder(row) : null;
  }

  async findStakeholder(
    tenantId: string,
    projectId: string,
    stakeholderId: string,
  ): Promise<StakeholderRecord | null> {
    const result = await this.pool.query<StakeholderRow>(
      "select * from project_stakeholders where tenant_id = $1 and project_id = $2 and id = $3",
      [tenantId, projectId, stakeholderId],
    );
    const row = result.rows[0];
    return row ? mapStakeholder(row) : null;
  }

  async deleteStakeholder(
    tenantId: string,
    projectId: string,
    stakeholderId: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      "delete from project_stakeholders where tenant_id = $1 and project_id = $2 and id = $3",
      [tenantId, projectId, stakeholderId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Activity for a project: events on the project itself plus events on records
   * that belong to it, so the timeline reflects the whole workspace.
   */
  async listActivity(
    tenantId: string,
    projectId: string,
    limit: number,
    /**
     * When set, only this person's own actions are returned.
     *
     * Managing a project entitles you to its whole history; merely being a
     * member on it entitles you to your own. Passing the restriction down
     * rather than filtering afterwards keeps the rule in one place and stops a
     * page-sized read returning rows the caller may not see.
     */
    onlyActorUserId?: string,
  ): Promise<ProjectActivityRecord[]> {
    const result = await this.pool.query<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      result: "success" | "failure";
      actor_user_id: string | null;
      actor_name: string | null;
      metadata: Record<string, unknown>;
      created_at: Date;
    }>(
      `select a.id, a.action, a.entity_type, a.entity_id, a.result,
              a.actor_user_id, u.display_name as actor_name, a.metadata, a.created_at
         from audit_events a
         left join users u on u.id = a.actor_user_id and u.tenant_id = a.tenant_id
        where a.tenant_id = $1
          -- Operational only. The caller's access was checked against this
          -- project, which entitles them to the work done on it and to nothing
          -- about a colleague's account or sign-in history.
          and a.sensitivity = 'operational'
          and (
            (a.entity_type = 'project' and a.entity_id = $2)
            or a.project_id = $2::uuid
          )
          ${onlyActorUserId ? "and a.actor_user_id = $4" : ""}
        order by a.created_at desc, a.id desc
        limit $3`,
      onlyActorUserId ? [tenantId, projectId, limit, onlyActorUserId] : [tenantId, projectId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      result: row.result,
      ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
      ...(row.actor_name ? { actorName: row.actor_name } : {}),
      /*
       * Redacted on the same terms as the activity page. Nothing an
       * operational entry records today is sensitive, but the metadata column
       * is free-form and the next action added to it will not come with a
       * reminder.
       */
      metadata: redactMetadata(row.metadata ?? {}, false),
      createdAt: row.created_at.toISOString(),
    }));
  }
}
