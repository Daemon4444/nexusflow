#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v docker >/dev/null 2>&1 || {
  echo "docker is required to validate container runtime behavior" >&2
  exit 1
}

BUILD_SHA="${BUILD_SHA:-$(git rev-parse HEAD)}"
if [[ ! "$BUILD_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "BUILD_SHA must be a full 40-character Git SHA" >&2
  exit 1
fi

SMOKE_SUFFIX="$$"
NETWORK_NAME="nexusflow-runtime-smoke-${SMOKE_SUFFIX}"
API_CONTAINER="nexusflow-api-smoke-${SMOKE_SUFFIX}"
WEB_CONTAINER="nexusflow-web-smoke-${SMOKE_SUFFIX}"
PG_CONTAINER="nexusflow-pg-smoke-${SMOKE_SUFFIX}"
REDIS_CONTAINER="nexusflow-redis-smoke-${SMOKE_SUFFIX}"

cleanup() {
  docker rm -f \
    "$API_CONTAINER" "$WEB_CONTAINER" "$PG_CONTAINER" "$REDIS_CONTAINER" \
    >/dev/null 2>&1 || true
  docker network rm "$NETWORK_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$NETWORK_NAME" >/dev/null
docker run -d --name "$PG_CONTAINER" --network "$NETWORK_NAME" \
  -e POSTGRES_USER=smoke -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=smoke \
  postgres:16-alpine >/dev/null
docker run -d --name "$REDIS_CONTAINER" --network "$NETWORK_NAME" \
  redis:7-alpine >/dev/null

dependencies_ready=false
for _ in {1..60}; do
  if docker exec "$PG_CONTAINER" pg_isready -U smoke -d smoke >/dev/null 2>&1 \
    && docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; then
    dependencies_ready=true
    break
  fi
  sleep 1
done
if [[ "$dependencies_ready" != "true" ]]; then
  echo "PostgreSQL/Redis smoke dependencies did not become ready" >&2
  exit 1
fi

docker run --rm --network "$NETWORK_NAME" \
  -e PG_HOST="$PG_CONTAINER" -e PG_USER=smoke -e PG_PASSWORD=smoke -e PG_DATABASE=smoke \
  "nexusflow-backend:${BUILD_SHA}" node backend/dist/db/migrate.js >/dev/null

docker run -d --name "$API_CONTAINER" --network "$NETWORK_NAME" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  --tmpfs /app/backend/uploads:rw,noexec,nosuid,size=1g \
  -e PROVIDER_OUTBOUND_HOST_ALLOWLIST=dashscope.aliyuncs.com \
  -e OSS_BUCKET=smoke -e OSS_ENDPOINT=oss.example.invalid \
  -e OSS_ACCESS_KEY_ID=smoke -e OSS_ACCESS_KEY_SECRET=smoke \
  -e PG_HOST="$PG_CONTAINER" -e PG_USER=smoke -e PG_PASSWORD=smoke -e PG_DATABASE=smoke \
  -e REDIS_HOST="$REDIS_CONTAINER" \
  "nexusflow-backend:${BUILD_SHA}" >/dev/null

api_ready=false
for _ in {1..60}; do
  if docker exec "$API_CONTAINER" node -e \
    "fetch('http://127.0.0.1:3001/api/health/ready').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"; then
    api_ready=true
    break
  fi
  sleep 1
done
if [[ "$api_ready" != "true" ]]; then
  docker logs "$API_CONTAINER" >&2
  exit 1
fi

[[ "$(docker inspect --format '{{.Config.User}}' "$API_CONTAINER")" == "node" ]]
[[ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$API_CONTAINER")" == "true" ]]

docker kill --signal USR2 "$API_CONTAINER" >/dev/null
docker exec "$API_CONTAINER" node -e \
  "fetch('http://127.0.0.1:3001/api/health/ready').then(r=>process.exit(r.status===503?0:1)).catch(()=>process.exit(1))"
docker stop -t 15 "$API_CONTAINER" >/dev/null

docker run -d --name "$WEB_CONTAINER" --network "$NETWORK_NAME" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=128m \
  --tmpfs /app/frontend/.next/cache:rw,noexec,nosuid,size=256m \
  "nexusflow-frontend:${BUILD_SHA}" >/dev/null

web_ready=false
for _ in {1..60}; do
  if docker exec "$WEB_CONTAINER" node -e \
    "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"; then
    web_ready=true
    break
  fi
  sleep 1
done
if [[ "$web_ready" != "true" ]]; then
  docker logs "$WEB_CONTAINER" >&2
  exit 1
fi

[[ "$(docker inspect --format '{{.Config.User}}' "$WEB_CONTAINER")" == "node" ]]
[[ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$WEB_CONTAINER")" == "true" ]]
docker stop -t 15 "$WEB_CONTAINER" >/dev/null

echo "container runtime smoke checks passed for ${BUILD_SHA}"
