#!/usr/bin/env bash
# Runs ON THE SERVER (called by GitHub Actions over SSH, or by hand):
#   bash deploy/deploy.sh
# Pulls main, restarts with pm2, checks /api/health and goes back to the previous commit if it fails.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3000}"
cd "$APP_DIR"

PREV="$(git rev-parse HEAD)"
git fetch --depth 1 origin "$BRANCH"
git reset --hard "origin/$BRANCH"
NEW="$(git rev-parse HEAD)"
echo "==> $PREV -> $NEW"

mkdir -p logs data
[ -f .env ] || { echo "!! .env is missing in $APP_DIR (copy .env.example and fill it in)"; exit 1; }
# no runtime dependencies; dev ones (esbuild) are only for building on your computer
[ -f package-lock.json ] && grep -q '"dependencies"' package.json && npm ci --omit=dev --no-audit --no-fund || true

pm2 startOrReload ecosystem.config.cjs --update-env

healthy() {
  for i in $(seq 1 20); do
    curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}
if healthy; then
  pm2 save >/dev/null
  echo "==> deployed $NEW"
else
  echo "!! health check failed, rolling back to $PREV"
  git reset --hard "$PREV"
  pm2 startOrReload ecosystem.config.cjs --update-env
  healthy && pm2 save >/dev/null
  exit 1
fi
