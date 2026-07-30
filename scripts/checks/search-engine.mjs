#!/usr/bin/env node
/**
 * Keeps every search in the product on one engine.
 *
 * There were six, and they disagreed. The palette matched with indexed
 * full-text search and ranked its answers; four pages used `ilike '%term%'`,
 * which cannot use an index and returns rows in table order; the team page
 * filtered in the browser with `includes`. The same word in two boxes gave two
 * answers, and only one of them was any good.
 *
 * Consolidating them was the easy part. Keeping them consolidated is what this
 * is for: the next person adding a list page will reach for `ilike` because it
 * is the obvious thing to write, and nothing in a code review reliably catches
 * a five-character SQL operator.
 *
 * Three rules, each earned by something that actually went wrong:
 *
 *   1. No repository matches text with `ilike`. That is the old engine.
 *   2. Client-side searching is confined to lists the browser holds whole. The
 *      moment the team endpoint gains a limit, filtering in the browser starts
 *      silently missing people — the failure is invisible, so the check has to
 *      be the thing that notices.
 *   3. The browser module and the SQL module keep the same thresholds. They are
 *      two implementations of one rule and drift between them is exactly the
 *      inconsistency this whole change removed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const API = join(ROOT, "apps/api/src");
const WEB = join(ROOT, "apps/web/src");

const failures = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function filesUnder(directory, suffix) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path, suffix);
    return entry.name.endsWith(suffix) ? [path] : [];
  });
}

/* ── 1. The old engine must not come back ── */

const repositories = filesUnder(join(API, "infrastructure/postgres"), ".ts");
for (const file of repositories) {
  const source = read(file) ?? "";
  // Only real SQL, not the comments explaining why it was removed.
  const offending = source
    .split("\n")
    .filter((line) => /\bilike\b/iu.test(line) && !/^\s*(\*|\/\/|--)/u.test(line));
  if (offending.length > 0) {
    failures.push(
      `${file.slice(ROOT.length)} matches text with ilike; use buildSearchClause from search-sql.ts`,
    );
  }
}

/* ── 2. Browser filtering only where the browser holds everything ── */

const adminRepository = read(join(API, "infrastructure/postgres/admin-repository.ts")) ?? "";
const listUsers = adminRepository.slice(
  adminRepository.indexOf("async listUsers"),
  adminRepository.indexOf("async findUserByEmail"),
);
if (/\blimit\b/iu.test(listUsers)) {
  failures.push(
    "listUsers now returns a page, but the team page still searches in the browser. " +
      "Move that search server-side or it will silently miss people beyond the first page.",
  );
}

/* ── 3. The two implementations must agree on the numbers ── */

const sql = read(join(API, "infrastructure/postgres/search-sql.ts")) ?? "";
const browser = read(join(WEB, "shared/search/match.ts")) ?? "";

const constants = ["MIN_FUZZY_LENGTH", "MAX_EDIT_DISTANCE", "TRIGRAM_THRESHOLD"];
for (const name of constants) {
  const pattern = new RegExp(`const ${name} = ([^;]+);`, "u");
  const inSql = pattern.exec(sql)?.[1]?.trim();
  const inBrowser = pattern.exec(browser)?.[1]?.trim();
  if (inSql === undefined || inBrowser === undefined) {
    failures.push(`${name} is missing from one of the two search implementations`);
  } else if (inSql !== inBrowser) {
    failures.push(
      `${name} is ${inSql} in SQL and ${inBrowser} in the browser; the two searches would disagree`,
    );
  }
}

/* ── Report ── */

if (failures.length > 0) {
  console.error("[search-engine] the product has drifted back towards several engines:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `[search-engine] one engine: no ilike in ${repositories.length} repositories, ` +
    `thresholds agree across both implementations`,
);
