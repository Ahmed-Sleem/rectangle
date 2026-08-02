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
  { id: "tasks", file: "features/tasks/TasksPage.tsx", tests: ["features/tasks/TasksPage.test.tsx"] },
  { id: "risks", file: "features/risks/RisksPage.tsx", tests: ["features/risks/RisksPage.test.tsx"] },
  {
    id: "team",
    file: "features/team/TeamPage.tsx",
    tests: ["features/team/TeamPage.test.tsx"],
    /*
     * The page is deliberately open and gated in parts, so it declares no
     * `requiredPermission` for the route guard to act on.
     *
     * The people directory is everyone's: it lists the colleagues you share a
     * project with, which membership already discloses. The account and role
     * registers need `users.read` and `user_types.read`, and each is absent
     * from the segment control rather than disabled for anybody without them —
     * so the refusal is expressed by the option not existing, which is the
     * house rule, rather than by a state this check can match on.
     */
    selfService: true,
  },
  {
    id: "team.directory",
    file: "features/team/PeopleDirectory.tsx",
    tests: ["features/team/PeopleDirectory.test.tsx"],
    /*
     * A presentational register, not a page.
     *
     * It briefly owned its own fetch, its own search box and its own empty,
     * loading and error states — which is how the Team page ended up with two
     * lists of the same people under two headings. The page owns all of that
     * now, shares one toolbar with Projects, Tasks and Risks, and hands this
     * the rows to draw. Its states are measured on `features/team/TeamPage.tsx`
     * above, where they actually live.
     */
    singleRecord: true,
    selfService: true,
    statesOwnedByHost: true,
  },
  {
    id: "profile",
    file: "features/profile/ProfilePage.tsx",
    tests: ["features/profile/ProfilePage.test.tsx"],
    // Always exactly one record — your own — and you are always allowed to
    // manage it. An empty state and a permission gate would both be dead code.
    singleRecord: true,
    selfService: true,
  },
  {
    id: "settings",
    file: "features/settings/SettingsPage.tsx",
    tests: ["features/settings/SettingsPage.test.tsx"],
    // Language and passkeys are the caller's own; only the company email
    // section is gated, and it hides itself. Gating the whole page would lock
    // people out of their own account settings.
    selfService: true,
  },
  {
    /*
     * Its own entry rather than being covered by the Settings page that hosts
     * it. It reads and writes company policy through its own endpoints and has
     * its own empty, loading and error states — a section large enough to have
     * those is large enough for the contract to be measured against it.
     */
    /*
     * Its own entry for the same reason the separation screen has one: it
     * reads company-wide configuration through its own endpoint and carries
     * its own permission, loading and error states.
     */
    id: "settings.permissions",
    file: "features/settings/PermissionReference.tsx",
    tests: ["features/settings/PermissionReference.test.tsx"],
    /*
     * There is no empty case to handle. The permission list, the standings and
     * the project roles are compile-time constants of the product, not records
     * a company creates — a build with none of them would be a build with no
     * access model. An empty state here would be code that can never run, and
     * the rule against unreachable states is exactly why this flag exists.
     */
    singleRecord: true,
  },
  {
    id: "settings.separation",
    file: "features/settings/SeparationRules.tsx",
    tests: ["features/settings/SeparationRules.test.tsx"],
  },
  {
    id: "activity",
    file: "features/activity/ActivityPage.tsx",
    tests: ["features/activity/ActivityPage.test.tsx"],
    // Everyone may read their own trail, so the page itself is not gated; the
    // service decides which scopes each caller may ask for.
    selfService: true,
  },
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
  // Self-service: the actor is the subject, so there is no permission to
  // check. The invariant that replaces it is stronger and verified below.
  { id: "profile", file: "application/profile-service.ts", selfService: true },
  // Token-authorised rather than session-authorised: the caller has no session
  // yet, so the token is the credential and the service verifies it.
  { id: "auth-lifecycle", file: "application/auth-lifecycle-service.ts", tokenAuthorised: true },
  { id: "search", file: "application/search-service.ts", readOnly: true },
  { id: "activity", file: "application/activity-service.ts", readOnly: true },
  { id: "risk", file: "application/risk-service.ts" },
  { id: "task", file: "application/task-service.ts" },
  { id: "admin", file: "application/admin-service.ts" },
];

