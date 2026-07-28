#!/usr/bin/env bash

set -euo pipefail

DRAIN_CONFIG="${NEXUSFLOW_NGINX_DRAIN_CONFIG:-/etc/nginx/nexusflow-drain.conf}"
AUDIO_GUARD_CONFIG="${NEXUSFLOW_NGINX_AUDIO_GUARD_CONFIG:-/etc/nginx/conf.d/nexusflow-audio-guards.conf}"
ACCESS_LOG="${NEXUSFLOW_NGINX_ACCESS_LOG:-/var/log/nginx/access.log}"
PROBE_PATH="${NEXUSFLOW_NODE_PROBE_PATH:-/__nexusflow_release_probe_9f3b}"
HEALTH_WAIT_SECONDS="${NEXUSFLOW_HEALTH_WAIT_SECONDS:-120}"
HEALTH_SAMPLES="${NEXUSFLOW_HEALTH_SAMPLES:-3}"
HEALTH_SOURCE_PATTERN='(172\.27\.219\.57|172\.27\.197\.226)'
DRAIN_PORT="${NEXUSFLOW_DRAIN_PORT:-80}"
DRAIN_TIMEOUT="${NEXUSFLOW_DRAIN_TIMEOUT_SECONDS:-300}"
DRAIN_ZERO_SAMPLES="${NEXUSFLOW_DRAIN_ZERO_SAMPLES:-3}"

log() {
  printf '[nginx-drain-node] %s\n' "$*" >&2
}

die() {
  printf '[nginx-drain-node] ERROR: %s\n' "$*" >&2
  exit 1
}

validate_positive_integer() {
  case "$2" in
    ''|*[!0-9]*) die "$1 must be a positive integer" ;;
  esac
  test "$2" -gt 0 || die "$1 must be positive"
}

validate_node_id() {
  case "$1" in
    ''|*[!A-Za-z0-9_.-]*) die "node ID may only contain A-Z, a-z, 0-9, dot, underscore and dash" ;;
  esac
}

require_root() {
  test "$(id -u)" = "0" || die "this helper must run as root"
}

