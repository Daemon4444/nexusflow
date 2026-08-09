#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURE="$(mktemp -d /tmp/nexusflow-release-primitives.XXXXXX)"
FIXTURE_ROOT="$FIXTURE/control"
RELEASES_ROOT="$FIXTURE/releases"
CURRENT_LINK="$FIXTURE/current"
PREVIOUS_LINK="$FIXTURE/previous"
BACKEND_ENV="$FIXTURE/backend.env"
UPLOADS_ROOT="$FIXTURE/uploads"
SHIMS="$FIXTURE/shims"
STATE="$FIXTURE/state"
OLD_SHA="1111111111111111111111111111111111111111"
NEW_SHA="2222222222222222222222222222222222222222"
BAD_SHA="3333333333333333333333333333333333333333"
EXTRA_SHA="4444444444444444444444444444444444444444"

cleanup() {
  case "$FIXTURE" in
    /tmp/nexusflow-release-primitives.*) rm -rf -- "$FIXTURE" ;;
    *) printf 'refusing to remove unexpected fixture: %s\n' "$FIXTURE" >&2 ;;
  esac
}
trap cleanup EXIT INT TERM

mkdir -p \
  "$FIXTURE_ROOT" \
  "$RELEASES_ROOT/$OLD_SHA/backend/dist" \
  "$RELEASES_ROOT/$OLD_SHA/frontend/.next" \
  "$RELEASES_ROOT/$NEW_SHA/backend/dist" \
  "$RELEASES_ROOT/$NEW_SHA/frontend/.next/server/app/models.segments" \
  "$RELEASES_ROOT/$NEW_SHA/frontend/.next/static/chunks" \
  "$SHIMS" \
  "$STATE" \
  "$UPLOADS_ROOT"
ln -s "$REPOSITORY_ROOT/node_modules" "$FIXTURE_ROOT/node_modules"
printf '%s\n' \
  'PG_HOST=database.invalid' \
  'PROVIDER_OUTBOUND_HOST_ALLOWLIST=api.anthropic.com,dashscope.aliyuncs.com,app-api.pixverse.ai,ark.cn-beijing.volces.com,token.genvia.ai,jawayid.com' \
  'PROVIDER_OUTBOUND_ENDPOINT_ALLOWLIST=jawayid.com:3000' \
  > "$BACKEND_ENV"

printf '{"sha":"%s","builtAt":"2026-01-01T00:00:00.000Z"}\n' "$OLD_SHA" \
  > "$RELEASES_ROOT/$OLD_SHA/backend/dist/build-info.json"
printf '%s\n' "$OLD_SHA" > "$RELEASES_ROOT/$OLD_SHA/frontend/.next/BUILD_ID"

printf '{"sha":"%s","builtAt":"2026-01-02T00:00:00.000Z"}\n' "$NEW_SHA" \
  > "$RELEASES_ROOT/$NEW_SHA/backend/dist/build-info.json"
printf '%s\n' "$NEW_SHA" > "$RELEASES_ROOT/$NEW_SHA/frontend/.next/BUILD_ID"
printf '{"version":3,"loopbackListeners":true,"managedProductionEnv":true,"sessionHashOnlyCutover":true,"providerCostTiers":true,"frontendRuntimeImmutable":true}\n' \
  > "$RELEASES_ROOT/$NEW_SHA/.release-capabilities.json"
printf 'v3 rendered output\n' \
  > "$RELEASES_ROOT/$NEW_SHA/frontend/.next/server/app/models.rsc"
printf 'v3 rendered segment\n' \
  > "$RELEASES_ROOT/$NEW_SHA/frontend/.next/server/app/models.segments/_full.segment.rsc"
printf 'console.log("fixture");\n' \
  > "$RELEASES_ROOT/$NEW_SHA/frontend/.next/static/chunks/fixture.js"
ln -s "$BACKEND_ENV" "$RELEASES_ROOT/$NEW_SHA/backend/.env"
ln -s "$UPLOADS_ROOT" "$RELEASES_ROOT/$NEW_SHA/backend/uploads"
ln -s "$UPLOADS_ROOT" "$RELEASES_ROOT/$OLD_SHA/backend/uploads"
(
  cd "$RELEASES_ROOT/$NEW_SHA"
  find . -type f ! -path './.release-manifest.sha256' -print0 |
    LC_ALL=C sort -z |
    xargs -0 sha256sum > .release-manifest.sha256
)

