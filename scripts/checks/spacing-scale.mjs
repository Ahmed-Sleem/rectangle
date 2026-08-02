#!/usr/bin/env node
/**
 * Raw spacing literal check.
 *
 * The design contract says the spacing scale is the only allowed set of values
 * and that a stylesheet must read them from the theme rather than write numbers
 * of its own. Nothing enforced it. `token-usage.mjs` asks whether a token a
 * stylesheet *uses* exists; it has no opinion about a stylesheet that uses no
 * token at all and writes `padding: 18px` instead.
 *
 * That gap is invisible in review, because `padding: 18px` and
 * `padding: var(--rect-space-5)` render almost identically — and stays
 * invisible until somebody changes the theme and one corner of the product
 * refuses to move with it. Sixty-two such literals were already in the shell
 * and the AI panel when this check was written, both of which predate the
 * scale.
 *
 * Only the three properties that carry layout rhythm are checked: padding,
 * margin and gap. Widths, heights and positions legitimately take computed and
 * one-off values, and banning those would produce noise rather than order.
 *
 * Run: node scripts/checks/spacing-scale.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_SRC = join(ROOT, "apps/web/src");

/**
 * The theme file is where numbers are allowed to exist — it is the one place
 * that defines them, so it cannot be written in terms of itself.
 */
const TOKEN_SOURCES = new Set(["shared/styles/tokens.css"]);

/**
 * Values permitted as literals despite not being on the scale.
 *
 * `0` needs no unit and no token. `1px` and `2px` are hairlines used to nudge
 * optical alignment of a glyph against a box; the scale's smallest step is 2px
 * and expressing a one-pixel correction as a token would misrepresent it as
 * spacing. `-1px` is the standard visually-hidden clip inset.
 */
const ALLOWED_LITERALS = new Set(["0px", "1px", "2px", "-1px"]);

/** The scale, read from the theme rather than restated, so the two cannot drift. */
function scaleFromTokens() {
  const css = readFileSync(join(WEB_SRC, "shared/styles/tokens.css"), "utf8");
  const values = new Set();
  for (const match of css.matchAll(/--rect-space-[a-z0-9]+\s*:\s*([^;]+);/giu)) {
    values.add(match[1].trim());
  }
  return values;
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

const scale = scaleFromTokens();
const offenders = [];

for (const file of stylesheets(WEB_SRC)) {
  const rel = relative(WEB_SRC, file).split("\\").join("/");
  if (TOKEN_SOURCES.has(rel)) continue;

  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    // Declarations only, and only the three that carry layout rhythm.
    const match = /^\s*(padding|margin|gap|row-gap|column-gap)(-[a-z-]+)?\s*:\s*([^;]+);/iu.exec(line);
    if (!match) return;

    const value = match[3];
    // `calc()` composes tokens and its arithmetic constants are not spacing.
    if (/calc\(/iu.test(value)) return;

    for (const literal of value.matchAll(/-?\d+(?:\.\d+)?px/gu)) {
      const found = literal[0];
      if (ALLOWED_LITERALS.has(found)) continue;
      if (scale.has(found)) continue;
      offenders.push({
        file: rel,
        line: index + 1,
        declaration: line.trim(),
        value: found,
      });
    }
  });
}

if (offenders.length > 0) {
  console.error("[spacing-scale] Spacing literals that are not on the scale:\n");
  for (const offender of offenders) {
    console.error(`  ${offender.file}:${offender.line}  ${offender.declaration}`);
  }
  console.error(
    `\n[spacing-scale] ${offenders.length} violation(s).\n` +
      "[spacing-scale] Padding, margin and gap must read the theme, or changing\n" +
      "[spacing-scale] the theme leaves them behind. Use var(--rect-space-N).\n" +
      `[spacing-scale] The scale is: ${[...scale].join(", ")}.\n` +
      "[spacing-scale] If a value genuinely does not exist, add a token — never a literal.",
  );
  process.exit(1);
}

console.log(
  `[spacing-scale] Every padding, margin and gap reads the theme (scale: ${[...scale].join(", ")})`,
);