validate_self_security() {
  local source_path
  local owner
  local mode
  local permissions
  source_path="$(readlink -f "${BASH_SOURCE[0]}")"
  owner="$(stat -c '%u' "$source_path")"
  mode="$(stat -c '%a' "$source_path")"
  permissions=$((8#$mode))
  test "$owner" = "0" || die "node helper must be owned by root"
  test $((permissions & 0022)) -eq 0 ||
    die "node helper must not be group/world writable (mode $mode)"
}

config_node_id() {
  sed -n 's/^# nexusflow-node-id: //p' "$DRAIN_CONFIG" | head -1
}

config_state() {
  sed -n 's/^# nexusflow-drain-state: //p' "$DRAIN_CONFIG" | head -1
}

render_config() {
  local state="$1"
  local node_id="$2"
  validate_node_id "$node_id"
  case "$state" in
    enabled|disabled) ;;
    *) die "state must be enabled or disabled" ;;
  esac

  printf '# Managed by NexusFlow release tooling. Included inside each NexusFlow server block.\n'
  printf '# nexusflow-node-id: %s\n' "$node_id"
  printf '# nexusflow-drain-state: %s\n' "$state"
  printf 'location = %s {\n' "$PROBE_PATH"
  printf '    default_type text/plain;\n'
  printf '    add_header Cache-Control "no-store" always;\n'
  printf '    return 200 "%s";\n' "$node_id"
  printf '}\n'
  cat <<'EOF'

# Large-context routes retain the 50 MiB contract. Buffering is disabled so
# backend API-key/IP/global admission runs before nginx streams the full body.
location = /v1/chat/completions {
    client_max_body_size 50m;
    client_body_timeout 30s;
    limit_conn nexusflow_v1_large_conn 10;
    limit_req zone=nexusflow_v1_large_rate burst=20 nodelay;
    limit_conn_status 429;
    limit_req_status 429;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_connect_timeout 5s;
    proxy_send_timeout 60s;
    proxy_read_timeout 300s;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3001;
}

location = /v1/responses {
    client_max_body_size 50m;
    client_body_timeout 30s;
    limit_conn nexusflow_v1_large_conn 10;
    limit_req zone=nexusflow_v1_large_rate burst=20 nodelay;
    limit_conn_status 429;
    limit_req_status 429;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_connect_timeout 5s;
    proxy_send_timeout 60s;
    proxy_read_timeout 300s;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3001;
}

location = /v1/messages {
    client_max_body_size 50m;
    client_body_timeout 30s;
    limit_conn nexusflow_v1_large_conn 10;
    limit_req zone=nexusflow_v1_large_rate burst=20 nodelay;
    limit_conn_status 429;
    limit_req_status 429;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_connect_timeout 5s;
    proxy_send_timeout 60s;
    proxy_read_timeout 300s;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3001;
}

# Embedding batches need more than ordinary API metadata but do not inherit the
# full model-context allowance.
location = /v1/embeddings {
    client_max_body_size 8m;
    client_body_timeout 15s;
    limit_conn nexusflow_v1_embedding_conn 10;
    limit_req zone=nexusflow_v1_embedding_rate burst=20 nodelay;
    limit_conn_status 429;
    limit_req_status 429;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 300s;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3001;
}

# The backend accepts only small fields/file_url for transcription and rejects
# binary file parts without disk storage.
location = /v1/audio/transcriptions {
    client_max_body_size 1m;
    client_body_timeout 10s;
    client_body_buffer_size 128k;
    limit_conn nexusflow_audio_transcription_conn 2;
    limit_req zone=nexusflow_audio_transcription_rate burst=2 nodelay;
    limit_conn_status 429;
    limit_req_status 429;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 300s;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3001;
}

# All remaining public v1 routes keep the ordinary 1 MiB edge budget.
location ^~ /v1/ {
    client_max_body_size 1m;
    client_body_timeout 10s;
    limit_conn nexusflow_v1_default_conn 20;
    limit_req zone=nexusflow_v1_default_rate burst=50 nodelay;
    limit_conn_status 429;
    limit_req_status 429;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 300s;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3001;
}

# Public Next proxy aliases must never become a second path to /v1. They would
# bypass the backend-edge body and concurrency contracts above.
location = /proxy/v1 { return 404; }
location ^~ /proxy/v1/ { return 404; }
location = /api/proxy/v1 { return 404; }
location ^~ /api/proxy/v1/ { return 404; }

# The frontend upload facade performs authentication before consuming the
# multipart stream. Nginx enforces the backend's 100 MiB file contract plus
# multipart overhead and limits unauthenticated socket/disk pressure.
location = /api/upload {
    client_max_body_size 101m;
    client_body_timeout 30s;
    limit_conn nexusflow_upload_conn 2;
    limit_req zone=nexusflow_upload_rate burst=2 nodelay;
    limit_conn_status 429;
    limit_req_status 429;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_connect_timeout 5s;
    proxy_send_timeout 60s;
    proxy_read_timeout 300s;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:19999;
}

location = /api/uploads { return 404; }
location ^~ /api/uploads/ {
    client_max_body_size 1m;
    client_body_timeout 10s;
    limit_conn nexusflow_upload_download_conn 8;
    limit_req zone=nexusflow_upload_download_rate burst=20 nodelay;
    limit_conn_status 429;
    limit_req_status 429;
    limit_rate_after 1m;
    limit_rate 10m;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 300s;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:19999;
}
EOF

  if test "$state" = "enabled"; then
    cat <<'EOF'
set $nexusflow_drain_match "";
if ($remote_addr ~ ^(172\.27\.219\.57|172\.27\.197\.226)$) {
    set $nexusflow_drain_match "${nexusflow_drain_match}I";
}
if ($request_method = HEAD) {
    set $nexusflow_drain_match "${nexusflow_drain_match}M";
}
if ($uri = /api/health) {
    set $nexusflow_drain_match "${nexusflow_drain_match}P";
}
if ($http_user_agent = "SLBHealthCheck") {
    set $nexusflow_drain_match "${nexusflow_drain_match}U";
}
if ($nexusflow_drain_match = "IMPU") {
    return 503;
}
EOF
  fi
}

render_audio_guard_config() {
  cat <<'EOF'
# Managed by NexusFlow release tooling. Included once in nginx http context.
limit_conn_zone $binary_remote_addr zone=nexusflow_audio_transcription_conn:10m;
limit_req_zone $binary_remote_addr zone=nexusflow_audio_transcription_rate:10m rate=6r/m;
limit_conn_zone $binary_remote_addr zone=nexusflow_v1_large_conn:10m;
limit_req_zone $binary_remote_addr zone=nexusflow_v1_large_rate:10m rate=120r/m;
limit_conn_zone $binary_remote_addr zone=nexusflow_v1_embedding_conn:10m;
limit_req_zone $binary_remote_addr zone=nexusflow_v1_embedding_rate:10m rate=120r/m;
limit_conn_zone $binary_remote_addr zone=nexusflow_v1_default_conn:10m;
limit_req_zone $binary_remote_addr zone=nexusflow_v1_default_rate:10m rate=300r/m;
limit_conn_zone $binary_remote_addr zone=nexusflow_upload_conn:10m;
limit_req_zone $binary_remote_addr zone=nexusflow_upload_rate:10m rate=12r/m;
limit_conn_zone $binary_remote_addr zone=nexusflow_upload_download_conn:10m;
limit_req_zone $binary_remote_addr zone=nexusflow_upload_download_rate:10m rate=120r/m;
EOF
}

