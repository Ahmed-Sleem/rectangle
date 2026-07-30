/**
 * The sliding-session migration, against real PostgreSQL.
 *
 * Its own file for the same reason as the permission migration: each PGlite
 * instance is a whole PostgreSQL compiled to WASM, and more than two resident
 * at once exhausts the worker. Files run one at a time, so a file is the
 * boundary that actually frees the previous database.
 *
 * The interesting cases are all about rows that already exist. A migration that
 * adds a not-null column to a live table either backfills correctly or takes
 * the deploy down, and the last one that got this wrong did exactly that.
 */
import { PGlite } from "@electric-sql/pglite";
/* Standard contrib in any managed Postgres; PGlite ships them separately. */
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateUpTo } from "./support/migrations.js";

/** Shared by both suites in this file; see the note above the second one. */
let db: PGlite;

const TENANT = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";
const OLD_SESSION = "66666666-6666-4666-8666-666666666666";

describe("session sliding expiry migration", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pg_trgm, fuzzystrmatch } });
    await migrateUpTo(db, "015_session_sliding_expiry.sql");
    /*
     * A session created under the old scheme: one deadline, an hour out, and
     * no notion of a cap. This is what every live row looks like at the moment
     * the migration runs.
     */
    await db.exec(`
      insert into tenants (id, name, slug) values ('${TENANT}','Sliding','sliding');
      insert into users (id, tenant_id, email, display_name, status)
        values ('${USER}','${TENANT}','site@example.com','Site Engineer','active');
      insert into auth_sessions (id, tenant_id, user_id, created_at, expires_at)
        values ('${OLD_SESSION}','${TENANT}','${USER}',
                now() - interval '30 minutes', now() + interval '30 minutes');
    `);
    await migrateUpTo(db);
  }, 60_000);

  async function session(): Promise<Record<string, unknown>> {
    const result = await db.query<Record<string, unknown>>(
      "select * from auth_sessions where id = $1",
      [OLD_SESSION],
    );
    return result.rows[0] ?? {};
  }

  it("gives an existing session a cap rather than leaving it null", async () => {
    // The column is not-null, so a row the backfill missed would have failed
    // the migration outright — but only if a row existed when it ran.
    expect((await session()).absolute_expires_at).not.toBeNull();
  });

  it("measures the cap from when the session began, not from the upgrade", async () => {
    /*
     * Measuring from `now()` would hand every signed-in person a fresh twelve
     * hours as a side effect of us deploying, which is a longer session than
     * the policy allows and one nobody chose to grant.
     */
    const row = await session();
    const created = new Date(String(row.created_at)).getTime();
    const cap = new Date(String(row.absolute_expires_at)).getTime();
    expect(cap - created).toBe(12 * 60 * 60 * 1000);
  });

  it("leaves the existing idle deadline where it was", async () => {
    // The migration grants a cap; it is not an opportunity to extend anybody.
    const row = await session();
    const expires = new Date(String(row.expires_at)).getTime();
    expect(expires).toBeLessThan(Date.now() + 31 * 60 * 1000);
  });

  it("records a last-seen time so a person recognises their own devices", async () => {
    expect((await session()).last_seen_at).not.toBeNull();
  });

  it("refuses a session capped before it was created", async () => {
    // The constraint is the thing that makes the column trustworthy later.
    await expect(
      db.exec(`
        insert into auth_sessions (tenant_id, user_id, created_at, expires_at, absolute_expires_at, last_seen_at)
          values ('${TENANT}','${USER}', now(), now() + interval '1 hour',
                  now() - interval '1 hour', now());
      `),
    ).rejects.toThrow();
  });

  it("is safe to run twice", async () => {
    // Re-running must not re-backfill a row whose cap has since been slid, or
    // an upgrade would silently reset everybody's clock.
    const before = await session();
    await migrateUpTo(db);
    expect((await session()).absolute_expires_at).toEqual(before.absolute_expires_at);
  });
});

/*
 * Shares the database above rather than standing up another.
 *
 * Each PGlite instance is a whole PostgreSQL compiled to WASM and the pages are
 * not returned to the operating system when one closes, so the cost accumulates
 * across a run until a worker is killed — which shows up as tests silently not
 * being counted rather than as a failure. These cases only read and insert
 * rows, so they have no reason to want a database of their own.
 */
describe("what the per-request lookup accepts", () => {
  /** Mirrors the predicate in `findActiveSession`. */
  async function isLive(id: string): Promise<boolean> {
    const result = await db.query<{ c: number }>(
      `select count(*)::int as c from auth_sessions
        where id = $1 and revoked_at is null
          and expires_at > now() and absolute_expires_at > now()`,
      [id],
    );
    return (result.rows[0]?.c ?? 0) > 0;
  }

  /*
   * Created well in the past, because both deadlines must postdate creation —
   * an expired session is one that began a while ago, and a fixture pretending
   * otherwise is rejected by the constraint rather than by the predicate under
   * test. My first version of this was, which is how I learned the constraint
   * was doing its job.
   */
  async function seed(id: string, expires: string, absolute: string): Promise<void> {
    await db.exec(`
      insert into auth_sessions (id, tenant_id, user_id, created_at, expires_at, absolute_expires_at, last_seen_at)
        values ('${id}','${TENANT}','${USER}', now() - interval '13 hours', ${expires}, ${absolute}, now());
    `);
  }

  it("accepts a session inside both deadlines", async () => {
    await seed("77777777-7777-4777-8777-777777777771", "now() + interval '1 hour'", "now() + interval '6 hours'");
    expect(await isLive("77777777-7777-4777-8777-777777777771")).toBe(true);
  });

  it("refuses one that has gone idle", async () => {
    await seed("77777777-7777-4777-8777-777777777772", "now() - interval '1 minute'", "now() + interval '6 hours'");
    expect(await isLive("77777777-7777-4777-8777-777777777772")).toBe(false);
  });

  it("refuses one past its cap however recently it was used", async () => {
    /*
     * The case the cap exists for: a tab polling in the background keeps the
     * idle deadline fresh forever. Only the cap stops it, so only the cap
     * bounds how long a stolen token stays useful.
     */
    await seed("77777777-7777-4777-8777-777777777773", "now() + interval '1 hour'", "now() - interval '1 minute'");
    expect(await isLive("77777777-7777-4777-8777-777777777773")).toBe(false);
  });

  it("never slides a deadline past the cap", async () => {
    // The update clamps with `least`, so even a caller asking for more than the
    // cap allows cannot get it.
    const id = "77777777-7777-4777-8777-777777777774";
    await seed(id, "now() + interval '1 hour'", "now() + interval '2 hours'");
    await db.query(
      `update auth_sessions
          set expires_at = least($2::timestamptz, absolute_expires_at), last_seen_at = now()
        where id = $1 and revoked_at is null`,
      [id, new Date(Date.now() + 99 * 60 * 60 * 1000).toISOString()],
    );
    const row = await db.query<Record<string, unknown>>(
      "select expires_at, absolute_expires_at from auth_sessions where id = $1",
      [id],
    );
    expect(new Date(String(row.rows[0]?.expires_at)).getTime()).toBe(
      new Date(String(row.rows[0]?.absolute_expires_at)).getTime(),
    );
  });
});

/*
 * Closed at the end of the file rather than at the end of the first suite,
 * because the second one shares it. Placed here so adding a third suite does
 * not silently reintroduce the second database.
 */
afterAll(async () => {
  await db.close();
});
