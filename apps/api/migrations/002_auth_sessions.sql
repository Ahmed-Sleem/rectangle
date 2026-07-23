-- Real authentication/session storage for Rectangle API.
alter table users
  add column if not exists password_hash text,
  add column if not exists status text not null default 'invited' check (status in ('invited', 'active', 'disabled'));

create table if not exists tenant_user_roles (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('tenant_owner','tenant_admin','project_admin','project_manager','controls_manager','viewer','external_collaborator')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id, role)
);

create index if not exists tenant_user_roles_user_idx on tenant_user_roles (tenant_id, user_id);

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  ip_address inet,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint auth_sessions_expiry_after_creation check (expires_at > created_at)
);

create index if not exists auth_sessions_user_active_idx on auth_sessions (tenant_id, user_id, expires_at desc) where revoked_at is null;
create index if not exists auth_sessions_expiry_idx on auth_sessions (expires_at);
