-- Four project roles, named after what people actually say.
--
-- A project used to have five roles: project_admin, project_manager,
-- controls_manager, viewer and external_collaborator. Two of them granted
-- identical sets, so "admin" and "manager" were the same appointment under two
-- names and nobody could say which to pick. controls_manager and
-- external_collaborator were shapes of a business that had not been asked for:
-- one company's controls manager is another's planner, and an external
-- collaborator who can read tasks and nothing else cannot do the one thing
-- externals are invited to do, which is comment on their own work.
--
-- What remains is the structure of an actual site team. The person who created
-- the project owns it: they may delete it and decide who else runs it. A
-- manager runs everything inside the project but cannot destroy it and cannot
-- change who runs it — those two are precisely the acts that must stay with
-- whoever is accountable for the project existing. A member does the work. A
-- viewer watches.
--
-- Mapping is by authority held, never by name. project_admin and
-- project_manager both administered a project, so both become owners: demoting
-- either would take away an appointment somebody is relying on today, and this
-- migration must never remove access. controls_manager could create and edit
-- tasks and risks, which is exactly what a member does now. external_collaborator
-- could only read, which is a viewer.

alter table project_members drop constraint if exists project_members_role_check;

update project_members
   set role = case role
     when 'project_admin' then 'owner'
     when 'project_manager' then 'owner'
     when 'controls_manager' then 'member'
     when 'external_collaborator' then 'viewer'
     else role
   end;

alter table project_members
  add constraint project_members_role_check
  check (role in ('owner', 'manager', 'member', 'viewer'));

-- Every project must have an owner, for the same reason every company must.
-- A project whose only administrator was deleted cannot otherwise be given a
-- new one by anybody except a company owner, and the site team is left unable
-- to add their own people to their own project.
--
-- The longest-standing member is promoted rather than an arbitrary one: they
-- are the likeliest to have been there since the project started, and the
-- choice has to be deterministic or two runs of this migration disagree.
insert into project_members (tenant_id, project_id, user_id, role)
select p.tenant_id, p.id, fallback.user_id, 'owner'
  from projects p
  cross join lateral (
    select m.user_id
      from project_members m
      join users u on u.tenant_id = m.tenant_id and u.id = m.user_id
     where m.tenant_id = p.tenant_id and m.project_id = p.id and u.status = 'active'
     order by m.created_at asc, m.user_id asc
     limit 1
  ) as fallback
 where not exists (
   select 1 from project_members m
    where m.tenant_id = p.tenant_id and m.project_id = p.id and m.role = 'owner'
 )
on conflict (project_id, user_id) do update set role = 'owner';

comment on column project_members.role is
  'owner may delete the project and appoint anyone; manager runs everything '
  'inside it except deletion and appointing owners or managers; member does the '
  'work; viewer reads.';
