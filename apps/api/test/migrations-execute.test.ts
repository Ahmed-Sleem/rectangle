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
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort();
}

/**
 * `pgcrypto` is unavailable in PGlite, but the only thing the schema uses it
 * for — `gen_random_uuid` — is built into PostgreSQL 13 and later, which is
 * what PGlite is. Dropping the extension statement changes nothing the
 * migrations depend on.
 */
function forPglite(sql: string): string {
  return sql.replace(/create extension[^;]*;/giu, "");
}

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
`;

async function migrateUpTo(db: PGlite, stopBefore?: string): Promise<void> {
  for (const file of migrationFiles()) {
    if (stopBefore && file >= stopBefore) return;
    await db.exec(forPglite(readFileSync(join(MIGRATIONS_DIR, file), "utf8")));
  }
}

describe("migrations execute against PostgreSQL", () => {
  it("applies every migration to an empty database", async () => {
    const db = new PGlite();
    try {
      // No fixture: a brand-new company installing the product for the first
      // time runs exactly this, and it must not depend on data existing.
      await expect(migrateUpTo(db)).resolves.toBeUndefined();
    } finally {
      await db.close();
    }
  }, 60_000);

  it("applies every migration on top of legacy data", async () => {
    const db = new PGlite();
    try {
      await migrateUpTo(db, "012_company_standing.sql");
      await db.exec(LEGACY_FIXTURE);
      await expect(migrateUpTo(db)).resolves.toBeUndefined();
    } finally {
      await db.close();
    }
  }, 60_000);
});

describe("company standing migration", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await migrateUpTo(db, "012_company_standing.sql");
    await db.exec(LEGACY_FIXTURE);
    await migrateUpTo(db);
  }, 60_000);

  async function count(sql: string): Promise<number> {
    const result = await db.query<{ c: number }>(sql);
    return result.rows[0]?.c ?? -1;
  }

  /*
   * Each PGlite instance holds a whole PostgreSQL compiled to WASM in memory.
   * Two suites left theirs open for the length of the run and a third tipped
   * the worker over, which surfaced as tests silently not running rather than
   * as a failure — the worst way for a check to break.
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
});

/**
 * The atomic permission split, run against real PostgreSQL on data shaped the
 * way production actually is.
 *
 * Asserted here rather than in a unit test because the mapping is a single SQL
 * statement doing set arithmetic on arrays, and the failure mode that matters —
 * somebody quietly losing access on upgrade morning — is invisible to anything
 * that does not execute it.
 */
describe("atomic permission migration", () => {
  let db: PGlite;

  const TENANT = "33333333-3333-4333-8333-333333333333";

  async function permissionsOf(key: string): Promise<string[]> {
    const result = await db.query<{ permissions: string[] }>(
      "select permissions from user_types where tenant_id = $1 and key = $2",
      [TENANT, key],
    );
    return result.rows[0]?.permissions ?? [];
  }

  beforeAll(async () => {
    db = new PGlite();
    await migrateUpTo(db, "014_atomic_permissions.sql");
    // User types carrying the coarse keys, exactly as a company upgrading from
    // the previous release would have them.
    await db.exec(`
      insert into tenants (id, name, slug) values ('${TENANT}','Split','split');
      insert into user_types (tenant_id, name, key, description, permissions, system_type) values
        ('${TENANT}','Full access','full_access','',
          array['projects.read','projects.manage','users.read','users.manage',
                'user_types.read','user_types.manage','settings.manage',
                'activity.read_team','activity.read_all'], true),
        ('${TENANT}','Project Manager','project_manager','',
          array['projects.read','projects.manage','users.read','user_types.read'], true),
        ('${TENANT}','Viewer','viewer','', array['projects.read'], true),
        ('${TENANT}','Site clerk','site_clerk','', array['projects.read'], false),
        ('${TENANT}','Auditor','auditor','', array['activity.read_all'], false);
    `);
    await migrateUpTo(db);
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("leaves no retired key anywhere", async () => {
    const result = await db.query<{ c: number }>(
      `select count(*)::int as c from user_types
        where permissions && array['projects.manage','users.manage','user_types.manage']`,
    );
    expect(result.rows[0]?.c).toBe(0);
  });

  it("keeps a full-access type holding everything it held", async () => {
    const permissions = await permissionsOf("full_access");
    for (const expected of [
      "projects.create", "projects.edit", "projects.archive", "projects.delete",
      "projects.manage_all", "project_team.manage", "tasks.delete", "risks.delete",
      "users.create", "users.edit", "users.disable",
      "user_types.create", "user_types.edit", "user_types.delete",
      "settings.manage", "activity.read_all",
    ]) {
      expect(permissions).toContain(expected);
    }
  });

  it("takes the power to destroy away from the seeded project office", async () => {
    // The owner's rule: deleting is for the administrator of that project, not
    // for whoever runs the project office across the company.
    const permissions = await permissionsOf("project_manager");
    expect(permissions).not.toContain("projects.delete");
    // It keeps everything else it could do, so this is a narrowing of one power
    // rather than a demotion.
    expect(permissions).toContain("projects.manage_all");
    expect(permissions).toContain("projects.edit");
    expect(permissions).toContain("projects.archive");
  });

  it("gives a read-only type the reads that used to be implied, and nothing else", async () => {
    const permissions = await permissionsOf("viewer");
    expect([...permissions].sort()).toEqual(
      ["project_team.read", "projects.read", "risks.read", "tasks.read"],
    );
  });

  it("renames the two types whose names collided with other vocabulary", async () => {
    const result = await db.query<{ key: string; name: string }>(
      "select key, name from user_types where tenant_id = $1 and system_type order by key",
      [TENANT],
    );
    const names = Object.fromEntries(result.rows.map((row) => [row.key, row.name]));
    expect(names["project_manager"]).toBe("Project office");
    expect(names["viewer"]).toBe("Read only");
    // Keys are what assignments point at, so they must survive the rename.
    expect(names["full_access"]).toBe("Full access");
  });

  it("treats a company's own types the same as the seeded ones", async () => {
    // A company-defined read-only type must not be left behind by a migration
    // that only knew about the seeded names.
    expect([...(await permissionsOf("site_clerk"))].sort()).toEqual(
      ["project_team.read", "projects.read", "risks.read", "tasks.read"],
    );
  });

  it("leaves a type holding none of the retired keys untouched", async () => {
    expect(await permissionsOf("auditor")).toEqual(["activity.read_all"]);
  });

  it("is safe to run twice", async () => {
    // Migrations are re-run against databases in unknown states often enough
    // that "applied once" is not a safe assumption to build a mapping on.
    const before = await permissionsOf("full_access");
    await db.exec(
      forPglite(readFileSync(join(MIGRATIONS_DIR, "014_atomic_permissions.sql"), "utf8")),
    );
    expect(await permissionsOf("full_access")).toEqual(before);
  });
});
