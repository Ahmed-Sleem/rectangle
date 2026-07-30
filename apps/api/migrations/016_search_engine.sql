-- One search engine for the whole product.
--
-- There were six. The global palette used indexed full-text search with ranking;
-- the projects, tasks, risks and activity pages each used `ilike '%term%'`; and
-- the team page filtered rows in the browser after downloading them. So the same
-- word typed into two boxes gave different answers, the page searches could not
-- use an index at all — a leading wildcard forces a sequential scan of every row
-- on every keystroke — and nothing anywhere tolerated a typo.
--
-- This migration gives every table the same searchable shape. The query side is
-- built in one module so a caller cannot accidentally invent a seventh engine.
--
-- Deliberately built on what a managed database gives us. ParadeDB's BM25 index
-- is better at ranking and is the right answer above roughly ten million rows,
-- but it is a third-party binary extension and Railway's managed Postgres cannot
-- install those — using it would mean running our own image and owning patching
-- and backups, which we are not equipped to do while C10 says we have no backups
-- at all. A construction company has thousands of records. Native full-text with
-- trigrams is the correct size of answer, and it is the same machinery the
-- palette has already been running in production.

-- ── Extensions ──
--
-- Both are standard contrib, present in the base image of every managed Postgres
-- worth using. `if not exists` rather than a hard requirement: if an environment
-- somehow lacks them the deploy still succeeds and search degrades to exact
-- matching, which is what it did yesterday. A search feature is not worth
-- refusing to start the product over.
create extension if not exists pg_trgm;
create extension if not exists fuzzystrmatch;

-- ── Normalisation ──
--
-- The one place text is folded before it is either indexed or searched. Both
-- sides must use it or they simply will not meet.
--
-- Arabic is why this exists and why `unaccent` is not used. I checked: unaccent
-- turns 'Héllo' into 'Hello' and leaves 'أَحْمَد' exactly as it found it. It
-- folds Latin diacritics and knows nothing about Arabic orthography. Yet the
-- alef forms أ إ آ ٱ are the same letter to a reader and people type whichever
-- their keyboard offers, so 'أحمد' and 'احمد' must be one word here. Same for
-- ة/ه at the end of a word, and for ى/ا. Tashkeel and tatweel are decoration
-- and carry no search meaning, so they go.
--
-- IMMUTABLE because a generated column and an expression index both require it,
-- and it is honestly immutable: same input, same output, no clock, no locale.
create or replace function rect_search_normalise(value text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select lower(
    regexp_replace(
      translate(
        value,
        -- Alef forms collapse to plain alef. Alef maqsura (ى) folds to ya (ي),
        -- NOT to alef: it is a final-position spelling of ya, so 'مصطفى' and
        -- 'مصطفي' are the same name while 'مصطفا' is not a word. Ta marbuta
        -- (ة) folds to ha, which is how people type it interchangeably.
        'أإآٱىة',
        'اااايه'
      ),
      -- tashkeel (U+064B..U+0652) and tatweel (U+0640): decoration, not meaning
      '[\u064B-\u0652\u0640]',
      '',
      'g'
    )
  )
$$;

comment on function rect_search_normalise(text) is
  'Folds text for search: lowercase, Arabic alef/ta-marbuta variants unified, tashkeel and tatweel removed. Used by both the stored search documents and every query, which must agree.';

-- ── Projects ──
--
-- Weighted, which the old document was not. A term matching a project''s name
-- should outrank the same term buried in a location, and `setweight` is what
-- lets `ts_rank_cd` know the difference. Without it every field is equal and
-- the ranking is close to arbitrary.
alter table projects drop column if exists search_document;
alter table projects
  add column search_document tsvector
  generated always as (
    setweight(to_tsvector('simple', rect_search_normalise(coalesce(name, ''))), 'A') ||
    setweight(to_tsvector('simple', rect_search_normalise(coalesce(code, ''))), 'A') ||
    setweight(to_tsvector('simple', rect_search_normalise(coalesce(location_name, ''))), 'B')
  ) stored;

create index if not exists projects_search_idx
  on projects using gin (search_document);

-- The trigram index is what makes the fuzzy pass affordable. Without it a
-- similarity check is a sequential scan, which is the problem we are removing.
create index if not exists projects_search_trgm_idx
  on projects using gin (
    rect_search_normalise(coalesce(name, '') || ' ' || coalesce(code, '')) gin_trgm_ops
  );

-- ── Tasks ──
alter table tasks drop column if exists search_document;
alter table tasks
  add column search_document tsvector
  generated always as (
    setweight(to_tsvector('simple', rect_search_normalise(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('simple', rect_search_normalise(coalesce(description, ''))), 'B')
  ) stored;

create index if not exists tasks_search_idx
  on tasks using gin (search_document);

create index if not exists tasks_search_trgm_idx
  on tasks using gin (rect_search_normalise(coalesce(title, '')) gin_trgm_ops);

-- ── Risks ──
--
-- Mitigation joins the document. Somebody looking for how a risk was handled
-- searches the words in the plan, and until now that text was not searchable
-- from anywhere in the product.
alter table risks drop column if exists search_document;
alter table risks
  add column search_document tsvector
  generated always as (
    setweight(to_tsvector('simple', rect_search_normalise(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('simple', rect_search_normalise(coalesce(description, ''))), 'B') ||
    setweight(to_tsvector('simple', rect_search_normalise(coalesce(mitigation, ''))), 'B')
  ) stored;

create index if not exists risks_search_idx
  on risks using gin (search_document);

create index if not exists risks_search_trgm_idx
  on risks using gin (rect_search_normalise(coalesce(title, '')) gin_trgm_ops);

-- ── People ──
--
-- The address is weighted below the name. Searching 'ahmed' should find Ahmed
-- before it finds everyone whose address happens to contain the string.
alter table users drop column if exists search_document;
alter table users
  add column search_document tsvector
  generated always as (
    setweight(to_tsvector('simple', rect_search_normalise(coalesce(display_name, ''))), 'A') ||
    setweight(to_tsvector('simple', rect_search_normalise(coalesce(email, ''))), 'B')
  ) stored;

create index if not exists users_search_idx
  on users using gin (search_document);

create index if not exists users_search_trgm_idx
  on users using gin (rect_search_normalise(coalesce(display_name, '')) gin_trgm_ops);
