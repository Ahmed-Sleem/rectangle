/** Static checks catch migration patterns that would fail during Railway startup. */
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMigrationDatabaseUrl, resolveMigrationsDir } from "../src/infrastructure/postgres/migrate.js";

const migrationsDir = new URL("../migrations", import.meta.url);

describe("PostgreSQL migrations", () => {
  it("keeps migration files ordered and free of unsupported expression constraints", () => {
    const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

    expect(files).toEqual(["001_core_projects.sql", "002_auth_sessions.sql"]);

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir.pathname, file), "utf8");
      expect(sql).not.toMatch(/unique\s*\([^)]*lower\s*\(/iu);
    }
  });

  it("resolves migrations from the service working directory used by Docker", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "rectangle-migrations-"));
    try {
      mkdirSync(join(tempRoot, "migrations"));
      await expect(resolveMigrationsDir(tempRoot)).resolves.toBe(join(tempRoot, "migrations"));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("requires only DATABASE_URL for the migration process", () => {
    expect(loadMigrationDatabaseUrl({ DATABASE_URL: "postgres://user:pass@localhost:5432/rectangle" })).toBe(
      "postgres://user:pass@localhost:5432/rectangle",
    );
  });
});
