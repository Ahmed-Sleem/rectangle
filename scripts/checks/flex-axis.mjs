#!/usr/bin/env node
/**
 * A scrolling flex container must say which way it runs.
 *
 * This check exists because of one missing line. `.rect-ai-panel__body` was
 * `display: flex` with no `flex-direction`, so it took the initial value,
 * `row`. That body holds the transcript, the continuation offer, the proposal
 * card and the error message — four siblings written to stack. Laid out in a
 * row they became columns side by side, and the transcript, a flex item with
 * nothing establishing its width, collapsed to its minimum content size: 15px
 * measured in Chromium, with message bubbles 13.8px wide. A sentence rendered
 * one character per line.
 *
 * It broke the conversation in a second way at the same time. The two sides of
 * a chat are `align-self: flex-end` and `flex-start`, which put a bubble on the
 * trailing or leading edge only while the cross axis is horizontal. Turned
 * sideways they aligned vertically, so question and answer landed at the same
 * x and stopped being distinguishable.
 *
 * WHY THE RULE IS NARROWED TO SCROLLING, NON-WRAPPING CONTAINERS.
 * Requiring an explicit axis on every flex container would report 134 rules in
 * this codebase, nearly all of them deliberate rows — a heading with a badge, a
 * toolbar, a button with an icon. A check that is wrong 133 times out of 134 is
 * one people learn to skip, which is worse than no check, so the condition is
 * drawn tightly around the mistake that actually happens:
 *
 *   - `overflow: auto` or `scroll` means the author intended a scroll region,
 *     and a scroll region is a stack of things. Nobody scrolls a button row.
 *   - `flex-wrap: wrap` means the author intended a wrapping row and the
 *     default axis is the one they wanted. `.rect-access__chosen` is exactly
 *     that: a wrapping field of badges with a height cap, and correct.
 *
 * Those two conditions together leave a set whose every member is a stack, so
 * an unstated axis in it is always the bug and never the intent.
 *
 * Run: node scripts/checks/flex-axis.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_SRC = join(ROOT, "apps/web/src");

/** Every stylesheet under the web source tree. */
function stylesheets(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return path.endsWith(".css") ? [path] : [];
  });
}

/**
 * Splits a stylesheet into rules.
 *
 * Deliberately simple: this matches innermost brace pairs, so a declaration
 * block nested in a media query is found on its own and the query wrapper is
 * skipped because it contains braces rather than declarations. That is all this
 * check needs, and a real CSS parser would be a dependency bought for nothing.
 */
function rules(source) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? "").trim().split("\n").pop().trim(),
    body: match[2] ?? "",
  }));
}

const offences = [];

for (const path of stylesheets(WEB_SRC)) {
  for (const rule of rules(readFileSync(path, "utf8"))) {
    const isFlex = /display:\s*(inline-)?flex/.test(rule.body);
    const scrolls = /overflow(-y|-block)?:\s*(auto|scroll)/.test(rule.body);
    const wraps = /flex-wrap:\s*wrap/.test(rule.body);
    const statesAxis = /flex-direction:/.test(rule.body);

    if (isFlex && scrolls && !wraps && !statesAxis) {
      offences.push(`${relative(ROOT, path)}  ${rule.selector}`);
    }
  }
}

if (offences.length > 0) {
  console.error(
    "[flex-axis] A scrolling flex container relies on the default row axis.\n" +
      "Its children will lay out side by side and collapse to their minimum width.\n" +
      "Add an explicit flex-direction; if a wrapping row really is intended, say\n" +
      "flex-wrap: wrap and the rule is satisfied.\n",
  );
  for (const offence of offences) console.error(`  ${offence}`);
  process.exit(1);
}

console.log("[flex-axis] every scrolling flex container states its axis");
