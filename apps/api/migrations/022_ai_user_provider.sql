-- A person's own provider, not merely their own key.
--
-- `ai_user_keys` let somebody bill their own account while still calling the
-- endpoint and model the company had chosen. That covered one case and missed
-- the one people actually asked for: a person who wants a different model
-- entirely — a cheaper one for quick questions, a stronger one for reasoning
-- through a delay, or a different provider because theirs is the account they
-- have. Holding only the key made the personal override an accounting detail
-- rather than a real choice.
--
-- Both columns are nullable, and that is the whole design. Null means "use the
-- company's", so each of the three settings falls back independently: somebody
-- who only wants a different model sets the model and nothing else, and keeps
-- following the company for the rest. Copying the company's values into the
-- personal row at save time would look identical on the day it was saved and
-- then quietly stop tracking the company the moment an owner changed provider.

alter table ai_user_keys
  -- Same shape as the company's, including the length bounds, because the
  -- resolver treats them interchangeably and a personal row that could hold a
  -- value the company row could not would be a difference with no meaning.
  add column if not exists base_url text
    check (base_url is null or char_length(base_url) between 8 and 512),
  add column if not exists model text
    check (model is null or char_length(model) between 1 and 200);

-- The key itself becomes optional for the same reason: somebody using the
-- company's key against their own choice of model is a legitimate combination,
-- and it was previously unrepresentable.
alter table ai_user_keys
  alter column api_key_cipher drop not null;

comment on table ai_user_keys is
  'A person''s own assistant settings. Every column is an override: null means '
  'follow the company. A row with all three null is meaningless and is deleted '
  'rather than stored.';

-- How many reasoning steps the assistant may take before it must answer.
--
-- It was a constant in the code, which meant the one setting most likely to
-- need tuning per company — it trades answer quality directly against spend —
-- could only be changed by shipping a release. An owner who finds the assistant
-- giving up too early on a large portfolio, or spending more than they want on
-- simple questions, should be able to say so.
--
-- Bounded in the database as well as in the schema. The lower bound is 1
-- because zero steps is not an assistant; the upper bound is 30 because beyond
-- that a model that has not converged is confused rather than close, and the
-- ceiling is what stops a mistyped value from becoming an expensive afternoon.
alter table ai_settings
  add column if not exists max_cycles integer not null default 10
    check (max_cycles between 1 and 30);

comment on column ai_settings.max_cycles is
  'Reasoning steps allowed per question before the assistant must answer. '
  'Trades depth against spend; the person can always ask it to continue.';
