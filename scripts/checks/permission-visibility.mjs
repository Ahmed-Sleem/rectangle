#!/usr/bin/env node
/**
 * Nothing a person cannot do may be offered to them.
 *
 * The owner reported the symptom directly: "if I cannot create a project, why
 * is the button there". Every page in the product currently answers that
 * correctly, but nothing stops the next page from getting it wrong, and the
 * mistake is invisible — the screen renders, the control looks normal, and the
 * refusal only arrives after the click. So the rule is enforced here instead of
 * remembered.
 *
 * Three rules, each of which has been broken on purpose and watched to fail.
 *
 * 1. Every enabled feature either names the permission needed to open it, or
 *    appears below with a written reason why it is open to everyone. The
 *    navigation hides what a person may not open, and it can only do that if
 *    the manifest says what is required.
 *
 * 2. A control is never disabled because of a permission. Industry consensus
 *    (Nielsen Norman, and every design system that has written this down) is
 *    that `disabled` means "not yet — and you can change that yourself". A
 *    permission the viewer will never hold is not a "not yet"; leaving the
 *    control visible is clutter at best, and at worst it discloses what other
 *    roles in the company are allowed to do. Hide it.
 *
 * 3. Every enabled feature that has a page is measured by the feature
 *    checklist. Analytics was enabled for months while being the only page
 *    absent from that list, so it was hollow and unverified at the same time.
 *
 * Run: node scripts/checks/permission-visibility.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = join(ROOT, "apps/web/src");
const FEATURES = join(WEB, "features");

/**
 * Features deliberately open to every signed-in person, each with the reason.
 *
 * A feature belongs here only when the caller is the subject of the page, or
 * when the page carries its own gate over a section rather than over the whole
 * of itself. Adding an entry is a decision; the reason is the record of it.
 */
const OPEN_TO_EVERYONE = {
  profile: "The caller is the subject. Nobody needs permission to read their own account.",
  logout: "Ending your own session cannot require a permission.",
  activity:
    "Everyone may audit themselves. The service returns the `self` scope to all callers and " +
    "adds `team` and `all` only to those holding the matching permission, so the page offers " +
    "only the scopes that exist for the viewer.",
  settings:
    "Language and passkeys are the caller's own. The company-wide sections inside the page " +
    "gate themselves on `settings.manage` and are absent, not disabled, for everybody else. " +
    "Gating the whole page would lock a person out of their own account settings.",
};

/**
 * Features whose page is a transition rather than a surface, and so has no
 * states for the feature checklist to measure.
 */
const NOT_A_DATA_SURFACE = {
  logout:
    "Ends the session and redirects. It renders one line of progress and never shows a " +
    "record, so there is no empty, error or permission state to hold it to.",
};

const failures = [];

const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);

/* ── Which features exist, and which the installation turns on ── */

const config = read(join(WEB, "app/feature-config.ts"));
if (config === null) {
  console.error("[permission-visibility] apps/web/src/app/feature-config.ts is missing");
  process.exit(1);
}

/**
 * The manifest is the code the shell reads, but the config is what an
 * installation actually ships, and it can turn a feature off. A feature that is
 * off is not offered to anybody, so it owes nothing here.
 */
