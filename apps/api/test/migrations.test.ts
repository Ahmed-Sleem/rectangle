/** Static checks catch migration patterns that would fail during Railway startup. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
});
