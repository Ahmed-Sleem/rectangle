#!/usr/bin/env bash
#
# End-to-end sign-in flows.
#
# Runs last in verify.sh because it consumes what the earlier steps produce:
# the built API and the built web bundle, served together from one origin
# exactly as the deployment serves them, against a real PostgreSQL.
#
# It is not optional and it is not skipped when the browser is missing. A check
# that quietly passes because its dependency is absent is worse than no check —
# it reports green for a suite that never ran. If Chromium is not installed the
# step fails and says how to install it.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
E2E_DIR="$ROOT_DIR/e2e"

if [ ! -d "$E2E_DIR/node_modules" ]; then
  echo "[e2e] e2e/node_modules missing; run: cd e2e && npm install" >&2
  exit 1
fi

cd "$E2E_DIR"

if ! npx playwright install --dry-run chromium >/dev/null 2>&1; then
  echo "[e2e] Chromium is not installed; run: cd e2e && npx playwright install chromium" >&2
  exit 1
fi

npx playwright test

echo "[e2e] a real browser signed in and used the product"
