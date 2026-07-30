/**
 * The one search engine, executed against a real PostgreSQL.
 *
 * These assert on rows returned, not on the SQL produced. A test that checked
 * the generated string would pass while the query was syntactically valid and
 * semantically wrong, which is the failure mode that matters here: every one of
 * the six engines this replaces returned *something*, and the something was
 * just worse than it looked.
 *
 * The cases are the ones a person actually produces at a keyboard — a partial
 * word, a swapped pair of letters, an Arabic name typed with whichever alef the
 * keyboard offered — rather than the ones that are convenient to write.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSearchClause, buildExpressionSearchClause } from "../src/infrastructure/postgres/search-sql.js";
import { createSearchDatabase } from "./support/search-database.js";

let db: PGlite;

beforeAll(async () => {
  db = await createSearchDatabase();
  await db.exec(`
    insert into projects (name, code, location_name) values
      ('New Cairo Hospital', 'NCH-001', 'New Cairo'),
      ('Cairo Metro Line 4', 'CML-004', 'Cairo'),
      ('Marina Towers', 'MRT-009', 'Alexandria'),
      ('مشروع أحمد للإنشاءات', 'AHM-001', 'القاهرة'),
      ('مستشفى إبراهيم', 'IBR-002', 'الإسكندرية');

    insert into tasks (title, description) values
      ('Pour foundation slab', 'Concrete works for block A'),
      ('Install curtain wall', 'Glazing to the north elevation');

    insert into risks (title, description, mitigation) values
      ('Delayed steel delivery', 'Supplier lead time slipped', 'Dual-source the fabricator'),
      ('Groundwater ingress', 'High water table on site', 'Install dewatering wells');

    insert into users (display_name, email) values
      ('Ahmed Sleem', 'ahmed@example.com'),
      ('أحمد سليم', 'ahmed.ar@example.com'),
      ('Mona Adel', 'mona@example.com');
  `);
}, 60_000);

afterAll(async () => {
  await db.close();
});

/** Runs a search the way a repository would, and returns the matched names. */
async function runStage(
  table: string,
  nameColumn: string,
  term: string,
  fuzzyExpression: string,
  mode: "exact" | "fuzzy",
): Promise<string[]> {
  const clause = buildSearchClause(term, "search_document", fuzzyExpression, 1, mode);
  if (!clause) return [];
  const result = await db.query<Record<string, string>>(
    `select ${nameColumn} as label
       from ${table}
      where ${clause.where}
      order by ${clause.rank} desc, ${nameColumn}`,
    clause.values,
  );
  return result.rows.map((row) => row.label ?? "");
}

/**
 * Exactly what a repository does: the precise search, and only if it found
 * nothing, the forgiving one. Written here rather than assumed, so these tests
 * exercise the same two-step the product performs.
 */
async function search(
  table: string,
  nameColumn: string,
  term: string,
  fuzzyExpression?: string,
): Promise<string[]> {
  const expression = fuzzyExpression ?? nameColumn;
  const exact = await runStage(table, nameColumn, term, expression, "exact");
  if (exact.length > 0) return exact;
  return runStage(table, nameColumn, term, expression, "fuzzy");
}

describe("normalising a term", () => {
  it("folds the QUERY as well as the stored document", async () => {
    /*
     * Both sides must be folded by the same function or they never meet, and it
     * is easy to fold only one and think it works. The stored document for
     * 'أحمد سليم' already contains the plain-alef form, so searching 'احمد'
     * succeeds even with an unfolded query — the test that catches a one-sided
     * fold has to search the *hamza* form and find the record whose text was
     * stored with it. `Ahmed Sleem` is here to prove Latin still behaves.
     */
    /*
     * Asserted on the exact stage alone. Through the full two-stage search the
     * fuzzy pass rescues an unfolded query — trigrams do not care about hamza —
     * so a one-sided fold still appears to work. Only the precise stage can say
     * whether the two sides genuinely agree.
     */
    expect(await runStage("users", "display_name", "أحمد", "display_name", "exact"))
      .toContain("أحمد سليم");
    expect(await runStage("users", "display_name", "احمد", "display_name", "exact"))
      .toContain("أحمد سليم");
  });

  it("treats every alef the same, because a keyboard offers whichever it offers", async () => {
    /*
     * This is the case `unaccent` cannot do. I checked before relying on it:
     * unaccent folds 'Héllo' to 'Hello' and returns 'أَحْمَد' untouched. It knows
     * Latin diacritics and nothing about Arabic orthography, so the folding is
     * ours to do.
     */
    for (const spelling of ["أحمد", "احمد", "إحمد", "آحمد"]) {
      expect(await search("users", "display_name", spelling)).toContain("أحمد سليم");
    }
  });

  it("ignores tashkeel, which is decoration rather than spelling", async () => {
    expect(await search("users", "display_name", "أَحْمَد")).toContain("أحمد سليم");
  });

  it("ignores tatweel, which only stretches a word visually", async () => {
    expect(await search("users", "display_name", "أحـــمد")).toContain("أحمد سليم");
  });

  it("is case-insensitive in Latin script", async () => {
    expect(await search("projects", "name", "CAIRO")).toContain("New Cairo Hospital");
    expect(await search("projects", "name", "cairo")).toContain("New Cairo Hospital");
  });

  it("finds an Arabic project by a word inside its name", async () => {
    expect(await search("projects", "name", "الانشاءات")).toContain("مشروع أحمد للإنشاءات");
  });
});

