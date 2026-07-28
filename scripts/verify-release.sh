#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/release-common.sh
source "$SCRIPT_DIR/release-common.sh"

RELEASE_DIR="${NEXUSFLOW_APP_ROOT:-}"
EXPECTED_SHA="${BUILD_SHA:-}"
BACKEND_URL="${NEXUSFLOW_VERIFY_BACKEND_URL:-http://127.0.0.1:3001}"
FRONTEND_URL="${NEXUSFLOW_VERIFY_FRONTEND_URL:-http://127.0.0.1:19999}"
FRONTEND_ROUTES="${NEXUSFLOW_VERIFY_FRONTEND_ROUTES:-/ /admin /login /dashboard /models /pricing}"
ASSET_ROUNDS="${NEXUSFLOW_VERIFY_ASSET_ROUNDS:-3}"
READY_ATTEMPTS="${NEXUSFLOW_VERIFY_READY_ATTEMPTS:-30}"
READY_DELAY_SECONDS="${NEXUSFLOW_VERIFY_READY_DELAY_SECONDS:-1}"
VERSION_READY_SAMPLES="${NEXUSFLOW_VERIFY_VERSION_SAMPLES:-3}"
FILES_ONLY=false

usage() {
  cat <<'EOF'
Usage: verify-release.sh --release-dir <path> --sha <full-git-sha> [--files-only]

Verifies the immutable manifest, deterministic Next BUILD_ID, backend health and
version, frontend build header, and every /_next/static asset referenced by the
configured frontend routes.
EOF
}

while test "$#" -gt 0; do
  case "$1" in
    --release-dir)
      test "$#" -ge 2 || release_die "--release-dir requires a value"
      RELEASE_DIR="$2"
      shift 2
      ;;
    --sha)
      test "$#" -ge 2 || release_die "--sha requires a value"
      EXPECTED_SHA="$2"
      shift 2
      ;;
    --files-only)
      FILES_ONLY=true
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

test -n "$RELEASE_DIR" || release_die "--release-dir is required"
test -n "$EXPECTED_SHA" || release_die "--sha is required"
release_validate_sha "$EXPECTED_SHA"
release_require_command node
release_require_command sha256sum

release_manifest_verify "$RELEASE_DIR"
ACTUAL_SHA="$(release_build_sha_from_directory "$RELEASE_DIR")"
test "$ACTUAL_SHA" = "$EXPECTED_SHA" ||
  release_die "release BUILD_ID mismatch: expected $EXPECTED_SHA, received $ACTUAL_SHA"

test -f "$RELEASE_DIR/backend/dist/build-info.json" ||
  release_die "backend build metadata is missing"
node -e '
  const fs = require("fs");
  const actual = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).sha;
  if (actual !== process.argv[2]) {
    console.error(`backend build SHA mismatch: ${actual}`);
    process.exit(1);
  }
' "$RELEASE_DIR/backend/dist/build-info.json" "$EXPECTED_SHA" ||
  release_die "backend build metadata does not match release"

if "$FILES_ONLY"; then
  release_log "file and build metadata verification passed for $EXPECTED_SHA"
  exit 0
fi

release_require_command curl
for value in "$READY_ATTEMPTS" "$READY_DELAY_SECONDS" "$VERSION_READY_SAMPLES"; do
  case "$value" in
    ''|*[!0-9]*) release_die "readiness attempts, delay and version samples must be positive integers" ;;
  esac
done
test "$READY_ATTEMPTS" -gt 0 || release_die "readiness attempts must be positive"
test "$READY_DELAY_SECONDS" -gt 0 || release_die "readiness delay must be positive"
test "$VERSION_READY_SAMPLES" -gt 0 ||
  release_die "version readiness samples must be positive"
test "$VERSION_READY_SAMPLES" -le "$READY_ATTEMPTS" ||
  release_die "version readiness samples must not exceed readiness attempts"

HEALTH=""
attempt=1
while test "$attempt" -le "$READY_ATTEMPTS"; do
  candidate="$(
    curl --fail --silent --show-error \
      --connect-timeout 3 \
      --max-time 10 \
      "$BACKEND_URL/api/health" 2>/dev/null || true
  )"
  if printf '%s' "$candidate" | node -e '
    let body = "";
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      try {
        const value = JSON.parse(body);
        if (
          value.status !== "ok" ||
          value.dependencies?.postgres !== "ok" ||
          value.dependencies?.redis !== "ok"
        ) process.exit(1);
      } catch {
        process.exit(1);
      }
    });
  ' >/dev/null 2>&1; then
    HEALTH="$candidate"
    break
  fi
  if test "$attempt" -lt "$READY_ATTEMPTS"; then
    sleep "$READY_DELAY_SECONDS"
  fi
  attempt=$((attempt + 1))
