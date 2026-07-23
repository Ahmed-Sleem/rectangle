/**
 * Minimal migration runner applies checked-in SQL migrations to PostgreSQL for
 * Rectangle API deployments. It records every applied migration once.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../config.js";
import { createPostgresPool } from "./pool.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(currentDir, "../../../migrations");

export async function runMigrations(): Promise<void> {
  const config = loadConfig();
  const pool = createPostgresPool(config.DATABASE_URL);
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
