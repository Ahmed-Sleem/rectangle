/**
 * PostgreSQL Projects repository enforces tenant-scoped queries in every SQL
 * statement so project data cannot cross tenant boundaries by accident.
 */
import type pg from "pg";
import type { ProjectsRepository } from "../../application/project-service.js";
import type { CreateProjectInput, ProjectListQuery, ProjectRecord, UpdateProjectInput } from "../../domain/project.js";

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
  return project;
}


export class PostgresProjectsRepository implements ProjectsRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(tenantId: string, input: CreateProjectInput): Promise<ProjectRecord> {
    const result = await this.pool.query(
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
    const result = await this.pool.query("select * from projects where tenant_id = $1 and id = $2 limit 1", [tenantId, id]);
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  }

  async listForTenant(tenantId: string, query: ProjectListQuery): Promise<ProjectRecord[]> {
    const values: unknown[] = [tenantId];
    const where = ["tenant_id = $1"];

    if (query.status) {
      values.push(query.status);
      where.push(`status = $${values.length}`);
    }
    if (query.search) {
      values.push(`%${query.search}%`);
      where.push(`(name ilike $${values.length} or code ilike $${values.length} or location_name ilike $${values.length})`);
    }
    if (query.cursor) {
      values.push(query.cursor);
      where.push(`id > $${values.length}`);
    }
    values.push(query.limit);

    const result = await this.pool.query(
      `select * from projects where ${where.join(" and ")} order by id asc limit $${values.length}`,
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
}