ln -s "$RELEASES_ROOT/$OLD_SHA" "$CURRENT_LINK"
printf '%s\n' "$OLD_SHA" > "$STATE/runtime-sha"
printf 'loopback\n' > "$STATE/listener-mode"
printf 'safe\n' > "$STATE/pm2-mode"
printf 'never\n' > "$STATE/save-mode"
printf '\n' > "$STATE/health-fail-sha"
printf '\n' > "$STATE/start-fail-sha"
printf '0\n' > "$STATE/start-fail-remaining"
printf '\n' > "$STATE/wrong-path-sha"
printf '%s\n' "$RELEASES_ROOT/$OLD_SHA" > "$STATE/wrong-path-root"
printf '%s\n' "$RELEASES_ROOT/$OLD_SHA" > "$STATE/definition-root"
touch "$STATE/app-quadrant-backend" "$STATE/app-quadrant-frontend"
: > "$STATE/pm2-command-log"

cat > "$SHIMS/stat" <<'EOF'
#!/usr/bin/env bash
case "${2:-}" in
  %u|'%u') printf '0\n' ;;
  %g|'%g') printf '0\n' ;;
  %a|'%a') printf '600\n' ;;
  *) /usr/bin/stat "$@" ;;
esac
EOF

cat > "$SHIMS/mv" <<'EOF'
#!/usr/bin/env bash
if test "${1:-}" = "-Tf"; then
  if test -e "$3" || test -L "$3"; then
    unlink "$3"
  fi
  /bin/mv -f "$2" "$3"
else
  /bin/mv "$@"
fi
EOF

cat > "$SHIMS/curl" <<'EOF'
#!/usr/bin/env bash
headers=""
output=""
write_format=""
url=""
while test "$#" -gt 0; do
  case "$1" in
    -D)
      headers="$2"
      shift 2
      ;;
    -o)
      output="$2"
      shift 2
      ;;
    -w)
      write_format="$2"
      shift 2
      ;;
    --connect-timeout|--max-time)
      shift 2
      ;;
    -*)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
