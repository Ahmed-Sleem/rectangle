-- The assistant: where the model lives, and what it was allowed to do.
--
-- Three tables, and the reason there are three rather than one is that they
-- answer three different questions with three different lifetimes.
--
-- `ai_settings` is the company's provider: a base URL, a model name and a key.
-- Free text on purpose — every serious provider now speaks the same
-- OpenAI-compatible shape, so naming them in an enum would mean a migration
-- every time a company changed supplier, which is a decision that belongs to
-- the company and not to us.
--
-- `ai_user_keys` exists because a company key and a personal key are different
-- promises. A company key is billed to the company and shared; a personal key
-- is somebody's own account. Putting them in one column would make "whose
-- spend is this" unanswerable.
--
-- `ai_pending_actions` is the one that matters. Anything the assistant proposes
-- to *change* is written here first and executed only when a person confirms
-- it. The arguments are stored server-side precisely so the confirmation step
-- can re-read them rather than trusting whatever comes back from the browser:
-- if the draft lived in the client, tampering with it between proposal and
-- confirmation would be trivial, and the human approval would be decorative.

-- Step 1: the company's provider and key.
create table if not exists ai_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  -- Where to send the request. Any OpenAI-compatible endpoint.
  base_url text not null check (char_length(base_url) between 8 and 512),
  -- Free text: the provider's own name for the model, whatever that is today.
  model text not null check (char_length(model) between 1 and 200),
  -- AES-256-GCM, same envelope as the SMTP password. Never leaves the server.
  api_key_cipher text,
  -- Off by default. A company that has not set this up must not have an
  -- assistant that fails on every message.
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users(id) on delete set null
);

-- Step 2: a person's own key, which takes precedence over the company's.
create table if not exists ai_user_keys (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  api_key_cipher text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  -- Cross-tenant rows are unrepresentable rather than merely discouraged.
  constraint ai_user_keys_user_tenant_fk
    foreign key (user_id, tenant_id) references users (id, tenant_id) on delete cascade
);

-- Step 3: proposed changes, awaiting a human.
create table if not exists ai_pending_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  -- Whose proposal it is. A confirmation from anybody else is refused, so one
  -- person cannot approve an action drafted in somebody else's session.
  user_id uuid not null references users(id) on delete cascade,
  tool text not null check (char_length(tool) between 2 and 64),
  -- Exactly what the model asked for, as validated JSON. This — not the
  -- request body at confirmation time — is what gets executed.
  arguments jsonb not null,
  created_at timestamptz not null default now(),
  -- A proposal nobody answered is not a proposal that should still be live an
  -- hour later. The service refuses anything past this, and the sweeper
  -- removes it.
  expires_at timestamptz not null,
  -- Set when it runs. Non-null means burnt: a token cannot be replayed.
  confirmed_at timestamptz,
  constraint ai_pending_actions_user_tenant_fk
    foreign key (user_id, tenant_id) references users (id, tenant_id) on delete cascade
);

-- The confirmation path looks up by id and owner together, so both are indexed
-- as one key rather than the id alone.
create index if not exists ai_pending_actions_owner_idx
  on ai_pending_actions (tenant_id, user_id, created_at desc);

comment on table ai_settings is
  'The company''s AI provider. Free-text endpoint and model so any '
  'OpenAI-compatible service works. The key is encrypted and never returned.';

comment on table ai_user_keys is
  'A person''s own API key, used in preference to the company''s when present.';

comment on table ai_pending_actions is
  'Changes the assistant proposed and a person has not yet approved. The '
  'arguments here are the ones that execute; the browser cannot substitute '
  'its own at confirmation time.';
