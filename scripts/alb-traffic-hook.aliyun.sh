#!/usr/bin/env bash

set -euo pipefail

REGION="${NEXUSFLOW_ALB_REGION:-cn-beijing}"
SERVER_GROUP_ID="${NEXUSFLOW_ALB_SERVER_GROUP_ID:-}"
LOCAL_SERVER_ID="${NEXUSFLOW_ALB_LOCAL_SERVER_ID:-}"
PEER_SERVER_ID="${NEXUSFLOW_ALB_PEER_SERVER_ID:-}"
LOCAL_PORT="${NEXUSFLOW_ALB_LOCAL_PORT:-80}"
PEER_PORT="${NEXUSFLOW_ALB_PEER_PORT:-80}"
RAM_ROLE="${NEXUSFLOW_ALIYUN_RAM_ROLE:-}"
PROFILE="${NEXUSFLOW_ALIYUN_PROFILE:-}"
WAIT_SECONDS="${NEXUSFLOW_ALB_WAIT_SECONDS:-90}"

log() {
  printf '[alb-traffic] %s\n' "$*" >&2
}

die() {
  printf '[alb-traffic] ERROR: %s\n' "$*" >&2
  exit 1
}

require_configuration() {
  command -v aliyun >/dev/null 2>&1 || die "aliyun CLI is unavailable"
  command -v node >/dev/null 2>&1 || die "node is unavailable"
  test -n "$SERVER_GROUP_ID" || die "NEXUSFLOW_ALB_SERVER_GROUP_ID is required"
  test -n "$LOCAL_SERVER_ID" || die "NEXUSFLOW_ALB_LOCAL_SERVER_ID is required"
  test -n "$PEER_SERVER_ID" || die "NEXUSFLOW_ALB_PEER_SERVER_ID is required"
  if test -z "$PROFILE" && test -z "$RAM_ROLE"; then
    die "set NEXUSFLOW_ALIYUN_PROFILE or NEXUSFLOW_ALIYUN_RAM_ROLE"
  fi
  test "$LOCAL_SERVER_ID" != "$PEER_SERVER_ID" ||
    die "local and peer ALB server IDs must be different"
  for value in "$LOCAL_PORT" "$PEER_PORT" "$WAIT_SECONDS"; do
    case "$value" in
      ''|*[!0-9]*) die "ALB ports and wait time must be positive integers" ;;
    esac
    test "$value" -gt 0 || die "ALB ports and wait time must be positive"
  done
}

aliyun_alb() {
  local auth=()
  if test -n "$PROFILE"; then
    auth=(--profile "$PROFILE")
  else
    auth=(--mode EcsRamRole --ram-role-name "$RAM_ROLE")
  fi
  aliyun "${auth[@]}" --region "$REGION" alb "$@"
}

list_servers() {
  aliyun_alb ListServerGroupServers \
    --ServerGroupId "$SERVER_GROUP_ID" \
    --MaxResults 100
}

validate_server_set() {
  LOCAL_SERVER_ID="$LOCAL_SERVER_ID" \
  PEER_SERVER_ID="$PEER_SERVER_ID" \
  LOCAL_PORT="$LOCAL_PORT" \
  PEER_PORT="$PEER_PORT" \
  node -e '
    let body = "";
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      const parsed = JSON.parse(body);
      const servers = parsed.Servers || parsed.servers || [];
      const expected = [
        [process.env.LOCAL_SERVER_ID, Number(process.env.LOCAL_PORT)],
        [process.env.PEER_SERVER_ID, Number(process.env.PEER_PORT)],
      ];
      if (servers.length !== 2) {
        throw new Error(`expected exactly two ALB servers, found ${servers.length}`);
      }
      for (const [id, port] of expected) {
        const matches = servers.filter((server) =>
          String(server.ServerId) === id && Number(server.Port) === port
        );
        if (matches.length !== 1) {
          throw new Error(`expected one ALB server ${id}:${port}, found ${matches.length}`);
        }
      }
      for (const server of servers) {
        for (const key of ["ServerId", "ServerIp", "ServerType", "Port"]) {
          if (server[key] === undefined || server[key] === null || server[key] === "") {
            throw new Error(`ALB server ${server.ServerId || "<unknown>"} is missing ${key}`);
          }
        }
      }
      process.stdout.write(JSON.stringify(servers));
    });
  '
}

server_payload() {
  local local_weight="$1"
  local peer_weight="$2"
  LOCAL_SERVER_ID="$LOCAL_SERVER_ID" \
  PEER_SERVER_ID="$PEER_SERVER_ID" \
  LOCAL_WEIGHT="$local_weight" \
  PEER_WEIGHT="$peer_weight" \
  node -e '
    let body = "";
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      const servers = JSON.parse(body);
      const weights = new Map([
        [process.env.LOCAL_SERVER_ID, Number(process.env.LOCAL_WEIGHT)],
        [process.env.PEER_SERVER_ID, Number(process.env.PEER_WEIGHT)],
      ]);
      const allowed = ["ServerId", "ServerIp", "ServerType", "Port", "Description"];
      const output = servers.map((server) => {
        const item = {};
        for (const key of allowed) {
          if (server[key] !== undefined && server[key] !== null && server[key] !== "") {
            item[key] = server[key];
          }
        }
        item.Weight = weights.get(String(server.ServerId));
        return item;
      });
      process.stdout.write(JSON.stringify(output));
    });
  '
}

