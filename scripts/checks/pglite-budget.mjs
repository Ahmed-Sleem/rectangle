#!/usr/bin/env node
/**
 * Caps how many in-memory PostgreSQL instances the test suite stands up.
 *
 * This exists because the same failure has now happened twice, both times
 * caught only by a fresh clone on a smaller machine, and both times it looked
 * like a pass. PGlite is PostgreSQL compiled to WebAssembly; each instance
 * reserves a large block of WASM memory and closing one does not hand those
 * pages back to the operating system, so the cost accumulates across a run.
 * Past the machine's limit a worker is killed mid-file, and vitest reports that
 * as an unhandled error beside a summary that still says everything passed —
 * the tests simply stop being counted. A suite that quietly runs twelve fewer
 * tests than it claims is indistinguishable from a healthy one.
 *
 * A budget rather than a ban, because these tests are the reason a broken
 * migration was caught before production. The point is that adding another
 * instance should be a decision somebody makes on purpose, with a number in
 * front of them, rather than a line that looks harmless in review.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = fileURLToPath(new URL("../../apps/api/test", import.meta.url));

/**
 * Four fits comfortably in the smallest environment this has been run in,
 * which had under a gigabyte free. Raising it means checking there, not here.
 */
const BUDGET = 4;

function testFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

const counts = testFiles(TEST_DIR)
  .map((file) => ({
    file: file.slice(TEST_DIR.length + 1),
    count: (readFileSync(file, "utf8").match(/new PGlite\(/gu) ?? []).length,
  }))
  .filter((entry) => entry.count > 0);

const total = counts.reduce((sum, entry) => sum + entry.count, 0);

for (const entry of counts) {
  console.log(`[pglite-budget] ${entry.file}: ${entry.count}`);
}

if (total > BUDGET) {
  console.error(
    `[pglite-budget] ${total} PGlite instances across the suite, budget is ${BUDGET}.`,
  );
  console.error(
    "[pglite-budget] Past this a worker is killed mid-run and tests stop being counted",
  );
  console.error(
    "[pglite-budget] without failing. Share an instance between suites, or raise the",
  );
  console.error(
    "[pglite-budget] budget only after checking a machine with under a gigabyte free.",
  );
  process.exit(1);
}

console.log(`[pglite-budget] ${total} instances, within the budget of ${BUDGET}`);
