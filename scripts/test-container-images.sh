#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v docker >/dev/null 2>&1 || {
  echo "docker is required to validate container images" >&2
  exit 1
}

# Dockerfiles use cache mounts to keep CI builds deterministic and reasonably
# fast. Explicitly enable BuildKit because fresh Docker CLI installations can
# otherwise fall back to the legacy builder.
export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"

BUILD_SHA="${BUILD_SHA:-$(git rev-parse HEAD)}"
BUILD_TIME="${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
if [[ ! "$BUILD_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "BUILD_SHA must be a full 40-character Git SHA" >&2
  exit 1
fi

docker build \
  --file docker/backend.Dockerfile \
  --build-arg "BUILD_SHA=$BUILD_SHA" \
  --build-arg "BUILD_TIME=$BUILD_TIME" \
  --tag "nexusflow-backend:${BUILD_SHA}" \
  .

docker build \
  --file docker/frontend.Dockerfile \
  --build-arg "BUILD_SHA=$BUILD_SHA" \
  --build-arg "BUILD_TIME=$BUILD_TIME" \
  --build-arg "BACKEND_URL=http://nexusflow-api:3001" \
  --tag "nexusflow-frontend:${BUILD_SHA}" \
  .

docker build \
  --file docker/gateway.Dockerfile \
  --build-arg "BUILD_SHA=$BUILD_SHA" \
  --build-arg "BUILD_TIME=$BUILD_TIME" \
  --tag "nexusflow-gateway:${BUILD_SHA}" \
  .

for image in \
  "nexusflow-backend:${BUILD_SHA}" \
  "nexusflow-frontend:${BUILD_SHA}" \
  "nexusflow-gateway:${BUILD_SHA}"; do
  docker image inspect "$image" >/dev/null
  revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image")"
  created="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.created" }}' "$image")"
  [[ "$revision" == "$BUILD_SHA" ]]
  [[ "$created" == "$BUILD_TIME" ]]
done

[[ "$(docker image inspect --format '{{.Config.User}}' "nexusflow-gateway:${BUILD_SHA}")" == "101" ]]

echo "container images built successfully for ${BUILD_SHA}"
