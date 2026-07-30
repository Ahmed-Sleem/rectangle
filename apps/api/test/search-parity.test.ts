/**
 * The browser and the database must answer the same question the same way.
 *
 * Five of the six searches in this product run in SQL. The Team page runs in
 * the browser, because it already holds every person and every role and a round
 * trip per keystroke would only add latency to a list already in memory. That
 * is a defensible split, but it creates a promise: the two implementations have
 * to behave identically, or somebody learns that 'احمد' finds أحمد everywhere
 * except one page.
 *
 * A comment promising they agree is worth nothing. This runs the same terms
 * through both and requires the same answers, so the promise is checked rather
 * than asserted. If the two ever diverge — a threshold tuned on one side, a
 * normalisation rule added to the other — this is what says so.
 *
 * It lives in the API package because that is where a real PostgreSQL is
 * available; the browser module is imported across the workspace by path.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSearchClause } from "../src/infrastructure/postgres/search-sql.js";
import {
  normaliseForSearch,
  parseSearchTerm,
  searchRecords,
} from "../../web/src/shared/search/match.js";
import { createSearchDatabase } from "./support/search-database.js";

interface Person {
  display_name: string;
  email: string;
}

/** The same rows on both sides, chosen to exercise every rule. */
const PEOPLE: Person[] = [
  { display_name: "Ahmed Sleem", email: "ahmed@example.com" },
  { display_name: "أحمد سليم", email: "ahmed.ar@example.com" },
  { display_name: "Mona Adel", email: "mona@example.com" },
  { display_name: "Omar Fathy", email: "omar.fathy@example.com" },
  { display_name: "مصطفى إبراهيم", email: "mostafa@example.com" },
  { display_name: "Sara Mahmoud", email: "sara@example.com" },
  /*
   * A two-word name, so the trigram rule can be tested where it actually
   * matters. Edit distance is measured against a single word, so it is useless
   * once a term spans several: 'abdel rahmn' is one edit from the right answer
   * as a phrase and eleven from any individual word. Similarity is the only
   * rule that can see it.
   */
  { display_name: "Hala Abdel Rahman", email: "hala@example.com" },
];

let db: PGlite;

beforeAll(async () => {
  db = await createSearchDatabase();
  for (const person of PEOPLE) {
    await db.query(`insert into users (display_name, email) values ($1, $2)`, [
      person.display_name,
      person.email,
    ]);
  }
}, 60_000);

afterAll(async () => {
  await db.close();
});

/** What the database answers, running the same two stages a repository does. */
async function fromDatabase(term: string): Promise<string[]> {
  const run = async (mode: "exact" | "fuzzy") => {
    const clause = buildSearchClause(
      term,
      "search_document",
      "coalesce(display_name, '') || ' ' || coalesce(email, '')",
      1,
      mode,
    );
    if (!clause) return PEOPLE.map((person) => person.display_name);
    const result = await db.query<{ display_name: string }>(
      `select display_name from users where ${clause.where} order by ${clause.rank} desc, display_name`,
      clause.values,
    );
    return result.rows.map((row) => row.display_name);
  };

  const exact = await run("exact");
  if (exact.length > 0) return exact;
  return run("fuzzy");
}

/** What the browser answers, given the same rows. */
function fromBrowser(term: string): string[] {
  return searchRecords(PEOPLE, term, (person) => [person.display_name, person.email]).map(
    (person) => person.display_name,
  );
}

/**
 * The precise stage on each side, in isolation.
 *
 * The two-stage search hides a broken fold: 'احمد' is one edit from 'أحمد', so
 * the forgiving stage finds the record even when the folding has been deleted
 * entirely. Only the exact stage can say whether the two spellings genuinely
 * became the same word.
 */
async function exactFromDatabase(term: string): Promise<string[]> {
  const clause = buildSearchClause(
    term,
    "search_document",
    "coalesce(display_name, '')",
    1,
    "exact",
  );
  if (!clause) return [];
  const result = await db.query<{ display_name: string }>(
    `select display_name from users where ${clause.where}`,
    clause.values,
  );
  return result.rows.map((row) => row.display_name);
}

function exactFromBrowser(term: string): string[] {
  const parsed = parseSearchTerm(term);
  return PEOPLE.filter((person) => {
    const text = normaliseForSearch(`${person.display_name} ${person.email}`);
    return parsed.required.every((word) =>
      text.split(/[^\p{L}\p{N}]+/u).some((candidate) => candidate.startsWith(word)),
    );
  }).map((person) => person.display_name);
}

