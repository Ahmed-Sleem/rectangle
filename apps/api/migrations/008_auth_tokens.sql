-- Single-use tokens for invitations, password resets, and email changes.
--
-- One table rather than three: all three are "prove you control an address,
-- then let one action through". Three tables would be three chances to get the
-- security details wrong in three different ways.

create table if not exists auth_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,

  -- Part of every lookup, never merely recorded: an invitation must not be
  -- usable as a password reset.
  purpose text not null check (purpose in (
    'invitation', 'password_reset', 'email_change', 'email_revert'
  )),

  -- Only the hash is stored. A leaked dump must not be a set of working
  -- links. SHA-256 is sufficient and correct here: the token is 128 bits of
  -- CSPRNG output, so there is nothing to brute force, and a slow KDF on
  -- every verification would be a self-inflicted denial of service.
  token_hash text not null,

  -- Carries what the action needs, e.g. the address an email change is
  -- moving to. Kept with the token so a half-finished change has no home
  -- anywhere else in the schema.
  metadata jsonb not null default '{}'::jsonb,

  expires_at timestamptz not null,
  -- Stamped inside the same transaction as the action it authorises, so a
  -- replayed link cannot perform it twice.
  consumed_at timestamptz,

  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint auth_tokens_user_tenant_fk
    foreign key (user_id, tenant_id) references users (id, tenant_id) on delete cascade
);

-- Verification looks a token up by its hash alone; the hash is unique enough
-- to be the entry point, and tenant scoping is applied to the row that comes
-- back rather than to the search.
create unique index if not exists auth_tokens_hash_key on auth_tokens (token_hash);

-- Issuing a token invalidates earlier ones of the same purpose, which is a
-- scan over exactly this pair.
create index if not exists auth_tokens_user_purpose_idx
  on auth_tokens (tenant_id, user_id, purpose)
  where consumed_at is null;

-- Expired rows are swept periodically; this makes that cheap.
create index if not exists auth_tokens_expiry_idx on auth_tokens (expires_at)
  where consumed_at is null;
