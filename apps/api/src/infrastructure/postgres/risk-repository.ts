/**
 * PostgreSQL storage for the risk and issue register.
 *
 * Every statement is tenant-scoped, and the portfolio-wide reads narrow to the
 * caller's projects inside SQL: discarding rows afterwards still leaks their
 * existence through counts.
 */
import type pg from "pg";
import type { RiskRepository } from "../../application/risk-service.js";
import {
  severityOf,
  type CreateRiskInput,
  type RiskCategory,
  type RiskKind,
  type RiskListQuery,
  type RiskRecord,
  type RiskStatus,
  type RiskSummary,
  type UpdateRiskInput,
} from "../../domain/risk.js";

interface RiskRow {
  id: string;
  tenant_id: string;
  project_id: string;
  project_name: string;
  project_code: string;
  kind: RiskKind;
  title: string;
  description: string | null;
  category: RiskCategory;
  probability: number;
  impact: number;
  score: number;
  residual_probability: number | null;
  residual_impact: number | null;
  status: RiskStatus;
  mitigation: string | null;
  mitigation_task_id: string | null;
  mitigation_task_title: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  due_date: string | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRisk(row: RiskRow): RiskRecord {
  const record: RiskRecord = {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    projectName: row.project_name,
    projectCode: row.project_code,
    kind: row.kind,
    title: row.title,
    category: row.category,
    probability: row.probability,
    impact: row.impact,
    score: row.score,
    // Derived in one place so the register and the matrix cannot disagree.
    severity: severityOf(row.score),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
  if (row.description != null) record.description = row.description;
  if (row.residual_probability != null) record.residualProbability = row.residual_probability;
  if (row.residual_impact != null) record.residualImpact = row.residual_impact;
  if (row.residual_probability != null && row.residual_impact != null) {
    record.residualScore = row.residual_probability * row.residual_impact;
  }
  if (row.mitigation != null) record.mitigation = row.mitigation;
  if (row.mitigation_task_id != null) record.mitigationTaskId = row.mitigation_task_id;
  if (row.mitigation_task_title != null) record.mitigationTaskTitle = row.mitigation_task_title;
  if (row.owner_user_id != null) record.ownerUserId = row.owner_user_id;
  if (row.owner_name != null) record.ownerName = row.owner_name;
  if (row.due_date != null) record.dueDate = row.due_date;
  if (row.closed_at != null) record.closedAt = row.closed_at.toISOString();
  return record;
}

/** Shared projection so every read returns an identically shaped record. */
const RISK_SELECT = `
  select r.id, r.tenant_id, r.project_id, p.name as project_name, p.code as project_code,
         r.kind, r.title, r.description, r.category,
         r.probability, r.impact, r.score,
         r.residual_probability, r.residual_impact,
         r.status, r.mitigation, r.mitigation_task_id, mt.title as mitigation_task_title,
         r.owner_user_id, u.display_name as owner_name,
         r.due_date::text as due_date, r.closed_at, r.created_at, r.updated_at
    from risks r
    join projects p on p.id = r.project_id and p.tenant_id = r.tenant_id
    left join users u on u.id = r.owner_user_id and u.tenant_id = r.tenant_id
    left join tasks mt on mt.id = r.mitigation_task_id and mt.tenant_id = r.tenant_id`;

/** Highest exposure first: a register sorted by date buries what matters. */
const RISK_ORDER = `
  order by case when r.status in ('closed', 'accepted') then 1 else 0 end,
           r.score desc,
           r.due_date asc nulls last,
           r.created_at desc`;

export class PostgresRiskRepository implements RiskRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(
    tenantId: string,
    projectId: string,
    createdByUserId: string,
    input: CreateRiskInput,
  ): Promise<RiskRecord> {
    const inserted = await this.pool.query<{ id: string }>(
      `insert into risks (
         tenant_id, project_id, kind, title, description, category,
         probability, impact, status, mitigation, mitigation_task_id,
         owner_user_id, due_date, residual_probability, residual_impact,
         created_by_user_id
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       returning id`,
      [
        tenantId,
        projectId,
        input.kind,
        input.title,
        input.description ?? null,
        input.category,
        input.probability,
        input.impact,
        input.status,
        input.mitigation ?? null,
        input.mitigationTaskId ?? null,
        input.ownerUserId ?? null,
        input.dueDate ?? null,
        input.residualProbability ?? null,
        input.residualImpact ?? null,
        createdByUserId,
      ],
    );

    const risk = await this.findById(tenantId, inserted.rows[0]!.id);
    if (!risk) throw new Error("Risk disappeared immediately after insert.");
    return risk;
  }

  async findById(tenantId: string, riskId: string): Promise<RiskRecord | null> {
    const result = await this.pool.query<RiskRow>(
      `${RISK_SELECT} where r.tenant_id = $1 and r.id = $2 limit 1`,
      [tenantId, riskId],
    );
    return result.rows[0] ? mapRisk(result.rows[0]) : null;
  }

  /**
   * Builds the shared filter clause.
   *
   * Clause and values are appended together in one pass. Assembling them
   * separately is how a search query once bound a value its statement never
   * referenced, which Postgres rejects outright.
   */
  private buildFilters(query: RiskListQuery, callerUserId: string, values: unknown[]): string {
    const clauses: string[] = [];
    const add = (sql: (placeholder: string) => string, value: unknown) => {
      values.push(value);
      clauses.push(sql(`$${values.length}`));
    };

    if (query.projectId) add((p) => `r.project_id = ${p}`, query.projectId);
    if (query.kind) add((p) => `r.kind = ${p}`, query.kind);
    if (query.status) add((p) => `r.status = ${p}`, query.status);
    if (query.category) add((p) => `r.category = ${p}`, query.category);
    if (query.probability) add((p) => `r.probability = ${p}`, query.probability);
    if (query.impact) add((p) => `r.impact = ${p}`, query.impact);

    if (query.mine) add((p) => `r.owner_user_id = ${p}`, callerUserId);
    else if (query.ownerUserId) add((p) => `r.owner_user_id = ${p}`, query.ownerUserId);

    if (query.openOnly) clauses.push(`r.status not in ('closed', 'accepted')`);
    if (query.search) {
      add((p) => `(r.title ilike ${p} or r.description ilike ${p})`, `%${query.search}%`);
    }

    return clauses.length > 0 ? ` and ${clauses.join(" and ")}` : "";
  }

  async list(tenantId: string, query: RiskListQuery, callerUserId: string): Promise<RiskRecord[]> {
    const values: unknown[] = [tenantId];
    const filters = this.buildFilters(query, callerUserId, values);
    values.push(query.limit);

    const result = await this.pool.query<RiskRow>(
      `${RISK_SELECT} where r.tenant_id = $1${filters} ${RISK_ORDER} limit $${values.length}`,
      values,
    );
    return result.rows.map(mapRisk);
  }

  async listForMemberProjects(
    tenantId: string,
    query: RiskListQuery,
    callerUserId: string,
  ): Promise<RiskRecord[]> {
    const values: unknown[] = [tenantId, callerUserId];
    const filters = this.buildFilters(query, callerUserId, values);
    values.push(query.limit);

    const result = await this.pool.query<RiskRow>(
      `${RISK_SELECT}
        where r.tenant_id = $1
          and exists (
            select 1 from project_members m
             where m.tenant_id = r.tenant_id
               and m.project_id = r.project_id
               and m.user_id = $2
          )${filters}
       ${RISK_ORDER}
       limit $${values.length}`,
      values,
    );
    return result.rows.map(mapRisk);
  }

  async update(
    tenantId: string,
    riskId: string,
    input: UpdateRiskInput,
    closure: { closedAt: string | null } | null,
  ): Promise<RiskRecord | null> {
    const assignments: string[] = [];
    const values: unknown[] = [tenantId, riskId];

    // `undefined` leaves a value alone, `null` clears it, so presence is
    // tested with `in` rather than truthiness.
    const set = (column: string, value: unknown) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };

    if (input.kind !== undefined) set("kind", input.kind);
    if (input.title !== undefined) set("title", input.title);
    if ("description" in input) set("description", input.description ?? null);
    if (input.category !== undefined) set("category", input.category);
    if (input.probability !== undefined) set("probability", input.probability);
    if (input.impact !== undefined) set("impact", input.impact);
    if (input.status !== undefined) set("status", input.status);
    if ("mitigation" in input) set("mitigation", input.mitigation ?? null);
    if ("mitigationTaskId" in input) set("mitigation_task_id", input.mitigationTaskId ?? null);
    if ("ownerUserId" in input) set("owner_user_id", input.ownerUserId ?? null);
    if ("dueDate" in input) set("due_date", input.dueDate ?? null);
    if ("residualProbability" in input) set("residual_probability", input.residualProbability ?? null);
    if ("residualImpact" in input) set("residual_impact", input.residualImpact ?? null);
    if (closure) set("closed_at", closure.closedAt);

    if (assignments.length === 0) return this.findById(tenantId, riskId);

    const result = await this.pool.query(
      `update risks set ${assignments.join(", ")}, updated_at = now()
        where tenant_id = $1 and id = $2`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return null;
    return this.findById(tenantId, riskId);
  }

  async remove(tenantId: string, riskId: string): Promise<boolean> {
    const result = await this.pool.query("delete from risks where tenant_id = $1 and id = $2", [
      tenantId,
      riskId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Headline counts and the 5×5 grid in one round trip.
   *
   * The grid counts only live entries: a matrix that keeps counting closed
   * risks never empties, and stops describing the situation now.
   */
  async summarise(
    tenantId: string,
    projectId: string | undefined,
    callerUserId: string,
    scope: "all" | "member",
  ): Promise<RiskSummary> {
    const values: unknown[] = [tenantId];
    let scopeFilter = "";

    if (scope === "member") {
      values.push(callerUserId);
      scopeFilter += ` and exists (
        select 1 from project_members m
         where m.tenant_id = r.tenant_id and m.project_id = r.project_id and m.user_id = $${values.length}
      )`;
    }
    if (projectId) {
      values.push(projectId);
      scopeFilter += ` and r.project_id = $${values.length}`;
    }

    const totals = await this.pool.query<{
      total: string;
      critical_or_high: string;
      under_review: string;
      closed: string;
      occurred: string;
    }>(
      `select count(*)::text as total,
              count(*) filter (where r.score >= 10 and r.status not in ('closed','accepted'))::text as critical_or_high,
              count(*) filter (where r.status in ('assessing','mitigating'))::text as under_review,
              count(*) filter (where r.status in ('closed','accepted'))::text as closed,
              count(*) filter (where r.status = 'occurred')::text as occurred
         from risks r
        where r.tenant_id = $1${scopeFilter}`,
      values,
    );

    const grid = await this.pool.query<{ probability: number; impact: number; count: string }>(
      `select r.probability, r.impact, count(*)::text as count
         from risks r
        where r.tenant_id = $1
          and r.status not in ('closed','accepted')${scopeFilter}
        group by r.probability, r.impact`,
      values,
    );

    const row = totals.rows[0];
    return {
      total: Number(row?.total ?? 0),
      criticalOrHigh: Number(row?.critical_or_high ?? 0),
      underReview: Number(row?.under_review ?? 0),
      closed: Number(row?.closed ?? 0),
      occurred: Number(row?.occurred ?? 0),
      matrix: grid.rows.map((cell) => ({
        probability: cell.probability,
        impact: cell.impact,
        count: Number(cell.count),
      })),
    };
  }

  async isProjectMember(tenantId: string, projectId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `select 1 from project_members
        where tenant_id = $1 and project_id = $2 and user_id = $3 limit 1`,
      [tenantId, projectId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async taskBelongsToProject(
    tenantId: string,
    projectId: string,
    taskId: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      "select 1 from tasks where tenant_id = $1 and project_id = $2 and id = $3 limit 1",
      [tenantId, projectId, taskId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
