/**
 * PostgreSQL global search.
 *
 * Every predicate here comes from `search-sql.ts`, which is the same module the
 * projects, tasks, risks, activity and team searches now use. Before that there
 * were six implementations and they disagreed: this one was indexed and ranked
 * while the pages used `ilike '%term%'`, so the same word typed into two boxes
 * gave two different answers and only one of them could use an index.
 *
 * Each search runs in two stages. The precise stage answers with full-text
 * matches, ranked. Only if it finds nothing does the forgiving stage run, and
 * that ordering is what keeps an exclusion honest — a fuzzy pass running
 * alongside re-admits the rows the person just excluded, because a near-miss is
 * still near even after `-metro` said to drop it.
 */
import type pg from "pg";
import type { SearchRepository, SearchResult } from "../../application/search-service.js";
import { buildSearchClause, type SearchMode } from "./search-sql.js";

export class PostgresSearchRepository implements SearchRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Runs the precise stage, then the forgiving one only if it found nothing.
   *
   * The two-stage decision lives here rather than inside one SQL statement
   * because "did anything match?" is a question about the whole result set. Ask
   * it as a subquery and the subquery has to repeat the caller's tenant and
   * permission filters — or, far worse, quietly not repeat them.
   */
  private async inTwoStages<T>(
    run: (mode: SearchMode) => Promise<T[]>,
  ): Promise<T[]> {
    const exact = await run("exact");
    if (exact.length > 0) return exact;
    return run("fuzzy");
  }

  async searchProjects(
    tenantId: string,
    userId: string,
    term: string,
    limit: number,
    scope: "all" | "member",
  ): Promise<SearchResult[]> {
    return this.inTwoStages(async (mode) => {
      const clause = buildSearchClause(term, "p.search_document", "coalesce(p.name, '')", 2, mode);
      if (!clause) return [];

      /*
       * Scoped exactly as tasks and risks already were. This block was the odd
       * one out: it took no user and no scope, so the palette returned every
       * project in the company to anybody who could search — including the
       * codes of jobs they had no part in, which are often a client's name.
       * The file's own opening comment promised the opposite.
       */
      const values: unknown[] = [tenantId, ...clause.values];
      let membershipFilter = "";

      if (scope === "member") {
        values.push(userId);
        membershipFilter = `and exists (
               select 1 from project_members m
                where m.tenant_id = p.tenant_id
                  and m.project_id = p.id
                  and m.user_id = $${values.length}
             )`;
      }

      values.push(limit);
      const result = await this.pool.query<{ id: string; name: string; code: string }>(
        `select p.id, p.name, p.code
           from projects p
          where p.tenant_id = $1
            and ${clause.where}
            ${membershipFilter}
          order by ${clause.rank} desc, p.name asc
          limit $${values.length}`,
        values,
      );

      return result.rows.map((row) => ({
        kind: "project" as const,
        id: row.id,
        title: row.name,
        subtitle: row.code,
        href: `/projects/${row.id}`,
      }));
    });
  }

  async searchTasks(
    tenantId: string,
    userId: string,
    term: string,
    limit: number,
    scope: "all" | "member",
  ): Promise<SearchResult[]> {
    return this.inTwoStages(async (mode) => {
      const clause = buildSearchClause(term, "t.search_document", "coalesce(t.title, '')", 2, mode);
      if (!clause) return [];

      /*
       * Values and placeholders are built together. Assembling the clause
       * separately from the array is how the two previously fell out of step:
       * an empty filter left `$4` unused while a fourth value was still bound,
       * and Postgres rejected every such query.
       */
      const values: unknown[] = [tenantId, ...clause.values];
      let membershipFilter = "";

      if (scope === "member") {
        values.push(userId);
        membershipFilter = `and exists (
               select 1 from project_members m
                where m.tenant_id = t.tenant_id
                  and m.project_id = t.project_id
                  and m.user_id = $${values.length}
             )`;
      }

      values.push(limit);

      const result = await this.pool.query<{
        id: string;
        title: string;
        project_id: string;
        project_name: string;
      }>(
        `select t.id, t.title, t.project_id, p.name as project_name
           from tasks t
           join projects p on p.id = t.project_id and p.tenant_id = t.tenant_id
          where t.tenant_id = $1
            and ${clause.where}
            ${membershipFilter}
          order by ${clause.rank} desc, t.updated_at desc
          limit $${values.length}`,
        values,
      );

      return result.rows.map((row) => ({
        kind: "task" as const,
        id: row.id,
        title: row.title,
        subtitle: row.project_name,
        href: `/tasks?projectId=${row.project_id}`,
      }));
    });
  }

  async searchRisks(
    tenantId: string,
    userId: string,
    term: string,
    limit: number,
    scope: "all" | "member",
  ): Promise<SearchResult[]> {
    return this.inTwoStages(async (mode) => {
      const clause = buildSearchClause(term, "r.search_document", "coalesce(r.title, '')", 2, mode);
      if (!clause) return [];

      const values: unknown[] = [tenantId, ...clause.values];
      let membershipFilter = "";

      if (scope === "member") {
        values.push(userId);
        membershipFilter = `and exists (
               select 1 from project_members m
                where m.tenant_id = r.tenant_id
                  and m.project_id = r.project_id
                  and m.user_id = $${values.length}
             )`;
      }

      values.push(limit);

      const result = await this.pool.query<{
        id: string;
        title: string;
        project_id: string;
        project_name: string;
      }>(
        `select r.id, r.title, r.project_id, p.name as project_name
           from risks r
           join projects p on p.id = r.project_id and p.tenant_id = r.tenant_id
          where r.tenant_id = $1
            and ${clause.where}
            ${membershipFilter}
          order by ${clause.rank} desc, r.updated_at desc
          limit $${values.length}`,
        values,
      );

      return result.rows.map((row) => ({
        kind: "risk" as const,
        id: row.id,
        title: row.title,
        subtitle: row.project_name,
        href: `/risks?projectId=${row.project_id}`,
      }));
    });
  }

  async searchPeople(tenantId: string, term: string, limit: number): Promise<SearchResult[]> {
    return this.inTwoStages(async (mode) => {
      const clause = buildSearchClause(
        term,
        "search_document",
        "coalesce(display_name, '')",
        2,
        mode,
      );
      if (!clause) return [];

      const values: unknown[] = [tenantId, ...clause.values, limit];
      const result = await this.pool.query<{ id: string; display_name: string; email: string }>(
        `select id, display_name, email
           from users
          where tenant_id = $1
            and ${clause.where}
          order by ${clause.rank} desc, display_name asc
          limit $${values.length}`,
        values,
      );

      return result.rows.map((row) => ({
        kind: "person" as const,
        id: row.id,
        title: row.display_name,
        subtitle: row.email,
        href: `/team`,
      }));
    });
  }
}
