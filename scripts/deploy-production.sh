#!/usr/bin/env bash
set -euo pipefail

ROOT="${NEXUSFLOW_ROOT:-/root/distiny/nexusflow}"
cd "$ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to deploy a dirty working tree." >&2
  exit 1
fi

BUILD_SHA="$(git rev-parse HEAD)"
BUILD_TIME="$(date -u +%FT%TZ)"

npm ci
BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" npm run build:backend
npm run build:frontend
(cd backend && npm run db:migrate)

BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" \
pm2 reload ecosystem.config.js --only quadrant-backend --update-env
pm2 reload ecosystem.config.js --only quadrant-frontend --update-env

curl --fail --silent --show-error http://127.0.0.1:3001/api/health >/dev/null
VERSION="$(curl --fail --silent --show-error http://127.0.0.1:3001/api/version)"
case "$VERSION" in
  *"$BUILD_SHA"*) ;;
  *)
    echo "Backend version mismatch: expected $BUILD_SHA, received $VERSION" >&2
    exit 1
    ;;
esac

FRONTEND_OK=false
for _ in $(seq 1 20); do
  if curl --fail --silent --show-error http://127.0.0.1:19999/ >/dev/null; then
    FRONTEND_OK=true
    break
  fi
  sleep 1
done
if [[ "$FRONTEND_OK" != "true" ]]; then
  echo "Frontend health check failed on http://127.0.0.1:19999/" >&2
  pm2 describe quadrant-frontend >&2 || true
  exit 1
fi

pm2 save

echo "Deployed $BUILD_SHA at $BUILD_TIME"
