-- Rectangle core tenant/project/audit schema for production PostgreSQL deployments.
create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  display_name text not null check (char_length(trim(display_name)) between 2 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, lower(email))
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9._-]{1,39}$'),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'planned' check (status in ('planned', 'active', 'on_hold', 'completed', 'archived')),
  planned_start_date date,
  planned_finish_date date,
  budget_amount numeric(14,2) check (budget_amount is null or budget_amount > 0),
  budget_currency char(3) check (budget_currency is null or budget_currency ~ '^[A-Z]{3}$'),
  sector text check (sector is null or sector in ('residential','commercial','infrastructure','industrial','healthcare','education','hospitality','mixed_use','other')),
  delivery_method text check (delivery_method is null or delivery_method in ('design_bid_build','design_build','construction_management','epc','other')),
  location_name text check (location_name is null or char_length(trim(location_name)) between 2 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_dates_order check (planned_finish_date is null or planned_start_date is null or planned_finish_date >= planned_start_date),
  constraint projects_budget_currency_pair check ((budget_amount is null and budget_currency is null) or (budget_amount is not null and budget_currency is not null)),
  unique (tenant_id, code)
);

create index if not exists projects_tenant_status_idx on projects (tenant_id, status, id);
create index if not exists projects_tenant_name_idx on projects (tenant_id, name);

create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('project_admin','project_manager','controls_manager','viewer','external_collaborator')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_tenant_user_idx on project_members (tenant_id, user_id);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  actor_agent_id text,
  action text not null check (char_length(action) between 3 and 120),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id uuid not null,
  result text not null check (result in ('success', 'failure')),
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_tenant_created_idx on audit_events (tenant_id, created_at desc, id desc);
create index if not exists audit_events_user_created_idx on audit_events (tenant_id, actor_user_id, created_at desc, id desc);
create index if not exists audit_events_entity_idx on audit_events (tenant_id, entity_type, entity_id, created_at desc);
