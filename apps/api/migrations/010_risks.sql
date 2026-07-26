-- Risk and issue register.
--
-- One table with a `kind` rather than two, because an issue is a risk that
-- occurred. Two tables would duplicate owner, project, mitigation and audit,
-- and would make "this risk has materialised" a delete-and-recreate that
-- throws away the history that made the record worth keeping.

create table if not exists risks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,

  kind text not null default 'risk' check (kind in ('risk', 'issue')),
  title text not null check (char_length(trim(title)) between 2 and 200),
  description text check (description is null or char_length(description) <= 4000),

  category text not null default 'other' check (category in (
    'safety', 'quality', 'schedule', 'cost', 'design',
    'procurement', 'environmental', 'regulatory', 'other'
  )),

  -- 1-5 on both axes, which is what makes the 5x5 matrix a matrix.
  probability smallint not null default 3 check (probability between 1 and 5),
  impact smallint not null default 3 check (impact between 1 and 5),

  -- Derived by the database, not the API. Two code paths computing this
  -- independently could disagree, and a matrix built on the disagreement
  -- would be wrong in a way nobody would spot.
  score smallint generated always as (probability * impact) stored,

  -- Exposure remaining once mitigation is in place. Null until mitigation
  -- exists, because a residual figure with no treatment behind it is a guess.
  residual_probability smallint check (residual_probability is null or residual_probability between 1 and 5),
  residual_impact smallint check (residual_impact is null or residual_impact between 1 and 5),

  status text not null default 'open' check (status in (
    'open', 'assessing', 'mitigating', 'accepted', 'closed', 'occurred'
  )),

  mitigation text check (mitigation is null or char_length(mitigation) <= 4000),

  -- Nullable: a risk is often logged before anyone owns it.
  owner_user_id uuid,
  due_date date,

  -- Set when the register entry reaches a terminal state, so "when was this
  -- resolved" is a stored fact rather than an audit-trail reconstruction.
  closed_at timestamptz,

  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Composite keys make a risk on another tenant's project, or owned by
  -- another tenant's user, impossible to store rather than merely unlikely.
  constraint risks_project_tenant_fk
    foreign key (project_id, tenant_id) references projects (id, tenant_id) on delete cascade,
  constraint risks_owner_tenant_fk
    foreign key (owner_user_id, tenant_id) references users (id, tenant_id) on delete set null
);

-- Mitigation may be tracked as a real task. Added separately so the foreign
-- key can be `set null`: deleting a task must not delete the risk it was
-- treating, which would lose the reason the task existed.
alter table risks
  add column if not exists mitigation_task_id uuid references tasks(id) on delete set null;

-- The register filtered by project, which is the common read.
create index if not exists risks_project_idx
  on risks (tenant_id, project_id, status, score desc);

-- "What do I own", across every project.
create index if not exists risks_owner_idx
  on risks (tenant_id, owner_user_id, status);

-- Matrix and KPI aggregates only ever count live entries.
create index if not exists risks_open_score_idx
  on risks (tenant_id, probability, impact)
  where status not in ('closed', 'accepted');

-- Findable from global search the moment it is written, like everything else.
alter table risks
  add column if not exists search_document tsvector
  generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored;

create index if not exists risks_search_idx on risks using gin (search_document);
