#!/usr/bin/env node
/**
 * Undefined design token check.
 *
 * `var(--rect-something)` that was never defined does not fail a build, a
 * typecheck or a lint. CSS simply drops the declaration and the element renders
 * without it. That is how `--rect-canvas-bg` reached production: the sticky page
 * toolbar and the activity day header both set `background: var(--rect-canvas-bg)`,
 * the token existed nowhere, and both were transparent — so page content
 * scrolled straight through the chrome that was supposed to hide it.
 *
 * Nothing in the existing gate could catch that. The token snapshot compares the
 * token file against the design docs; it never asks whether a token a stylesheet
 * *uses* actually exists.
 *
 * Run: node scripts/checks/token-usage.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_SRC = join(ROOT, "apps/web/src");

/** Every `.css` file the app ships. */
function stylesheets(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...stylesheets(path));
    else if (entry.endsWith(".css")) found.push(path);
  }
  return found;
}

const files = stylesheets(WEB_SRC);

/**
 * Tokens a stylesheet defines. Collected across every file rather than only the
 * token sheet, because a component may legitimately define a local custom
 * property for its own use.
 */
const defined = new Set();
for (const file of files) {
  for (const match of readFileSync(file, "utf8").matchAll(/(--rect-[a-z0-9-]+)\s*:/giu)) {
    defined.add(match[1]);
  }
}

/**
 * A `var()` may name a fallback — `var(--a, var(--b))` or `var(--a, 4px)` — and
 * a fallback means the author already handled absence, so those are not
 * reported.
 */
const missing = [];
for (const file of files) {
  const css = readFileSync(file, "utf8");
  for (const match of css.matchAll(/var\(\s*(--rect-[a-z0-9-]+)\s*([,)])/giu)) {
    const [, token, next] = match;
    if (next === ",") continue;
    if (defined.has(token)) continue;

    const line = css.slice(0, match.index).split("\n").length;
    missing.push(`${relative(ROOT, file)}:${line} uses ${token}, which is never defined`);
  }
}

if (missing.length > 0) {
  console.error("[token-usage] Stylesheets reference tokens that do not exist:");
  for (const problem of [...new Set(missing)]) console.error(`  - ${problem}`);
  console.error("[token-usage] CSS drops an unresolvable declaration silently, so this renders as a missing style rather than an error.");
  process.exit(1);
}

console.log(`[token-usage] Every design token used by ${files.length} stylesheets is defined`);
