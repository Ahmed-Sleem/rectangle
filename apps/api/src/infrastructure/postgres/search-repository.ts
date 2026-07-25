/**
 * PostgreSQL global search.
 *
 * Prefix and substring matching with `ilike`, which is adequate for a palette
 * over a company's own records. Full-text ranking is a later concern; adding
 * it now would mean a search index to keep in step with three tables for no
 * benefit at this size.
 */
import type pg from "pg";
import type { SearchRepository, SearchResult } from "../../application/search-service.js";

/**
 * Escapes a user's term so `%` and `_` are matched literally.
 *
 * Without this, typing `%` matches every record and the palette looks broken;
 * the value is still bound as a parameter, so this is about correctness rather
 * than injection.
 */
function likeTerm(term: string): string {
  return `%${term.replace(/([\\%_])/gu, "\\$1")}%`;
}

export class PostgresSearchRepository implements SearchRepository {
  constructor(private readonly pool: pg.Pool) {}

  async searchProjects(tenantId: string, term: string, limit: number): Promise<SearchResult[]> {
    const result = await this.pool.query<{ id: string; name: string; code: string }>(
      `select id, name, code
         from projects
        where tenant_id = $1 and (name ilike $2 or code ilike $2 or location_name ilike $2)
        order by name asc
        limit $3`,
      [tenantId, likeTerm(term), limit],
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
    // Membership scoping happens in the query for the same reason the task
    // list does it there: filtering afterwards still reveals what exists.
    const membershipFilter =
      scope === "member"
        ? `and exists (
             select 1 from project_members m
              where m.tenant_id = t.tenant_id and m.project_id = t.project_id and m.user_id = $4
           )`
        : "";

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
          and t.title ilike $2
          ${membershipFilter}
        order by t.updated_at desc
        limit $3`,
      [tenantId, likeTerm(term), limit, userId],
    );

    return result.rows.map((row) => ({
      kind: "task" as const,
      id: row.id,
      title: row.title,
      subtitle: row.project_name,
      href: `/tasks?projectId=${row.project_id}`,
    }));
  }

  async searchPeople(tenantId: string, term: string, limit: number): Promise<SearchResult[]> {
    const result = await this.pool.query<{ id: string; display_name: string; email: string }>(
      `select id, display_name, email
         from users
        where tenant_id = $1 and (display_name ilike $2 or email ilike $2)
        order by display_name asc
        limit $3`,
      [tenantId, likeTerm(term), limit],
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
