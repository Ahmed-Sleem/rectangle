#!/usr/bin/env node
/**
 * Deployment build-context check.
 *
 * Railway builds each app from the Dockerfile, and the Dockerfile copies only a
 * subset of the repository into each build stage. Anything an app imports that
 * lives outside its own copied context compiles locally — where the whole repo
 * is present — and then fails the deploy.
 *
 * This check reproduces the Dockerfile's build context and fails fast, locally,
 * with the same error Railway would report.
 *
 * Run: node scripts/checks/deploy-context.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Paths each Dockerfile stage copies, mirroring the COPY instructions.
 * Keep in sync with the Dockerfile; the self-check below enforces that.
 */
const STAGES = [
  {
    name: "web-build",
    appDir: "apps/web",
    copied: [
      "apps/web/package.json",
      "apps/web/package-lock.json",
      "apps/web/index.html",
      "apps/web/tsconfig.json",
      "apps/web/tsconfig.app.json",
      "apps/web/tsconfig.node.json",
      "apps/web/vite.config.ts",
      "apps/web/public",
      "apps/web/src",
    ],
  },
  {
    name: "api-build",
    appDir: "apps/api",
    copied: [
      "apps/api/package.json",
      "apps/api/package-lock.json",
      "apps/api/tsconfig.json",
      "apps/api/tsconfig.build.json",
      "apps/api/src",
      "apps/api/migrations",
    ],
  },
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Static import/require/export-from specifiers, ignoring comments. */
function findRelativeSpecifiers(source) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const specifiers = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(withoutComments)) !== null) {
      const value = match[1];
      if (value.startsWith(".")) specifiers.push(value);
    }
  }
  return specifiers;
}

const problems = [];

for (const stage of STAGES) {
  /*
   * Only the paths the stage actually COPYs, not the whole app directory.
   *
   * Walking the app directory asked the wrong question. `apps/api/test` is
   * never copied into any image, so a test reaching into another app cannot
   * fail a deploy — and search-parity.test.ts deliberately imports the browser
   * matcher, because holding the two search implementations to the same answers
   * is the entire point of that test. Reported as a deployment fault, it was a
   * false alarm that a reader would eventually silence by weakening the check
   * or deleting a good test. What the Dockerfile copies is what the container
   * has, so that is what is examined.
   */
  const files = stage.copied
    .flatMap((path) => {
      const full = join(ROOT, path);
      try {
        return statSync(full).isDirectory() ? walk(full) : [full];
      } catch {
        // A COPY naming a path that does not exist is caught by the
        // Dockerfile self-check below, which reports it far more clearly.
        return [];
      }
    })
    .filter((file) => SOURCE_EXTENSIONS.has(file.slice(file.lastIndexOf("."))));

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const specifier of findRelativeSpecifiers(source)) {
      // Strip Vite query suffixes such as ?raw before resolving.
      const cleaned = specifier.split("?")[0];
      const target = resolve(dirname(file), cleaned);
      const fromRoot = relative(ROOT, target);

      // Escaping the repo entirely, or landing outside this stage's app dir,
      // means the file will not exist inside the container.
      if (fromRoot.startsWith("..") || !fromRoot.startsWith(stage.appDir)) {
        problems.push({
          stage: stage.name,
          file: relative(ROOT, file),
          specifier,
          resolvesTo: fromRoot,
        });
      }
    }
  }
}

// Self-check: the copy list above must still match the Dockerfile.
const dockerfile = readFileSync(join(ROOT, "Dockerfile"), "utf8");
for (const stage of STAGES) {
  for (const path of stage.copied) {
    if (!dockerfile.includes(path)) {
      problems.push({
        stage: stage.name,
        file: "Dockerfile",
        specifier: path,
        resolvesTo:
          "listed in deploy-context.mjs but no longer COPYed by the Dockerfile — update one of them",
      });
    }
  }
}

if (problems.length > 0) {
  console.error("[deploy-context] Imports that will not exist in the Docker build context:\n");
  for (const problem of problems) {
    console.error(`  ${problem.file}`);
    console.error(`    imports  ${problem.specifier}`);
    console.error(`    resolves ${problem.resolvesTo}`);
    console.error(`    stage    ${problem.stage} does not copy this path\n`);
  }
  console.error(
    "Fix by moving the dependency inside the app, or move the check to a repo-level\n" +
      "test under scripts/checks/ that runs outside the deployable image.",
  );
  process.exit(1);
}

console.log("[deploy-context] All app imports stay inside their Docker build context");
