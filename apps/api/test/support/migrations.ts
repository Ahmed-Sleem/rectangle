/**
 * Shared plumbing for the suites that execute migrations against real
 * PostgreSQL.
 *
 * Extracted when the migration tests were split across files. They are split
 * because each PGlite instance is a whole PostgreSQL compiled to WASM and more
 * than two resident at once exhausts the worker, and files are the boundary
 * that actually frees one — but the helpers must stay single-copy, or the two
 * files could drift into testing subtly different things.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations", import.meta.url));

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort();
}

/**
 * Drops only the extension statements PGlite cannot satisfy.
 *
 * `pgcrypto` is unavailable, and the only thing the schema wants from it —
 * `gen_random_uuid` — is built into PostgreSQL 13 and later, which is what
 * PGlite is. Dropping that statement changes nothing.
 *
 * Named rather than blanket, and that distinction cost a debugging session:
 * a rule removing every `create extension` also removed `pg_trgm`, so the
 * migration went on to create a `gin_trgm_ops` index against an extension it
 * had just been prevented from installing. The ones the suites load through
 * the PGlite constructor have to survive, or the schema they build is not the
 * schema that ships.
 */
export function forPglite(sql: string): string {
  return sql.replace(/create extension[^;]*\bpgcrypto\b[^;]*;/giu, "");
}

/** Applies migrations in order, stopping before `stopBefore` when given. */
export async function migrateUpTo(db: PGlite, stopBefore?: string): Promise<void> {
  for (const file of migrationFiles()) {
    if (stopBefore && file >= stopBefore) return;
    await db.exec(forPglite(readFileSync(join(MIGRATIONS_DIR, file), "utf8")));
  }
}
