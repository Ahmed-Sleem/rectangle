#!/usr/bin/env node
/**
 * Anything a person may do, the assistant can do for them — or somebody wrote
 * down why not.
 *
 * The owner's requirement, in his words: *"the model should have 100% of
 * capabilities of the user, if user can create user the agent can create them
 * for him"*. That was true on the day the tools were written and is exactly the
 * sort of thing that stops being true quietly. A new permission ships with a
 * screen behind it, nobody thinks about the assistant, and the gap is invisible
 * — there is no error, no failing test, and no symptom except a person asking
 * the assistant for something it cannot do and being told it has no such tool.
 *
 * So the parity is checked rather than remembered. Every permission in the
 * catalogue must either be the `requiredPermission` of a tool, or appear below
 * with a reason. The exemption list is the point: it turns "we forgot" into "we
 * decided", and the decision is reviewable in one place.
 *
 * Run: node scripts/checks/ai-tool-parity.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PERMISSIONS = join(ROOT, "apps/api/src/domain/permissions.ts");
const TOOLS = join(ROOT, "apps/api/src/domain/ai.ts");

/**
 * Permissions the assistant deliberately has no tool for, and why.
 *
 * Every entry is a decision, not a backlog item. A permission belongs here when
 * a tool would be wrong, not when one has not been written yet — if it is
 * merely missing, the honest thing is to fail this check and add the tool.
 */
const DELIBERATELY_ABSENT = {
  "settings.manage":
    "Company configuration: provider endpoints, keys, mail delivery. Changing where the model itself runs, through the model, is a loop with no safe stopping point — and these are the settings that would let one instruction redirect every future request to somebody else's endpoint.",
  "activity.read_all":
    "Reads sign-in history and account changes for the whole company. `recent_activity` already covers the operational trail behind `activity.read_team`; widening it to the security and personal classes would put somebody's failed logins into a conversation transcript.",
  "users.disable":
    "Locking a colleague out of the product mid-shift is not something to reach through a chat instruction, and unlike a deleted task it cannot be undone by the person who noticed.",
  "user_types.read": "A saved permission list is scaffolding for the team screens, not a thing to ask about.",
  "user_types.create": "As above: these lists exist to fill in the team form, and are edited there.",
  "user_types.edit": "As above.",
  "user_types.delete": "As above.",
  "users.read":
    "Covered by `list_colleagues` and `project_team`, which answer the same question in the shape a person asks it.",
  "users.edit":
    "Editing somebody else's account details is administration, done on the screen that shows the whole record rather than through a sentence.",
  "projects.archive":
    "Covered by `update_project`, which takes a status and is subject to the same permission checks.",
  "projects.delete":
    "Deleting a project takes its tasks, risks and history with it. Confirmed on the screen that can show what is about to be lost.",
  "projects.manage_all":
    "Not an action: it widens the scope of the other project permissions rather than granting one of its own.",
};

const permissionsSource = readFileSync(PERMISSIONS, "utf8");
const toolsSource = readFileSync(TOOLS, "utf8");

/*
 * The catalogue is the array literal, read up to its closing bracket rather
 * than by scanning the whole file — the same strings appear again further down
 * in groupings and defaults, and counting those would report permissions that
 * do not exist.
 */
const listStart = permissionsSource.indexOf("export const permissionSchema");
const listEnd = permissionsSource.indexOf("]", listStart);
if (listStart === -1 || listEnd === -1) {
  console.error("[ai-tool-parity] could not find the permission list; this check needs updating");
  process.exit(1);
}

const permissions = [
  ...permissionsSource.slice(listStart, listEnd).matchAll(/"([a-z_]+\.[a-z_]+)"/g),
].map((match) => match[1]);

const covered = new Set(
  [...toolsSource.matchAll(/requiredPermission:\s*"([a-z_]+\.[a-z_]+)"/g)].map((match) => match[1]),
);

const failures = [];

for (const permission of permissions) {
  if (covered.has(permission)) continue;
  if (permission in DELIBERATELY_ABSENT) continue;

  failures.push(
    `${permission} has no tool and no recorded reason. Add a tool to aiTools, or add it to ` +
      `DELIBERATELY_ABSENT in this file with the reason a tool would be wrong.`,
  );
}

/*
 * The list must not rot in the other direction either. An exemption for a
 * permission that no longer exists is a stale decision that hides the next
 * real gap, because a reader trusts the list to describe the catalogue.
 */
for (const exempt of Object.keys(DELIBERATELY_ABSENT)) {
  if (!permissions.includes(exempt)) {
    failures.push(`${exempt} is listed as deliberately absent but is not a permission any more.`);
  }
  if (covered.has(exempt)) {
    failures.push(
      `${exempt} is listed as deliberately absent, but a tool now requires it. Remove the exemption.`,
    );
  }
}

if (failures.length > 0) {
  console.error("[ai-tool-parity] the assistant cannot do everything a person can:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `[ai-tool-parity] ${permissions.length} permissions: ${covered.size} reachable through a tool, ` +
    `${Object.keys(DELIBERATELY_ABSENT).length} deliberately not`,
);
