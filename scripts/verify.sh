#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
API_DIR="$ROOT_DIR/apps/api"

echo "[verify] Rectangle verification started"
echo "[verify] root: $ROOT_DIR"
echo "[verify] node: $(node -v)"
echo "[verify] npm: $(npm -v)"

if [ ! -d "$WEB_DIR/node_modules" ]; then
  echo "[verify] apps/web/node_modules missing; run: cd apps/web && npm ci" >&2
  exit 1
fi

if [ ! -d "$API_DIR/node_modules" ]; then
  echo "[verify] apps/api/node_modules missing; run: cd apps/api && npm ci" >&2
  exit 1
fi

run_step() {
  local name="$1"
  shift
  echo "\n[verify] ▶ $name"
  "$@"
  echo "[verify] ✓ $name"
}

cd "$WEB_DIR"
run_step "web typecheck" npm run typecheck
run_step "web lint" npm run lint
run_step "web unit/component tests" npm test
run_step "web production build" npm run build

cd "$API_DIR"
run_step "api typecheck" npm run typecheck
run_step "api tests" npm test
run_step "api production build" npm run build

# Repo-level checks. These live outside the apps because the deployable image
# only contains an app directory, and because they guard the deployment itself.
cd "$ROOT_DIR"
run_step "feature checklist" node scripts/checks/feature-checklist.mjs
run_step "design token snapshot" node scripts/checks/token-snapshot.mjs
run_step "design token usage" node scripts/checks/token-usage.mjs
run_step "spacing scale" node scripts/checks/spacing-scale.mjs
run_step "logical properties" node scripts/checks/logical-properties.mjs
run_step "duplicate css" node scripts/checks/duplicate-css.mjs
run_step "flex axis" node scripts/checks/flex-axis.mjs
run_step "sticky bars cover their gap" node scripts/checks/sticky-cover.mjs
run_step "one opening animation" node scripts/checks/one-opening.mjs
run_step "motion tokens" node scripts/checks/motion-tokens.mjs
run_step "pglite budget" node scripts/checks/pglite-budget.mjs
run_step "one search engine" node scripts/checks/search-engine.mjs
run_step "permission visibility" node scripts/checks/permission-visibility.mjs
run_step "rules reference integrity" node scripts/checks/rules-reference.mjs
run_step "deploy build context" node scripts/checks/deploy-context.mjs
run_step "dependency advisories" node scripts/checks/dependency-audit.mjs
run_step "docker build simulation" ./scripts/checks/docker-build-sim.sh

# Last, because it is the only step that needs the built output of the two
# steps above: it starts the real API serving the real bundle against a real
# PostgreSQL and drives a browser through it.
run_step "audit coverage" node ./scripts/checks/audit-coverage.mjs
run_step "assistant capability parity" node ./scripts/checks/ai-tool-parity.mjs
run_step "end-to-end sign-in flows" ./scripts/checks/e2e.sh

echo "\n[verify] All checks passed"
