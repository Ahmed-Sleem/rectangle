#!/usr/bin/env node
/**
 * Physical direction check.
 *
 * Arabic is a first-class layout here, not a translation, and the design
 * contract says every rule must hold in RTL. `left` and `right` do not: they
 * mean the same edge whichever way the page reads, so a control positioned with
 * them stays put while everything around it flips.
 *
 * That is not theoretical. The assistant launcher was pinned with `right`, and
 * the header reserved room for it with `padding-right`. In Arabic the header's
 * own controls moved to the left, the launcher did not, and the two ended up on
 * top of each other — reported by the owner as the AI icon overlapping the
 * profile control. There were even RTL overrides for the launcher, written to
 * flip it back; the padding had no matching override, so half the pair silently
 * did nothing.
 *
 * Two rules to write and one to remember is one too many. Use the logical
 * property and the direction comes for free.
 *
 * Run: node scripts/checks/logical-properties.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_SRC = join(ROOT, "apps/web/src");

/**
 * Physical properties and the logical property that replaces each.
 *
 * `float` and `clear` are absent deliberately: the product uses neither, and
 * banning something nobody writes is noise rather than a guard.
 */
const REPLACEMENTS = new Map([
  ["left", "inset-inline-start"],
  ["right", "inset-inline-end"],
  ["margin-left", "margin-inline-start"],
  ["margin-right", "margin-inline-end"],
  ["padding-left", "padding-inline-start"],
  ["padding-right", "padding-inline-end"],
  ["border-left", "border-inline-start"],
  ["border-right", "border-inline-end"],
  ["border-left-width", "border-inline-start-width"],
  ["border-right-width", "border-inline-end-width"],
  ["border-left-color", "border-inline-start-color"],
  ["border-right-color", "border-inline-end-color"],
  ["border-left-style", "border-inline-start-style"],
  ["border-right-style", "border-inline-end-style"],
  ["text-align", null],
]);

/**
 * `text-align` is only a violation when it names a physical side; `center`,
 * `start` and `end` are all fine.
 */
function textAlignViolates(value) {
  return /\b(left|right)\b/iu.test(value);
}

function stylesheets(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...stylesheets(path));
    else if (entry.endsWith(".css")) found.push(path);
  }
  return found;
}

const offenders = [];

for (const file of stylesheets(WEB_SRC)) {
  const rel = relative(WEB_SRC, file).split("\\").join("/");
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      const match = /^\s*([a-z-]+)\s*:\s*([^;]+);/iu.exec(line);
      if (!match) return;

      const property = match[1].toLowerCase();
      const value = match[2];
      if (!REPLACEMENTS.has(property)) return;

      if (property === "text-align") {
        if (!textAlignViolates(value)) return;
        offenders.push({
          file: rel,
          line: index + 1,
          text: line.trim(),
          advice: "text-align: start / end",
        });
        return;
      }

      offenders.push({
        file: rel,
        line: index + 1,
        text: line.trim(),
        advice: REPLACEMENTS.get(property),
      });
    });
}

if (offenders.length > 0) {
  console.error("[logical-properties] Physical directions that will not flip in Arabic:\n");
  for (const offender of offenders) {
    console.error(`  ${offender.file}:${offender.line}  ${offender.text}`);
    console.error(`      use: ${offender.advice}`);
  }
  console.error(
    `\n[logical-properties] ${offenders.length} violation(s).\n` +
      "[logical-properties] Arabic is a layout, not a translation. A physical side\n" +
      "[logical-properties] stays put while the page around it flips, and the second\n" +
      "[logical-properties] rule written to correct that is the one somebody forgets.",
  );
  process.exit(1);
}

console.log("[logical-properties] Every direction-dependent rule is logical, so Arabic flips with it");
