-- Full-text search indexes for projects and tasks.
--
-- The palette previously matched with `ilike '%term%'`, which cannot use an
-- index at all: a leading wildcard forces a sequential scan of every row on
-- every keystroke. These columns are maintained by the database on write, so
-- there is no separate index to keep in step and no window where a record
-- exists but is not yet findable.

-- `simple` rather than `english`: a company's data is Arabic and English
-- mixed, and the English stemmer mangles Arabic while helping neither. Prefix
-- matching with `:*` covers partial words, which is what a palette needs.
alter table projects
  add column if not exists search_document tsvector
  generated always as (
    to_tsvector('simple',
      coalesce(name, '') || ' ' ||
      coalesce(code, '') || ' ' ||
      coalesce(location_name, '')
    )
  ) stored;

create index if not exists projects_search_idx
  on projects using gin (search_document);

alter table tasks
  add column if not exists search_document tsvector
  generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored;

create index if not exists tasks_search_idx
  on tasks using gin (search_document);

-- People are searched by name and address. The address is indexed whole
-- rather than tokenised, because half an email address is not a useful match.
alter table users
  add column if not exists search_document tsvector
  generated always as (
    to_tsvector('simple', coalesce(display_name, '') || ' ' || coalesce(email, ''))
  ) stored;

create index if not exists users_search_idx
  on users using gin (search_document);
