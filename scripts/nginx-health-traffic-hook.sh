#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/release-common.sh
source "$SCRIPT_DIR/release-common.sh"

ROOT="${NEXUSFLOW_ROOT:-/root/distiny/nexusflow}"
PEER_HOST="${NEXUSFLOW_PEER_HOST:-172.27.219.55}"
PEER_ROOT="${NEXUSFLOW_PEER_ROOT:-/root/distiny/nexusflow}"
SOURCE_NODE_HELPER="$ROOT/scripts/nginx-health-drain-node.sh"
NODE_HELPER="${NEXUSFLOW_NODE_DRAIN_HELPER:-/usr/local/sbin/nexusflow-nginx-health-drain-node}"
PEER_NODE_HELPER="${NEXUSFLOW_PEER_NODE_DRAIN_HELPER:-/usr/local/sbin/nexusflow-nginx-health-drain-node}"
LOCAL_NODE_ID="${NEXUSFLOW_LOCAL_NODE_ID:-main}"
PEER_NODE_ID="${NEXUSFLOW_PEER_NODE_ID:-peer}"
PUBLIC_URL="${NEXUSFLOW_PUBLIC_URL:-https://nexusflow.hk}"
PROBE_PATH="${NEXUSFLOW_NODE_PROBE_PATH:-/__nexusflow_release_probe_9f3b}"
PROBE_TIMEOUT_SECONDS="${NEXUSFLOW_TRAFFIC_PROBE_TIMEOUT_SECONDS:-180}"
PROBE_ONLY_SAMPLES="${NEXUSFLOW_TRAFFIC_ONLY_SAMPLES:-30}"
PROBE_BALANCED_SAMPLES="${NEXUSFLOW_TRAFFIC_BALANCED_SAMPLES:-80}"
LOCK_FILE="${NEXUSFLOW_TRAFFIC_LOCK_FILE:-/run/lock/nexusflow-health-traffic.lock}"

log() {
  printf '[nginx-health-traffic] %s\n' "$*" >&2
}

die() {
  printf '[nginx-health-traffic] ERROR: %s\n' "$*" >&2
  exit 1
}

validate_positive_integer() {
  case "$2" in
    ''|*[!0-9]*) die "$1 must be a positive integer" ;;
  esac
  test "$2" -gt 0 || die "$1 must be positive"
}

for value in "$ROOT" "$PEER_ROOT" "$PEER_HOST" "$NODE_HELPER" "$PEER_NODE_HELPER" "$LOCK_FILE"; do
  case "$value" in
    *[!A-Za-z0-9_./:@-]*) die "release paths and peer host contain unsafe characters" ;;
  esac
done
for value in "$LOCAL_NODE_ID" "$PEER_NODE_ID"; do
  case "$value" in
    ''|*[!A-Za-z0-9_.-]*) die "node IDs contain unsafe characters" ;;
  esac
done
test "$LOCAL_NODE_ID" != "$PEER_NODE_ID" || die "local and peer node IDs must be different"
validate_positive_integer "probe timeout" "$PROBE_TIMEOUT_SECONDS"
validate_positive_integer "only-node samples" "$PROBE_ONLY_SAMPLES"
validate_positive_integer "balanced samples" "$PROBE_BALANCED_SAMPLES"

release_require_command curl
release_require_command flock
release_require_command sha256sum
release_require_command ssh
release_validate_secure_hook "$SOURCE_NODE_HELPER"
release_validate_secure_hook "$NODE_HELPER"

mkdir -p "$(dirname "$LOCK_FILE")"
exec 8>"$LOCK_FILE"
flock -n 8 || die "another health-check traffic transition is already running"

peer_run() {
  ssh -o BatchMode=yes -o ConnectTimeout=10 "root@$PEER_HOST" "$@"
}

