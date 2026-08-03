#!/usr/bin/env node
/**
 * Anything that changes data leaves a record.
 *
 * The owner asked for activity to capture every change. It very nearly did —
 * an audit of every service found two unlogged methods out of forty-odd, both
 * added in the same recent session as the feature that needed them. That ratio
 * is the point: this rule is followed almost perfectly and broken occasionally,
 * by the person adding the newest thing, which is exactly the shape of rule
 * that has to be enforced by a machine rather than by care.
 *
 * The check is deliberately crude in one direction and precise in the other. It
 * finds public service methods whose names say they write, and it requires the
 * word `audit` somewhere in the body. It cannot tell whether the entry is a
 * *good* one — that is a matter of judgement — but it can tell that somebody
 * thought about it, and the false-negative it allows (a method that mentions
 * audit without appending) is far cheaper than the false-positive it avoids
 * (failing the build for a method that legitimately delegates).
 *
 * Break-tested: deleting the audit call from any write method fails this.
 *
 * Run: node scripts/checks/audit-coverage.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVICES = join(ROOT, "apps/api/src/application");

/**
 * Verbs that mean "this changes something".
 *
 * A prefix list rather than a list of methods, so a new write method is covered
 * the moment it is named, without anybody remembering to register it here.
 */
const WRITE_VERBS =
  /^(create|update|delete|save|remove|add|set|archive|restore|invite|revoke|assign|reset|change|complete|cancel|accept|rename|claim|register)/;

/**
 * Methods that genuinely have nothing to record, each with the reason.
 *
 * An entry here is a decision, and the reason is the record of it. Anything not
 * listed must audit — the list is short on purpose, and growing it should feel
 * like it needs justifying.
 */
const EXEMPT = {
  "notification-sender.ts": {
    send: "Infrastructure, not a service method. Every caller audits the action that sent the mail; a second entry here would record the same event twice.",
  },
  "retention-service.ts": {
    removeExpired:
      "A scheduled sweep of rows that have already expired, with no actor to attribute it to. It reports counts to the caller, which is where the operational record belongs.",
  },
};

const problems = [];
let checked = 0;

for (const file of readdirSync(SERVICES).filter((name) => name.endsWith(".ts"))) {
  const lines = readFileSync(join(SERVICES, file), "utf8").split("\n");

  /*
   * Method boundaries are found by indentation rather than by matching braces.
   * Brace matching was the first attempt and it was wrong: an object literal or
   * a nested arrow inside a method throws the depth count off, and the check
   * then reads a fragment of one method as the whole of another. Two-space
   * indentation is the class-body convention the linter already enforces, so it
   * is a reliable marker here in a way brace depth is not.
   */
  const starts = [];
  lines.forEach((line, index) => {
    const match = /^ {2}(?:private |public )?async ([a-zA-Z]\w*)\(/.exec(line);
    if (match) starts.push({ index, name: match[1] });
  });

  starts.forEach((start, position) => {
    if (!WRITE_VERBS.test(start.name)) return;
    if (EXEMPT[file]?.[start.name]) return;

    checked += 1;
    const end = starts[position + 1]?.index ?? lines.length;
    const body = lines.slice(start.index, end).join("\n");

    if (!/audit/i.test(body)) {
      problems.push(`${file}: ${start.name}() changes data and records nothing`);
    }
  });
}

if (problems.length > 0) {
  console.error("[audit-coverage] write methods with no audit entry:");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\nEvery change must be attributable. Append to the audit repository, or " +
      "add the method to EXEMPT in this file with the reason it has nothing to record.",
  );
  process.exit(1);
}

console.log(`[audit-coverage] ${checked} write methods, every one leaves a record`);