const enabledIds = new Set();
for (const match of config.matchAll(/\{\s*id:\s*"([a-z0-9-]+)"\s*,\s*enabled:\s*(true|false)/gu)) {
  if (match[2] === "true") enabledIds.add(match[1]);
}

if (enabledIds.size === 0) {
  failures.push("no enabled features were found in feature-config.ts — the parser has drifted");
}

const featureDirs = readdirSync(FEATURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "_template")
  .map((entry) => entry.name);

/* ── Rule 1: an enabled feature names its permission, or justifies being open ── */

for (const id of featureDirs) {
  if (!enabledIds.has(id)) continue;

  const manifest = read(join(FEATURES, id, "index.ts"));
  if (manifest === null) {
    failures.push(`feature '${id}' is enabled but has no index.ts manifest`);
    continue;
  }

  const declares = /requiredPermission:\s*"[a-z_]+\.[a-z_]+"/u.test(manifest);
  const justified = Object.hasOwn(OPEN_TO_EVERYONE, id);

  if (!declares && !justified) {
    failures.push(
      `feature '${id}' is in the navigation for everyone: its manifest names no ` +
        `requiredPermission and it is not listed as deliberately open in this check. ` +
        `Either add the permission, or add '${id}' to OPEN_TO_EVERYONE with the reason.`,
    );
  }

  if (declares && justified) {
    failures.push(
      `feature '${id}' both names a requiredPermission and is listed as open to everyone; ` +
        `one of the two is now wrong`,
    );
  }
}

/* ── Rule 1b: the justification list does not outlive the features it covers ── */

for (const id of Object.keys(OPEN_TO_EVERYONE)) {
  if (!featureDirs.includes(id)) {
    failures.push(`OPEN_TO_EVERYONE names '${id}', which is not a feature — stale exemption`);
  }
}

for (const id of Object.keys(NOT_A_DATA_SURFACE)) {
  if (!featureDirs.includes(id)) {
    failures.push(`NOT_A_DATA_SURFACE names '${id}', which is not a feature — stale exemption`);
  }
}

/* ── Rule 2: permissions hide controls, they never disable them ── */

/** Names that mean "may this person", as opposed to "is this form ready". */
const AUTHORITY = /\b(?:hasPermission\(|permissions\.includes|roles\.includes|roles\.some|can(?:Create|Edit|Delete|Manage|Archive|Invite|Assign|Read)\w*)/u;

function sourceFilesUnder(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFilesUnder(path));
    else if (/\.tsx$/u.test(entry.name) && !/\.test\.tsx$/u.test(entry.name)) found.push(path);
  }
  return found;
}

for (const path of sourceFilesUnder(FEATURES)) {
  const source = readFileSync(path, "utf8");
  const relative = path.slice(ROOT.length + 1);

  /*
   * Read the whole expression rather than the first line of it: a disabled
   * prop is routinely written across several lines, and stopping at the newline
   * matched nothing and reported every file clean.
   */
  for (const match of source.matchAll(/disabled=\{([^}]*)\}/gu)) {
    const expression = match[1];
    if (AUTHORITY.test(expression)) {
      failures.push(
        `${relative} disables a control based on authority: disabled={${expression.trim()}}. ` +
          `A permission the viewer will never hold is not a "not yet" — render nothing instead.`,
      );
    }
  }
}

/* ── Rule 3: an enabled page is a measured page ── */

const checklist = read(join(ROOT, "scripts/checks/feature-checklist.mjs"));
if (checklist === null) {
  failures.push("scripts/checks/feature-checklist.mjs is missing");
} else {
  for (const id of featureDirs) {
    if (!enabledIds.has(id)) continue;

    if (Object.hasOwn(NOT_A_DATA_SURFACE, id)) continue;

    const pages = readdirSync(join(FEATURES, id)).filter(
      (name) => /Page\.tsx$/u.test(name) && !/\.test\./u.test(name),
    );

    /*
     * Named page by page, not feature by feature. Asking whether the checklist
     * mentions the directory passed while a page was deleted from it, because
     * the same directory still appeared in a sibling page's `tests` entry —
     * verified by removing RisksPage and watching this check stay green. The
     * question worth asking is whether *this file* is measured.
     */
    for (const page of pages) {
      if (!checklist.includes(`features/${id}/${page}`)) {
        failures.push(
          `apps/web/src/features/${id}/${page} is a page of an enabled feature, but the ` +
            `feature checklist never names it, so its states and permission gating are unverified`,
        );
      }
    }
  }
}

/* ── Report ── */

if (failures.length > 0) {
  console.error("[permission-visibility] the product is offering what it will refuse:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `[permission-visibility] ${enabledIds.size} enabled features: each names its permission or ` +
    `justifies being open, no control is disabled by authority, every page is measured`,
);
