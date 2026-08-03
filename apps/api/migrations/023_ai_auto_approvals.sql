-- Which proposals a person has stopped wanting to be asked about.
--
-- The owner asked for a "do not show this again" tick on the confirmation card.
-- The research on agent approval is unanimous about the shape this has to take,
-- and equally unanimous about the shape that fails: a single global "never ask
-- me again" is the switch behind most of the published incidents, because the
-- approval stops being a decision and becomes a reflex, and then one
-- irreversible action costs more than every click it ever saved.
--
-- So the grant is per tool. Ticking the box on "create a task" means task
-- creation stops asking; it says nothing about deleting one. That keeps the
-- gate where the risk is, and it keeps each grant small enough that revoking it
-- is obvious.
--
-- PER PERSON, not per company. Somebody who trusts the assistant to file tasks
-- for them has said something about their own working habits, not about their
-- colleagues'. A company-wide grant would let one person's confidence remove
-- everybody else's confirmation step without their knowing.
--
-- WHAT CANNOT BE STORED HERE: any tool marked destructive in the registry. That
-- rule lives in the service rather than in a check constraint, because the
-- database has no way to know which tools those are and duplicating the list
-- here would create a second answer that drifts from the first. It is enforced
-- on the way in and tested.

create table if not exists ai_auto_approvals (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  -- The registry name, e.g. 'create_task'. Not a foreign key: the registry is
  -- code, and a tool that is removed should simply stop matching rather than
  -- block a migration.
  tool text not null check (char_length(tool) between 2 and 64),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id, tool),
  -- Cross-tenant rows are unrepresentable rather than merely discouraged.
  constraint ai_auto_approvals_user_tenant_fk
    foreign key (user_id, tenant_id) references users (id, tenant_id) on delete cascade
);

comment on table ai_auto_approvals is
  'Tools this person has chosen not to be asked about again. Per person and per '
  'tool; irreversible tools are refused here by the service and always ask.';
