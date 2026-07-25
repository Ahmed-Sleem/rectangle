#!/usr/bin/env node
/**
 * Design token snapshot check.
 *
 * design/tokens/shell.tokens.json is the machine-readable mirror of the shipped
 * apps/web/src/shared/styles/tokens.css. If the two drift, the design docs start
 * describing a product that does not exist.
 *
 * This lives at repo level rather than inside apps/web because the deployable
 * image only contains the app directory; see scripts/checks/deploy-context.mjs.
 *
 * Run: node scripts/checks/token-snapshot.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const tokensCss = readFileSync(
  join(ROOT, "apps/web/src/shared/styles/tokens.css"),
  "utf8",
);
const globalCss = readFileSync(
  join(ROOT, "apps/web/src/shared/styles/global.css"),
  "utf8",
);
const snapshot = JSON.parse(
  readFileSync(join(ROOT, "design/tokens/shell.tokens.json"), "utf8"),
);

const failures = [];

function cssToken(name) {
  const match = tokensCss.match(new RegExp(`${name}:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

function expectToken(name, expected, label) {
  const actual = cssToken(name);
  if (actual !== expected) {
    failures.push(`${label}: ${name} is "${actual}" in tokens.css but the snapshot says "${expected}"`);
  }
}

// Inter weights advertised by the snapshot must actually be imported.
const importedWeights = [...globalCss.matchAll(/@fontsource\/inter\/(\d+)\.css/g)]
  .map((match) => Number(match[1]))
  .sort((a, b) => a - b);
const snapshotWeights = [...snapshot.font.weights].sort((a, b) => a - b);
if (JSON.stringify(importedWeights) !== JSON.stringify(snapshotWeights)) {
  failures.push(
    `font weights: global.css imports [${importedWeights}] but the snapshot advertises [${snapshotWeights}]`,
  );
}

for (const [key, value] of Object.entries(snapshot.space)) {
  const suffix = key.replace(/^s/, "");
  // Zero is written unitless in CSS.
  expectToken(`--rect-space-${suffix}`, value === 0 ? "0" : `${value}px`, "spacing");
}

expectToken("--rect-control-compact", `${snapshot.control.compact}px`, "control");
expectToken("--rect-control-standard", `${snapshot.control.standard}px`, "control");
expectToken("--rect-control-touch", `${snapshot.control.touch}px`, "control");
expectToken("--rect-table-row-dense", `${snapshot.tableRow.dense}px`, "table");

expectToken(
  "--rect-canvas-content-max",
  `${snapshot.canvas.contentMaxWidth}px`,
  "canvas",
);
expectToken("--rect-panel-stack-gap", `${snapshot.canvas.stackGap}px`, "canvas");
expectToken(
  "--rect-panel-padding",
  `${snapshot.canvas.paddingY}px ${snapshot.canvas.paddingX}px`,
  "canvas",
);

expectToken("--rect-overlay-width-sm", `${snapshot.overlay.widthSm}px`, "overlay");
expectToken("--rect-overlay-width-md", `${snapshot.overlay.widthMd}px`, "overlay");
expectToken("--rect-overlay-width-lg", `${snapshot.overlay.widthLg}px`, "overlay");
expectToken("--rect-overlay-width-xl", `${snapshot.overlay.widthXl}px`, "overlay");
expectToken("--rect-overlay-max-block", `${snapshot.overlay.maxBlock}px`, "overlay");
expectToken("--rect-app-blur", `${snapshot.overlay.appBlur}px`, "overlay");

expectToken("--rect-z-overlay", String(snapshot.zIndex.overlay), "z-index");
expectToken("--rect-z-toast", String(snapshot.zIndex.toast), "z-index");

if (failures.length > 0) {
  console.error("[token-snapshot] design/tokens/shell.tokens.json drifted from tokens.css:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("\nUpdate whichever is wrong so design docs match the shipped product.");
  process.exit(1);
}

console.log("[token-snapshot] Design token snapshot matches the shipped tokens");