validate_config_file() {
  local owner
  local mode
  local permissions
  local node_id
  local state
  local audio_owner
  local audio_mode
  local audio_permissions

  test -f "$DRAIN_CONFIG" || die "drain config is missing: $DRAIN_CONFIG"
  owner="$(stat -c '%u' "$DRAIN_CONFIG")"
  mode="$(stat -c '%a' "$DRAIN_CONFIG")"
  permissions=$((8#$mode))
  test "$owner" = "0" || die "drain config must be owned by root"
  test $((permissions & 0022)) -eq 0 ||
    die "drain config must not be group/world writable (mode $mode)"
  node_id="$(config_node_id)"
  state="$(config_state)"
  validate_node_id "$node_id"
  case "$state" in
    enabled|disabled) ;;
    *) die "drain config has no valid managed state" ;;
  esac
  test -f "$AUDIO_GUARD_CONFIG" ||
    die "audio ingress guard config is missing: $AUDIO_GUARD_CONFIG"
  audio_owner="$(stat -c '%u' "$AUDIO_GUARD_CONFIG")"
  audio_mode="$(stat -c '%a' "$AUDIO_GUARD_CONFIG")"
  audio_permissions=$((8#$audio_mode))
  test "$audio_owner" = "0" || die "audio ingress guard config must be owned by root"
  test $((audio_permissions & 0022)) -eq 0 ||
    die "audio ingress guard config must not be group/world writable (mode $audio_mode)"
  cmp -s "$AUDIO_GUARD_CONFIG" <(render_audio_guard_config) ||
    die "audio ingress guard config differs from the release-managed policy"
  grep -F 'location = /v1/audio/transcriptions {' "$DRAIN_CONFIG" >/dev/null ||
    die "audio ingress exact-location policy is missing from the server include"
  grep -F 'client_max_body_size 1m;' "$DRAIN_CONFIG" >/dev/null ||
    die "audio ingress request-body cap is missing"
  grep -F 'client_body_timeout 10s;' "$DRAIN_CONFIG" >/dev/null ||
    die "audio ingress slow-client timeout is missing"
  grep -F 'limit_conn nexusflow_audio_transcription_conn 2;' "$DRAIN_CONFIG" >/dev/null ||
    die "audio ingress connection limit is missing"
  grep -F 'limit_req zone=nexusflow_audio_transcription_rate burst=2 nodelay;' "$DRAIN_CONFIG" >/dev/null ||
    die "audio ingress request-rate limit is missing"
  grep -F 'location = /v1/chat/completions {' "$DRAIN_CONFIG" >/dev/null ||
    die "large chat ingress policy is missing"
  grep -F 'location = /v1/responses {' "$DRAIN_CONFIG" >/dev/null ||
    die "large responses ingress policy is missing"
  grep -F 'location = /v1/messages {' "$DRAIN_CONFIG" >/dev/null ||
    die "large messages ingress policy is missing"
  grep -F 'location = /v1/embeddings {' "$DRAIN_CONFIG" >/dev/null ||
    die "embedding ingress policy is missing"
  grep -F 'location ^~ /v1/ {' "$DRAIN_CONFIG" >/dev/null ||
    die "default v1 ingress policy is missing"
  test "$(grep -Fxc '    client_max_body_size 50m;' "$DRAIN_CONFIG")" -eq 3 ||
    die "large-context routes do not have exactly three 50 MiB policies"
  grep -F '    client_max_body_size 8m;' "$DRAIN_CONFIG" >/dev/null ||
    die "embedding request-body cap is missing"
  test "$(grep -Fxc '    proxy_request_buffering off;' "$DRAIN_CONFIG")" -eq 8 ||
    die "managed ingress routes must stream only after application admission"
  test "$(grep -Fxc '    proxy_buffering off;' "$DRAIN_CONFIG")" -eq 8 ||
    die "managed ingress routes must preserve streaming"
  for blocked_alias in \
    'location = /proxy/v1 { return 404; }' \
    'location ^~ /proxy/v1/ { return 404; }' \
    'location = /api/proxy/v1 { return 404; }' \
    'location ^~ /api/proxy/v1/ { return 404; }'; do
    grep -F "$blocked_alias" "$DRAIN_CONFIG" >/dev/null ||
      die "public v1 proxy alias rejection is missing"
  done
  grep -F 'location = /api/upload {' "$DRAIN_CONFIG" >/dev/null ||
    die "upload ingress policy is missing"
  grep -F '    client_max_body_size 101m;' "$DRAIN_CONFIG" >/dev/null ||
    die "upload request-body cap is missing"
  grep -F 'location ^~ /api/uploads/ {' "$DRAIN_CONFIG" >/dev/null ||
    die "upload download ingress policy is missing"
  grep -F '    limit_rate 10m;' "$DRAIN_CONFIG" >/dev/null ||
    die "upload download bandwidth policy is missing"
}

write_state() {
  local state="$1"
  local current_node
  local parent
  local temporary
  local previous
  local restored=false

  require_root
  validate_self_security
  validate_config_file
  current_node="$(config_node_id)"
  parent="$(dirname "$DRAIN_CONFIG")"
  temporary="$(mktemp "$parent/.nexusflow-drain.new.XXXXXX")"
  previous="$(mktemp "$parent/.nexusflow-drain.previous.XXXXXX")"
  cp -a "$DRAIN_CONFIG" "$previous"

  cleanup_state_change() {
    local code=$?
    rm -f -- "$temporary"
    if test "$code" -ne 0 && ! "$restored"; then
      log "state change failed; restoring the previous nginx drain config"
      cp -a "$previous" "$DRAIN_CONFIG"
      nginx -t >/dev/null 2>&1 || true
      nginx -s reload >/dev/null 2>&1 || true
    fi
    rm -f -- "$previous"
    exit "$code"
  }
  trap cleanup_state_change EXIT
  trap 'exit 130' INT TERM

  render_config "$state" "$current_node" > "$temporary"
  chown root:root "$temporary"
  chmod 0644 "$temporary"
  mv -f -- "$temporary" "$DRAIN_CONFIG"
  nginx -t >/dev/null
  if ! nginx -s reload; then
    die "nginx reload failed"
  fi
  restored=true
  trap - EXIT INT TERM
  rm -f -- "$previous"
  log "health-check drain state is $state on $current_node"
}

health_line_count() {
  test -r "$ACCESS_LOG" || die "nginx access log is unreadable: $ACCESS_LOG"
  wc -l < "$ACCESS_LOG" | tr -d ' '
}

wait_health_status() {
  local expected="$1"
  local start_line="$2"
  local deadline
  local total_lines
  local begin
  local recent
  local count

  case "$expected" in
    200|503) ;;
    *) die "health status must be 200 or 503" ;;
  esac
  case "$start_line" in
    ''|*[!0-9]*) die "health log start line must be a non-negative integer" ;;
  esac
  validate_positive_integer "NEXUSFLOW_HEALTH_WAIT_SECONDS" "$HEALTH_WAIT_SECONDS"
  validate_positive_integer "NEXUSFLOW_HEALTH_SAMPLES" "$HEALTH_SAMPLES"
  test -r "$ACCESS_LOG" || die "nginx access log is unreadable: $ACCESS_LOG"

  deadline=$((SECONDS + HEALTH_WAIT_SECONDS))
  while test "$SECONDS" -lt "$deadline"; do
    total_lines="$(health_line_count)"
    if test "$total_lines" -lt "$start_line"; then
      start_line=0
    fi
    begin=$((start_line + 1))
    recent="$(
      tail -n "+$begin" "$ACCESS_LOG" |
        grep -E "^${HEALTH_SOURCE_PATTERN} .*\"HEAD /api/health HTTP/[0-9.]+\" [0-9]{3} [0-9]+ \"[^\"]*\" \"SLBHealthCheck\"" |
        tail -n "$HEALTH_SAMPLES" || true
    )"
    count="$(printf '%s\n' "$recent" | sed '/^$/d' | wc -l | tr -d ' ')"
    if test "$count" -eq "$HEALTH_SAMPLES" &&
      test "$(
        printf '%s\n' "$recent" |
          grep -Ec "\"HEAD /api/health HTTP/[0-9.]+\" ${expected} " || true
      )" -eq "$HEALTH_SAMPLES"; then
      log "observed $HEALTH_SAMPLES consecutive ALB health checks with status $expected"
      return 0
    fi
    sleep 2
  done
  die "did not observe $HEALTH_SAMPLES consecutive ALB health checks with status $expected"
}