describe("matching whole words", () => {
  it("finds every record containing the word, best first", async () => {
    const rows = await search("projects", "name", "cairo");
    expect(rows).toContain("New Cairo Hospital");
    expect(rows).toContain("Cairo Metro Line 4");
  });

  it("finds a record by its code, which is what people paste", async () => {
    expect(await search("projects", "name", "NCH-001")).toEqual(["New Cairo Hospital"]);
  });

  it("requires all the words, so a second word narrows rather than widens", async () => {
    // The old `ilike '%term%'` could not do this at all: it matched the whole
    // phrase as one substring, so "cairo hospital" found nothing.
    expect(await search("projects", "name", "cairo hospital")).toEqual(["New Cairo Hospital"]);
  });

  it("searches a risk by the words in its mitigation", async () => {
    // Mitigation was in no search index anywhere before this.
    expect(await search("risks", "title", "dewatering")).toEqual(["Groundwater ingress"]);
  });

  it("searches a task by its description", async () => {
    expect(await search("tasks", "title", "glazing")).toEqual(["Install curtain wall"]);
  });

  it("returns nothing for a term that matches nothing", async () => {
    // Rather than everything, which is what a broken predicate usually does.
    expect(await search("projects", "name", "zzzznotathing")).toEqual([]);
  });
});

describe("matching a word still being typed", () => {
  it("matches on a prefix, because a palette answers per keystroke", async () => {
    /*
     * `websearch_to_tsquery` produces no prefix of its own, so without this
     * 'cai' matches nothing until the whole of 'cairo' is typed — the feature
     * looks broken right up to the moment it stops being needed.
     */
    expect(await search("projects", "name", "cai")).toContain("New Cairo Hospital");
    expect(await search("projects", "name", "hospit")).toContain("New Cairo Hospital");
  });

  it("narrows as more words are typed", async () => {
    const one = await search("projects", "name", "cai");
    const two = await search("projects", "name", "new cai");
    expect(one.length).toBeGreaterThan(two.length);
    expect(two).toEqual(["New Cairo Hospital"]);
  });

  it("does not turn an exclusion into a prefix", async () => {
    /*
     * The dangerous case. `cai -metro` renders as `'cai' & !'metro'`, and
     * appending `:*` to the query text would attach it to the *exclusion*,
     * silently widening what is being excluded to everything starting "metro".
     * Appending is therefore only allowed when the query ends in a plain
     * positive lexeme.
     */
    expect(await search("projects", "name", "cai -metro")).toEqual(["New Cairo Hospital"]);
  });

  it("matches an Arabic word by prefix too", async () => {
    expect(await search("users", "display_name", "أحم")).toContain("أحمد سليم");
  });
});

describe("the syntax people already know from the web", () => {
  it("treats a quoted phrase as a phrase", async () => {
    const rows = await search("projects", "name", '"new cairo"');
    expect(rows).toEqual(["New Cairo Hospital"]);
  });

  it("excludes a term after a minus sign", async () => {
    /*
     * The case that decided the whole design. Running the fuzzy pass alongside
     * full text rather than only as a fallback let the excluded row back in,
     * because "Cairo Metro Line 4" is similar to the word "cairo" whatever the
     * exclusion said. Fuzzy runs only when full text found nothing.
     */
    const rows = await search("projects", "name", "cairo -metro");
    expect(rows).toEqual(["New Cairo Hospital"]);
  });

  it("does not guess when the person used operators", async () => {
    /*
     * Somebody writing `-` or quotes is being precise, and approximations are
     * the opposite of what they asked for. Tested with a term that finds
     * nothing exactly and would otherwise be rescued: 'hospitl' alone reaches
     * the hospital through the fuzzy stage, so if operators did not disable it
     * the exclusion would be quietly ignored.
     */
    expect(await search("projects", "name", "hospitl")).toContain("New Cairo Hospital");
    expect(await search("projects", "name", "hospitl -cairo")).toEqual([]);
  });

  it("accepts or between alternatives", async () => {
    const rows = await search("projects", "name", "marina or metro");
    expect(rows).toContain("Marina Towers");
    expect(rows).toContain("Cairo Metro Line 4");
  });
});

