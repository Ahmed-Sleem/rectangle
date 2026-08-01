-- Permissions belong to a person, not to a role they happen to hold.
--
-- Until now a person's company-wide authority came from two places at once: a
-- standing (owner/admin/member/guest), which silently granted all 27
-- permissions or none of them, and a set of user types, each carrying a bundle.
-- Neither was visible where the decision was made. Choosing "Project office"
-- for a site engineer handed them `projects.manage_all` — every project in the
-- company — because that permission was buried inside a bundle nobody opens.
--
-- The model is now the simple one it should always have been. A permission is
-- granted to a person, directly, and that grant is the whole truth. A "role" is
-- demoted to what it actually is: a saved list somebody assembled to avoid
-- ticking the same twenty boxes for the twentieth site engineer. It grants
-- nothing at runtime; it only prefills the form.
--
-- One standing survives. The account that sets the company up holds everything,
-- and a company must always have one, or the first bad edit locks everybody out
-- of their own data with no way back. Everything else is ticked or it is not.
--
-- Statement order is deliberate, and migration 012 is the reason: it once wrote
-- values before widening the constraint that governed them and the first UPDATE
-- was rejected by the constraint it was about to replace. Here the grants are
-- copied out of the bundles BEFORE anything stops reading bundles, so no
-- window exists in which a person has lost their access.

-- Step 1: somewhere for a grant to live.
create table if not exists user_permissions (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  permission text not null check (char_length(permission) between 3 and 64),
  -- Who granted it and when. An access question asked six months later is
  -- unanswerable without this, and the audit trail records the change but not
  -- the resulting state.
  granted_at timestamptz not null default now(),
  granted_by_user_id uuid references users(id) on delete set null,
  primary key (tenant_id, user_id, permission),
  -- Cross-tenant grants are unrepresentable rather than merely discouraged.
  constraint user_permissions_user_tenant_fk
    foreign key (user_id, tenant_id) references users (id, tenant_id) on delete cascade
);

create index if not exists user_permissions_user_idx
  on user_permissions (tenant_id, user_id);

-- Step 2: copy what everybody effectively holds today, before bundles stop
-- granting. A person keeps exactly the access they had this morning.
--
-- Owners and administrators are deliberately NOT expanded here. Their authority
-- came from standing, and step 3 preserves that for owners; expanding it into
-- 27 rows would make a later permission addition silently miss them.
insert into user_permissions (tenant_id, user_id, permission, granted_by_user_id)
select distinct a.tenant_id, a.user_id, p.permission, null::uuid
  from user_type_assignments a
  join user_types t
    on t.tenant_id = a.tenant_id and t.id = a.user_type_id
  cross join lateral unnest(t.permissions) as p(permission)
  join users u
    on u.tenant_id = a.tenant_id and u.id = a.user_id
 where not exists (
   select 1 from tenant_user_roles r
    where r.tenant_id = a.tenant_id
      and r.user_id = a.user_id
      and r.role in ('owner', 'admin')
 )
on conflict (tenant_id, user_id, permission) do nothing;

-- Step 3: administrators become owners.
--
-- `admin` granted every permission by standing, exactly as `owner` did, so the
-- two were the same authority under two names. Collapsing them loses nothing.
-- Demoting them to a permission list instead would be the one change here that
-- could remove somebody's access, which this migration must never do.
update tenant_user_roles set role = 'owner' where role = 'admin';

-- Step 4: everybody else has no standing at all. Their access is the rows
-- written in step 2 and nothing else — which is the entire point.
delete from tenant_user_roles where role in ('member', 'guest');

-- Step 5: narrow the constraint now that no other value remains.
alter table tenant_user_roles drop constraint if exists tenant_user_roles_role_check;

alter table tenant_user_roles
  add constraint tenant_user_roles_role_check
  check (role in ('owner'));

-- Step 6: a company must never be left without an owner. If the only owner was
-- somehow removed, promote the longest-standing active person rather than
-- leaving the company unadministrable.
insert into tenant_user_roles (tenant_id, user_id, role)
select t.id, fallback.id, 'owner'
  from tenants t
  cross join lateral (
    select u.id
      from users u
     where u.tenant_id = t.id and u.status = 'active'
     order by u.created_at asc, u.id asc
     limit 1
  ) as fallback
 where not exists (
   select 1 from tenant_user_roles r where r.tenant_id = t.id and r.role = 'owner'
 )
on conflict (tenant_id, user_id) do nothing;

-- Step 7: bundles stop being system objects. They were seeded with three
-- hardcoded sets — Full access, Project office, Read only — and a company was
-- expected to pick one for every person. They are now saved lists a company
-- assembles for itself, so nothing is protected from editing or deletion.
update user_types set system_type = false where system_type = true;

comment on table user_permissions is
  'Company-wide permissions granted directly to a person. The whole truth about '
  'what somebody may do, except the owner standing which grants everything.';

comment on table user_types is
  'A saved list of permissions, used to prefill the form when granting access to '
  'a person. Grants nothing by itself.';
