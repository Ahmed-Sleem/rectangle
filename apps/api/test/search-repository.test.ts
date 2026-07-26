/**
 * Guards the search SQL itself.
 *
 * The service tests mock this repository, so nothing exercised the statements
 * it builds — which is how a query that bound four values while referencing
 * three placeholders reached production and broke search for every
 * administrator. These tests run the real query builder against a fake pool
 * and check the two things that were wrong.
 */
import { describe, expect, it } from "vitest";
import {
  PostgresSearchRepository,
  searchInternals,
} from "../src/infrastructure/postgres/search-repository.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

interface Captured {
  sql: string;
  values: unknown[];
}

/** Records what would have been sent instead of talking to a database. */
function fakePool(captured: Captured[]) {
  return {
    async query(sql: string, values: unknown[]) {
      captured.push({ sql, values });
      return { rows: [], rowCount: 0 };
    },
  } as never;
}

/** Highest placeholder referenced, e.g. `$3` → 3. */
function placeholderCount(sql: string): number {
  const used = new Set([...sql.matchAll(/\$(\d+)/gu)].map((match) => Number(match[1])));
  return used.size === 0 ? 0 : Math.max(...used);
}

describe("search SQL", () => {
  it("binds exactly the parameters each statement references", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresSearchRepository(fakePool(captured));

    // Every register, and both task scopes: the mismatch only appeared in one.
    await repository.searchProjects(tenantId, "cairo", 5);
    await repository.searchPeople(tenantId, "cairo", 5);
    await repository.searchTasks(tenantId, userId, "cairo", 5, "member");
    await repository.searchTasks(tenantId, userId, "cairo", 5, "all");

    expect(captured).toHaveLength(4);
    for (const { sql, values } of captured) {
      expect(placeholderCount(sql)).toBe(values.length);
    }
  });

  it("drops the membership value when the clause using it is absent", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresSearchRepository(fakePool(captured));

    await repository.searchTasks(tenantId, userId, "cairo", 5, "all");

    // A tenant-wide manager needs no membership filter, so the user id must
    // not be bound: Postgres refuses a bind with more values than parameters.
    expect(captured[0]!.values).not.toContain(userId);
  });

  it("keeps the membership value when the clause is present", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresSearchRepository(fakePool(captured));

    await repository.searchTasks(tenantId, userId, "cairo", 5, "member");

    expect(captured[0]!.sql).toContain("project_members");
    expect(captured[0]!.values).toContain(userId);
  });

  it("searches the indexed column rather than scanning with a leading wildcard", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresSearchRepository(fakePool(captured));

    await repository.searchProjects(tenantId, "cairo", 5);

    // `ilike '%term%'` cannot use an index; the generated column can.
    expect(captured[0]!.sql).toContain("search_document @@ to_tsquery");
    expect(captured[0]!.sql).not.toMatch(/ilike/iu);
  });

  it("ranks results so the best match is first", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresSearchRepository(fakePool(captured));

    await repository.searchProjects(tenantId, "cairo", 5);

    expect(captured[0]!.sql).toContain("ts_rank_cd");
  });
});

describe("prefix query building", () => {
  it("matches a word still being typed", () => {
    // Without `:*`, nothing matches until the word is finished.
    expect(searchInternals.prefixQuery("cai")).toBe("cai:*");
  });

  it("requires every word, so more typing narrows rather than widens", () => {
    expect(searchInternals.prefixQuery("new cairo")).toBe("new:* & cairo:*");
  });

  it("strips punctuation that to_tsquery would reject", () => {
    // A raw apostrophe or ampersand makes to_tsquery throw a syntax error.
    expect(searchInternals.prefixQuery("a & b")).toBe("a:* & b:*");
    expect(searchInternals.prefixQuery("o'brien")).toBe("o:* & brien:*");
  });

  it("produces nothing for a term with no searchable characters", () => {
    // Returned early rather than passed on, because to_tsquery rejects it.
    expect(searchInternals.prefixQuery("!!!")).toBe("");
  });

  it("keeps Arabic words intact", () => {
    expect(searchInternals.prefixQuery("مشروع القاهرة")).toBe("مشروع:* & القاهرة:*");
  });
});
