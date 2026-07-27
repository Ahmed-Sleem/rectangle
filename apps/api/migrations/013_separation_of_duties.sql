-- Separation of duties: pairs of permissions one person may never hold at once.
--
-- Static separation of duty in the NIST sense. Some combinations are a control
-- failure however trustworthy the individual, because they let one person both
-- commit the company and approve having done so.
--
-- Deliberately per tenant and empty by default. The obvious candidates — being
-- able to invent a role and also assign it, or to configure the company and
-- also be the only reader of the record of those changes — are all held
-- together by any full-access role and by every owner. Shipping a rule enabled
-- would make administration itself unassignable, which is how a control nobody
-- asked for becomes a control everybody switches off. A company declares the
-- pairs that matter to it.

create table if not exists tenant_separation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  permission_a text not null check (char_length(permission_a) between 3 and 64),
  permission_b text not null check (char_length(permission_b) between 3 and 64),
  -- Shown when an assignment is refused. A refusal nobody can argue with is a
  -- refusal nobody can act on.
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  created_at timestamptz not null default now(),
  -- A pair is unordered, so it is stored in a fixed order and the constraint
  -- below keeps it that way. Without it the same rule could be entered twice,
  -- once each way round.
  constraint tenant_separation_rules_ordered check (permission_a < permission_b)
);

create unique index if not exists tenant_separation_rules_pair_idx
  on tenant_separation_rules (tenant_id, permission_a, permission_b);