/**
 * The terms worth agreeing on: one per rule, plus the awkward ones.
 *
 * Ordering is deliberately not compared. Both sides rank, but `ts_rank_cd`
 * weighs cover density in a way a browser cannot reproduce without shipping a
 * copy of PostgreSQL, and claiming otherwise would be a test that fails for a
 * reason nobody can act on. What must agree is *which records match* — being
 * shown a person or not being shown them is the thing people notice.
 */
const TERMS = [
  "ahmed",
  "AHMED",
  "ahm",
  "احمد",
  "أحمد",
  "أَحْمَد",
  "مصطفى",
  "مصطفي",
  "ابراهيم",
  "mona",
  "sara mahmoud",
  "ahmed -sleem",
  '"mona adel"',
  "mona or omar",
  "ahmd",
  "monna",
  "fathi",
  "zzzznothing",
  "ab",
];

describe("the browser and the database agree", () => {
  for (const term of TERMS) {
    it(`returns the same people for ${JSON.stringify(term)}`, async () => {
      const database = [...(await fromDatabase(term))].sort();
      const browser = [...fromBrowser(term)].sort();
      expect(browser).toEqual(database);
    });
  }
});

describe("the shared rules", () => {
  it("folds Arabic on both sides, which is the whole reason this file exists", async () => {
    /*
     * The spellings must DIFFER from the stored one, or the test proves
     * nothing: 'أحمد' matches the record spelled 'أحمد' whether anything is
     * folded or not. An earlier version of this looped over four spellings
     * including the stored one and passed with the folding deleted entirely.
     *
     * 'مصطفى' is stored with ى and searched with ي; 'إبراهيم' is stored with
     * إ and searched with ا. Both need the fold to meet.
     */
    for (const spelling of ["احمد", "إحمد", "آحمد"]) {
      expect(await exactFromDatabase(spelling)).toContain("أحمد سليم");
      expect(exactFromBrowser(spelling)).toContain("أحمد سليم");
    }
    expect(exactFromBrowser("مصطفي")).toContain("مصطفى إبراهيم");
    expect(exactFromBrowser("ابراهيم")).toContain("مصطفى إبراهيم");
  });

  it("forgives the same typos on both sides", async () => {
    /*
     * Several typos rather than one, and checked as whole result sets. A single
     * `toContain` passed with the browser threshold raised to 0.9, because
     * 'ahmd' still reached 'Ahmed Sleem' by edit distance — the trigram rule
     * was doing nothing and nothing said so. Comparing the full answer catches
     * a threshold that quietly stops contributing.
     */
    /*
     * 'abdel rahmn' is here to isolate the trigram rule, and finding a term
     * that could took three attempts worth recording. Single-word typos are
     * all within two edits, so edit distance answers them and the threshold
     * could be set to anything unnoticed — it was raised to 0.9 as a check and
     * everything still passed. 'mahm' and 'mohandes' were worse: both are
     * prefixes, so the precise stage answered them and the fuzzy stage never
     * ran. A multi-word term is the case where edit distance genuinely cannot
     * help, because it measures against one word at a time.
     */
    for (const typo of ["ahmd", "monna", "fathi", "sleeem", "abdel rahmn"]) {
      expect([...fromBrowser(typo)].sort()).toEqual([...(await fromDatabase(typo))].sort());
    }
    expect(fromBrowser("ahmd")).toContain("Ahmed Sleem");
    expect(fromBrowser("monna")).toContain("Mona Adel");
    // Only similarity can reach this one; see the note on the fixture row.
    expect(fromBrowser("abdel rahmn")).toContain("Hala Abdel Rahman");
  });

  it("refuses to guess on both sides once operators are used", async () => {
    // A person writing `-` is being precise, and approximations are the
    // opposite of what they asked for.
    expect(await fromDatabase("ahmd -sleem")).toEqual([]);
    expect(fromBrowser("ahmd -sleem")).toEqual([]);
  });

  it("returns everything for an empty term on both sides", async () => {
    expect(fromBrowser("   ")).toHaveLength(PEOPLE.length);
    expect(await fromDatabase("   ")).toHaveLength(PEOPLE.length);
  });
});