node_helper() {
  local node="$1"
  shift
  case "$node" in
    local) "$NODE_HELPER" "$@" ;;
    peer) peer_run "cd '$PEER_ROOT' && '$PEER_NODE_HELPER' $*" ;;
    *) die "unknown node: $node" ;;
  esac
}

node_id_for() {
  case "$1" in
    local) printf '%s' "$LOCAL_NODE_ID" ;;
    peer) printf '%s' "$PEER_NODE_ID" ;;
    *) die "unknown node: $1" ;;
  esac
}

public_probe() {
  curl --fail --silent --show-error \
    --connect-timeout 3 \
    --max-time 8 \
    -H 'Cache-Control: no-cache' \
    -H 'Connection: close' \
    "${PUBLIC_URL}${PROBE_PATH}?release_probe=$(date +%s%N)"
}

prove_only() {
  local expected="$1"
  local deadline=$((SECONDS + PROBE_TIMEOUT_SECONDS))
  local sample
  local actual
  local all_expected

  while test "$SECONDS" -lt "$deadline"; do
    all_expected=true
    sample=0
    while test "$sample" -lt "$PROBE_ONLY_SAMPLES"; do
      actual="$(public_probe 2>/dev/null || true)"
      if test "$actual" != "$expected"; then
        all_expected=false
        break
      fi
      sample=$((sample + 1))
    done
    if "$all_expected"; then
      log "public path returned only node $expected for $PROBE_ONLY_SAMPLES samples"
      return 0
    fi
    sleep 2
  done
  die "public path did not converge to only node $expected"
}

prove_balanced() {
  local deadline=$((SECONDS + PROBE_TIMEOUT_SECONDS))
  local sample=0
  local actual
  local seen_local=false
  local seen_peer=false

  while test "$SECONDS" -lt "$deadline"; do
    actual="$(public_probe 2>/dev/null || true)"
    if test "$actual" = "$LOCAL_NODE_ID"; then seen_local=true; fi
    if test "$actual" = "$PEER_NODE_ID"; then seen_peer=true; fi
    if "$seen_local" && "$seen_peer"; then
      log "public path observed both $LOCAL_NODE_ID and $PEER_NODE_ID"
      return 0
    fi
    sample=$((sample + 1))
    if test "$sample" -ge "$PROBE_BALANCED_SAMPLES"; then
      sample=0
      seen_local=false
      seen_peer=false
    fi
    sleep 1
  done
  die "public path did not prove both healthy nodes"
}

ensure_node_identity() {
  local node="$1"
  local expected
  local configured
  local direct
  expected="$(node_id_for "$node")"
  configured="$(node_helper "$node" node-id)"
  test "$configured" = "$expected" ||
    die "$node drain config identifies $configured instead of $expected"
  direct="$(node_helper "$node" direct-probe)"
  test "$direct" = "$expected" ||
    die "$node direct probe identifies $direct instead of $expected"
}

wait_node_health() {
  local node="$1"
  local expected="$2"
  local start="$3"
  node_helper "$node" wait-health "$expected" "$start"
}

serve_node() {
  local node="$1"
  local start
  start="$(node_helper "$node" health-line-count)"
  node_helper "$node" disable
  wait_node_health "$node" 200 "$start"
}

drain_node() {
  local node="$1"
  local start
  start="$(node_helper "$node" health-line-count)"
  node_helper "$node" enable
  wait_node_health "$node" 503 "$start"
}

wait_node_connections() {
  node_helper "$1" wait-drained
}

RECOVERY_NODE=""
recover_failed_transition() {
  local code=$?
  local recovery_start
  if test "$code" -ne 0 && test -n "$RECOVERY_NODE"; then
    log "transition failed; restoring health checks on $RECOVERY_NODE"
    recovery_start="$(node_helper "$RECOVERY_NODE" health-line-count 2>/dev/null || printf '0')"
    if node_helper "$RECOVERY_NODE" disable >/dev/null 2>&1; then
      wait_node_health "$RECOVERY_NODE" 200 "$recovery_start" >/dev/null 2>&1 || true
    fi
  fi
  exit "$code"
}
trap recover_failed_transition EXIT
trap 'exit 130' INT TERM

