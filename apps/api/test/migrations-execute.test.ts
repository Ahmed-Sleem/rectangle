/**
 * Executes every migration against a real PostgreSQL.
 *
 * `migrations.test.ts` reads the files and checks them for patterns. That is
 * not the same as running them, and the difference cost a failed production
 * deploy: migration 012 rewrote `tenant_user_roles` values *before* widening
 * the check constraint that governed them, so the very first UPDATE was
 * rejected by the constraint it was about to replace. Every static check
 * passed. The database was the only thing that could have said no.
 *
 * PGlite is PostgreSQL compiled to WebAssembly — the actual engine, not a
 * simulation — so constraints, triggers and generated columns all behave as
 * they do in production. It is a dev dependency and never ships.
 */
import { PGlite } from "@electric-sql/pglite";
/* Standard contrib in any managed Postgres; PGlite ships them separately. */
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateUpTo } from "./support/migrations.js";

/** The shapes production actually contains, seeded before the 012 rewrite. */
const LEGACY_FIXTURE = `
  insert into tenants (id, name, slug) values
    ('11111111-1111-4111-8111-111111111111','Acme','acme'),
    ('22222222-2222-4222-8222-222222222222','Ownerless','ownerless');

  insert into users (id, tenant_id, email, display_name, status) values
    ('aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','owner@a.co','Owner','active'),
    ('aaaaaaaa-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','viewer@a.co','Viewer','active'),
    ('aaaaaaaa-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','norole@a.co','No Role','active'),
    ('bbbbbbbb-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','admin@b.co','Admin Only','active');

  -- The multi-row shape setup used to write, plus somebody holding two roles.
  insert into tenant_user_roles (tenant_id, user_id, role) values
    ('11111111-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111','tenant_owner'),
    ('11111111-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111','tenant_admin'),
    ('11111111-1111-4111-8111-111111111111','aaaaaaaa-2222-4222-8222-222222222222','viewer'),
    ('11111111-1111-4111-8111-111111111111','aaaaaaaa-2222-4222-8222-222222222222','project_manager'),
    ('22222222-2222-4222-8222-222222222222','bbbbbbbb-1111-4111-8111-111111111111','tenant_admin');

  -- Projects as they exist in a database that predates the creator being
  -- enrolled automatically: real work, and not one row in project_members.
  insert into projects (id, tenant_id, name, code, status) values
    ('cccccccc-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Legacy Tower','LT-001','active'),
    ('cccccccc-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Staffed Depot','SD-002','active');

  -- One of them already has a team, so the migration has something it must
  -- leave alone. Without this the test could not tell "repairs what is broken"
  -- from "writes rows everywhere".
  insert into project_members (tenant_id, project_id, user_id, role) values
    ('11111111-1111-4111-8111-111111111111','cccccccc-2222-4222-8222-222222222222','aaaaaaaa-2222-4222-8222-222222222222','viewer');
`;

describe("migrations execute against PostgreSQL", () => {
  it("applies every migration to an empty database", async () => {
    const db = new PGlite({ extensions: { pg_trgm, fuzzystrmatch } });
    try {
      // No fixture: a brand-new company installing the product for the first
      // time runs exactly this, and it must not depend on data existing.
      await expect(migrateUpTo(db)).resolves.toBeUndefined();
    } finally {
      await db.close();
    }
  }, 60_000);
});

