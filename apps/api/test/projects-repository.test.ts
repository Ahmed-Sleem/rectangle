/**
 * Guards the projects list SQL.
 *
 * The service tests mock this repository, so nothing exercised the statement it
 * builds. That gap is exactly how a search query shipped binding four values
 * while referencing three placeholders — see `search-repository.test.ts`. The
 * list query has since grown two lateral joins, which is the kind of change
 * that quietly breaks placeholder arithmetic.
 *
 * These run the real builder against a fake pool and check what a database
 * would otherwise have to tell us in production.
 */
import { describe, expect, it } from "vitest";
import { PostgresProjectsRepository } from "../src/infrastructure/postgres/projects-repository.js";

const tenantId = "11111111-1111-4111-8111-111111111111";

interface Captured {
  sql: string;
  values: unknown[];
}

function fakePool(captured: Captured[], rows: Array<Record<string, unknown>> = []) {
  return {
    async query(sql: string, values: unknown[]) {
      captured.push({ sql, values });
      return { rows, rowCount: rows.length };
    },
  } as never;
}

/** Highest placeholder referenced, e.g. `$3` → 3. */
function placeholderCount(sql: string): number {
  const used = new Set([...sql.matchAll(/\$(\d+)/gu)].map((match) => Number(match[1])));
  return used.size === 0 ? 0 : Math.max(...used);
}

const baseRow = {
  id: "33333333-3333-4333-8333-333333333333",
  tenant_id: tenantId,
  name: "Riyadh Tower",
  code: "RT-01",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("projects list SQL", () => {
  it("binds exactly the parameters it references, for every filter combination", async () => {
    const combinations = [
      {},
      { status: "active" as const },
      { search: "tower" },
      { cursor: "33333333-3333-4333-8333-333333333333" },
      { status: "active" as const, search: "tower", cursor: "33333333-3333-4333-8333-333333333333" },
    ];

    for (const extra of combinations) {
      const captured: Captured[] = [];
      const repository = new PostgresProjectsRepository(fakePool(captured));
      await repository.listForTenant(tenantId, { limit: 20, ...extra });

      expect(captured).toHaveLength(1);
      const { sql, values } = captured[0]!;
      expect(placeholderCount(sql)).toBe(values.length);
    }
  });

  it("keeps the member sample scoped to the same tenant as the project", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresProjectsRepository(fakePool(captured));
    await repository.listForTenant(tenantId, { limit: 20 });

    const { sql } = captured[0]!;
    // A join on project_id alone would leak names across tenants if an id ever
    // repeated. Both the membership rows and the user rows are pinned.
    expect(sql).toContain("m.tenant_id = p.tenant_id");
    expect(sql).toContain("u.tenant_id = m.tenant_id");
    expect(sql).toContain("allm.tenant_id = p.tenant_id");
  });

  it("counts every member even though it only fetches a sample of names", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresProjectsRepository(fakePool(captured));
    await repository.listForTenant(tenantId, { limit: 20 });

    const { sql } = captured[0]!;
    // The names are capped for the card; the count must not be, or a project
    // with twenty members would claim it had five. The count therefore has to
    // come from its own aggregate over the membership table rather than from
    // the derived table the LIMIT applies to.
    expect(sql).toMatch(/limit\s+5/u);
    expect(sql).toMatch(/count\(\*\)::int\s+from project_members allm/u);

    // And the limited sample must not be what the count is taken from.
    const sample = sql.slice(sql.indexOf("from ("), sql.indexOf("as named"));
    expect(sample).toMatch(/limit\s+5/u);
    expect(sample).not.toContain("member_count");
  });

  it("reports the true member total alongside the sampled names", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresProjectsRepository(
      fakePool(captured, [{ ...baseRow, member_names: ["Mona Adel", "Sara Nabil"], member_count: 9 }]),
    );

    const [project] = await repository.listForTenant(tenantId, { limit: 20 });

    expect(project?.memberNames).toEqual(["Mona Adel", "Sara Nabil"]);
    expect(project?.memberCount).toBe(9);
  });

  it("leaves membership absent when the row carries none", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresProjectsRepository(fakePool(captured, [{ ...baseRow }]));

    const [project] = await repository.listForTenant(tenantId, { limit: 20 });

    // Writes return the bare row. Reporting an empty team there would be a
    // claim the query never made.
    expect(project?.memberNames).toBeUndefined();
    expect(project?.memberCount).toBeUndefined();
  });

  it("treats an empty team as empty rather than missing", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresProjectsRepository(
      fakePool(captured, [{ ...baseRow, member_names: [], member_count: 0 }]),
    );

    const [project] = await repository.listForTenant(tenantId, { limit: 20 });

    expect(project?.memberNames).toEqual([]);
    expect(project?.memberCount).toBe(0);
  });
});
