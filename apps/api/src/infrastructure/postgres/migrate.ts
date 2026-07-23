/**
 * Minimal migration runner applies checked-in SQL migrations to PostgreSQL for
 * Rectangle API deployments. It records every applied migration once.
 */
import { access, readdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createPostgresPool } from "./pool.js";

const migrationEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
});

export function loadMigrationDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return migrationEnvSchema.parse(env).DATABASE_URL;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveMigrationsDir(cwd = process.cwd()): Promise<string> {
  const candidates = [
    join(cwd, "migrations"),
    join(cwd, "apps/api/migrations"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Migrations directory not found. Checked: ${candidates.join(", ")}`);
}

export async function runMigrations(): Promise<void> {
  const databaseUrl = loadMigrationDatabaseUrl();
  const migrationsDir = await resolveMigrationsDir();
  const pool = createPostgresPool(databaseUrl);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )`);

    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const migrationId = file.replace(/\.sql$/u, "");
      const existing = await client.query("select 1 from schema_migrations where id = $1", [migrationId]);
      if (existing.rowCount && existing.rowCount > 0) continue;
      const sql = await readFile(join(migrationsDir, file), "utf8");
      await client.query(sql);
      await client.query("insert into schema_migrations (id) values ($1)", [migrationId]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runMigrations();
}
