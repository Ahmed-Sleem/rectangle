-- Sessions that follow the work instead of a stopwatch.
--
-- `expires_at` was set once at sign-in, an hour ahead, and never moved. Somebody
-- in the middle of writing up a site visit was signed out mid-sentence, which is
-- not a security control — it is the reason people keep a second tab open to
-- avoid losing their place, and habits like that are worse than the timeout was
-- ever going to be good.
--
-- The replacement is the pair OWASP asks for and neither half alone. `expires_at`
-- becomes an idle deadline that moves forward while somebody is working, so an
-- active person is never interrupted. `absolute_expires_at` is fixed at sign-in
-- and never moves, so a session cannot be kept alive forever by a tab polling in
-- the background — which is exactly what an idle timeout on its own permits, and
-- the reason a stolen token would otherwise be good indefinitely.
--
-- `last_seen_at` is recorded because a person looking at their own signed-in
-- devices needs to recognise them, and "last used" is what makes a row
-- recognisable. It is a fact worth storing rather than deriving from the idle
-- deadline, which will drift as the idle window is tuned.

alter table auth_sessions
  add column if not exists absolute_expires_at timestamptz,
  add column if not exists last_seen_at timestamptz;

-- Existing rows predate the column. Their absolute cap is measured from when
-- they were created rather than from now, so this migration cannot hand anybody
-- a longer session than the policy allows by way of being run.
update auth_sessions
   set absolute_expires_at = created_at + interval '12 hours'
 where absolute_expires_at is null;

update auth_sessions
   set last_seen_at = created_at
 where last_seen_at is null;

alter table auth_sessions
  alter column absolute_expires_at set not null,
  alter column last_seen_at set not null;

-- The cap can equal the idle deadline at the moment of creation but must never
-- precede the row's own existence.
alter table auth_sessions
  drop constraint if exists auth_sessions_absolute_after_creation;
alter table auth_sessions
  add constraint auth_sessions_absolute_after_creation
  check (absolute_expires_at > created_at);

-- Every authenticated request reads a session by id and both deadlines, and
-- writes the sliding one back. Without the cap in the index that write turns
-- into a heap fetch on the hottest query in the product.
drop index if exists auth_sessions_user_active_idx;
create index if not exists auth_sessions_user_active_idx
  on auth_sessions (tenant_id, user_id, expires_at desc, absolute_expires_at)
  where revoked_at is null;