describe("company standing migration", () => {
  let db: PGlite;

  /*
   * One database for the whole suite, and it also stands in for what used to be
   * a separate "applies on top of legacy data" case.
   *
   * That case built an identical database and asserted only that migrating did
   * not throw — which every assertion below already depends on, since none of
   * them could run if it had. Two instances to prove one thing was the
   * difference between this file fitting in memory and not: each PGlite is a
   * whole PostgreSQL compiled to WASM, and the pages are not returned to the
   * operating system when one is closed, so the cost is cumulative across a
   * run rather than momentary.
   */
  beforeAll(async () => {
    db = new PGlite({ extensions: { pg_trgm, fuzzystrmatch } });
    await migrateUpTo(db, "012_company_standing.sql");
    await db.exec(LEGACY_FIXTURE);
    await expect(migrateUpTo(db)).resolves.toBeUndefined();
  }, 60_000);

  async function count(sql: string): Promise<number> {
    const result = await db.query<{ c: number }>(sql);
    return result.rows[0]?.c ?? -1;
  }

  /*
   * Freed as soon as this suite is done rather than at the end of the file.
   *
   * Each instance is a whole PostgreSQL compiled to WASM, and vitest keeps a
   * describe block's fixtures alive until its own hooks run — so three suites
   * in one file meant three databases resident at once and a worker that died
   * part way through. It surfaced as tests silently not running beside a
   * green-looking summary, which is the worst way for a check to break.
   */
  afterAll(async () => {
    await db.close();
  });

  it("leaves no legacy role name behind", async () => {
    expect(
      await count(`select count(*)::int as c from tenant_user_roles
                    where role not in ('owner','admin','member','guest')`),
    ).toBe(0);
  });

  it("leaves nobody holding two standings", async () => {
    // The fault the owner spotted: somebody who was viewer and owner at once.
    expect(
      await count(`select count(*)::int as c from (
                     select tenant_id, user_id from tenant_user_roles
                      group by 1, 2 having count(*) > 1
                   ) as duplicated`),
    ).toBe(0);
  });

  it("keeps the most capable standing when collapsing several", async () => {
    const result = await db.query<{ role: string }>(
      `select role from tenant_user_roles
        where user_id = 'aaaaaaaa-1111-4111-8111-111111111111'`,
    );
    // Held tenant_owner and tenant_admin; owner is the one that survives.
    expect(result.rows[0]?.role).toBe("owner");
  });

  it("maps a company-wide project role down to member", async () => {
    const result = await db.query<{ role: string }>(
      `select role from tenant_user_roles
        where user_id = 'aaaaaaaa-2222-4222-8222-222222222222'`,
    );
    // Held viewer and project_manager. Neither is a company standing; the
    // company-wide project_manager is exactly what silently granted manage
    // rights on every project.
    expect(result.rows[0]?.role).toBe("member");
  });

  it("gives a standing to somebody who had no row at all", async () => {
    expect(
      await count(`select count(*)::int as c from users u
                    where not exists (
                      select 1 from tenant_user_roles r
                       where r.tenant_id = u.tenant_id and r.user_id = u.id
                    )`),
    ).toBe(0);
  });

  it("leaves no company without an owner", async () => {
    // A company nobody owns cannot be repaired from inside the product.
    expect(
      await count(`select count(*)::int as c from tenants t
                    where not exists (
                      select 1 from tenant_user_roles r
                       where r.tenant_id = t.id and r.role = 'owner'
                    )`),
    ).toBe(0);
  });

  it("promotes the existing admin when a company had no owner", async () => {
    const result = await db.query<{ role: string }>(
      `select role from tenant_user_roles
        where user_id = 'bbbbbbbb-1111-4111-8111-111111111111'`,
    );
    expect(result.rows[0]?.role).toBe("owner");
  });

  it("refuses a legacy role name afterwards", async () => {
    await expect(
      db.exec(`insert into tenant_user_roles (tenant_id, user_id, role) values
               ('11111111-1111-4111-8111-111111111111','aaaaaaaa-3333-4333-8333-333333333333','tenant_owner')`),
    ).rejects.toThrow(/check constraint/iu);
  });

  it("refuses a second standing for the same person", async () => {
    // The primary key is what makes the contradiction unrepresentable.
    await expect(
      db.exec(`insert into tenant_user_roles (tenant_id, user_id, role) values
               ('11111111-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111','admin')`),
    ).rejects.toThrow(/duplicate key|unique/iu);
  });

  /*
   * The fault this repairs is not a bug in the schema — it is the consequence
   * of a correct rule meeting data that predates it. Once reading a project
   * requires reach, a project with no members is reachable only by people who
   * reach everything, and nothing in `projects` records who created it.
   *
   * The repair has to be unreachable-proof: adding somebody to a project needs
   * `project_team.manage` on that project, which needs to reach it, which is
   * the thing that is missing. So the database has to do it.
   */
  it("gives every memberless project the company owners and admins", async () => {
    const result = await db.query<{ user_id: string; role: string }>(
      `select user_id, role from project_members
        where project_id = 'cccccccc-1111-4111-8111-111111111111'
        order by user_id`,
    );

    // The owner holds both 'owner' and 'admin' rows in the legacy fixture and
    // is collapsed to one standing by migration 012, so they appear once.
    expect(result.rows).toEqual([
      { user_id: "aaaaaaaa-1111-4111-8111-111111111111", role: "project_admin" },
    ]);
  });

  it("leaves a project that already has a team exactly as it was", async () => {
    /*
     * The half that stops this being a licence to enrol everybody everywhere.
     * A project with members is somebody's, and the migration has no business
     * adding the company's administrators to it.
     */
    const result = await db.query<{ user_id: string; role: string }>(
      `select user_id, role from project_members
        where project_id = 'cccccccc-2222-4222-8222-222222222222'`,
    );

    expect(result.rows).toEqual([
      { user_id: "aaaaaaaa-2222-4222-8222-222222222222", role: "viewer" },
    ]);
  });

  it("leaves no project in the database unreachable", async () => {
    // The property that actually matters, stated directly rather than inferred
    // from the two cases above.
    const orphans = await db.query<{ c: number }>(
      `select count(*)::int as c from projects p
        where not exists (
          select 1 from project_members m
           where m.tenant_id = p.tenant_id and m.project_id = p.id
        )`,
    );
    expect(orphans.rows[0]?.c).toBe(0);
  });

  it("changes nothing when run a second time", async () => {
    // Every migration runs on each boot, so a second pass must be a no-op.
    const before = await db.query<{ c: number }>("select count(*)::int as c from project_members");
    await migrateUpTo(db);
    const after = await db.query<{ c: number }>("select count(*)::int as c from project_members");
    expect(after.rows[0]?.c).toBe(before.rows[0]?.c);
  });
});
