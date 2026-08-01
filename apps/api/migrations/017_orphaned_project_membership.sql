-- A project with no members became invisible, and there was no way back.
--
-- Reading a project now requires reach: you are a company owner or
-- administrator, you hold `projects.manage_all`, or you are a member of it.
-- That rule is right, and it exposed something the previous rules had hidden.
--
-- Projects created before the creator was automatically enrolled have **no rows
-- at all** in `project_members`. Under the old behaviour that cost nothing,
-- because reading a project only asked for the `projects.read` permission and
-- scoped by tenant. Under the correct rule those projects are reachable only by
-- people who reach everything, and `projects` carries no `created_by` column,
-- so there is nothing in the schema that can say who the project belonged to.
--
-- The trap is that the repair is unreachable through the product. Adding
-- somebody to a project requires `project_team.manage` on that project, which
-- requires reaching it, which is the thing that is missing. A company whose
-- owner account was disabled would have work nobody could ever open again.
--
-- So every memberless project is given the company's owners and administrators
-- as project administrators. Three reasons that is the right set:
--
--   * they can already reach every project through their standing, so this
--     grants no visibility that did not exist a moment ago — it only writes
--     down what was already true, which is what makes it safe;
--   * `project_admin` is the one role that can add other people, so the real
--     team can be put back through the interface rather than through SQL;
--   * it is the smallest set that guarantees somebody. Enrolling every member
--     of the company would hand every old project to everybody, recreating
--     precisely the disclosure this release closed.
--
-- Idempotent by construction. It only considers projects that currently have no
-- members, and `on conflict do nothing` covers the race where two deploys run
-- it at once. Re-running it after a team has been assembled changes nothing,
-- because such a project is no longer memberless.

insert into project_members (tenant_id, project_id, user_id, role)
select p.tenant_id, p.id, r.user_id, 'project_admin'
  from projects p
  join tenant_user_roles r
    on r.tenant_id = p.tenant_id
   and r.role in ('owner', 'admin')
  join users u
    on u.tenant_id = r.tenant_id
   and u.id = r.user_id
   -- Active accounts only. `findActiveSession` requires `u.status = 'active'`
   -- on every request, so enrolling a disabled owner writes a name into the
   -- project team that can never open it — leaving the project exactly as
   -- unreachable as before while appearing to have been repaired.
   and u.status = 'active'
 where not exists (
   select 1
     from project_members existing
    where existing.tenant_id = p.tenant_id
      and existing.project_id = p.id
 )
on conflict (project_id, user_id) do nothing;

-- The company whose owners and administrators are all disabled.
--
-- The statement above deliberately skips disabled accounts, which leaves that
-- company exactly where it started: a project nobody can open. It is a narrow
-- case and it has an obvious least-bad answer — the longest-standing active
-- person in the company, who in a firm small enough for this to happen is the
-- person actually running the work.
--
-- `not exists` again rather than a different condition, so this pass only sees
-- projects the first one could not repair, and re-running remains a no-op.
insert into project_members (tenant_id, project_id, user_id, role)
select p.tenant_id, p.id, fallback.id, 'project_admin'
  from projects p
  cross join lateral (
    select u.id
      from users u
     where u.tenant_id = p.tenant_id
       and u.status = 'active'
     order by u.created_at asc, u.id asc
     limit 1
  ) as fallback
 where not exists (
   select 1
     from project_members existing
    where existing.tenant_id = p.tenant_id
      and existing.project_id = p.id
 )
on conflict (project_id, user_id) do nothing;

-- Still unsolved, and correctly so: a company with no active people at all.
-- There is nobody to give the work to, and inventing an account would be worse
-- than leaving a dormant company dormant. It resolves itself the moment
-- somebody is re-enabled, because this migration runs on every boot.
