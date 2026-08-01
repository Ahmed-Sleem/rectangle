/**
 * PostgreSQL Projects repository enforces tenant-scoped queries in every SQL
 * statement so project data cannot cross tenant boundaries by accident.
 */
import type pg from "pg";
import type { ProjectsRepository } from "../../application/project-service.js";
import type { CreateProjectInput, ProjectListQuery, ProjectRecord, UpdateProjectInput } from "../../domain/project.js";
import { buildSearchClause, type SearchMode } from "./search-sql.js";

function mapProject(row: Record<string, unknown>): ProjectRecord {
  const project: ProjectRecord = {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    code: String(row.code),
    status: row.status as ProjectRecord["status"],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
  if (row.description != null) project.description = String(row.description);
  if (row.planned_start_date != null) project.plannedStartDate = String(row.planned_start_date);
  if (row.planned_finish_date != null) project.plannedFinishDate = String(row.planned_finish_date);
  if (row.budget_amount != null) project.budgetAmount = String(row.budget_amount);
  if (row.budget_currency != null) project.budgetCurrency = String(row.budget_currency);
  if (row.sector != null) project.sector = row.sector as NonNullable<ProjectRecord["sector"]>;
  if (row.delivery_method != null) project.deliveryMethod = row.delivery_method as NonNullable<ProjectRecord["deliveryMethod"]>;
  if (row.location_name != null) project.locationName = String(row.location_name);
  // Only the list/detail reads join task counts; writes return the bare row.
  if (row.total_tasks != null && Number(row.total_tasks) > 0) {
    project.totalTasks = Number(row.total_tasks);
    project.doneTasks = Number(row.done_tasks ?? 0);
  }
  if (Array.isArray(row.member_names)) {
    project.memberNames = row.member_names.map((name) => String(name));
    project.memberCount = Number(row.member_count ?? project.memberNames.length);
  }
  return project;
}


export class PostgresProjectsRepository implements ProjectsRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Creates the project and makes its creator the project administrator.
   *
   * One transaction, because a project whose creator is not on it is a project
   * they cannot open. Membership is what grants reach, so somebody holding
   * `projects.create` without the company-wide `projects.manage_all` used to
   * create a job and watch it vanish — `resolveAccess` found no membership and
   * answered "not found", which is the correct answer to the wrong question.
   *
   * This is also what the industry does: in Procore, granting project creation
   * automatically gives the creator administrative rights on what they create.
   * The alternative — creating something and asking somebody else to let you
   * back in — is not a workflow anybody would design on purpose.
   */
  async create(
    tenantId: string,
    input: CreateProjectInput,
    creatorUserId: string,
  ): Promise<ProjectRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const created = await this.insertProject(client, tenantId, input);
      /*
       * The conflict target must name the primary key exactly, which is
       * `(project_id, user_id)` — tenant_id is carried on the row and enforced
       * by a composite foreign key, but it is not part of the key. Naming all
       * three matched no constraint, and PostgreSQL rejects that outright, so
       * every project creation failed. It was invisible to the suite because
       * the repository tests are the only ones that execute this statement and
       * none of them called `create`.
       */
      await client.query(
        `insert into project_members (tenant_id, project_id, user_id, role)
         values ($1, $2, $3, 'project_admin')
         on conflict (project_id, user_id) do nothing`,
        [tenantId, created.id, creatorUserId],
      );
      await client.query("commit");
      return created;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertProject(
    client: pg.PoolClient,
    tenantId: string,
    input: CreateProjectInput,
  ): Promise<ProjectRecord> {
    const result = await client.query(
      `insert into projects (
        tenant_id, name, code, description, status, planned_start_date, planned_finish_date,
        budget_amount, budget_currency, sector, delivery_method, location_name
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      returning *`,
      [
        tenantId,
        input.name,
        input.code,
        input.description ?? null,
        input.status,
        input.plannedStartDate ?? null,
        input.plannedFinishDate ?? null,
        input.budgetAmount ?? null,
        input.budgetCurrency ?? null,
        input.sector ?? null,
        input.deliveryMethod ?? null,
        input.locationName ?? null,
      ],
    );
    return mapProject(result.rows[0]);
  }

  async findByTenantAndCode(tenantId: string, code: string): Promise<ProjectRecord | null> {
    const result = await this.pool.query("select * from projects where tenant_id = $1 and code = $2 limit 1", [tenantId, code]);
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  }

  async findByIdForTenant(tenantId: string, id: string): Promise<ProjectRecord | null> {
    // Carries the same task counts as the list so the workspace and the card
    // that led to it can never show different progress for one project.
    const result = await this.pool.query(
      `select p.*, counts.total_tasks, counts.done_tasks
         from projects p
         cross join lateral (
           select count(*) filter (where t.status <> 'cancelled')::int as total_tasks,
                  count(*) filter (where t.status = 'done')::int as done_tasks
             from tasks t
            where t.tenant_id = p.tenant_id and t.project_id = p.id
         ) as counts
        where p.tenant_id = $1 and p.id = $2
        limit 1`,
      [tenantId, id],
    );
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  }

  /**
   * The register, filtered and searched.
   *
   * Runs the precise search first and the forgiving one only if it found
   * nothing, which is the same two-step the palette performs. Doing it in one
   * statement would mean asking "is this row an exact match" per row, which
   * says nothing about whether some other row matched — so one right answer
   * would still drag every near-miss in beside it.
   */
  async listForTenant(tenantId: string, query: ProjectListQuery): Promise<ProjectRecord[]> {
    const exact = await this.listMatching(tenantId, query, "exact");
    if (!query.search || exact.length > 0) return exact;
    return this.listMatching(tenantId, query, "fuzzy");
  }

  private async listMatching(
    tenantId: string,
    query: ProjectListQuery,
    searchMode: SearchMode,
  ): Promise<ProjectRecord[]> {
    const values: unknown[] = [tenantId];
    // Columns are qualified because the task-count join brings a second table
    // into scope; an unqualified `status` would be ambiguous.
    const where = ["p.tenant_id = $1"];

    if (query.status) {
      values.push(query.status);
      where.push(`p.status = $${values.length}`);
    }
    /*
     * The shared engine, so this box behaves exactly like the palette and every
     * other search in the product. It replaced `ilike '%term%'`, which could not
     * use an index — a leading wildcard forces a scan of every row on every
     * keystroke — and returned rows in table order with the best match as likely
     * to be last as first.
     */
    const search = buildSearchClause(
      query.search ?? "",
      "p.search_document",
      "coalesce(p.name, '')",
      values.length + 1,
      searchMode,
    );
    if (search) {
      values.push(...search.values);
      where.push(search.where);
    }
    if (query.cursor) {
      values.push(query.cursor);
      where.push(`p.id > $${values.length}`);
    }
    values.push(query.limit);

    // Counted in one lateral join rather than a query per project. Cancelled
    // work is excluded from both figures: it was decided against, so it is
    // neither an achievement nor an outstanding obligation.
    const result = await this.pool.query(
      `select p.*, counts.total_tasks, counts.done_tasks,
              team.member_names, team.member_count
         from projects p
         cross join lateral (
           select count(*) filter (where t.status <> 'cancelled')::int as total_tasks,
                  count(*) filter (where t.status = 'done')::int as done_tasks
             from tasks t
            where t.tenant_id = p.tenant_id and t.project_id = p.id
         ) as counts
         cross join lateral (
           -- Names for the avatars, plus the true total so the card can say
           -- "+3" honestly rather than counting only the ones it fetched.
           select coalesce(array_agg(named.display_name order by named.display_name), '{}') as member_names,
                  (select count(*)::int
                     from project_members allm
                    where allm.tenant_id = p.tenant_id and allm.project_id = p.id) as member_count
             from (
               select u.display_name
                 from project_members m
                 join users u on u.tenant_id = m.tenant_id and u.id = m.user_id
                where m.tenant_id = p.tenant_id and m.project_id = p.id
                order by u.display_name
                limit 5
             ) as named
         ) as team
        where ${where.join(" and ")}
        order by ${search ? `${search.rank} desc,` : ""} p.id asc
        limit $${values.length}`,
      values,
    );
    return result.rows.map(mapProject);
  }

  async updateForTenant(tenantId: string, id: string, input: UpdateProjectInput): Promise<ProjectRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };

    if (input.name !== undefined) add("name", input.name);
    if (input.code !== undefined) add("code", input.code);
    if (input.description !== undefined) add("description", input.description || null);
    if (input.status !== undefined) add("status", input.status);
    if (input.plannedStartDate !== undefined) add("planned_start_date", input.plannedStartDate);
    if (input.plannedFinishDate !== undefined) add("planned_finish_date", input.plannedFinishDate);
    if (input.budgetAmount !== undefined) add("budget_amount", input.budgetAmount);
    if (input.budgetCurrency !== undefined) add("budget_currency", input.budgetCurrency);
    if (input.sector !== undefined) add("sector", input.sector);
    if (input.deliveryMethod !== undefined) add("delivery_method", input.deliveryMethod);
    if (input.locationName !== undefined) add("location_name", input.locationName);

    values.push(tenantId, id);
    const result = await this.pool.query(
      `update projects set ${fields.join(", ")}, updated_at = now()
       where tenant_id = $${values.length - 1} and id = $${values.length}
       returning *`,
      values,
    );
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  }

  async deleteForTenant(tenantId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      "delete from projects where tenant_id = $1 and id = $2",
      [tenantId, id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
