#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"

echo "[verify] Rectangle verification started"
echo "[verify] root: $ROOT_DIR"
echo "[verify] node: $(node -v)"
echo "[verify] npm: $(npm -v)"

if [ ! -d "$WEB_DIR/node_modules" ]; then
  echo "[verify] apps/web/node_modules missing; run: cd apps/web && npm ci" >&2
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
run_step "typecheck" npm run typecheck
run_step "lint" npm run lint
run_step "unit/component tests" npm test
run_step "production build" npm run build

echo "\n[verify] All checks passed"