route_one() {
  local desired="$1"
  local drained="$2"
  local desired_id
  local drained_state

  desired_id="$(node_id_for "$desired")"
  ensure_node_identity "$desired"
  ensure_node_identity "$drained"
  serve_node "$desired"
  drained_state="$(node_helper "$drained" status)"
  if test "$drained_state" = "disabled"; then
    prove_balanced
  fi

  RECOVERY_NODE="$drained"
  drain_node "$drained"
  prove_only "$desired_id"
  wait_node_connections "$drained"
  RECOVERY_NODE=""
  log "traffic mode confirmed: $desired"
}

route_balanced() {
  RECOVERY_NODE="local"
  serve_node local
  RECOVERY_NODE="peer"
  serve_node peer
  prove_balanced
  RECOVERY_NODE=""
  log "traffic mode confirmed: balanced"
}

assert_mode() {
  local mode="$1"
  local local_state
  local peer_state
  local_state="$(node_helper local status)"
  peer_state="$(node_helper peer status)"
  ensure_node_identity local
  ensure_node_identity peer
  case "$mode" in
    local)
      test "$local_state:$peer_state" = "disabled:enabled" ||
        die "traffic config is not local-only: local=$local_state peer=$peer_state"
      prove_only "$LOCAL_NODE_ID"
      ;;
    peer)
      test "$local_state:$peer_state" = "enabled:disabled" ||
        die "traffic config is not peer-only: local=$local_state peer=$peer_state"
      prove_only "$PEER_NODE_ID"
      ;;
    balanced)
      test "$local_state:$peer_state" = "disabled:disabled" ||
        die "traffic config is not balanced: local=$local_state peer=$peer_state"
      prove_balanced
      ;;
    *) die "unknown traffic mode: $mode" ;;
  esac
  log "traffic mode matches: $mode"
}

preflight() {
  local source_digest
  local local_digest
  local peer_digest
  test -f "$SOURCE_NODE_HELPER" ||
    die "node helper source is missing: $SOURCE_NODE_HELPER"
  source_digest="$(sha256sum "$SOURCE_NODE_HELPER" | awk '{ print $1 }')"
  local_digest="$(sha256sum "$NODE_HELPER" | awk '{ print $1 }')"
  peer_digest="$(
    peer_run "test -x '$PEER_NODE_HELPER' \
      && test \"\$(stat -c '%u' '$PEER_NODE_HELPER')\" = 0 \
      && sha256sum '$PEER_NODE_HELPER' | awk '{ print \$1 }'"
  )"
  test "$source_digest" = "$local_digest" ||
    die "installed local node helper does not match the release source"
  test "$source_digest" = "$peer_digest" ||
    die "installed peer node helper does not match the release source"
  node_helper local preflight
  node_helper peer preflight
  assert_mode balanced
  log "health-check traffic preflight passed"
}

case "${1:-}" in
  preflight)
    test "$#" -eq 1 || die "usage: $0 preflight"
    preflight
    ;;
  route)
    test "$#" -eq 2 || die "usage: $0 route {local|peer|balanced}"
    case "$2" in
      local) route_one local peer ;;
      peer) route_one peer local ;;
      balanced) route_balanced ;;
      *) die "unknown traffic mode: $2" ;;
    esac
    ;;
  assert)
    test "$#" -eq 2 || die "usage: $0 assert {local|peer|balanced}"
    assert_mode "$2"
    ;;
  status)
    test "$#" -eq 1 || die "usage: $0 status"
    printf 'local=%s peer=%s\n' \
      "$(node_helper local status)" \
      "$(node_helper peer status)"
    ;;
  *)
    die "usage: $0 {preflight|route <mode>|assert <mode>|status}"
    ;;
esac