sha="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/runtime-sha")"
health_fail_sha="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/health-fail-sha")"
case "$url" in
  */api/health)
    test -z "$health_fail_sha" || test "$sha" != "$health_fail_sha" || exit 22
    printf '{"status":"ok","dependencies":{"postgres":"ok","redis":"ok"}}'
    ;;
  */api/version)
    version_sha="$sha"
    if test -f "$NEXUSFLOW_TEST_STATE/version-alternate-target" &&
      test "$sha" = "$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/version-alternate-target")"; then
      counter="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/version-alternate-counter")"
      if test $((counter % 2)) -eq 0; then
        version_sha="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/version-alternate-sha")"
      fi
      printf '%s\n' "$((counter + 1))" \
        > "$NEXUSFLOW_TEST_STATE/version-alternate-counter"
    elif test -f "$NEXUSFLOW_TEST_STATE/version-lag-remaining"; then
      remaining="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/version-lag-remaining")"
      if test "$remaining" -gt 0; then
        version_sha="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/version-lag-sha")"
        printf '%s\n' "$((remaining - 1))" \
          > "$NEXUSFLOW_TEST_STATE/version-lag-remaining"
      fi
    fi
    printf '{"sha":"%s"}' "$version_sha"
    ;;
  */_next/static/*.js)
    test "$output" = "/dev/null"
    test -n "$write_format"
    printf 'application/javascript 24'
    ;;
  *)
    if test -z "$headers" && test -z "$output"; then
      exit 0
    fi
    test -n "$headers"
    test -n "$output"
    printf 'HTTP/1.1 200 OK\r\nX-NexusFlow-Build-Sha: %s\r\n\r\n' "$sha" > "$headers"
    printf '<script src="/_next/static/chunks/fixture.js"></script>\n' > "$output"
    ;;
esac
EOF

cat > "$SHIMS/pm2" <<'EOF'
#!/usr/bin/env bash
command="${1:-}"
case "$command" in
  start)
    printf 'start %s\n' "${2:-}" >> "$NEXUSFLOW_TEST_STATE/pm2-command-log"
    fail_sha="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/start-fail-sha")"
    fail_remaining="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/start-fail-remaining")"
    if test -n "$fail_sha" &&
      test "$BUILD_SHA" = "$fail_sha" &&
      test "$fail_remaining" -gt 0; then
      printf '%s\n' "$((fail_remaining - 1))" \
        > "$NEXUSFLOW_TEST_STATE/start-fail-remaining"
      printf '%s\n' "$NEXUSFLOW_APP_ROOT" \
        > "$NEXUSFLOW_TEST_STATE/definition-root"
      touch "$NEXUSFLOW_TEST_STATE/app-quadrant-backend"
      rm -f -- "$NEXUSFLOW_TEST_STATE/app-quadrant-frontend"
      exit 1
    fi
    printf '%s\n' "$BUILD_SHA" > "$NEXUSFLOW_TEST_STATE/runtime-sha"
    wrong_path_sha="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/wrong-path-sha")"
    if test -n "$wrong_path_sha" && test "$BUILD_SHA" = "$wrong_path_sha"; then
      tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/wrong-path-root" \
        > "$NEXUSFLOW_TEST_STATE/definition-root"
      printf '\n' >> "$NEXUSFLOW_TEST_STATE/definition-root"
    else
      printf '%s\n' "$NEXUSFLOW_APP_ROOT" > "$NEXUSFLOW_TEST_STATE/definition-root"
    fi
    touch \
      "$NEXUSFLOW_TEST_STATE/app-quadrant-backend" \
      "$NEXUSFLOW_TEST_STATE/app-quadrant-frontend"
    ;;
  delete)
    shift
    test "$#" -gt 0
    for app in "$@"; do
      case "$app" in
        quadrant-backend|quadrant-frontend)
          printf 'delete %s\n' "$app" >> "$NEXUSFLOW_TEST_STATE/pm2-command-log"
          rm -f -- "$NEXUSFLOW_TEST_STATE/app-$app"
          ;;
        *)
          printf 'unexpected fake pm2 deletion target: %s\n' "$app" >&2
          exit 1
          ;;
      esac
    done
    ;;
  jlist)
    sha="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/runtime-sha")"
    root="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/definition-root")"
    mode="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/pm2-mode")"
    node_env="production"
    release_runtime="true"
    mock="false"
    pg_mem="false"
    seed="false"
    if test "$mode" = "unsafe"; then
      node_env="development"
      mock="true"
    fi
    entries=()
    if test -f "$NEXUSFLOW_TEST_STATE/app-quadrant-backend"; then
      backend='{"name":"quadrant-backend","pm2_env":{"status":"online","pm_cwd":"%s/backend","pm_exec_path":"%s/backend/dist/index.js","NODE_ENV":"%s","NEXUSFLOW_RELEASE_RUNTIME":"%s","ENABLE_MOCK_PAYMENT":"%s","ENABLE_SEED_API_KEYS":"%s","USE_PG_MEM":"%s","PROVIDER_OUTBOUND_HOST_ALLOWLIST":"api.anthropic.com,dashscope.aliyuncs.com,app-api.pixverse.ai,ark.cn-beijing.volces.com,token.genvia.ai,jawayid.com","PROVIDER_OUTBOUND_ENDPOINT_ALLOWLIST":"jawayid.com:3000","PORT":3001,"BUILD_SHA":"%s"}}'
      printf -v backend_one "$backend" \
        "$root" "$root" "$node_env" "$release_runtime" "$mock" "$seed" "$pg_mem" "$sha"
      printf -v backend_two "$backend" \
        "$root" "$root" "$node_env" "$release_runtime" "$mock" "$seed" "$pg_mem" "$sha"
      entries+=("$backend_one" "$backend_two")
    fi
    if test -f "$NEXUSFLOW_TEST_STATE/app-quadrant-frontend"; then
      printf -v frontend '{"name":"quadrant-frontend","pm2_env":{"status":"online","pm_cwd":"%s/frontend","pm_exec_path":"%s/node_modules/next/dist/bin/next","NODE_ENV":"production","PORT":19999}}' \
        "$root" "$root"
      entries+=("$frontend")
    fi
    entries+=('{"name":"unrelated-worker","pm2_env":{"status":"online"}}')
    output=""
    for entry in "${entries[@]}"; do
      test -z "$output" || output+=","
      output+="$entry"
    done
    printf '[%s]\n' "$output"
    ;;
  save)
    mode="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/save-mode")"
    case "$mode" in
      once)
        printf 'never\n' > "$NEXUSFLOW_TEST_STATE/save-mode"
        exit 1
        ;;
      always)
        exit 1
        ;;
    esac
    ;;
  *)
    printf 'unexpected fake pm2 command: %s\n' "$command" >&2
    exit 1
    ;;
esac
EOF

cat > "$SHIMS/ss" <<'EOF'
#!/usr/bin/env bash
mode="$(tr -d '\r\n' < "$NEXUSFLOW_TEST_STATE/listener-mode")"
if test "$mode" = "wildcard"; then
  printf 'LISTEN 0 511 0.0.0.0:3001 0.0.0.0:*\n'
  printf 'LISTEN 0 511 0.0.0.0:19999 0.0.0.0:*\n'
else
  printf 'LISTEN 0 511 127.0.0.1:3001 0.0.0.0:*\n'
  printf 'LISTEN 0 511 127.0.0.1:19999 0.0.0.0:*\n'
fi
EOF

chmod 0755 "$SHIMS/stat" "$SHIMS/mv" "$SHIMS/curl" "$SHIMS/pm2" "$SHIMS/ss"

audio_server_policy="$FIXTURE/audio-server-policy.conf"
enabled_server_policy="$FIXTURE/audio-server-policy-enabled.conf"
audio_http_policy="$FIXTURE/audio-http-policy.conf"
"$SCRIPT_DIR/nginx-health-drain-node.sh" render disabled fixture-node \
  > "$audio_server_policy"
"$SCRIPT_DIR/nginx-health-drain-node.sh" render enabled fixture-node \
  > "$enabled_server_policy"
"$SCRIPT_DIR/nginx-health-drain-node.sh" render-audio-guard \
  > "$audio_http_policy"
grep -Fx 'location = /v1/audio/transcriptions {' "$audio_server_policy" >/dev/null
grep -Fx '    client_max_body_size 1m;' "$audio_server_policy" >/dev/null
grep -Fx '    client_body_timeout 10s;' "$audio_server_policy" >/dev/null
grep -Fx '    limit_conn nexusflow_audio_transcription_conn 2;' "$audio_server_policy" >/dev/null
grep -Fx '    limit_req zone=nexusflow_audio_transcription_rate burst=2 nodelay;' \
  "$audio_server_policy" >/dev/null
for location in \
  'location = /v1/chat/completions {' \
  'location = /v1/responses {' \
  'location = /v1/messages {' \
  'location = /v1/embeddings {'; do
  grep -Fx "$location" "$audio_server_policy" >/dev/null
done
test "$(grep -Fxc '    client_max_body_size 50m;' "$audio_server_policy")" -eq 3
test "$(grep -Fxc '    client_max_body_size 8m;' "$audio_server_policy")" -eq 1
test "$(grep -Fxc '    client_max_body_size 1m;' "$audio_server_policy")" -eq 2
test "$(grep -Fxc '    client_max_body_size 101m;' "$audio_server_policy")" -eq 1
test "$(grep -Fxc '    proxy_request_buffering off;' "$audio_server_policy")" -eq 7
test "$(grep -Fxc '    proxy_buffering off;' "$audio_server_policy")" -eq 7
test "$(grep -Fxc '    proxy_set_header X-Forwarded-Proto $nf_forwarded_proto;' "$audio_server_policy")" -eq 7
test "$(grep -Fxc 'client_max_body_size 1m;' "$REPOSITORY_ROOT/ops/nginx/nexusflow-v1-location.conf")" -eq 1
test "$(grep -Fxc 'client_body_timeout 10s;' "$REPOSITORY_ROOT/ops/nginx/nexusflow-v1-location.conf")" -eq 1
grep -Fx 'limit_conn nf_v1_conn 50;' \
  "$REPOSITORY_ROOT/ops/nginx/nexusflow-v1-location.conf" >/dev/null
grep -Fx 'limit_req zone=nf_v1 burst=100 nodelay;' \
  "$REPOSITORY_ROOT/ops/nginx/nexusflow-v1-location.conf" >/dev/null
grep -Fx 'if ($nexusflow_drain_match = "IMPU") {' "$enabled_server_policy" >/dev/null
grep -Fx '    return 503;' "$enabled_server_policy" >/dev/null
for blocked_alias in \
  'location = /proxy/v1 { return 404; }' \
  'location ^~ /proxy/v1/ { return 404; }' \
  'location = /api/proxy/v1 { return 404; }' \
  'location ^~ /api/proxy/v1/ { return 404; }'; do
  grep -Fx "$blocked_alias" "$audio_server_policy" >/dev/null
done
grep -Fx 'location = /api/upload {' "$audio_server_policy" >/dev/null
grep -Fx '    limit_conn nexusflow_upload_conn 2;' "$audio_server_policy" >/dev/null
grep -Fx 'location ^~ /api/uploads/ {' "$audio_server_policy" >/dev/null
grep -Fx '    limit_rate 10m;' "$audio_server_policy" >/dev/null
grep -Fx 'limit_conn_zone $binary_remote_addr zone=nexusflow_audio_transcription_conn:10m;' \
  "$audio_http_policy" >/dev/null
grep -Fx 'limit_req_zone $binary_remote_addr zone=nexusflow_audio_transcription_rate:10m rate=6r/m;' \
  "$audio_http_policy" >/dev/null
grep -Fx 'limit_req_zone $binary_remote_addr zone=nexusflow_v1_large_rate:10m rate=120r/m;' \
  "$audio_http_policy" >/dev/null
grep -Fx 'limit_req_zone $binary_remote_addr zone=nexusflow_v1_embedding_rate:10m rate=120r/m;' \
  "$audio_http_policy" >/dev/null
grep -Fx 'limit_req_zone $binary_remote_addr zone=nexusflow_upload_rate:10m rate=12r/m;' \
  "$audio_http_policy" >/dev/null
grep -Fx 'limit_req_zone $binary_remote_addr zone=nexusflow_upload_download_rate:10m rate=120r/m;' \
  "$audio_http_policy" >/dev/null

nginx_syntax_status=skipped
if command -v nginx >/dev/null 2>&1; then
  nginx_test_config="$FIXTURE/nginx-test.conf"
  printf '%s\n' \
    'error_log stderr;' \
    "pid $FIXTURE/nginx.pid;" \
    'events {}' \
    'http {' \
    '  map $http_x_forwarded_proto $nf_forwarded_proto {' \
    '    default $http_x_forwarded_proto;' \
    '    "" $scheme;' \
    '  }' \
    "  include $REPOSITORY_ROOT/ops/nginx/nexusflow-v1-zones.conf;" \
    "  include $audio_http_policy;" \
    '  server {' \
    '    listen 127.0.0.1:18080;' \
    '    access_log off;' \
    '    set_real_ip_from 127.0.0.1;' \
    '    real_ip_header X-Forwarded-For;' \
    "    include $enabled_server_policy;" \
    '    location /v1/ {' \
    "      include $REPOSITORY_ROOT/ops/nginx/nexusflow-v1-location.conf;" \
    '      proxy_pass http://127.0.0.1:3001;' \
    '    }' \
    '  }' \
    '  server {' \
    '    listen 127.0.0.1:18081;' \
    '    access_log off;' \
    '    set_real_ip_from 127.0.0.1;' \
    '    real_ip_header X-Forwarded-For;' \
    "    include $audio_server_policy;" \
    '    location /v1/ {' \
    "      include $REPOSITORY_ROOT/ops/nginx/nexusflow-v1-location.conf;" \
    '      proxy_pass http://127.0.0.1:3001;' \
    '    }' \
    '  }' \
    '}' \
    > "$nginx_test_config"
  nginx -t -c "$nginx_test_config" -p "$FIXTURE" >/dev/null
  nginx_syntax_status=passed
fi

run_primitive() {
  env \
    -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    -u http_proxy -u https_proxy -u all_proxy \
    HTTP_PROXY="${NEXUSFLOW_TEST_INJECT_PROXY:-}" \
    PATH="$SHIMS:$PATH" \
    NEXUSFLOW_TEST_STATE="$STATE" \
    NEXUSFLOW_ROOT="$FIXTURE_ROOT" \
    NEXUSFLOW_RELEASES_ROOT="$RELEASES_ROOT" \
    NEXUSFLOW_CURRENT_LINK="$CURRENT_LINK" \
    NEXUSFLOW_PREVIOUS_LINK="$PREVIOUS_LINK" \
    NEXUSFLOW_BACKEND_ENV="$BACKEND_ENV" \
    NEXUSFLOW_UPLOADS_ROOT="$UPLOADS_ROOT" \
    NEXUSFLOW_VERIFY_FRONTEND_ROUTES="/" \
    NEXUSFLOW_VERIFY_ASSET_ROUNDS=1 \
    NEXUSFLOW_VERIFY_READY_ATTEMPTS=3 \
    NEXUSFLOW_VERIFY_READY_DELAY_SECONDS=1 \
    NEXUSFLOW_VERIFY_VERSION_SAMPLES=2 \
    "$SCRIPT_DIR/deploy-production.sh" "$@"
}

resolved_path() {
  node -e 'process.stdout.write(require("fs").realpathSync(process.argv[1]))' "$1"
}

verify_manifest_only() {
  bash -c '
    set -euo pipefail
    source "$1"
    release_manifest_verify "$2"
  ' _ "$SCRIPT_DIR/release-common.sh" "$1"
}

# Legacy v2 compatibility ignores checksums only for already-manifested
# runtime-rendered models/pricing outputs. The exact file set remains
# immutable, adjacent compiled code remains checksummed, and v3 releases are
# fully immutable.
LEGACY_RENDER_FIXTURE="$FIXTURE/legacy-render-v2"
mkdir -p \
  "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.segments" \
  "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/(dashboard)/models"
printf '{"version":2,"loopbackListeners":true,"managedProductionEnv":true,"sessionHashOnlyCutover":true,"providerCostTiers":true}\n' \
  > "$LEGACY_RENDER_FIXTURE/.release-capabilities.json"
printf 'legacy rendered output before revalidation\n' \
  > "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.rsc"
printf 'legacy segment before revalidation\n' \
  > "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.segments/_full.segment.rsc"
printf 'compiled page code\n' \
  > "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/(dashboard)/models/page.js"
(
  cd "$LEGACY_RENDER_FIXTURE"
  find . -type f ! -path './.release-manifest.sha256' -print0 |
    LC_ALL=C sort -z |
    xargs -0 sha256sum > .release-manifest.sha256
)
printf 'legacy rendered output after revalidation\n' \
  > "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.rsc"
printf 'legacy segment after revalidation\n' \
  > "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.segments/_full.segment.rsc"
verify_manifest_only "$LEGACY_RENDER_FIXTURE"

printf 'unmanifested runtime output\n' \
  > "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.segments/new.segment.rsc"
set +e
verify_manifest_only "$LEGACY_RENDER_FIXTURE" >/dev/null 2>&1
legacy_unmanifested_status=$?
set -e
test "$legacy_unmanifested_status" -ne 0
rm -f -- "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.segments/new.segment.rsc"

rm -f -- "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.rsc"
set +e
verify_manifest_only "$LEGACY_RENDER_FIXTURE" >/dev/null 2>&1
legacy_missing_status=$?
set -e
test "$legacy_missing_status" -ne 0
printf 'legacy rendered output after revalidation\n' \
  > "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.rsc"

rm -f -- "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.rsc"
ln -s /dev/null "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.rsc"
set +e
verify_manifest_only "$LEGACY_RENDER_FIXTURE" >/dev/null 2>&1
legacy_symlink_status=$?
set -e
test "$legacy_symlink_status" -ne 0
rm -f -- "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.rsc"
printf 'legacy rendered output after revalidation\n' \
  > "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/models.rsc"

printf 'tampered compiled page code\n' \
  > "$LEGACY_RENDER_FIXTURE/frontend/.next/server/app/(dashboard)/models/page.js"
set +e
verify_manifest_only "$LEGACY_RENDER_FIXTURE" >/dev/null 2>&1
legacy_adjacent_status=$?
set -e
test "$legacy_adjacent_status" -ne 0

printf 'v3 rendered output after mutation\n' \
  > "$RELEASES_ROOT/$NEW_SHA/frontend/.next/server/app/models.rsc"
set +e
verify_manifest_only "$RELEASES_ROOT/$NEW_SHA" >/dev/null 2>&1
v3_render_status=$?
set -e
test "$v3_render_status" -ne 0
printf 'v3 rendered output\n' \
  > "$RELEASES_ROOT/$NEW_SHA/frontend/.next/server/app/models.rsc"

cp "$RELEASES_ROOT/$NEW_SHA/.release-capabilities.json" \
  "$FIXTURE/v3-release-capabilities.json"
printf '{"version":2,"loopbackListeners":true,"managedProductionEnv":true,"sessionHashOnlyCutover":true,"providerCostTiers":true}\n' \
  > "$RELEASES_ROOT/$NEW_SHA/.release-capabilities.json"
printf 'v3 rendered output after forged downgrade\n' \
  > "$RELEASES_ROOT/$NEW_SHA/frontend/.next/server/app/models.rsc"
set +e
verify_manifest_only "$RELEASES_ROOT/$NEW_SHA" >/dev/null 2>&1
forged_downgrade_status=$?
set -e
test "$forged_downgrade_status" -ne 0
cp "$FIXTURE/v3-release-capabilities.json" \
  "$RELEASES_ROOT/$NEW_SHA/.release-capabilities.json"
printf 'v3 rendered output\n' \
  > "$RELEASES_ROOT/$NEW_SHA/frontend/.next/server/app/models.rsc"
verify_manifest_only "$RELEASES_ROOT/$NEW_SHA"

# First immutable rollout must accept the legacy wildcard-bound baseline
# without weakening the requirements attached to the new artifact.
printf 'wildcard\n' > "$STATE/listener-mode"
run_primitive verify --sha "$OLD_SHA"

# A new target with wildcard listeners must fail and durably restore the old
# baseline. The dedicated status 20 proves that the recovery was verified and
# persisted.
set +e
NEXUSFLOW_DRAIN_CONFIRMED=true run_primitive activate --sha "$NEW_SHA"
wildcard_status=$?
set -e
test "$wildcard_status" -eq 20
test "$(resolved_path "$CURRENT_LINK")" = "$(resolved_path "$RELEASES_ROOT/$OLD_SHA")"
test "$(tr -d '\r\n' < "$STATE/runtime-sha")" = "$OLD_SHA"

# The same target succeeds once both listeners are loopback-only.
printf 'loopback\n' > "$STATE/listener-mode"
printf '%s\n' "$OLD_SHA" > "$STATE/version-lag-sha"
printf '1\n' > "$STATE/version-lag-remaining"
NEXUSFLOW_DRAIN_CONFIRMED=true run_primitive activate --sha "$NEW_SHA"
test "$(tr -d '\r\n' < "$STATE/version-lag-remaining")" = "0"
test "$(resolved_path "$CURRENT_LINK")" = "$(resolved_path "$RELEASES_ROOT/$NEW_SHA")"
test "$(resolved_path "$(tr -d '\r\n' < "$STATE/definition-root")")" = \
  "$(resolved_path "$RELEASES_ROOT/$NEW_SHA")"
test -f "$STATE/app-quadrant-backend"
test -f "$STATE/app-quadrant-frontend"

# A normal rollback to the pre-capability release remains possible even though
# that old process binds wildcard ports.
printf 'wildcard\n' > "$STATE/listener-mode"
set +e
NEXUSFLOW_DRAIN_CONFIRMED=true run_primitive rollback
unprepared_rollback_status=$?
set -e
test "$unprepared_rollback_status" -ne 0
NEXUSFLOW_DRAIN_CONFIRMED=true \
NEXUSFLOW_SESSION_ROLLBACK_PREPARED=true \
  run_primitive rollback
test "$(resolved_path "$CURRENT_LINK")" = "$(resolved_path "$RELEASES_ROOT/$OLD_SHA")"
test "$(resolved_path "$(tr -d '\r\n' < "$STATE/definition-root")")" = \
  "$(resolved_path "$RELEASES_ROOT/$OLD_SHA")"

# A target whose cluster workers keep alternating old/new build identities must
# fail closed and restore the legacy baseline.
printf 'loopback\n' > "$STATE/listener-mode"
printf '%s\n' "$NEW_SHA" > "$STATE/version-alternate-target"
printf '%s\n' "$OLD_SHA" > "$STATE/version-alternate-sha"
printf '0\n' > "$STATE/version-alternate-counter"
set +e
NEXUSFLOW_DRAIN_CONFIRMED=true run_primitive activate --sha "$NEW_SHA"
mixed_version_status=$?
set -e
test "$mixed_version_status" -eq 20
test "$(resolved_path "$CURRENT_LINK")" = "$(resolved_path "$RELEASES_ROOT/$OLD_SHA")"
rm -f -- \
  "$STATE/version-alternate-target" \
  "$STATE/version-alternate-sha" \
  "$STATE/version-alternate-counter"

# PM2 persistence failure on the new target must also restore and persist the
# old release with status 20.
printf 'once\n' > "$STATE/save-mode"
set +e
NEXUSFLOW_DRAIN_CONFIRMED=true run_primitive activate --sha "$NEW_SHA"
save_status=$?
set -e
test "$save_status" -eq 20
test "$(resolved_path "$CURRENT_LINK")" = "$(resolved_path "$RELEASES_ROOT/$OLD_SHA")"

# A PM2 startup failure after removing the stale target definitions must
# deterministically recreate and persist the old release.
printf '%s\n' "$NEW_SHA" > "$STATE/start-fail-sha"
printf '1\n' > "$STATE/start-fail-remaining"
set +e
NEXUSFLOW_DRAIN_CONFIRMED=true run_primitive activate --sha "$NEW_SHA"
start_failure_status=$?
set -e
test "$start_failure_status" -eq 20
test "$(tr -d '\r\n' < "$STATE/start-fail-remaining")" = "0"
test "$(resolved_path "$CURRENT_LINK")" = "$(resolved_path "$RELEASES_ROOT/$OLD_SHA")"
test "$(tr -d '\r\n' < "$STATE/runtime-sha")" = "$OLD_SHA"
test "$(resolved_path "$(tr -d '\r\n' < "$STATE/definition-root")")" = \
  "$(resolved_path "$RELEASES_ROOT/$OLD_SHA")"
test -f "$STATE/app-quadrant-backend"
test -f "$STATE/app-quadrant-frontend"
printf '\n' > "$STATE/start-fail-sha"

# A runtime can report the target SHA while PM2 still points at a stale
# release directory. The path gate must reject that false-positive and restore
# the old process definitions.
printf '%s\n' "$NEW_SHA" > "$STATE/wrong-path-sha"
set +e
NEXUSFLOW_DRAIN_CONFIRMED=true run_primitive activate --sha "$NEW_SHA"
wrong_path_status=$?
set -e
test "$wrong_path_status" -eq 20
test "$(resolved_path "$CURRENT_LINK")" = "$(resolved_path "$RELEASES_ROOT/$OLD_SHA")"
test "$(tr -d '\r\n' < "$STATE/runtime-sha")" = "$OLD_SHA"
test "$(resolved_path "$(tr -d '\r\n' < "$STATE/definition-root")")" = \
  "$(resolved_path "$RELEASES_ROOT/$OLD_SHA")"
printf '\n' > "$STATE/wrong-path-sha"

# Unsafe managed runtime environment is a new-target failure, not a reason to
# reject the old rollback baseline.
printf 'unsafe\n' > "$STATE/pm2-mode"
set +e
NEXUSFLOW_DRAIN_CONFIRMED=true run_primitive activate --sha "$NEW_SHA"
unsafe_status=$?
set -e
test "$unsafe_status" -eq 20
test "$(resolved_path "$CURRENT_LINK")" = "$(resolved_path "$RELEASES_ROOT/$OLD_SHA")"

# If the legacy rollback target itself is unhealthy, the primitive must put
# the hash-capable current release back, verify it, persist it, and fail. The
# outer orchestrator then keeps the node drained and restores hash-only DB
# posture before it can be the sole target.
printf 'safe\n' > "$STATE/pm2-mode"
printf 'loopback\n' > "$STATE/listener-mode"
NEXUSFLOW_DRAIN_CONFIRMED=true run_primitive activate --sha "$NEW_SHA"
printf '%s\n' "$OLD_SHA" > "$STATE/health-fail-sha"
set +e
NEXUSFLOW_DRAIN_CONFIRMED=true \
NEXUSFLOW_SESSION_ROLLBACK_PREPARED=true \
  run_primitive rollback
old_health_status=$?
set -e
test "$old_health_status" -ne 0
test "$(resolved_path "$CURRENT_LINK")" = "$(resolved_path "$RELEASES_ROOT/$NEW_SHA")"
test "$(resolved_path "$PREVIOUS_LINK")" = "$(resolved_path "$RELEASES_ROOT/$OLD_SHA")"
test "$(tr -d '\r\n' < "$STATE/runtime-sha")" = "$NEW_SHA"
test -f "$(resolved_path "$CURRENT_LINK")/.release-capabilities.json"
if grep -Eq '^delete (all|unrelated-worker)$' "$STATE/pm2-command-log"; then
  printf 'managed release attempted to delete an unrelated PM2 app\n' >&2
  exit 1
fi

# Archive extraction must reject links that escape the private staging root,
# even when the outer archive checksum itself is valid.
mkdir -p "$FIXTURE/bad-archive"
ln -s ../../outside "$FIXTURE/bad-archive/escape"
tar -C "$FIXTURE/bad-archive" -czf "$FIXTURE/bad-release.tar.gz" .
sha256sum "$FIXTURE/bad-release.tar.gz" > "$FIXTURE/bad-release.tar.gz.sha256"
set +e
run_primitive install \
  --artifact "$FIXTURE/bad-release.tar.gz" \
  --sha "$BAD_SHA"
archive_escape_status=$?
set -e
test "$archive_escape_status" -ne 0
test ! -e "$RELEASES_ROOT/$BAD_SHA"

mkdir -p "$FIXTURE/extra-archive"
cp -R "$RELEASES_ROOT/$NEW_SHA/." "$FIXTURE/extra-archive/"
unlink "$FIXTURE/extra-archive/backend/.env"
printf 'not covered by the immutable manifest\n' \
  > "$FIXTURE/extra-archive/unmanifested.txt"
tar -C "$FIXTURE/extra-archive" -czf "$FIXTURE/extra-release.tar.gz" .
sha256sum "$FIXTURE/extra-release.tar.gz" > "$FIXTURE/extra-release.tar.gz.sha256"
set +e
run_primitive install \
  --artifact "$FIXTURE/extra-release.tar.gz" \
  --sha "$EXTRA_SHA"
archive_extra_status=$?
set -e
test "$archive_extra_status" -ne 0
test ! -e "$RELEASES_ROOT/$EXTRA_SHA"

set +e
NEXUSFLOW_TEST_INJECT_PROXY="http://proxy.invalid:8080" \
  run_primitive preflight
proxy_status=$?
set -e
test "$proxy_status" -ne 0

"$SCRIPT_DIR/test-nginx-health-drain-installer.sh"

printf 'release-primitive-regressions-ok bootstrap=%s ingress_guard=%s nginx_syntax=%s legacy_unmanifested=%s legacy_missing=%s legacy_symlink=%s legacy_adjacent=%s v3_render=%s forged_downgrade=%s wildcard=%s unprepared=%s mixed=%s save=%s start_failure=%s wrong_path=%s unsafe=%s old_health=%s archive_escape=%s archive_extra=%s proxy=%s\n' \
  0 0 "$nginx_syntax_status" "$legacy_unmanifested_status" "$legacy_missing_status" "$legacy_symlink_status" "$legacy_adjacent_status" "$v3_render_status" "$forged_downgrade_status" "$wildcard_status" "$unprepared_rollback_status" "$mixed_version_status" "$save_status" "$start_failure_status" "$wrong_path_status" "$unsafe_status" "$old_health_status" "$archive_escape_status" "$archive_extra_status" "$proxy_status"
