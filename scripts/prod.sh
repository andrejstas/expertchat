#!/bin/sh
# Production server on port 3000. Builds into .next-prod (separate from the dev
# server's .next) and only rebuilds when code changed since the last build.
# Experts and memory are read at runtime, so editing them needs no rebuild.
set -e
cd "$(dirname "$0")/.."
export NEXT_DIST_DIR=.next-prod

pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true

stale=$(find app components lib package.json next.config.mjs tailwind.config.ts postcss.config.js \
  -newer .next-prod/BUILD_ID -print -quit 2>/dev/null || echo missing)
if [ ! -f .next-prod/BUILD_ID ] || [ -n "$stale" ]; then
  npm run build
fi
exec npx next start -p 3000
