-- Tenant-managed user types and permissions.
create table if not exists user_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  key text not null check (key ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'),
  description text check (description is null or char_length(description) <= 500),
  permissions text[] not null,
  system_type boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create table if not exists user_type_assignments (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  user_type_id uuid not null references user_types(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id, user_type_id)
);

create index if not exists user_type_assignments_user_idx on user_type_assignments (tenant_id, user_id);
