-- Tenant SMTP email settings. Passwords are encrypted by the application before storage.
create table if not exists tenant_email_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  enabled boolean not null default false,
  host text not null check (char_length(trim(host)) between 2 and 255),
  port integer not null check (port between 1 and 65535),
  secure boolean not null default false,
  username text not null check (char_length(trim(username)) between 1 and 255),
  encrypted_password text not null,
  from_email text not null check (char_length(trim(from_email)) between 3 and 254),
  from_name text not null check (char_length(trim(from_name)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
