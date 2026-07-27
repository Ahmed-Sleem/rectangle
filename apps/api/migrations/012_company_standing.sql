-- The authorization model was two half-built models that contradicted each other.
--
-- `tenant_user_roles` had a primary key of (tenant_id, user_id, role), so one
-- person could hold several company roles at once. Nothing reconciled them, and
-- three faults followed:
--
--   1. Every user created through the Team page was inserted as 'viewer'
--      literally, and no code anywhere else ever wrote to this table. An owner
--      could not promote anybody, through any screen, ever.
--   2. The seeded "Owner" user type carries every permission, so assigning it
--      produced a person whose company role read 'viewer' and whose effective
--      permissions were everything. That is the "viewer and owner at the same
--      time" contradiction, and it resolved to full access.
--   3. The table allowed 'project_manager', 'viewer' and friends — the same
--      names as `project_members.role`, which is per project. Holding one here
--      granted it across *every* project in the company, silently, defeating
--      the per-project membership that already worked correctly.
--
-- This migration replaces the set with a single **standing** per person, so the
-- contradiction becomes impossible in the schema rather than discouraged in the
-- interface. Project roles stay where they belong: on the project.
--
-- Statement order matters and is the reason this file failed once already. The
-- constraint permitting the new values must be in place *before* any statement
-- writes one. The first version mapped the old names to the new ones and only
-- then swapped the constraint, so the very first UPDATE was rejected by the
-- constraint it was about to replace. The whole file runs inside one
-- transaction opened by the migration runner, so either all of this applies or
-- none of it does.

-- Step 1: widen the constraint first, so both the old and the new vocabulary
-- are legal while the data is being moved between them. Nothing is relaxed
-- permanently — step 5 narrows it to the final set once no old value remains.
alter table tenant_user_roles drop constraint if exists tenant_user_roles_role_check;

alter table tenant_user_roles
  add constraint tenant_user_roles_role_check
  check (role in (
    'owner', 'admin', 'member', 'guest',
    'tenant_owner', 'tenant_admin', 'project_admin', 'project_manager',
    'controls_manager', 'viewer', 'external_collaborator'
  ));

-- Step 2: collapse each person to their most capable role before the primary
-- key stops allowing more than one.
create or replace function rectangle_standing_rank(role_name text) returns int as $$
  select case role_name
    when 'tenant_owner' then 4
    when 'owner' then 4
    when 'tenant_admin' then 3
    when 'admin' then 3
    when 'external_collaborator' then 1
    when 'guest' then 1
    else 2
  end;
$$ language sql immutable;

delete from tenant_user_roles a
 using tenant_user_roles b
 where a.tenant_id = b.tenant_id
   and a.user_id = b.user_id
   and (
     rectangle_standing_rank(a.role) < rectangle_standing_rank(b.role)
     or (rectangle_standing_rank(a.role) = rectangle_standing_rank(b.role) and a.role > b.role)
   );

-- Step 3: move to the new vocabulary. Everything that is not owner or admin
-- becomes a member: the project-scoped roles granted only projects.read and
-- projects.manage, which a user type can carry explicitly. External
-- collaborators become guests.
update tenant_user_roles
   set role = case
     when role = 'tenant_owner' then 'owner'
     when role = 'tenant_admin' then 'admin'
     when role = 'external_collaborator' then 'guest'
     else 'member'
   end
 where role not in ('owner', 'admin', 'member', 'guest');

drop function if exists rectangle_standing_rank(text);

-- Step 4: one row per person. This is the line that makes "viewer and owner at
-- once" unrepresentable rather than merely discouraged.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'tenant_user_roles_pkey'
       and conrelid = 'tenant_user_roles'::regclass
  ) then
    alter table tenant_user_roles drop constraint tenant_user_roles_pkey;
  end if;
end $$;

alter table tenant_user_roles
  add constraint tenant_user_roles_pkey primary key (tenant_id, user_id);

-- Anyone with no row at all predates this and is a member; the join that reads
-- authority would otherwise return an empty standing and refuse them everything.
insert into tenant_user_roles (tenant_id, user_id, role)
select u.tenant_id, u.id, 'member'
  from users u
 where not exists (
   select 1 from tenant_user_roles r
    where r.tenant_id = u.tenant_id and r.user_id = u.id
 );

-- A company must always have somebody who can administer it. If the collapse
-- above left a tenant with no owner — only possible for data that was already
-- inconsistent — promote its earliest admin, and failing that its earliest user.
with ownerless as (
  select t.id as tenant_id
    from tenants t
   where not exists (
     select 1 from tenant_user_roles r
      where r.tenant_id = t.id and r.role = 'owner'
   )
),
candidate as (
  select distinct on (o.tenant_id) o.tenant_id, u.id as user_id
    from ownerless o
    join users u on u.tenant_id = o.tenant_id and u.status = 'active'
    left join tenant_user_roles r on r.tenant_id = u.tenant_id and r.user_id = u.id
   order by o.tenant_id, (r.role = 'admin') desc nulls last, u.created_at asc
)
update tenant_user_roles r
   set role = 'owner'
  from candidate c
 where r.tenant_id = c.tenant_id and r.user_id = c.user_id;

-- Step 5: narrow the constraint to the final set, now that no legacy value
-- survives. Verified rather than assumed: if anything unexpected remains the
-- constraint will refuse to validate and the whole transaction rolls back,
-- which is the correct outcome — a half-migrated authorization table is worse
-- than a failed deploy.
alter table tenant_user_roles drop constraint if exists tenant_user_roles_role_check;

alter table tenant_user_roles
  add constraint tenant_user_roles_role_check
  check (role in ('owner', 'admin', 'member', 'guest'));
