#!/usr/bin/env node
/**
 * Feature completeness checklist.
 *
 * `docs/UI_UX_PRESENTATION_PLAN.md` §5 defines a page-level contract every
 * feature must satisfy. Reading it and hoping is how requirements get missed, so
 * the mechanically checkable parts are verified here instead.
 *
 * This does not replace judgement. It catches the omissions that are easy to
 * make and hard to notice: a page with no error state, an action that is not
 * permission-gated, copy that never reaches a translation, a feature with no
 * tests.
 *
 * Run: node scripts/checks/feature-checklist.mjs [--json]
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = join(ROOT, "apps/web/src");
const API = join(ROOT, "apps/api/src");

/**
 * Pages that render data and therefore owe the full contract.
 * Add a feature here the moment its page exists, not after.
 */
const PAGES = [
  { id: "overview.today", file: "features/overview/TodayPage.tsx", tests: ["features/overview/TodayPage.test.tsx"] },
  { id: "projects.list", file: "features/projects/ProjectsPage.tsx", tests: ["features/projects/ProjectsPage.test.tsx"] },
  { id: "projects.workspace", file: "features/projects/ProjectDetailPage.tsx", tests: ["features/projects/ProjectDetailPage.test.tsx"] },
  { id: "projects.settings", file: "features/projects/ProjectSettingsPage.tsx", tests: ["features/projects/ProjectSettingsPage.test.tsx"] },
  { id: "team", file: "features/team/TeamPage.tsx", tests: ["features/team/TeamPage.test.tsx"] },
  { id: "settings", file: "features/settings/SettingsPage.tsx", tests: ["features/settings/SettingsPage.test.tsx"] },
];

/**
 * Backend slices that must carry validation, authorization, and tenant scoping.
 *
 * `readOnly` marks a service that only reads. Those still owe every other
 * guarantee; they are exempt from the audit check because logging a read would
 * bury the mutations the audit trail exists to preserve. Marking a service that
 * does mutate as read-only is the one way to weaken this, so the flag is
 * verified below rather than trusted.
 */
const SERVICES = [
  { id: "overview", file: "application/overview-service.ts", readOnly: true },
  { id: "project", file: "application/project-service.js".replace(".js", ".ts") },
  { id: "project-team", file: "application/project-team-service.ts" },
  { id: "admin", file: "application/admin-service.ts" },
];

const read = (base, file) => {
  const path = join(base, file);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

const results = [];
function check(scope, id, label, passed, detail = "") {
  results.push({ scope, id, label, passed, detail });
}

// ── Page contract ───────────────────────────────────────────────────────────
for (const page of PAGES) {
  const source = read(WEB, page.file);
  if (source === null) {
    check("page", page.id, "page exists", false, page.file);
    continue;
  }

  // Contract questions 1–4: the four states a data surface must handle.
  check("page", page.id, "empty state", /EmptyState|rect-empty|noRecords/.test(source));
  check("page", page.id, "loading state", /LoadingState|isLoading|isPending/.test(source));
  check("page", page.id, "error state", /ErrorState|role="alert"|isError/.test(source));
  check(
    "page",
    page.id,
    "permission state",
    /canManage|canRead|permissions|useOptionalAuth|useAuth/.test(source),
  );

  // Question 5: actions must be gated, not shown and then rejected.
  const hasWriteAction = /Button[^>]*variant="primary"|onClick=\{\(\) => set\w*Open/.test(source);
  check(
    "page",
    page.id,
    "actions gated by permission",
    !hasWriteAction || /canManage|permissions\.includes|roles\.some/.test(source),
  );

  // Question 11: every visible string translated.
  check("page", page.id, "uses translations", /useTranslation/.test(source));

  // Shared building blocks, never hand-rolled (UI_RULES §11/§12/§13).
  check("page", page.id, "no hand-rolled window", !/rect-ui-modal-backdrop|role="dialog"/.test(source));
  check("page", page.id, "no hand-rolled disclosure", !/<details|<summary/.test(source));

  // Tests exist and are not empty.
  const hasTests = page.tests.some((t) => {
    const test = read(WEB, t);
    return test !== null && /\bit\(/.test(test);
  });
  check("page", page.id, "has tests", hasTests);
}

// ── Service contract ────────────────────────────────────────────────────────
for (const service of SERVICES) {
  const source = read(API, service.file);
  if (source === null) {
    check("service", service.id, "service exists", false, service.file);
    continue;
  }
  check("service", service.id, "validates input", /\bparse[A-Z]\w*\(|safeParse/.test(source));
  check("service", service.id, "checks authorization", /require[A-Z]\w*|canManage|resolveAccess/.test(source));
  check("service", service.id, "scopes to tenant", /tenantId/.test(source));

  if (service.readOnly) {
    // A read-only claim is only credible while the service never calls a
    // repository method that changes state.
    check(
      "service",
      service.id,
      "read-only service performs no writes",
      !/\.(create|update|delete|add|remove|save|append)[A-Z(]/.test(source),
      "declared readOnly but calls a mutating repository method",
    );
  } else {
    check("service", service.id, "writes audit events", /audit\.append/.test(source));
  }
}

// ── Cross-cutting ───────────────────────────────────────────────────────────
const uiCss = read(WEB, "shared/ui/ui.css") ?? "";
const tokens = read(WEB, "shared/styles/tokens.css") ?? "";

check(
  "global",
  "focus",
  "focus indicators stay inside the element",
  !/box-shadow:\s*0 0 0 \d+px(?!.*inset)/.test(uiCss) || /inset 0 0 0/.test(uiCss),
  "an outward ring is clipped by overflow containers",
);
check("global", "tokens", "no untokenized font sizes", !/font-size:\s*[0-9.]+(rem|px|em)/.test(uiCss));
check("global", "tokens", "control width tokens defined", /--rect-field-width-/.test(tokens));

// Every locale namespace must carry both languages.
const localesDir = join(WEB, "shared/i18n/locales");
if (existsSync(localesDir)) {
  for (const file of readdirSync(localesDir).filter((f) => f.endsWith(".ts") && f !== "types.ts")) {
    const source = readFileSync(join(localesDir, file), "utf8");
    check("i18n", file, "defines both languages", /const en =/.test(source) && /const ar:/.test(source));
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.passed);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
} else {
  const byScope = new Map();
  for (const result of results) {
    if (!byScope.has(result.scope)) byScope.set(result.scope, []);
    byScope.get(result.scope).push(result);
  }

  for (const [scope, entries] of byScope) {
    console.log(`\n  ${scope}`);
    let lastId = "";
    for (const entry of entries) {
      if (entry.id !== lastId) {
        console.log(`    ${entry.id}`);
        lastId = entry.id;
      }
      const mark = entry.passed ? "✓" : "✗";
      const detail = entry.detail && !entry.passed ? `  — ${entry.detail}` : "";
      console.log(`      ${mark} ${entry.label}${detail}`);
    }
  }

  console.log(
    `\n[feature-checklist] ${results.length - failed.length}/${results.length} checks passed`,
  );
}

if (failed.length > 0) {
  console.error(`\n[feature-checklist] ${failed.length} incomplete:`);
  for (const entry of failed) {
    console.error(`  - ${entry.scope}/${entry.id}: ${entry.label}`);
  }
  process.exit(1);
}

console.log("[feature-checklist] Every page and service meets the contract");