describe("forgiving a typo", () => {
  it("finds a word with a letter missing", async () => {
    expect(await search("projects", "name", "hospitl")).toContain("New Cairo Hospital");
  });

  it("finds a word with two letters swapped", async () => {
    /*
     * Trigram similarity alone cannot do this. Swapping two characters destroys
     * most of the trigrams in a short word, so "ciaro" scores 0.2 against
     * "cairo" — indistinguishable from noise, and lowering the threshold that
     * far matches half the table. Edit distance sees two operations and says so.
     */
    expect(await search("projects", "name", "ciaro")).toContain("New Cairo Hospital");
  });

  it("finds a word with a letter doubled", async () => {
    expect(await search("projects", "name", "marinna")).toContain("Marina Towers");
  });

  it("does not treat a different word as a typo", async () => {
    /*
     * The other half of typo tolerance, and the half that makes it usable. Three
     * edits apart is where genuinely different short words live: "metro" is
     * three from "cairo". Accepting three would make every five-letter search
     * return most of the table.
     */
    const rows = await search("projects", "name", "metro");
    expect(rows).not.toContain("New Cairo Hospital");
  });

  it("does not fuzzy-match a term too short to be meaningfully wrong", async () => {
    // Nearly every short word is within two edits of "abc", so below four
    // characters the fuzzy stage is switched off entirely.
    const rows = await search("projects", "name", "abc");
    expect(rows).toEqual([]);
  });

  it("does not let a guess widen a search that already matched", async () => {
    /*
     * The rule that keeps `-exclude` honest, tested on a term with no operators
     * so the guard is actually exercised. An earlier version of this file only
     * tested exclusion through operator syntax, where the fuzzy stage is
     * switched off for a different reason — so removing the guard entirely left
     * every test green.
     *
     * 'hospital' matches one project exactly. Without the guard the fuzzy stage
     * also runs and pulls in anything merely similar; with it, an exact answer
     * stays an exact answer.
     */
    await db.exec(
      `insert into projects (name, code, location_name)
         values ('Hospitel Annexe', 'HSA-001', 'Giza')`,
    );
    expect(await search("projects", "name", "hospital")).toEqual(["New Cairo Hospital"]);
    // And the near-miss is still reachable when nothing matches exactly.
    expect(await search("projects", "name", "hospitel")).toContain("Hospitel Annexe");
    await db.exec(`delete from projects where code = 'HSA-001'`);
  });

  it("prefers an exact match over an approximate one", async () => {
    // A guess must never displace a real match, however close the guess.
    const rows = await search("projects", "name", "marina");
    expect(rows[0]).toBe("Marina Towers");
  });
});

describe("ranking", () => {
  it("puts a name match above a match in a lesser field", async () => {
    /*
     * The weights exist for this. 'Cairo' is in one project's name and another's
     * location; unweighted, `ts_rank_cd` scores them equally and the order is
     * effectively arbitrary.
     */
    /*
     * Named to sort *before* the name match alphabetically, so the secondary
     * `order by name` cannot produce the expected order on its own. An earlier
     * version used 'Riverside Depot', which sorts after 'Cairo Metro Line 4'
     * anyway — that test passed with the ranking replaced by a constant.
     */
    await db.exec(
      `insert into projects (name, code, location_name)
         values ('Abu Depot', 'ABD-001', 'Cairo Industrial Zone')`,
    );
    const rows = await search("projects", "name", "cairo");
    expect(rows.indexOf("Cairo Metro Line 4")).toBeLessThan(rows.indexOf("Abu Depot"));
    await db.exec(`delete from projects where code = 'ABD-001'`);
  });
});

describe("an empty term", () => {
  it("produces no clause at all, rather than one matching nothing", async () => {
    // A caller with no search term must get its unfiltered list back. Returning
    // a clause that matches nothing would empty every page that has a search box.
    expect(buildSearchClause("", "search_document", "name", 1)).toBeNull();
    expect(buildSearchClause("   ", "search_document", "name", 1)).toBeNull();
  });
});

describe("tables assembled from joins", () => {
  it("matches across several expressions with the same rules", async () => {
    /*
     * Activity rows have no stored document — they are built from joins — so
     * they take the expression form. The mechanism differs; the behaviour a
     * person sees must not.
     */
    const clause = buildExpressionSearchClause("ahmed", ["display_name", "email"], 1, "exact");
    expect(clause).not.toBeNull();
    const result = await db.query<{ display_name: string }>(
      `select display_name from users where ${clause?.where} order by ${clause?.rank} desc`,
      clause?.values ?? [],
    );
    expect(result.rows.map((row) => row.display_name)).toContain("Ahmed Sleem");
  });

  it("normalises Arabic in the expression form too", async () => {
    const clause = buildExpressionSearchClause("احمد", ["display_name", "email"], 1, "exact");
    const result = await db.query<{ display_name: string }>(
      `select display_name from users where ${clause?.where}`,
      clause?.values ?? [],
    );
    expect(result.rows.map((row) => row.display_name)).toContain("أحمد سليم");
  });
});
