#!/usr/bin/env node
/**
 * Dependency advisory gate.
 *
 * Advisories were previously discovered by running `npm audit` by hand and then
 * recorded as an open item, which meant a new advisory only surfaced when
 * somebody remembered to look. This runs the audit as part of the same gate
 * that guards everything else, so a vulnerable dependency fails the push rather
 * than waiting for a review.
 *
 * Both workspaces are audited at their full dependency tree, not just
 * production: a compromised build-time package can rewrite the bundle that
 * production serves.
 *
 * Run: node scripts/checks/dependency-audit.mjs
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const WORKSPACES = ["apps/web", "apps/api"];

/**
 * Severities that fail the build. `low` and `moderate` are reported but do not
 * block, because a gate that fires on advisories nobody will act on gets
 * bypassed, and a bypassed gate protects nothing.
 */
const BLOCKING = new Set(["high", "critical"]);

function audit(workspace) {
  const cwd = resolve(ROOT, workspace);
  let raw;

  try {
    raw = execFileSync("npm", ["audit", "--json"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    // npm exits non-zero when it finds anything at all, so the report still
    // has to be read from stdout rather than treated as a failure to run.
    if (typeof error.stdout !== "string" || error.stdout.length === 0) {
      throw new Error(`[dependency-audit] npm audit could not run in ${workspace}: ${error.message}`);
    }
    raw = error.stdout;
  }

  const report = JSON.parse(raw);
  const advisories = Object.values(report.vulnerabilities ?? {});

  const blocking = advisories.filter((entry) => BLOCKING.has(entry.severity));
  const other = advisories.filter((entry) => !BLOCKING.has(entry.severity));

  return { workspace, blocking, other };
}

let failed = false;

for (const workspace of WORKSPACES) {
  const { blocking, other } = audit(workspace);

  for (const entry of other) {
    console.log(`[dependency-audit] ${workspace}: ${entry.severity} in ${entry.name} (not blocking)`);
  }

  if (blocking.length > 0) {
    failed = true;
    for (const entry of blocking) {
      const via = entry.via
        .map((v) => (typeof v === "string" ? v : v.title))
        .join("; ");
      console.error(`[dependency-audit] ${workspace}: ${entry.severity} in ${entry.name} — ${via}`);
    }
    continue;
  }

  console.log(`[dependency-audit] ${workspace}: no high or critical advisories`);
}

if (failed) {
  console.error("[dependency-audit] Resolve the advisories above, or justify and downgrade them deliberately.");
  process.exit(1);
}

console.log("[dependency-audit] Dependency trees carry no blocking advisories");
