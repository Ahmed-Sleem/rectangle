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
 * `pgcrypto` is unavailable in PGlite, but the only thing the schema uses it
 * for — `gen_random_uuid` — is built into PostgreSQL 13 and later, which is
 * what PGlite is. Dropping the extension statement changes nothing the
 * migrations depend on.
 */
export function forPglite(sql: string): string {
  return sql.replace(/create extension[^;]*;/giu, "");
}

/** Applies migrations in order, stopping before `stopBefore` when given. */
export async function migrateUpTo(db: PGlite, stopBefore?: string): Promise<void> {
  for (const file of migrationFiles()) {
    if (stopBefore && file >= stopBefore) return;
    await db.exec(forPglite(readFileSync(join(MIGRATIONS_DIR, file), "utf8")));
  }
}
