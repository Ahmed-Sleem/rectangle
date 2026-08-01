/**
 * The people register in SQL.
 *
 * Both queries are the same shape and differ in one clause, so they are built
 * from one statement rather than written twice: the company register lists
 * everybody in the tenant, and the colleague register lists the people who
 * share a project with the caller. Keeping them as two hand-written queries
 * would mean the project scoping — the part that must not be got wrong — has
 * two chances to drift.
 *
 * Every aggregate is bounded by the viewer's reach, not the subject's. A row
 * describes what the viewer is allowed to know about that person, which is not
 * the same as what is true about them.
 */
import type pg from "pg";
import type {
  DirectoryPerson,
  DirectoryReach,
  DirectoryRepository,
} from "../../application/directory-service.js";

interface PersonRow {
  id: string;
  display_name: string;
  email: string;
  status: DirectoryPerson["status"];
  standing: DirectoryPerson["standing"];
  projects: Array<{ id: string; name: string; code: string; role: string; shared: boolean }> | null;
  shared_project_count: number;
  open_task_count: number;
  permissions: string[] | null;
}

/** Work that is neither finished nor abandoned, and so is still somebody's. */
const OPEN_TASK_STATUSES = "('todo', 'in_progress', 'blocked', 'in_review')";

export class PostgresDirectoryRepository implements DirectoryRepository {
  constructor(private readonly pool: pg.Pool) {}

  listCompanyDirectory(tenantId: string, reach: DirectoryReach): Promise<DirectoryPerson[]> {
    return this.list(tenantId, reach, "company");
  }

  listColleagues(tenantId: string, reach: DirectoryReach): Promise<DirectoryPerson[]> {
    return this.list(tenantId, reach, "colleagues");
  }

  private async list(
    tenantId: string,
    reach: DirectoryReach,
    register: "company" | "colleagues",
  ): Promise<DirectoryPerson[]> {
    const values: unknown[] = [tenantId, reach.userId];

    /*
     * Which projects the VIEWER may see. Everything else in the statement hangs
     * off this, so the subject's own membership never widens it: a person may
     * be on ten projects and still show two here, because two is what the
     * viewer is entitled to know about.
     */
    const visibleProjects = reach.all
      ? "select id from projects where tenant_id = $1"
      : `select p.id from projects p
          where p.tenant_id = $1
            and exists (
              select 1 from project_members vm
               where vm.tenant_id = p.tenant_id and vm.project_id = p.id and vm.user_id = $2
            )`;

    /*
     * The colleague register is "shares a project with me", which is narrower
     * than "is on a project I can see" — an administrator can see every
     * project, but the people on them are not thereby their colleagues. So it
     * asks about the viewer's own membership directly, never about reach.
     */
    const membershipFilter =
      register === "colleagues"
        ? `and u.id <> $2
           and exists (
             select 1
               from project_members mine
               join project_members theirs
                 on theirs.tenant_id = mine.tenant_id and theirs.project_id = mine.project_id
              where mine.tenant_id = u.tenant_id
                and mine.user_id = $2
                and theirs.user_id = u.id
           )`
        : "";

    const result = await this.pool.query<PersonRow>(
      `with visible as (${visibleProjects})
       select u.id,
              u.display_name,
              u.email,
              u.status,
              coalesce(standing.role, 'none') as standing,
              /*
               * Ordered by name so the list is stable between requests: an
               * unordered aggregate is free to reshuffle, and a profile whose
               * projects move on every refresh reads as broken.
               */
              (
                select coalesce(
                  json_agg(
                    json_build_object(
                      'id', pr.id, 'name', pr.name, 'code', pr.code,
                      'role', pm.role, 'shared', shared.is_shared
                    ) order by pr.name
                  ),
                  '[]'
                )
                  from project_members pm
                  join projects pr on pr.tenant_id = pm.tenant_id and pr.id = pm.project_id
                 cross join lateral (
                   select exists (
                     select 1 from project_members v
                      where v.tenant_id = pm.tenant_id and v.project_id = pm.project_id
                        and v.user_id = $2
                   ) as is_shared
                 ) as shared
                 where pm.tenant_id = u.tenant_id
                   and pm.user_id = u.id
                   and pm.project_id in (select id from visible)
              ) as projects,
              (
                select count(*)::int
                  from project_members pm
                 where pm.tenant_id = u.tenant_id and pm.user_id = u.id
                   and exists (
                     select 1 from project_members v
                      where v.tenant_id = pm.tenant_id and v.project_id = pm.project_id
                        and v.user_id = $2
                   )
              ) as shared_project_count,
              (
                -- Open work only, and only on projects the viewer may see, so
                -- the figure never implies work behind a door they cannot open.
                select count(*)::int
                  from tasks t
                 where t.tenant_id = u.tenant_id
                   and t.assignee_user_id = u.id
                   and t.status in ${OPEN_TASK_STATUSES}
                   and t.project_id in (select id from visible)
              ) as open_task_count,
              (
                -- The administrative half of the row, so the page needs one
                -- register rather than two lists of the same people.
                select coalesce(array_agg(p.permission order by p.permission), '{}')
                  from user_permissions p
                 where p.tenant_id = u.tenant_id and p.user_id = u.id
              ) as permissions
         from users u
         left join tenant_user_roles standing
           on standing.tenant_id = u.tenant_id and standing.user_id = u.id
        where u.tenant_id = $1
          ${membershipFilter}
        order by u.display_name asc`,
      values,
    );

    return result.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      status: row.status,
      standing: row.standing,
      projects: (row.projects ?? []).map((project) => ({
        id: project.id,
        name: project.name,
        code: project.code,
        role: project.role,
        sharedWithViewer: project.shared,
      })),
      sharedProjectCount: Number(row.shared_project_count ?? 0),
      openTaskCount: Number(row.open_task_count ?? 0),
      permissions: row.permissions ?? [],
    }));
  }
}
