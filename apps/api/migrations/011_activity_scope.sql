-- Audit entries were readable by every user.
--
-- `listRecentActivity` filtered on tenant alone, and the Today page that calls
-- it is gated on `projects.read`, which everyone holds. So the newest site
-- engineer could read new hires' email addresses, failed sign-in attempts, who
-- had been disabled, the SMTP host, and activity on projects they are
-- deliberately excluded from.
--
-- Scoping that read needs two things the table does not carry: how sensitive an
-- entry is, and which project it belongs to. Both are derived here rather than
-- filtered in the application, because a filter applied after the rows are
-- fetched is a filter somebody will eventually forget to apply.

alter table audit_events
  add column if not exists sensitivity text
    check (sensitivity in ('operational', 'personal', 'security', 'administrative'));

-- Which project an entry concerns, when it concerns one. Nullable: company-level
-- actions such as creating a user belong to no project. Kept as a plain column
-- rather than joined at read time, because the entity a row points at may since
-- have been deleted and the audit trail must survive it.
alter table audit_events
  add column if not exists project_id uuid;

-- Backfill from the action name. Every existing action is covered by the
-- prefixes below; the else branch is 'administrative' so an action nobody
-- classified is hidden from everyone except a full administrator. Failing
-- closed is the only safe default for a column that decides visibility.
update audit_events
   set sensitivity = case
     when action like 'project.%' or action like 'task.%'
       or action like 'risk.%' or action like 'document.%' then 'operational'
     when action like 'auth.%' then 'security'
     when action like 'profile.%' or action like 'passkey.%'
       or action = 'user.email_changed' or action = 'user.email_change_requested'
       or action = 'user.email_change_reverted' or action = 'user.invitation_accepted' then 'personal'
     else 'administrative'
   end
 where sensitivity is null;

alter table audit_events
  alter column sensitivity set default 'administrative';

-- Backfill the project for entries that already name one in their metadata, and
-- for the project entity itself. Older task and risk entries cannot be resolved
-- this way; they simply stay project-less, which means they are visible only to
-- a full administrator. That is the conservative direction.
update audit_events
   set project_id = case
     when entity_type = 'project' then entity_id
     when metadata ? 'projectId' then (metadata ->> 'projectId')::uuid
     else null
   end
 where project_id is null
   and (entity_type = 'project' or metadata ? 'projectId');

-- Reading is always "newest first, for this tenant, filtered by sensitivity",
-- so sensitivity belongs in the index rather than being a post-filter over a
-- scan of the whole tenant's history.
create index if not exists audit_events_tenant_sensitivity_idx
  on audit_events (tenant_id, sensitivity, created_at desc, id desc);

-- The project-scoped feed, which is what most users actually see.
create index if not exists audit_events_project_created_idx
  on audit_events (tenant_id, project_id, created_at desc, id desc)
  where project_id is not null;
