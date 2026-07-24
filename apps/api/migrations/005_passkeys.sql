-- WebAuthn/passkey credentials and short-lived challenges.
create table if not exists webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_type text,
  backed_up boolean not null default false,
  name text not null default 'Passkey',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists webauthn_credentials_user_idx on webauthn_credentials (tenant_id, user_id);

create table if not exists webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  challenge text not null,
  ceremony text not null check (ceremony in ('registration','authentication')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists webauthn_challenges_lookup_idx on webauthn_challenges (tenant_id, user_id, ceremony, expires_at desc);