direct_probe() {
  local expected
  local actual
  validate_config_file
  expected="$(config_node_id)"
  actual="$(
    curl --fail --silent --show-error \
      --connect-timeout 3 \
      --max-time 5 \
      -H 'Host: nexusflow.hk' \
      "http://127.0.0.1${PROBE_PATH}"
  )"
  test "$actual" = "$expected" ||
    die "direct nginx node probe mismatch: expected $expected, received ${actual:-<empty>}"
  printf '%s\n' "$actual"
}

preflight() {
  local state
  local start
  require_root
  validate_self_security
  command -v curl >/dev/null 2>&1 || die "curl is unavailable"
  command -v nginx >/dev/null 2>&1 || die "nginx is unavailable"
  command -v ss >/dev/null 2>&1 || die "ss is unavailable"
  validate_config_file
  nginx -T 2>&1 | grep -F "# configuration file $DRAIN_CONFIG:" >/dev/null ||
    die "$DRAIN_CONFIG is not included by nginx"
  nginx -T 2>&1 | grep -F "# configuration file $AUDIO_GUARD_CONFIG:" >/dev/null ||
    die "$AUDIO_GUARD_CONFIG is not included by nginx"
  nginx -T 2>&1 | grep -Eq '^[[:space:]]*real_ip_header[[:space:]]+(X-Forwarded-For|X-Real-IP);' ||
    die "nginx real_ip_header is required for per-client ingress limits"
  nginx -T 2>&1 | grep -Eq '^[[:space:]]*set_real_ip_from[[:space:]]+[^;]+;' ||
    die "nginx trusted real-IP source is required for per-client ingress limits"
  nginx -t >/dev/null
  direct_probe >/dev/null
  state="$(config_state)"
  test "$state" = "disabled" ||
    die "node starts preflight in drained state"
  start="$(health_line_count)"
  wait_health_status 200 "$start"
  log "node preflight passed: $(config_node_id)"
}

