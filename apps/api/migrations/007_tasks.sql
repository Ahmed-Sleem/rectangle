-- Tasks: the unit of work a project is actually delivered through.
--
-- A task always belongs to a project. There is no tenant-level orphan task,
-- because work that belongs to no project cannot be scheduled, assigned to a
-- project member, or reported on.

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null,
  title text not null check (char_length(trim(title)) between 2 and 200),
  description text check (description is null or char_length(description) <= 4000),

  -- Deliberately a small, fixed set. Companies asking for custom workflow
  -- states get that when a real workflow engine exists; inventing a free-text
  -- status column now would make every board and report unreliable.
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),

  -- Nullable: work is often captured before anyone is chosen to do it.
  assignee_user_id uuid,
  due_date date,
  start_date date,

  -- Set only when the task actually reaches a terminal state, so "when was
  -- this finished" is answered by a stored fact rather than an audit scan.
  completed_at timestamptz,

  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tasks_dates_order
    check (due_date is null or start_date is null or due_date >= start_date),

  -- The composite key makes a task belonging to another tenant's project
  -- impossible in the database, not merely unlikely in application code.
  constraint tasks_project_tenant_fk
    foreign key (project_id, tenant_id) references projects (id, tenant_id) on delete cascade,

  -- Same guarantee for the assignee: cross-tenant assignment cannot be stored.
  constraint tasks_assignee_tenant_fk
    foreign key (assignee_user_id, tenant_id) references users (id, tenant_id) on delete set null
);

-- Listing a project's board is the hot path.
create index if not exists tasks_project_status_idx
  on tasks (tenant_id, project_id, status, due_date);

-- "My tasks" across every project the person can reach.
create index if not exists tasks_assignee_idx
  on tasks (tenant_id, assignee_user_id, status, due_date);

-- Portfolio-wide date rollups for the Today surface.
create index if not exists tasks_tenant_due_idx
  on tasks (tenant_id, due_date)
  where status not in ('done', 'cancelled');

-- Comments are entity-linked so the same shape can later carry risks,
-- documents and approvals without a second commenting system.
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  author_user_id uuid references users(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx
  on task_comments (task_id, created_at desc);
