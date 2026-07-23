/**
 * PostgreSQL pool adapter centralizes database connectivity for production API
 * repositories and health readiness checks.
 */
import pg from "pg";

const { Pool } = pg;

export function createPostgresPool(connectionString: string) {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export async function assertDatabaseReady(pool: pg.Pool): Promise<void> {
  await pool.query("select 1");
}
