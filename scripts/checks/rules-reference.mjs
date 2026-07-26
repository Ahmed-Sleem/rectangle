#!/usr/bin/env node
/**
 * Rules-document reference check.
 *
 * UI_RULES is mandatory reading, which makes a stale entry in it worse than no
 * entry at all: it instructs the next change to use a component that was
 * deleted. This happened — the building-block table and the definition of done
 * both kept naming `SearchField`, `FilterBar`, `FilterSelect` and
 * `FilterBarSpacer` for three commits after they were removed.
 *
 * Every component named in backticks in the building-block table (§11.1) must
 * be exported by the shared UI kit.
 *
 * Run: node scripts/checks/rules-reference.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const RULES = resolve(ROOT, "design/UI_RULES.md");
const KIT_DIR = resolve(ROOT, "apps/web/src/shared/ui");

const rules = readFileSync(RULES, "utf8");

/**
 * The block table is the authoritative list of what a page may reach for, so
 * it is the section worth enforcing. Prose elsewhere may legitimately mention
 * historical names while explaining why something changed.
 */
const TABLE_START = "### 11.1 The kit";
const TABLE_END = "### 11.2 Rules";

const start = rules.indexOf(TABLE_START);
const end = rules.indexOf(TABLE_END);

if (start === -1 || end === -1) {
  console.error("[rules-reference] Could not locate the building-block table (§11.1) in UI_RULES.md");
  process.exit(1);
}

const table = rules.slice(start, end);

// Only the first column names components; later columns describe usage in prose
// that may legitimately contain backticked CSS or prop names.
const named = new Set();
for (const line of table.split("\n")) {
  if (!line.trim().startsWith("|")) continue;
  const firstCell = line.split("|")[1] ?? "";
  for (const match of firstCell.matchAll(/`([A-Z][A-Za-z0-9]*)`/g)) {
    named.add(match[1]);
  }
}

if (named.size === 0) {
  console.error("[rules-reference] The building-block table named no components; the check would pass vacuously.");
  process.exit(1);
}

const barrel = readFileSync(resolve(KIT_DIR, "index.ts"), "utf8");

const missing = [...named].filter((name) => !new RegExp(`\\b${name}\\b`).test(barrel));

if (missing.length > 0) {
  console.error(
    `[rules-reference] UI_RULES §11.1 names components the shared kit does not export: ${missing.join(", ")}`,
  );
  console.error("[rules-reference] Update the rules to match what ships, or restore the component.");
  process.exit(1);
}

console.log(`[rules-reference] All ${named.size} components named in UI_RULES §11.1 are exported by the kit`);
