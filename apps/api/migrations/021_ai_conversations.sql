-- Conversations with the assistant, kept.
--
-- The first version of the assistant was deliberately stateless: the browser
-- held the transcript and posted it back on every turn, which meant no table to
-- migrate, nothing to expire and nothing to disclose. That was the right call
-- for a feature nobody could see yet. It stops being the right call the moment
-- somebody uses the thing for real work, because a refreshed tab then destroys
-- an afternoon of questions and the answers that came back — and because a
-- person cannot return to what the assistant told them last Tuesday about a
-- delay they are now being asked to explain.
--
-- So the transcript moves to the server, and the client stops carrying it. That
-- is not merely a place to put it: it makes the stored thread and the thread the
-- model is shown the same object. When the browser owned the history, the two
-- could disagree — a client that dropped, reordered or edited a message would
-- send the model something the record did not contain, and the record would be
-- the lie. One representation cannot drift from itself.
--
-- WHAT THIS IS FOR, precisely, because a stored conversation invites scope
-- creep: it exists so the person who wrote it can read it again. That is the
-- purpose it was collected for and the only purpose it may serve. It is not an
-- oversight tool — a manager cannot read a subordinate's thread, and there is no
-- query in this system that would let them — and it is not a corpus. Anything
-- beyond showing a person their own words back to them is a different purpose,
-- which under both Egypt's PDPL and the GDPR needs its own explicit consent
-- gathered at the time, not inherited from this one.

-- Step 1: the thread.
create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  -- Whose conversation it is. Every read is scoped by this column and there is
  -- no path that reads a thread without it.
  user_id uuid not null references users(id) on delete cascade,
  -- Drawn from the opening question rather than asked for. Somebody with a
  -- question does not want to name a document first, and an untitled list is
  -- unnavigable, so the first thing they typed becomes the label.
  title text not null check (char_length(title) between 1 and 200),
  -- The project the conversation was started against, if any. Kept so that
  -- reopening an old thread restores the context it was answered in; a project
  -- that is later deleted leaves the thread readable rather than removing it.
  project_id uuid references projects(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Moves with every turn. The list is ordered by this and not by creation,
  -- because the thread somebody is in the middle of is the one they want.
  updated_at timestamptz not null default now(),
  -- Cross-tenant rows are unrepresentable rather than merely discouraged.
  constraint ai_conversations_user_tenant_fk
    foreign key (user_id, tenant_id) references users (id, tenant_id) on delete cascade
);

-- Step 2: the turns.
create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  -- Denormalised from the parent so that every read can be scoped by tenant in
  -- the same WHERE clause that finds the rows, instead of relying on a join
  -- having been written correctly at each call site.
  tenant_id uuid not null references tenants(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  -- Which tools the answer was built from, so the transcript can say what it
  -- looked at. An array of names, empty when it answered from the conversation
  -- alone. Names only: the results themselves are the project's own data and
  -- are already stored where they belong.
  used_tools text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- The list: this person's threads, newest activity first.
create index if not exists ai_conversations_owner_idx
  on ai_conversations (tenant_id, user_id, updated_at desc);

-- Reading a thread: its messages in the order they were said.
create index if not exists ai_messages_thread_idx
  on ai_messages (conversation_id, created_at);

comment on table ai_conversations is
  'A person''s conversations with the assistant. Readable only by the person '
  'who held them: there is no cross-user query, by design.';

comment on table ai_messages is
  'The turns of a conversation, in order. `used_tools` names what the answer '
  'was built from so the transcript can show its working.';
