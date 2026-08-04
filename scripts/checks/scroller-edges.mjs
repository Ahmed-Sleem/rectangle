#!/usr/bin/env node
/**
 * A scrolling element must not pin its own decoration to an edge.
 *
 * This is the check for a fault that was reported four times and fixed wrongly
 * three of them, so the mechanism is worth stating in full.
 *
 * The canvas draws a hairline at its bottom while content is hidden below. That
 * line was a pseudo-element on the scrolling body, and both of the obvious ways
 * to place it are wrong for the same underlying reason.
 *
 *  - `position: absolute` is resolved against the padding box, and for a scroll
 *    container the padding box is the WHOLE scrollable canvas, not the part you
 *    can see. `inset-block-end: 0` therefore meant "the bottom of everything
 *    inside", measured on the activity page at y=1002 while the panel's visible
 *    edge was at y=765 — and it slid as the page scrolled.
 *
 *  - `position: sticky` is resolved against the scrollport, which sounds right,
 *    but a sticky box still participates in layout. In a flex column it sticks
 *    relative to the end of the last child rather than to the container, so it
 *    rode up the page with the content. Measured at y=356 with the panel ending
 *    at 765.
 *
 * The reason both fail is the same: the scrolling element cannot host something
 * meant to hold still, because everything inside it moves. The line belongs to
 * a parent that does not scroll.
 *
 * That is invisible in review and invisible in a screenshot of a page at rest —
 * it only appears once there is enough content to scroll, which is why it kept
 * surviving. Hence a check.
 *
 * Run: node scripts/checks/scroller-edges.mjs
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

function rules(source) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? "").trim().split("\n").pop().trim(),
    body: match[2] ?? "",
  }));
}

/** The bare element a selector applies to, without states or pseudo-elements. */
function base(selector) {
  return selector.split("::")[0].split(":")[0].split("[")[0].trim();
}

const all = stylesheets(WEB_SRC).flatMap((path) =>
  rules(readFileSync(path, "utf8")).map((rule) => ({ ...rule, path })),
);

/*
 * Everything that scrolls. Collected across every stylesheet first, because a
 * component's scrolling and its decoration are often declared far apart — in
 * the case that prompted this, in two blocks of the same file a hundred lines
 * from each other, which is precisely why reading one did not reveal the other.
 */
const scrollers = new Set(
  all
    .filter((rule) => /overflow(-y|-block)?:\s*(auto|scroll)/.test(rule.body))
    .map((rule) => base(rule.selector)),
);

const failures = [];

for (const rule of all) {
  if (!rule.selector.includes("::after") && !rule.selector.includes("::before")) continue;
  if (!/position:\s*(absolute|sticky)/.test(rule.body)) continue;
  /* Only decoration pinned to an edge. A centred spinner is nobody's problem. */
  if (!/(inset-block-(start|end)|top|bottom):\s*0/.test(rule.body)) continue;

  if (scrollers.has(base(rule.selector))) {
    failures.push(
      `${relative(ROOT, rule.path)}  ${rule.selector} is pinned to an edge of an element ` +
        `that scrolls. Absolute resolves against the whole scrollable canvas and sticky ` +
        `against the last flex child, so it will drift with the content either way. ` +
        `Draw it on a parent that does not scroll.`,
    );
  }
}

if (failures.length > 0) {
  console.error("[scroller-edges] a decoration will drift with the content:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `[scroller-edges] ${scrollers.size} scrolling elements, none of them hosting an edge decoration`,
);
