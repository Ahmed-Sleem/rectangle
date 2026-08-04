#!/usr/bin/env node
/**
 * A bar pinned inside a scrolling column must cover the gap beneath it.
 *
 * This exists because one fault was reported three separate times, each time
 * described as "a random horizontal line across the middle of the page", and
 * each time a different element was blamed and patched. The real mechanism was
 * the same on every occasion and it is worth writing down.
 *
 * A sticky bar inside a flex or grid column with `gap` paints only its own box.
 * The gap between it and the next child belongs to the container, not to the
 * bar, so nothing paints there. At rest that strip is empty and invisible. The
 * moment the column scrolls, content travels up through it and is clipped
 * halfway across — measured on the activity page, the pixel directly below the
 * bar was a KPI card's label with its top half cut off. The eye reads that cut,
 * plus the bar's own hairline sitting on it, as a line drawn across the page.
 *
 * It cannot be seen in a screenshot of a page at rest, it does not reproduce in
 * jsdom, and it looks like a different bug every time because whatever happens
 * to be scrolling past is what gets sliced. So it is checked here instead.
 *
 * THE RULE: if a rule is `position: sticky` and sits in a container with a gap,
 * it must either extend over that gap — a negative end margin with the space
 * given back as padding — or declare that it does not need to, by having no
 * background to break. A bar with no background was never covering anything.
 *
 * Run: node scripts/checks/sticky-cover.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_SRC = join(ROOT, "apps/web/src");

function stylesheets(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return path.endsWith(".css") ? [path] : [];
  });
}

/** Innermost brace pairs, which is every declaration block. */
function rules(source) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? "").trim().split("\n").pop().trim(),
    body: match[2] ?? "",
  }));
}

const offences = [];

for (const path of stylesheets(WEB_SRC)) {
  for (const rule of rules(readFileSync(path, "utf8"))) {
    const sticky = /position:\s*sticky/.test(rule.body);
    if (!sticky) continue;

    /*
     * Only bars that paint. A sticky element with no background is not hiding
     * anything behind it, so there is no seam for content to show through and
     * nothing for this rule to be about.
     */
    const paints = /background(-color)?:\s*(?!none|transparent)/.test(rule.body);
    if (!paints) continue;

    /*
     * Pinned to the start edge only. A bar pinned to the *end* of a column sits
     * above content that scrolls beneath it from the other direction, and the
     * gap that matters is the one before it — a different rule, and none exists
     * in this product today.
     */
    const pinnedToStart = /inset-block-start:\s*0/.test(rule.body);
    if (!pinnedToStart) continue;

    /*
     * Either a negative end margin that pulls the bar over the gap, or a
     * declaration that the author considered it — `margin-block-end: 0`, or a
     * `margin` shorthand, on a bar whose container has no gap is a legitimate
     * answer and says so on the face of the rule.
     */
    const coversGap = /margin-block-end:/.test(rule.body) || /\bmargin:/.test(rule.body);
    if (coversGap) continue;

    offences.push(`${relative(ROOT, path)}  ${rule.selector}`);
  }
}

if (offences.length > 0) {
  console.error(
    "[sticky-cover] A pinned bar paints its own box but not the gap beneath it.\n" +
      "Content will scroll through that strip and be sliced across, which reads as a\n" +
      "stray horizontal line. Pull the bar over the gap with a negative\n" +
      "margin-block-end and give the space back as padding-block-end.\n",
  );
  for (const offence of offences) console.error(`  ${offence}`);
  process.exit(1);
}

console.log("[sticky-cover] every pinned bar covers the gap beneath it");