wait_drained() {
  local deadline
  local zero_samples=0
  local active
  validate_positive_integer "NEXUSFLOW_DRAIN_PORT" "$DRAIN_PORT"
  validate_positive_integer "NEXUSFLOW_DRAIN_TIMEOUT_SECONDS" "$DRAIN_TIMEOUT"
  validate_positive_integer "NEXUSFLOW_DRAIN_ZERO_SAMPLES" "$DRAIN_ZERO_SAMPLES"
  command -v ss >/dev/null 2>&1 || die "ss is unavailable"

  deadline=$((SECONDS + DRAIN_TIMEOUT))
  while test "$SECONDS" -lt "$deadline"; do
    active="$(
      ss -Htn state established "( sport = :$DRAIN_PORT )" 2>/dev/null |
        wc -l |
        tr -d ' '
    )"
    if test "$active" -eq 0; then
      zero_samples=$((zero_samples + 1))
      if test "$zero_samples" -ge "$DRAIN_ZERO_SAMPLES"; then
        log "port $DRAIN_PORT has no established connections"
        return 0
      fi
    else
      zero_samples=0
    fi
    sleep 2
  done
  die "port $DRAIN_PORT still has established connections after ${DRAIN_TIMEOUT}s"
}

case "${1:-}" in
  render)
    test "$#" -eq 3 || die "usage: $0 render {enabled|disabled} <node-id>"
    render_config "$2" "$3"
    ;;
  render-audio-guard)
    test "$#" -eq 1 || die "usage: $0 render-audio-guard"
    render_audio_guard_config
    ;;
  enable)
    test "$#" -eq 1 || die "usage: $0 enable"
    write_state enabled
    ;;
  disable)
    test "$#" -eq 1 || die "usage: $0 disable"
    write_state disabled
    ;;
  status)
    test "$#" -eq 1 || die "usage: $0 status"
    validate_config_file
    printf '%s\n' "$(config_state)"
    ;;
  node-id)
    test "$#" -eq 1 || die "usage: $0 node-id"
    validate_config_file
    printf '%s\n' "$(config_node_id)"
    ;;
  health-line-count)
    test "$#" -eq 1 || die "usage: $0 health-line-count"
    health_line_count
    ;;
  wait-health)
    test "$#" -eq 3 || die "usage: $0 wait-health {200|503} <start-line>"
    wait_health_status "$2" "$3"
    ;;
  direct-probe)
    test "$#" -eq 1 || die "usage: $0 direct-probe"
    direct_probe
    ;;
  wait-drained)
    test "$#" -eq 1 || die "usage: $0 wait-drained"
    require_root
    validate_self_security
    wait_drained
    ;;
  preflight)
    test "$#" -eq 1 || die "usage: $0 preflight"
    preflight
    ;;
  *)
    die "usage: $0 {render|render-audio-guard|enable|disable|status|node-id|health-line-count|wait-health|direct-probe|wait-drained|preflight}"
    ;;
esac
