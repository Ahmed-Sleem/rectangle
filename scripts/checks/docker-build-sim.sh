#!/usr/bin/env bash
# Docker build simulation.
#
# Reproduces the Dockerfile's build context by copying only the files each stage
# COPYs into a clean directory, then running that stage's build commands there.
#
# A container runtime is not required, so this runs anywhere the repo builds. It
# catches the failure mode that plain `verify.sh` cannot see: source that
# compiles against the full repository but is missing inside the image.
#
# Run: scripts/checks/docker-build-sim.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "[docker-sim] simulating Dockerfile build context in $WORK_DIR"

# ── web-build stage ─────────────────────────────────────────────────────────
WEB_CTX="$WORK_DIR/apps/web"
mkdir -p "$WEB_CTX"

cp "$ROOT_DIR/apps/web/package.json" \
   "$ROOT_DIR/apps/web/package-lock.json" \
   "$ROOT_DIR/apps/web/index.html" \
   "$ROOT_DIR/apps/web/tsconfig.json" \
   "$ROOT_DIR/apps/web/tsconfig.app.json" \
   "$ROOT_DIR/apps/web/tsconfig.node.json" \
   "$ROOT_DIR/apps/web/vite.config.ts" \
   "$WEB_CTX/"
cp -r "$ROOT_DIR/apps/web/public" "$WEB_CTX/public"
cp -r "$ROOT_DIR/apps/web/src" "$WEB_CTX/src"

# Reuse installed dependencies; the image runs `npm ci` for these separately.
if [ ! -d "$ROOT_DIR/apps/web/node_modules" ]; then
  echo "[docker-sim] apps/web/node_modules missing; run: npm --prefix apps/web ci" >&2
  exit 1
fi
ln -s "$ROOT_DIR/apps/web/node_modules" "$WEB_CTX/node_modules"

echo "[docker-sim] ▶ web-build: npm run typecheck && npm run build"
(
  cd "$WEB_CTX"
  # tsBuildInfo points into node_modules/.tmp, which is shared via the symlink;
  # force a clean build so a cached result cannot mask a missing file.
  npm run typecheck -- --force >/dev/null
  npm run build >/dev/null
)
echo "[docker-sim] ✓ web-build"

# ── api-build stage ─────────────────────────────────────────────────────────
API_CTX="$WORK_DIR/apps/api"
mkdir -p "$API_CTX"

cp "$ROOT_DIR/apps/api/package.json" \
   "$ROOT_DIR/apps/api/package-lock.json" \
   "$ROOT_DIR/apps/api/tsconfig.json" \
   "$ROOT_DIR/apps/api/tsconfig.build.json" \
   "$API_CTX/"
cp -r "$ROOT_DIR/apps/api/src" "$API_CTX/src"
cp -r "$ROOT_DIR/apps/api/migrations" "$API_CTX/migrations"

if [ ! -d "$ROOT_DIR/apps/api/node_modules" ]; then
  echo "[docker-sim] apps/api/node_modules missing; run: npm --prefix apps/api ci" >&2
  exit 1
fi
ln -s "$ROOT_DIR/apps/api/node_modules" "$API_CTX/node_modules"

echo "[docker-sim] ▶ api-build: npm run typecheck && npm run build"
(
  cd "$API_CTX"
  npm run typecheck >/dev/null
  npm run build >/dev/null
)
echo "[docker-sim] ✓ api-build"

echo "[docker-sim] Both image stages build from their own context"
