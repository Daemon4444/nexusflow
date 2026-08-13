#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURE="$(mktemp -d /tmp/nexusflow-nginx-installer.XXXXXX)"
CONFIG_ROOT="$FIXTURE/etc/nginx/conf.d"
SNIPPET_ROOT="$FIXTURE/etc/nginx/snippets"
DRAIN_CONFIG="$FIXTURE/etc/nginx/nexusflow-drain.conf"
AUDIO_GUARD_CONFIG="$CONFIG_ROOT/nexusflow-audio-guards.conf"
V1_LOCATION_CONFIG="$SNIPPET_ROOT/nexusflow-v1-location.conf"
NODE_HELPER="$FIXTURE/usr/local/sbin/nexusflow-nginx-health-drain-node"
SITE_CONFIG="$CONFIG_ROOT/nexusflow.conf"
SHIMS="$FIXTURE/shims"
STATE="$FIXTURE/state"
REAL_NGINX="$(command -v nginx || true)"

cleanup() {
  case "$FIXTURE" in
    /tmp/nexusflow-nginx-installer.*) rm -rf -- "$FIXTURE" ;;
    *) printf 'refusing to remove unexpected fixture: %s\n' "$FIXTURE" >&2 ;;
  esac
}
trap cleanup EXIT INT TERM

mkdir -p \
  "$CONFIG_ROOT" \
  "$SNIPPET_ROOT" \
  "$(dirname "$NODE_HELPER")" \
  "$SHIMS" \
  "$STATE"

printf '%s\n' \
  'server {' \
  "    include $DRAIN_CONFIG;" \
  '    listen 127.0.0.1:18082;' \
  '    access_log off;' \
  '    set_real_ip_from 127.0.0.1;' \
  '    real_ip_header X-Forwarded-For;' \
  '    location /v1/ {' \
  "        include $V1_LOCATION_CONFIG;" \
  '        proxy_pass http://127.0.0.1:3001;' \
  '    }' \
  '}' \
  'server {' \
  '    listen 127.0.0.1:18083;' \
  '    access_log off;' \
  '    set_real_ip_from 127.0.0.1;' \
  '    real_ip_header X-Forwarded-For;' \
  '    location /v1/ {' \
  "        include $V1_LOCATION_CONFIG;" \
  '        proxy_pass http://127.0.0.1:3001;' \
  '    }' \
  '}' \
  > "$SITE_CONFIG"
printf '%s\n' \
  '# pre-existing v1 policy' \
  'limit_req zone=nf_v1_edge_v2 burst=2000 nodelay;' \
  'limit_conn nf_v1_edge_conn_v2 500;' \
  > "$V1_LOCATION_CONFIG"
cp "$SCRIPT_DIR/nginx-health-drain-node.sh" "$NODE_HELPER"
chmod 0755 "$NODE_HELPER"
"$NODE_HELPER" render disabled fixture-node > "$DRAIN_CONFIG"
"$NODE_HELPER" render-audio-guard > "$AUDIO_GUARD_CONFIG"

cat > "$SHIMS/id" <<'EOF'
#!/usr/bin/env bash
if test "${1:-}" = "-u"; then
  printf '0\n'
else
  /usr/bin/id "$@"
fi
EOF

cat > "$SHIMS/stat" <<'EOF'
#!/usr/bin/env bash
case "${2:-}" in
  %u|'%u') printf '0\n' ;;
  %a|'%a') printf '755\n' ;;
  *) /usr/bin/stat "$@" ;;
esac
EOF

cat > "$SHIMS/chown" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat > "$SHIMS/nginx" <<'EOF'
#!/usr/bin/env bash
state="$NEXUSFLOW_INSTALLER_TEST_STATE"
case "${1:-}" in
  -t)
    count=0
    if test -f "$state/test-count"; then
      count="$(tr -d '\r\n' < "$state/test-count")"
    fi
    count=$((count + 1))
    printf '%s\n' "$count" > "$state/test-count"
    if test -f "$state/fail-test-nth" &&
      test "$count" = "$(tr -d '\r\n' < "$state/fail-test-nth")"; then
      exit 1
    fi
    ;;
  -T)
    if test -f "$state/hide-site"; then
      printf '# configuration file /unrelated.conf:\n'
    else
      printf '# configuration file %s:\n' "$NEXUSFLOW_INSTALLER_TEST_SITE_CONFIG"
    fi
    ;;
  -s)
    test "${2:-}" = "reload" || exit 2
    count=0
    if test -f "$state/reload-count"; then
      count="$(tr -d '\r\n' < "$state/reload-count")"
    fi
    count=$((count + 1))
    printf '%s\n' "$count" > "$state/reload-count"
    if test -f "$state/fail-reload-once"; then
      rm -f -- "$state/fail-reload-once"
      exit 1
    fi
    ;;
  *)
    exit 2
    ;;
esac
EOF

cat > "$SHIMS/curl" <<'EOF'
#!/usr/bin/env bash
if test -f "$NEXUSFLOW_INSTALLER_TEST_STATE/fail-probe-once"; then
  rm -f -- "$NEXUSFLOW_INSTALLER_TEST_STATE/fail-probe-once"
  exit 22
fi
if test -f "$NEXUSFLOW_INSTALLER_TEST_STATE/fail-probe"; then
  exit 22
fi
printf 'fixture-node'
EOF

