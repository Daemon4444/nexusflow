#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/release-common.sh
source "$SCRIPT_DIR/release-common.sh"

ROOT="${NEXUSFLOW_ROOT:-/root/distiny/nexusflow}"
RELEASES_ROOT="${NEXUSFLOW_RELEASES_ROOT:-/root/distiny/nexusflow-releases}"
ARTIFACTS_ROOT="${NEXUSFLOW_ARTIFACTS_ROOT:-/root/distiny/nexusflow-artifacts}"
CURRENT_LINK="${NEXUSFLOW_CURRENT_LINK:-/root/distiny/nexusflow-current}"
DRY_RUN=false
OUTPUT=""
BUILD_SHA=""
EXTRA_STATIC_ARCHIVE=""

usage() {
  cat <<'EOF'
Usage: build-release-artifact.sh [--sha <full-git-sha>] [--output <archive>]
                                 [--extra-static-archive <tar>] [--dry-run]

Builds one immutable NexusFlow release archive in an isolated directory. The
running source tree, node_modules, backend dist, and frontend .next are never
modified.
EOF
}

while test "$#" -gt 0; do
  case "$1" in
    --sha)
      test "$#" -ge 2 || release_die "--sha requires a value"
      BUILD_SHA="$2"
      shift 2
      ;;
    --output)
      test "$#" -ge 2 || release_die "--output requires a value"
      OUTPUT="$2"
      shift 2
      ;;
    --extra-static-archive)
      test "$#" -ge 2 || release_die "--extra-static-archive requires a value"
      EXTRA_STATIC_ARCHIVE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      release_die "unknown argument: $1"
      ;;
  esac
done

release_require_command git
release_require_command node
release_require_command npm
release_require_command tar
release_require_command sha256sum

cd "$ROOT"
BUILD_SHA="${BUILD_SHA:-$(git rev-parse HEAD)}"
release_validate_sha "$BUILD_SHA"
OUTPUT="${OUTPUT:-$ARTIFACTS_ROOT/nexusflow-${BUILD_SHA}.tar.gz}"

if "$DRY_RUN"; then
  release_log "dry-run: would build $BUILD_SHA from $ROOT"
  release_log "dry-run: isolated build root $RELEASES_ROOT/.build-${BUILD_SHA}-<pid>"
  release_log "dry-run: artifact $OUTPUT"
  if test -n "$EXTRA_STATIC_ARCHIVE"; then
    release_log "dry-run: would retain static assets from $EXTRA_STATIC_ARCHIVE"
  fi
  exit 0
fi

test "$(git rev-parse "$BUILD_SHA^{commit}")" = "$BUILD_SHA" ||
  release_die "commit is not available locally: $BUILD_SHA"
