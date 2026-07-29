/**
 * The atomic permission split, run against real PostgreSQL on data shaped the
 * way production actually is.
 *
 * Its own file rather than a third suite beside the others, and that is a
 * memory constraint rather than an organisational preference. Each PGlite
 * instance is a whole PostgreSQL compiled to WASM; three resident at once
 * killed the worker part way through the run, and vitest reported it as an
 * unhandled error beside a summary that still looked green. Files run one at a
 * time, so a file is the boundary that actually frees the previous database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, forPglite, migrateUpTo } from "./support/migrations.js";

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