weights_for_mode() {
  case "$1" in
    local) printf '100 0\n' ;;
    peer) printf '0 100\n' ;;
    balanced) printf '100 100\n' ;;
    *) die "unknown traffic mode: $1" ;;
  esac
}

assert_mode() {
  local mode="$1"
  local expected
  local local_weight
  local peer_weight
  local server_json

  expected="$(weights_for_mode "$mode")"
  local_weight="${expected%% *}"
  peer_weight="${expected##* }"
  server_json="$(list_servers | validate_server_set)"

  LOCAL_SERVER_ID="$LOCAL_SERVER_ID" \
  PEER_SERVER_ID="$PEER_SERVER_ID" \
  LOCAL_WEIGHT="$local_weight" \
  PEER_WEIGHT="$peer_weight" \
  node -e '
    const servers = JSON.parse(process.argv[1]);
    const expected = new Map([
      [process.env.LOCAL_SERVER_ID, Number(process.env.LOCAL_WEIGHT)],
      [process.env.PEER_SERVER_ID, Number(process.env.PEER_WEIGHT)],
    ]);
    for (const server of servers) {
      const want = expected.get(String(server.ServerId));
      if (
        want === undefined ||
        Number(server.Weight) !== want ||
        String(server.Status) !== "Available"
      ) {
        process.exit(1);
      }
    }
  ' "$server_json"
}

wait_for_mode() {
  local mode="$1"
  local deadline=$((SECONDS + WAIT_SECONDS))
  while test "$SECONDS" -lt "$deadline"; do
    if assert_mode "$mode" >/dev/null 2>&1; then
      log "traffic mode confirmed: $mode"
      return 0
    fi
    sleep 2
  done
  die "timed out waiting for traffic mode: $mode"
}

update_mode() {
  local mode="$1"
  local expected
  local local_weight
  local peer_weight
  local servers
  local payload

  expected="$(weights_for_mode "$mode")"
  local_weight="${expected%% *}"
  peer_weight="${expected##* }"
  servers="$(list_servers | validate_server_set)"
  payload="$(printf '%s' "$servers" | server_payload "$local_weight" "$peer_weight")"

  aliyun_alb UpdateServerGroupServersAttribute \
    --ServerGroupId "$SERVER_GROUP_ID" \
    --Servers "$payload" \
    --ClientToken "nexusflow-$(date -u +%Y%m%dT%H%M%SZ)-${mode}" >/dev/null
  wait_for_mode "$mode"
}

preflight() {
  local servers
  local payload
  local output
  local code

  servers="$(list_servers | validate_server_set)"
  printf '%s' "$servers" |
    LOCAL_SERVER_ID="$LOCAL_SERVER_ID" \
    PEER_SERVER_ID="$PEER_SERVER_ID" \
    node -e '
      let body = "";
      process.stdin.on("data", (chunk) => { body += chunk; });
      process.stdin.on("end", () => {
        const servers = JSON.parse(body);
        if (servers.some((server) => String(server.Status) !== "Available")) {
          process.exit(1);
        }
      });
    ' || die "ALB server group is still configuring or unavailable"
  payload="$(printf '%s' "$servers" | server_payload 100 100)"
  set +e
  output="$(aliyun_alb UpdateServerGroupServersAttribute \
    --ServerGroupId "$SERVER_GROUP_ID" \
    --Servers "$payload" \
    --ClientToken "nexusflow-preflight-$(date -u +%Y%m%dT%H%M%SZ)" \
    --DryRun true 2>&1)"
  code=$?
  set -e

  if test "$code" -ne 0 && ! printf '%s' "$output" | grep -q 'DryRunOperation'; then
    printf '%s\n' "$output" >&2
    die "ALB update dry-run failed"
  fi
  log "read and update permissions verified with ALB dry-run"
}

require_configuration

case "${1:-}" in
  preflight)
    preflight
    ;;
  route)
    test "$#" -eq 2 || die "usage: $0 route {local|peer|balanced}"
    update_mode "$2"
    ;;
  assert)
    test "$#" -eq 2 || die "usage: $0 assert {local|peer|balanced}"
    assert_mode "$2" || die "traffic mode does not match: $2"
    log "traffic mode matches: $2"
    ;;
  status)
    list_servers | validate_server_set
    printf '\n'
    ;;
  *)
    die "usage: $0 {preflight|route <mode>|assert <mode>|status}"
    ;;
esac
