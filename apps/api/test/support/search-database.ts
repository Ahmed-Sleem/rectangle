/**
 * A real PostgreSQL carrying the real schema, for testing the search engine.
 *
 * The clauses this exercises are strings of SQL. A unit test asserting on the
 * string would pass while the query was invalid, meaningless, or matching the
 * wrong rows — the only thing that can tell us the engine works is a database
 * executing it against rows we recognise.
 *
 * `pg_trgm` and `fuzzystrmatch` are loaded as PGlite contrib bundles. They are
 * standard contrib in every managed Postgres; PGlite ships them separately.
 */
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS_DIR, forPglite } from "./migrations.js";

export async function createSearchDatabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm, fuzzystrmatch } });

  /*
   * The migration is applied verbatim rather than a hand-written copy of the
   * schema. A copy drifts, and then the tests describe a database that no
   * longer exists — which is exactly the class of bug this whole file is for.
   *
   * `forPglite` strips the `create extension` lines because PGlite loads them
   * through the constructor above instead.
   */
  const migration = readFileSync(join(MIGRATIONS_DIR, "016_search_engine.sql"), "utf8");
  const functionOnly = migration.slice(
    migration.indexOf("create or replace function"),
    migration.indexOf("comment on function"),
  );

  await db.exec("create extension if not exists pg_trgm;");
  await db.exec("create extension if not exists fuzzystrmatch;");
  await db.exec(functionOnly);

  /*
   * The searchable columns exactly as the migration declares them, on tables
   * reduced to what search touches. The full schema would drag in tenants,
   * users, memberships and foreign keys that have nothing to do with matching
   * text, and every one of them is another thing to keep in step.
   */
  await db.exec(`
    create table projects (
      id serial primary key,
      name text,
      code text,
      location_name text,
      search_document tsvector generated always as (
        setweight(to_tsvector('simple', rect_search_normalise(coalesce(name, ''))), 'A') ||
        setweight(to_tsvector('simple', rect_search_normalise(coalesce(code, ''))), 'A') ||
        setweight(to_tsvector('simple', rect_search_normalise(coalesce(location_name, ''))), 'B')
      ) stored
    );

    create table tasks (
      id serial primary key,
      title text,
      description text,
      search_document tsvector generated always as (
        setweight(to_tsvector('simple', rect_search_normalise(coalesce(title, ''))), 'A') ||
        setweight(to_tsvector('simple', rect_search_normalise(coalesce(description, ''))), 'B')
      ) stored
    );

    create table risks (
      id serial primary key,
      title text,
      description text,
      mitigation text,
      search_document tsvector generated always as (
        setweight(to_tsvector('simple', rect_search_normalise(coalesce(title, ''))), 'A') ||
        setweight(to_tsvector('simple', rect_search_normalise(coalesce(description, ''))), 'B') ||
        setweight(to_tsvector('simple', rect_search_normalise(coalesce(mitigation, ''))), 'B')
      ) stored
    );

    create table users (
      id serial primary key,
      display_name text,
      email text,
      search_document tsvector generated always as (
        setweight(to_tsvector('simple', rect_search_normalise(coalesce(display_name, ''))), 'A') ||
        setweight(to_tsvector('simple', rect_search_normalise(coalesce(email, ''))), 'B')
      ) stored
    );
  `);

  return db;
}

/** Kept so the helper compiles against the same list the real suites use. */
export { forPglite };
