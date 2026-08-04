#!/usr/bin/env node
/**
 * Everything that opens, opens the same way.
 *
 * There were six ways. A window, a canvas sheet, the user menu, the dropdown,
 * the assistant panel and a toast each carried their own keyframes, their own
 * duration and their own easing — 140ms spring here, 160ms ease-out there,
 * 180ms with a raw cubic-bezier written inline somewhere else. Every one of
 * them was doing the same thing: fade in, rise a little, settle from slightly
 * small. Only the numbers differed, and only by enough that opening two things
 * in succession felt like using two products.
 *
 * That is invisible in review. Each animation is defensible on its own and the
 * drift only exists across files, which is exactly the shape of problem a check
 * catches and a person does not.
 *
 * THE RULE: a surface that opens uses the shared `rect-surface-in`, and does
 * not declare its own entry keyframes. Exits are deliberately not covered —
 * a toast sliding out to the edge it lives on and a window fading in place are
 * genuinely different, and forcing them together would be consistency for its
 * own sake.
 *
 * Run: node scripts/checks/one-opening.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_SRC = join(ROOT, "apps/web/src");

/** The one permitted entry animation. */
const SHARED = "rect-surface-in";

/**
 * Entry animations that are deliberately their own, and why.
 *
 * Each is a decision. A thing belongs here when it is not a surface opening in
 * place — when the motion carries meaning the shared one cannot express.
 */
const ALLOWED = {
  "rect-overlay-in":
    "The scrim behind a window, not the window. It fades a backdrop across the whole viewport and must not rise or scale with the surface it sits under.",
  "rect-toast-in":
    "A toast slides in from the edge it lives on, which tells you where it came from and where it will go. A surface fading in place would lose that.",
  "rect-ai-panel-in":
    "The assistant panel animates its own width, pushing the canvas aside rather than appearing over it. It is a layout change, not a surface opening.",
  "rect-fab-in": "The handset action button scales up from its own corner as an affordance, not as a surface.",
  "rect-nav-orb-in": "Part of the navigation rail's own entrance, tied to the shell rather than to a window.",
  "rect-boot-letter": "The loading wordmark, which is a brand animation and not a surface at all.",
  "rect-auth-drift": "The sign-in backdrop, a slow ambient movement with no open or close.",
  "rect-fade-up": "A list item arriving in place within an already-open surface.",
  "rect-ai-content-in":
    "The assistant's own contents, staggered inside the panel after it has finished opening.",
};

function stylesheets(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return path.endsWith(".css") ? [path] : [];
  });
}

const failures = [];
const declared = new Set();

for (const path of stylesheets(WEB_SRC)) {
  const source = readFileSync(path, "utf8");

  for (const match of source.matchAll(/@keyframes\s+([a-z0-9-]+)/gi)) {
    declared.add(match[1]);
  }

  /*
   * Only animations that look like an opening. An `-out`, a spin and a
   * `-drift` are not entries, and the names in this product are consistent
   * enough to say so — which is itself worth keeping true.
   */
  for (const match of source.matchAll(/animation:\s*([a-z0-9-]+)/gi)) {
    const name = match[1];
    if (!name.endsWith("-in")) continue;
    if (name === SHARED) continue;
    if (name in ALLOWED) continue;

    failures.push(
      `${relative(ROOT, path)} opens with "${name}" instead of "${SHARED}". ` +
        `Use the shared animation, or record why this one is different in ALLOWED.`,
    );
  }
}

/* A reason recorded for an animation nobody has any more is a stale decision. */
for (const name of Object.keys(ALLOWED)) {
  if (!declared.has(name)) {
    failures.push(`"${name}" is listed as a deliberate exception but no longer exists.`);
  }
}

if (!declared.has(SHARED)) {
  failures.push(`The shared "${SHARED}" animation is missing. Everything that opens depends on it.`);
}

if (failures.length > 0) {
  console.error("[one-opening] surfaces have drifted apart again:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `[one-opening] every surface opens with ${SHARED}; ` +
    `${Object.keys(ALLOWED).length} deliberate exceptions, each with a reason`,
);