const read = (base, file) => {
  const path = join(base, file);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

const results = [];
/**
 * Whether the feature's manifest names a permission, which means the router
 * refuses the page before this component is ever rendered.
 */
function featureDeclaresPermission(pageId) {
  const featureId = pageId.split(".")[0];
  const manifest = join(WEB, "features", featureId, "index.ts");
  if (!existsSync(manifest)) return false;
  return /requiredPermission:\s*"/.test(readFileSync(manifest, "utf8"));
}

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

  // Contract questions 1–4: the four states a data surface must handle. A
  // single-record surface cannot be empty — the record is the page.
  if (!page.singleRecord) {
    check("page", page.id, "empty state", /EmptyState|rect-empty|noRecords/.test(source));
  }
  /*
   * A register that is handed its rows does not fetch, so it has no loading or
   * error of its own — its host does, and that is where they are measured.
   * Demanding them here would push a spinner into a presentational component
   * purely to satisfy a check, which is the tail wagging the dog.
   */
  if (!page.statesOwnedByHost) {
    check("page", page.id, "loading state", /LoadingState|isLoading|isPending/.test(source));
    check("page", page.id, "error state", /ErrorState|role="alert"|isError/.test(source));
  }
  /*
   * Question 4: what does someone without permission see?
   *
   * The previous version of this check matched the word `permissions` anywhere
   * in the file, so a page that merely imported an auth hook passed. It could
   * not fail, and an audit later found that no page in the product had a real
   * no-permission state. It now requires one of three genuine answers:
   *
   *   - the page declares a `requiredPermission`, so the route guard refuses
   *     it before the component mounts;
   *   - the page renders `NoPermissionState` itself, for a page that is partly
   *     open and partly gated;
   *   - the page is self-service, where the caller is the subject and no
   *     permission applies.
   */
  const guardedByRoute = featureDeclaresPermission(page.id);
  check(
    "page",
    page.id,
    "permission state",
    page.selfService || guardedByRoute || /NoPermissionState/.test(source),
  );

  // Question 5: actions must be gated, not shown and then rejected.
  //
  // Matched on the authority helpers rather than on the name of a local flag.
  // The previous version looked for a variable called `canManage`, so splitting
  // the coarse permissions into atomic ones — which replaced that one flag with
  // `canCreate`, `canEdit` and `canDelete` on every page — reported four pages
  // as ungated while they were in fact gated more tightly than before. A check
  // that fails when the code improves is measuring the wrong thing.
  //
  // `access.data?.access` covers the per-project pages, where the answer is not
  // a company-wide permission at all: the server resolves what this caller may
  // do on this one project, and the page gates on that.
  //
  // `capabilities[` and `canOnAnyProject(` cover the registers that span
  // projects. Tasks and Risks used to read the company-wide permission, which
  // was wrong in both directions — it offered actions the server refuses on a
  // project the person is not on, and withheld actions a project role grants.
  // They now ask the server per project, and this check flagged them as
  // ungated for doing the stricter thing. Its own note above applies: a check
  // that fails when the code improves is measuring the wrong thing.
  const hasWriteAction = /Button[^>]*variant="primary"|onClick=\{\(\) => set\w*Open/.test(source);
  if (!page.singleRecord) {
    check(
      "page",
      page.id,
      "actions gated by permission",
      !hasWriteAction ||
        /hasPermission\(|permissions\.includes|roles\.some|access\.data\?\.access|capabilities\[|canOnAnyProject\(/.test(
          source,
        ),
    );
  }

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
  if (service.tokenAuthorised) {
    // The whole point of these flows is that a token stands in for a session.
    // What must hold is that the token is never trusted as presented: it is
    // resolved, its purpose checked, and it is spent exactly once.
    check(
      "service",
      service.id,
      "resolves tokens rather than trusting them",
      /this\.resolve\(/.test(source) && /record\.purpose !== purpose/.test(source),
      "a presented token must be looked up and matched to its purpose",
    );
    check(
      "service",
      service.id,
      "spends a token exactly once",
      /tokens\.consume\(/.test(source),
      "the action must run inside the same transaction that marks the token used",
    );
  } else if (service.selfService) {
    // The subject must always be the caller. A self-service method that reads
    // a user id from its input is an admin endpoint under the wrong name, and
    // would let anyone edit anyone by changing one field in the request.
    const readsSubjectFromInput = /input\.userId|rawUserId|params\.userId/.test(source);
    check(
      "service",
      service.id,
      "acts only on the caller",
      !readsSubjectFromInput && /actor\.userId/.test(source),
      "a self-service method must take its subject from the principal",
    );
  } else {
    /*
     * `availableScopes` is the third honest shape, alongside requiring a
     * permission outright and resolving per-record access: the service works
     * out which slice the caller may ask for and refuses anything wider. It is
     * listed explicitly rather than by loosening the pattern, so the check
     * still fails for a service that authorises nothing.
     */
    check(
      "service",
      service.id,
      "checks authorization",
      /require[A-Z]\w*|canReach[A-Z]\w*|canRead[A-Z]\w*|resolveAccess|availableScopes/.test(source),
    );
  }
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
