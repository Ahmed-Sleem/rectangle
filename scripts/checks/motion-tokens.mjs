#!/usr/bin/env node
/**
 * Motion is described by role, in one place, and nowhere else.
 *
 * The audit that produced this found thirty distinct raw millisecond durations
 * and eight raw easing curves written inline across the stylesheets. Four of
 * those curves duplicated a token that already existed — one of them retyped in
 * seven separate declarations — and most of the durations differed from each
 * other by amounts nobody can perceive. That is not a set of decisions, it is
 * the same decision made slightly differently a few dozen times.
 *
 * The cause was two rival families for one idea: `--rect-motion-*` carried a
 * duration and an easing together, `--rect-duration-*` with `--rect-ease-*`
 * split them, and both existed for the same components. `--rect-motion-menu`
 * said 0.35s while `--rect-duration-menu` said 160ms. New code picked whichever
 * it happened to see and wrote a raw value when neither fitted.
 *
 * So the rule is narrow and mechanical: a timing function belongs to the theme.
 * A raw `cubic-bezier` outside the token file is always a duplicate of, or a
 * near-miss against, something already defined — there is no case where hiding
 * a curve in a component stylesheet is the better answer.
 *
 * Durations are NOT policed the same way, deliberately. A keyframe percentage,
 * a stagger delay and a debounce are all legitimately local, and a check that
 * flagged them would report far more noise than signal — which is how a check
 * teaches people to ignore it. The curves are where the drift actually lived.
 *
 * Run: node scripts/checks/motion-tokens.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_SRC = join(ROOT, "apps/web/src");
const TOKENS = join(WEB_SRC, "shared/styles/tokens.css");

function stylesheets(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return path.endsWith(".css") ? [path] : [];
  });
}

const failures = [];

for (const path of stylesheets(WEB_SRC)) {
  if (path === TOKENS) continue;

  const source = readFileSync(path, "utf8");
  const curves = [...source.matchAll(/cubic-bezier\([^)]*\)/g)].map((match) => match[0]);

  for (const curve of new Set(curves)) {
    failures.push(
      `${relative(ROOT, path)} writes ${curve} directly. Add it to tokens.css as a ` +
        `--rect-ease-* or a --rect-motion-* role and read it from there.`,
    );
  }
}

/*
 * And the roles themselves must exist. Everything else reads them, so a rename
 * that missed the definitions would leave every animation silently falling back
 * to its initial value rather than failing loudly.
 */
const tokens = readFileSync(TOKENS, "utf8");
for (const role of [
  "--rect-motion-control",
  "--rect-motion-surface",
  "--rect-motion-layout",
  "--rect-motion-emphasis",
  "--rect-motion-reveal",
  "--rect-motion-spinner",
]) {
  if (!tokens.includes(`${role}:`)) failures.push(`the motion role ${role} is missing from tokens.css`);
}

if (failures.length > 0) {
  console.error("[motion-tokens] motion has drifted out of the theme:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("[motion-tokens] six motion roles, and every easing curve lives in the theme");