if test -n "$EXTRA_STATIC_ARCHIVE"; then
  test -f "$EXTRA_STATIC_ARCHIVE" ||
    release_die "extra static archive is missing: $EXTRA_STATIC_ARCHIVE"
  while IFS= read -r entry; do
    case "$entry" in
      .|./|./*) ;;
      *) release_die "extra static archive contains an unsafe path: $entry" ;;
    esac
    case "/$entry/" in
      */../*) release_die "extra static archive contains parent traversal: $entry" ;;
    esac
  done < <(tar -tf "$EXTRA_STATIC_ARCHIVE")
fi

mkdir -p "$RELEASES_ROOT" "$ARTIFACTS_ROOT"
STAGING="$RELEASES_ROOT/.build-${BUILD_SHA}-$$"

cleanup() {
  case "$STAGING" in
    "$RELEASES_ROOT"/.build-"$BUILD_SHA"-*) rm -rf -- "$STAGING" ;;
    *) release_log "refusing to remove unexpected staging path: $STAGING" ;;
  esac
}
trap cleanup EXIT

test ! -e "$STAGING" || release_die "staging path already exists: $STAGING"
mkdir -p "$STAGING"

release_log "exporting source for $BUILD_SHA"
git archive --format=tar "$BUILD_SHA" | tar -xf - -C "$STAGING"
if test -e "$STAGING/backend/.env" || test -L "$STAGING/backend/.env"; then
  release_die "backend/.env must never be embedded in a release artifact"
fi

release_log "installing locked dependencies in isolated release"
(
  cd "$STAGING"
  npm ci --legacy-peer-deps
)

BUILD_TIME="$(date -u +%FT%TZ)"
release_log "building backend once"
(
  cd "$STAGING"
  BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" npm run build:backend
)

release_log "building frontend once with deterministic BUILD_ID"
(
  cd "$STAGING"
  BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" npm run build:frontend
)

ACTUAL_BUILD_ID="$(tr -d '\r\n' < "$STAGING/frontend/.next/BUILD_ID")"
test "$ACTUAL_BUILD_ID" = "$BUILD_SHA" ||
  release_die "frontend BUILD_ID mismatch: expected $BUILD_SHA, received $ACTUAL_BUILD_ID"

CURRENT_RELEASE=""
if CURRENT_RELEASE="$(release_resolve_path "$CURRENT_LINK" 2>/dev/null)"; then
  :
elif test -d "$ROOT/frontend/.next/static"; then
  CURRENT_RELEASE="$ROOT"
fi

if test -n "$CURRENT_RELEASE" && test -d "$CURRENT_RELEASE/frontend/.next/static"; then
  release_log "retaining immutable static assets from previous release"
  (
    cd "$CURRENT_RELEASE/frontend/.next/static"
    tar -cf - .
  ) | (
    cd "$STAGING/frontend/.next/static"
    tar --skip-old-files -xf -
  )
fi

if test -n "$EXTRA_STATIC_ARCHIVE"; then
  release_log "retaining immutable static assets from peer"
  (
    cd "$STAGING/frontend/.next/static"
    tar --skip-old-files -xf "$EXTRA_STATIC_ARCHIVE"
  )
fi

# Build caches are not runtime artifacts and can be hundreds of megabytes.
case "$STAGING/frontend/.next/cache" in
  "$RELEASES_ROOT"/.build-"$BUILD_SHA"-*/frontend/.next/cache)
    rm -rf -- "$STAGING/frontend/.next/cache"
    ;;
  *)
    release_die "refusing to remove an unexpected Next.js cache path"
    ;;
esac

cat > "$STAGING/.release-metadata.json" <<EOF
{"sha":"$BUILD_SHA","builtAt":"$BUILD_TIME","node":"$(node --version)","npm":"$(npm --version)"}
EOF
cat > "$STAGING/.release-capabilities.json" <<'EOF'
{"version":3,"loopbackListeners":true,"managedProductionEnv":true,"sessionHashOnlyCutover":true,"providerCostTiers":true,"frontendRuntimeImmutable":true}
EOF

release_log "creating SHA-256 manifest"
(
  cd "$STAGING"
  if test -e backend/.env || test -L backend/.env; then
    release_die "backend/.env appeared during the build and cannot be packaged"
  fi
  while IFS= read -r -d '' manifest_file; do
    case "$manifest_file" in
      *$'\n'*|*$'\r'*|*\\*)
        release_die "release filename cannot be represented safely in the manifest"
        ;;
    esac
  done < <(
    find . -type f \
      ! -path './.release-manifest.sha256' \
      ! -path './frontend/.next/cache/*' \
      -print0
  )
  find . -type f \
    ! -path './.release-manifest.sha256' \
    ! -path './frontend/.next/cache/*' \
    -print0 |
    LC_ALL=C sort -z |
    xargs -0 sha256sum > .release-manifest.sha256
  sha256sum --quiet -c .release-manifest.sha256
)

TEMPORARY_OUTPUT="${OUTPUT}.tmp.$$"
trap 'rm -f -- "$TEMPORARY_OUTPUT"; cleanup' EXIT
release_log "packing immutable release artifact"
tar -C "$STAGING" -czf "$TEMPORARY_OUTPUT" .
mv -f "$TEMPORARY_OUTPUT" "$OUTPUT"
(
  cd "$(dirname "$OUTPUT")"
  sha256sum "$(basename "$OUTPUT")"
) > "${OUTPUT}.sha256"

release_log "built $OUTPUT"
printf '%s\n' "$OUTPUT"
