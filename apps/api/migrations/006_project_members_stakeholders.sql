-- Project team and stakeholder registers.
--
-- `project_members` was created in 001 but never used by application code. This
-- migration brings it up to the standard the rest of the schema follows
-- (timestamps, update trigger parity) and adds the stakeholder register that the
-- project workspace needs.

-- Membership rows are edited in place when a role changes, so they need to carry
-- their own update timestamp for audit and ordering.
alter table project_members
  add column if not exists updated_at timestamptz not null default now();

-- Listing a project's team is the hot path; index it directly.
create index if not exists project_members_project_idx
  on project_members (project_id, created_at desc);

-- A member must belong to the same tenant as the project. The composite foreign
-- keys below make cross-tenant membership impossible at the database level
-- rather than relying on application checks alone.
create unique index if not exists projects_id_tenant_key
  on projects (id, tenant_id);

create unique index if not exists users_id_tenant_key
  on users (id, tenant_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_members_project_tenant_fk'
  ) then
    alter table project_members
      add constraint project_members_project_tenant_fk
      foreign key (project_id, tenant_id) references projects (id, tenant_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'project_members_user_tenant_fk'
  ) then
    alter table project_members
      add constraint project_members_user_tenant_fk
      foreign key (user_id, tenant_id) references users (id, tenant_id)
      on delete cascade;
  end if;
end
$$;

-- Stakeholders are external or internal parties with an interest in the project.
-- Unlike members they are not Rectangle user accounts, so they are stored as
-- records rather than references to `users`.
create table if not exists project_stakeholders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  organization text check (organization is null or char_length(trim(organization)) between 2 and 160),
  category text not null check (category in (
    'client','consultant','contractor','subcontractor','supplier','authority','community','internal','other'
  )),
  influence text not null default 'medium' check (influence in ('low','medium','high')),
  interest text not null default 'medium' check (interest in ('low','medium','high')),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(trim(phone)) between 3 and 40),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_stakeholders_project_tenant_fk
    foreign key (project_id, tenant_id) references projects (id, tenant_id) on delete cascade
);

create index if not exists project_stakeholders_project_idx
  on project_stakeholders (project_id, created_at desc);

create index if not exists project_stakeholders_tenant_idx
  on project_stakeholders (tenant_id, category);