chmod 0755 "$SHIMS/id" "$SHIMS/stat" "$SHIMS/chown" "$SHIMS/nginx" "$SHIMS/curl"

run_installer() {
  printf '0\n' > "$STATE/test-count"
  printf '0\n' > "$STATE/reload-count"
  env \
    PATH="$SHIMS:$PATH" \
    NEXUSFLOW_INSTALLER_TEST_STATE="$STATE" \
    NEXUSFLOW_INSTALLER_TEST_SITE_CONFIG="$SITE_CONFIG" \
    NEXUSFLOW_NGINX_CONFIG_ROOT="$CONFIG_ROOT" \
    NEXUSFLOW_NGINX_SNIPPET_ROOT="$SNIPPET_ROOT" \
    NEXUSFLOW_NGINX_DRAIN_CONFIG="$DRAIN_CONFIG" \
    NEXUSFLOW_NGINX_AUDIO_GUARD_CONFIG="$AUDIO_GUARD_CONFIG" \
    NEXUSFLOW_NGINX_V1_LOCATION_CONFIG="$V1_LOCATION_CONFIG" \
    NEXUSFLOW_INSTALLED_NODE_DRAIN_HELPER="$NODE_HELPER" \
    NEXUSFLOW_SOURCE_V1_LOCATION_CONFIG="$REPOSITORY_ROOT/ops/nginx/nexusflow-v1-location.conf" \
    NEXUSFLOW_INSTALLER_PROBE_ATTEMPTS=2 \
    NEXUSFLOW_INSTALLER_PROBE_DELAY_SECONDS=0 \
    "$SCRIPT_DIR/install-nginx-health-drain.sh" "$SITE_CONFIG" "${1:-fixture-node}"
}

bundle_hash() {
  sha256sum \
    "$SITE_CONFIG" \
    "$DRAIN_CONFIG" \
    "$AUDIO_GUARD_CONFIG" \
    "$V1_LOCATION_CONFIG" \
    "$NODE_HELPER"
}

expect_failed_and_restored() {
  local scenario="$1"
  local before
  local after
  local status
  before="$(bundle_hash)"
  set +e
  run_installer fixture-node >/dev/null 2>&1
  status=$?
  set -e
  test "$status" -ne 0 || {
    printf 'installer failure scenario unexpectedly succeeded: %s\n' "$scenario" >&2
    exit 1
  }
  after="$(bundle_hash)"
  test "$after" = "$before" || {
    printf 'installer did not restore every managed file: %s\n' "$scenario" >&2
    exit 1
  }
}

# A partially inserted include is normalized across both production-shaped
# server blocks. Repeating the install must leave every managed file unchanged.
run_installer
test "$(
  awk -v managed="include $DRAIN_CONFIG;" '
    {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+$/, "", line)
      if (line == managed) count++
    }
    END { print count + 0 }
  ' "$SITE_CONFIG"
)" -eq 2
test "$(grep -Ec '^[[:space:]]*location[[:space:]]+/v1/[[:space:]]*\{' "$SITE_CONFIG")" -eq 2
test "$(
  env \
    PATH="$SHIMS:$PATH" \
    NEXUSFLOW_NGINX_DRAIN_CONFIG="$DRAIN_CONFIG" \
    NEXUSFLOW_NGINX_AUDIO_GUARD_CONFIG="$AUDIO_GUARD_CONFIG" \
    NEXUSFLOW_NGINX_V1_LOCATION_CONFIG="$V1_LOCATION_CONFIG" \
    "$NODE_HELPER" status
)" = "disabled"
first_hash="$(bundle_hash)"
run_installer
test "$(bundle_hash)" = "$first_hash"
touch "$STATE/fail-probe-once"
run_installer
test "$(bundle_hash)" = "$first_hash"

# The resulting dual-server topology must also pass a real nginx parser when
# nginx is available on the test host.
syntax_status=skipped
if test -n "$REAL_NGINX"; then
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
    "  include $AUDIO_GUARD_CONFIG;" \
    "  include $SITE_CONFIG;" \
    '}' \
    > "$nginx_test_config"
  "$REAL_NGINX" -t -c "$nginx_test_config" -p "$FIXTURE" >/dev/null
  syntax_status=passed
fi

# Make every managed target observably different from the repository source;
# each injected failure must still restore the exact pre-install bytes.
for managed_file in \
  "$SITE_CONFIG" \
  "$DRAIN_CONFIG" \
  "$AUDIO_GUARD_CONFIG" \
  "$V1_LOCATION_CONFIG" \
  "$NODE_HELPER"; do
  printf '%s\n' '# rollback sentinel' >> "$managed_file"
done

printf '2\n' > "$STATE/fail-test-nth"
expect_failed_and_restored nginx-test
rm -f -- "$STATE/fail-test-nth"

touch "$STATE/fail-reload-once"
expect_failed_and_restored nginx-reload

touch "$STATE/fail-probe"
expect_failed_and_restored direct-probe
rm -f -- "$STATE/fail-probe"

before_wrong_node="$(bundle_hash)"
set +e
run_installer other-node >/dev/null 2>&1
wrong_node_status=$?
set -e
test "$wrong_node_status" -ne 0
test "$(bundle_hash)" = "$before_wrong_node"

printf 'nginx-installer-regressions-ok syntax=%s wrong_node=%s\n' \
  "$syntax_status" "$wrong_node_status"
