/**
 * The whole product, running, for the end-to-end tests.
 *
 * Everything below this file's boundary is the real thing: the built API, the
 * built web bundle served by that API from one origin exactly as Railway serves
 * it, and a genuine PostgreSQL carrying the real migrations. Nothing is
 * stubbed, and no test-only branch exists inside the application — the audit
 * called the missing sign-in test the weakest point of the suite, and a fake
 * sign-in would have left it exactly as weak.
 *
 * The database is PGlite exposed over the PostgreSQL wire protocol, so `pg`
 * connects with an ordinary connection string and the API cannot tell the
 * difference. That is what makes this possible without Docker: PGlite is
 * PostgreSQL 18 compiled to WASM, not an emulation of it.
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "apps/api/migrations");

export const DB_PORT = Number(process.env.E2E_DB_PORT ?? 55432);
export const API_PORT = Number(process.env.E2E_API_PORT ?? 8099);
export const BASE_URL = `http://127.0.0.1:${API_PORT}`;

/**
 * PGlite loads contrib through its constructor, so the `create extension`
 * lines are dropped — but only the ones it genuinely cannot satisfy. Removing
 * them all once took `pg_trgm` with it and left the trigram index unbuildable,
 * which failed as a syntax error a long way from the cause.
 */
function forPglite(sql) {
  return sql.replace(/create extension[^;]*\bpgcrypto\b[^;]*;/giu, "");
}

async function migrate(db) {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    await db.exec(forPglite(readFileSync(join(MIGRATIONS, file), "utf8")));
  }
  return files.length;
}

async function waitForHealth(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not listening yet. The deadline is the only thing that gives up.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${url} never became healthy`);
}

export async function startStack() {
  const db = await PGlite.create({ extensions: { pg_trgm, fuzzystrmatch } });
  const migrationCount = await migrate(db);

  /*
   * `maxConnections` defaults to 1, and the API's pool opens up to 10. Every
   * connection past the first was refused, which surfaced as an intermittent
   * 500 from /v1/me the moment a browser did what browsers do and issued
   * several requests at once. It looked exactly like an authentication bug in
   * the product, and was not: PGlite is single-threaded, so the socket server
   * queues at the query level, and the pool's ceiling is the number that has
   * to be allowed through.
   */
  const socket = new PGLiteSocketServer({
    db,
    port: DB_PORT,
    host: "127.0.0.1",
    maxConnections: 20,
  });
  await socket.start();

  /*
   * A bounded heap. Three things share this machine — a WASM PostgreSQL, a
   * browser and this server — and Node sizes its heap from total system
   * memory, so an idle API reserves far more than it needs and the kernel
   * kills whichever process asks next. That surfaces as "worker process exited
   * unexpectedly (SIGKILL)", which reads as a flaky test rather than the
   * memory ceiling it is. 768 MB is well above anything these flows allocate
   * and still leaves room for the other two.
   */
  const api = spawn(process.execPath, ["--max-old-space-size=768", join(ROOT, "apps/api/dist/index.js")], {
    env: {
      ...process.env,
      /*
       * Not "production", and the reason is worth stating because it looks
       * like the less faithful choice.
       *
       * The session cookie is marked `Secure` when NODE_ENV is production,
       * which is exactly right — and it means a browser silently discards it
       * over plain HTTP. Railway terminates TLS in front of the app, so the
       * real deployment never sees that; a local harness on http://127.0.0.1
       * would, and every test would fail at sign-in for a reason that has
       * nothing to do with the product. The alternative is a certificate and a
       * TLS listener here, which tests the harness rather than Rectangle.
       */
      NODE_ENV: "development",
      PORT: String(API_PORT),
      DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`,
      /*
       * A fixed secret, and safe to be fixed: it signs sessions for a database
       * that exists for the length of one test run and is never reachable from
       * outside this machine. It is not a credential to anything.
       */
      SESSION_JWT_SECRET: "e2e-only-secret-not-used-anywhere-else-000000",
      RECTANGLE_WEB_DIST: join(ROOT, "apps/web/dist"),
      APP_BASE_URL: `http://127.0.0.1:${API_PORT}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const log = [];
  api.stdout.on("data", (chunk) => { log.push(String(chunk)); if (process.env.E2E_VERBOSE) process.stdout.write(String(chunk)); });
  api.stderr.on("data", (chunk) => { log.push(String(chunk)); if (process.env.E2E_VERBOSE) process.stderr.write(String(chunk)); });

  // Surfaced deliberately: a server that exits during startup otherwise shows
  // up only as a timeout, with the reason sitting unread in a buffer.
  api.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`[e2e] API exited with ${code}:\n${log.join("")}\n`);
    }
  });

  try {
    await waitForHealth(`${BASE_URL}/health/live`);
  } catch (error) {
    process.stderr.write(`[e2e] API never started:\n${log.join("")}\n`);
    throw error;
  }

  return {
    baseUrl: BASE_URL,
    migrationCount,
    async stop() {
      api.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 500));
      api.kill("SIGKILL");
      await socket.stop();
      await db.close();
    },
  };
}