done
test -n "$HEALTH" || release_die "backend health dependencies did not become healthy"

VERSION=""
version_matches=0
attempt=1
while test "$attempt" -le "$READY_ATTEMPTS"; do
  candidate="$(
    curl --fail --silent --show-error \
      --connect-timeout 3 \
      --max-time 10 \
      "$BACKEND_URL/api/version" 2>/dev/null || true
  )"
  if printf '%s' "$candidate" | EXPECTED_SHA="$EXPECTED_SHA" node -e '
    let body = "";
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      try {
        const value = JSON.parse(body);
        if (value.sha !== process.env.EXPECTED_SHA) process.exit(1);
      } catch {
        process.exit(1);
      }
    });
  ' >/dev/null 2>&1; then
    version_matches=$((version_matches + 1))
    if test "$version_matches" -ge "$VERSION_READY_SAMPLES"; then
      VERSION="$candidate"
      break
    fi
  else
    version_matches=0
  fi
  if test "$attempt" -lt "$READY_ATTEMPTS"; then
    sleep "$READY_DELAY_SECONDS"
  fi
  attempt=$((attempt + 1))
done
test -n "$VERSION" ||
  release_die "running backend version did not converge to $EXPECTED_SHA for $VERSION_READY_SAMPLES consecutive samples"

TEMPORARY="$(mktemp -d /tmp/nexusflow-release-verify.XXXXXX)"
trap 'rm -rf -- "$TEMPORARY"' EXIT

for route in $FRONTEND_ROUTES; do
  safe_name="$(printf '%s' "$route" | tr '/?&=' '____')"
  headers="$TEMPORARY/${safe_name}.headers"
  body="$TEMPORARY/${safe_name}.html"
  route_ready=false
  attempt=1
  while test "$attempt" -le "$READY_ATTEMPTS"; do
    if curl --fail --silent --show-error \
      --connect-timeout 3 \
      --max-time 10 \
      -D "$headers" \
      -o "$body" \
      "$FRONTEND_URL$route" 2>/dev/null &&
      tr -d '\r' < "$headers" |
        grep -Fxi "X-NexusFlow-Build-Sha: $EXPECTED_SHA" >/dev/null; then
      route_ready=true
      break
    fi
    if test "$attempt" -lt "$READY_ATTEMPTS"; then
      sleep "$READY_DELAY_SECONDS"
    fi
    attempt=$((attempt + 1))
  done
  "$route_ready" ||
    release_die "frontend route $route did not become ready at build $EXPECTED_SHA"

  node -e '
    const fs = require("fs");
    const html = fs.readFileSync(process.argv[1], "utf8");
    const assets = new Set(html.match(/\/_next\/static\/[^"'\'' <>\s]+/g) || []);
    for (const asset of assets) {
      console.log(asset.replace(/\\+$/, "").replaceAll("&amp;", "&"));
    }
  ' "$body"
done | LC_ALL=C sort -u > "$TEMPORARY/assets.txt"

test -s "$TEMPORARY/assets.txt" ||
  release_die "no Next.js static assets were discovered"

case "$ASSET_ROUNDS" in
  ''|*[!0-9]*) release_die "NEXUSFLOW_VERIFY_ASSET_ROUNDS must be a positive integer" ;;
esac
test "$ASSET_ROUNDS" -gt 0 || release_die "NEXUSFLOW_VERIFY_ASSET_ROUNDS must be positive"

round=1
while test "$round" -le "$ASSET_ROUNDS"; do
  while IFS= read -r asset; do
    result="$(curl --fail --silent --show-error \
      --connect-timeout 3 \
      --max-time 10 \
      -o /dev/null \
      -w '%{content_type} %{size_download}' \
      "$FRONTEND_URL$asset")" ||
      release_die "frontend static asset failed in round $round: $asset"
    content_type="${result%% *}"
    size="${result##* }"
    test "$size" -gt 0 ||
      release_die "frontend static asset is empty in round $round: $asset"
    case "$asset" in
      *.js)
        case "$content_type" in
          *javascript*) ;;
          *) release_die "unexpected JavaScript content type for $asset: $content_type" ;;
        esac
        ;;
      *.css)
        case "$content_type" in
          text/css*) ;;
          *) release_die "unexpected CSS content type for $asset: $content_type" ;;
        esac
        ;;
    esac
  done < "$TEMPORARY/assets.txt"
  round=$((round + 1))
done

release_manifest_verify "$RELEASE_DIR"
release_log "runtime, build header, and static chunk verification passed for $EXPECTED_SHA"
