/**
 * PostgreSQL global search.
 *
 * Matching runs against the `search_document` columns maintained by the
 * database on write, so a record is findable the moment it exists and there is
 * no separate index to fall out of step. The previous `ilike '%term%'` could
 * not use an index at all — a leading wildcard forces a sequential scan of
 * every row on every keystroke.
 *
 * Results are ranked rather than returned in table order, because the first
 * row is the one a palette user is about to press Enter on.
 */
import type pg from "pg";
import type { SearchRepository, SearchResult } from "../../application/search-service.js";

/**
 * Builds a prefix query from free text.
 *
 * `to_tsquery` rejects punctuation and bare operators, so the term is reduced
 * to word characters and rejoined with AND. Each word gets `:*` so the last
 * one still matches while it is being typed.
 */
function prefixQuery(term: string): string {
  const words = term
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => `${word}:*`);
  return words.join(" & ");
}

export class PostgresSearchRepository implements SearchRepository {
  constructor(private readonly pool: pg.Pool) {}

  async searchProjects(tenantId: string, term: string, limit: number): Promise<SearchResult[]> {
    const query = prefixQuery(term);
    // A term of only punctuation produces no query, which `to_tsquery` would
    // reject outright rather than treat as "match nothing".
    if (!query) return [];

    const result = await this.pool.query<{ id: string; name: string; code: string }>(
      `select id, name, code
         from projects
        where tenant_id = $1
          and search_document @@ to_tsquery('simple', $2)
        order by ts_rank_cd(search_document, to_tsquery('simple', $2)) desc, name asc
        limit $3`,
      [tenantId, query, limit],
    );

    return result.rows.map((row) => ({
      kind: "project" as const,
      id: row.id,
      title: row.name,
      subtitle: row.code,
      href: `/projects/${row.id}`,
    }));
  }

  async searchTasks(
    tenantId: string,
    userId: string,
    term: string,
    limit: number,
    scope: "all" | "member",
  ): Promise<SearchResult[]> {
    const query = prefixQuery(term);
    if (!query) return [];

    // Values and placeholders are built together. Assembling the clause
    // separately from the array is how the two previously fell out of step:
    // an empty filter left `$4` unused while a fourth value was still bound,
    // and Postgres rejected every such query.
    const values: unknown[] = [tenantId, query];
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
    const limitPlaceholder = `$${values.length}`;

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
          and t.search_document @@ to_tsquery('simple', $2)
          ${membershipFilter}
        order by ts_rank_cd(t.search_document, to_tsquery('simple', $2)) desc,
                 t.updated_at desc
        limit ${limitPlaceholder}`,
      values,
    );

    return result.rows.map((row) => ({
      kind: "task" as const,
      id: row.id,
      title: row.title,
      subtitle: row.project_name,
      href: `/tasks?projectId=${row.project_id}`,
    }));
  }

  async searchRisks(
    tenantId: string,
    userId: string,
    term: string,
    limit: number,
    scope: "all" | "member",
  ): Promise<SearchResult[]> {
    const query = prefixQuery(term);
    if (!query) return [];

    const values: unknown[] = [tenantId, query];
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
    const limitPlaceholder = `$${values.length}`;

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
          and r.search_document @@ to_tsquery('simple', $2)
          ${membershipFilter}
        order by ts_rank_cd(r.search_document, to_tsquery('simple', $2)) desc,
                 r.score desc
        limit ${limitPlaceholder}`,
      values,
    );

    return result.rows.map((row) => ({
      kind: "risk" as const,
      id: row.id,
      title: row.title,
      subtitle: row.project_name,
      href: `/risks?projectId=${row.project_id}`,
    }));
  }

  async searchPeople(tenantId: string, term: string, limit: number): Promise<SearchResult[]> {
    const query = prefixQuery(term);
    if (!query) return [];

    const result = await this.pool.query<{ id: string; display_name: string; email: string }>(
      `select id, display_name, email
         from users
        where tenant_id = $1
          and search_document @@ to_tsquery('simple', $2)
        order by ts_rank_cd(search_document, to_tsquery('simple', $2)) desc, display_name asc
        limit $3`,
      [tenantId, query, limit],
    );

    return result.rows.map((row) => ({
      kind: "person" as const,
      id: row.id,
      title: row.display_name,
      subtitle: row.email,
      href: "/team",
    }));
  }
}

/** Exported for the test that proves queries bind exactly what they reference. */
export const searchInternals = { prefixQuery };
