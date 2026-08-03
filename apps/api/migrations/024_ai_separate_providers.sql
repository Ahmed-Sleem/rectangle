-- Two providers, not one with overrides.
--
-- Session 48 let a personal row override the company field by field: set only a
-- model and you kept the company's endpoint and key. That was wrong, and the
-- reason is not aesthetic. It made "whose settings are these, and who is
-- paying" unanswerable — somebody could be running the company's endpoint with
-- their own key and their own model, and no screen could honestly report that.
-- It also made the personal configuration depend on a company configuration
-- existing, so a person could not set up their own model at all until an owner
-- had set one up first. That was reported as a bug and it is one.
--
-- So a personal configuration is now COMPLETE or ABSENT. Endpoint, model and
-- key together, plus its own budgets, because whoever pays for the calls sets
-- the limits on them. A person with both configurations picks one, and the
-- choice is stored so it survives a new device.
--
-- The columns were nullable individually. They stay nullable in SQL — a row
-- exists from the first PUT and is completed by the wizard — but the service
-- treats a personal provider as usable only when endpoint, model and key are
-- all present. Enforcing that as a table constraint would make the partial save
-- the wizard performs impossible, and would put the same rule in two places.

alter table ai_user_keys
  -- The person's own budgets. Null means "not chosen", and the service falls
  -- back to the shipped defaults rather than to the company's numbers: the
  -- company's budget belongs to the company's model.
  add column if not exists max_cycles integer
    check (max_cycles is null or max_cycles between 1 and 30),
  add column if not exists max_output_tokens integer
    check (max_output_tokens is null or max_output_tokens between 256 and 32000);

-- Which of the two a person is using, when they have both.
--
-- Null means they have not chosen, which is the honest state for somebody who
-- has only ever had one. The service resolves null to whichever is actually
-- configured, so the column never has to be back-filled and a person who
-- deletes one configuration does not end up pointing at nothing.
alter table ai_user_keys
  add column if not exists preferred text
    check (preferred is null or preferred in ('company', 'personal'));

-- The company's own output ceiling, alongside the reasoning budget it already
-- has. Both are spending decisions and both belong to whoever pays.
alter table ai_settings
  add column if not exists max_output_tokens integer not null default 2048
    check (max_output_tokens between 256 and 32000);

comment on column ai_user_keys.preferred is
  'Which configuration this person uses when both exist. Null means they have '
  'only ever had one, and the service uses whichever that is.';

comment on column ai_settings.max_output_tokens is
  'Longest reply the company model may generate, in tokens. A spending limit, '
  'so it belongs to whoever pays for the calls.';
