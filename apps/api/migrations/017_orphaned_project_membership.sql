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
 where not exists (
   select 1
     from project_members existing
    where existing.tenant_id = p.tenant_id
      and existing.project_id = p.id
 )
on conflict (project_id, user_id) do nothing;

-- Left deliberately unsolved in SQL: a company with no owner or administrator
-- at all. That cannot arise through the product — the first account created is
-- an owner and the last owner cannot be demoted — and inventing a member for
-- such a company would be guessing at who should hold the work.
