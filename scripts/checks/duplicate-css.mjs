#!/usr/bin/env node
/**
 * Duplicated rule check.
 *
 * The library rule says a thing is defined once and used everywhere. The way
 * that rule actually breaks is not somebody deciding to fork a component — it
 * is somebody needing a text-styled button on the risks page, not knowing one
 * exists, writing nine lines of CSS, and doing the same thing a month later on
 * the tasks page. `rect-risk__link` and `rect-tasks__link` were byte-for-byte
 * identical in two stylesheets, and nothing noticed.
 *
 * Two identical rule bodies in two different files is that mistake, caught at
 * the moment it is made rather than at the moment they drift. The fix is never
 * to delete one copy: it is to move the thing into `shared/ui` and use it from
 * both places.
 *
 * Only bodies with real substance are compared. Two rules that both say
 * `display: grid` are a coincidence, not a shared component, and reporting
 * them would train people to ignore this check.
 *
 * Run: node scripts/checks/duplicate-css.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_SRC = join(ROOT, "apps/web/src");

/**
 * How many declarations a rule needs before duplication is meaningful.
 *
 * Below this, matching bodies are the same handful of layout defaults that
 * legitimately recur — a grid with a gap, a flex row with a gap.
 */
const MIN_DECLARATIONS = 4;

/**
 * What makes two rules the same *component* rather than the same *layout*.
 *
 * This distinction is the whole accuracy of the check, and the first version
 * did not draw it: it reported five list resets and four flex rows, which are
 * ordinary CSS idioms, alongside the one real finding. A check that cries wolf
 * nine times out of ten is a check people learn to skip, so it would have been
 * worse than no check at all.
 *
 * Arranging boxes is not an identity — `display: grid; gap: 8px` says nothing
 * about what a thing *is*, and two screens arranging boxes the same way have
 * not duplicated anything. Appearance is an identity: colour, type, border,
 * background, shadow and radius are what somebody copies when they mean "one
 * of those", and they are what drifts when only one copy is updated.
 *
 * So a duplicate must share appearance, not merely arrangement.
 */
const IDENTITY_PROPERTIES = [
  "color",
  "background",
  "background-color",
  "border",
  "border-color",
  "border-radius",
  "box-shadow",
  "font",
  "font-size",
  "font-weight",
  "text-decoration",
  "text-transform",
  "letter-spacing",
  "opacity",
  "clip",
];

function describesAppearance(declarations) {
  return declarations.some((declaration) => {
    const property = declaration.split(":")[0]?.trim().toLowerCase() ?? "";
    return IDENTITY_PROPERTIES.some(
      (identity) => property === identity || property.startsWith(`${identity}-`),
    );
  });
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

/** Every `selector { body }` pair, with comments and whitespace normalised out. */
function rules(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  const found = [];
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    const selector = match[1].trim();
    // At-rule preludes and keyframe stops are not component definitions.
    if (selector.startsWith("@") || /^\d|^from$|^to$/u.test(selector)) continue;

    const declarations = match[2]
      .split(";")
      .map((line) => line.trim().replace(/\s+/gu, " "))
      .filter(Boolean)
      .sort();

    if (declarations.length < MIN_DECLARATIONS) continue;
    if (!describesAppearance(declarations)) continue;
    found.push({ selector, body: declarations.join("; ") });
  }
  return found;
}

const byBody = new Map();

for (const file of stylesheets(WEB_SRC)) {
  const rel = relative(WEB_SRC, file).split("\\").join("/");
  for (const rule of rules(readFileSync(file, "utf8"))) {
    const seen = byBody.get(rule.body) ?? [];
    seen.push({ file: rel, selector: rule.selector });
    byBody.set(rule.body, seen);
  }
}

const duplicates = [];
for (const [body, places] of byBody) {
  const files = new Set(places.map((place) => place.file));
  // Same body in one file is usually a deliberate pair of related states.
  if (files.size < 2) continue;
  duplicates.push({ body, places });
}

if (duplicates.length > 0) {
  console.error("[duplicate-css] The same rule body is defined in more than one file:\n");
  for (const duplicate of duplicates) {
    for (const place of duplicate.places) {
      console.error(`  ${place.file}  ${place.selector}`);
    }
    console.error(`      ${duplicate.body}\n`);
  }
  console.error(
    `[duplicate-css] ${duplicates.length} duplicated rule(s).\n` +
      "[duplicate-css] Two files describing the same thing is one component and one\n" +
      "[duplicate-css] future inconsistency, because only one copy gets the next fix.\n" +
      "[duplicate-css] Move it into shared/ui and use it from both places — do not\n" +
      "[duplicate-css] simply delete the second copy.",
  );
  process.exit(1);
}

console.log("[duplicate-css] No rule body is defined in two files");
