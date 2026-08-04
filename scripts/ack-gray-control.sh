#!/usr/bin/env bash
set -euo pipefail

REGION_ID="${NEXUSFLOW_ALB_REGION_ID:-cn-beijing}"
RAM_ROLE_NAME="${NEXUSFLOW_ALB_RAM_ROLE_NAME:-NexusFlowCertSyncRole}"
RULE_ID="${NEXUSFLOW_ALB_RULE_ID:-rule-i4mtbc9w83vq2avual}"
ECS_SERVER_GROUP_ID="${NEXUSFLOW_ECS_SERVER_GROUP_ID:-sgp-lvirvljge3xp1xjbvy}"
ACK_SERVER_GROUP_ID="${NEXUSFLOW_ACK_SERVER_GROUP_ID:-sgp-3zgnpomvq7f52eo3m5}"
ACK_ALB_HOST="${NEXUSFLOW_ACK_ALB_HOST:-alb-p4dpe83oyje5xdsum7.cn-beijing.alb.aliyuncsslb.com}"
ACK_NAMESPACE="${NEXUSFLOW_ACK_NAMESPACE:-nexusflow-staging}"
PUBLIC_HEALTH_URL="${NEXUSFLOW_PUBLIC_HEALTH_URL:-https://nexusflow.hk/api/health}"
PROBE_INTERVAL_SECONDS="${NEXUSFLOW_PROBE_INTERVAL_SECONDS:-10}"
MAX_PUBLIC_INFLIGHT_PER_POD="${NEXUSFLOW_MAX_PUBLIC_INFLIGHT_PER_POD:-20}"
MAX_PUBLIC_INFLIGHT_TOTAL="${NEXUSFLOW_MAX_PUBLIC_INFLIGHT_TOTAL:-60}"

log() {
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$*"
}

aliyun_alb() {
  aliyun alb "$@" \
    --mode EcsRamRole \
    --ram-role-name "$RAM_ROLE_NAME" \
    --region "$REGION_ID"
}

probe_url() {
  local url="$1"
  shift
  local result
  result=$(curl -sS -o /dev/null --connect-timeout 3 --max-time 12 \
    -w '%{http_code} %{time_total}' "$@" "$url") || return 1
  local code latency
  read -r code latency <<<"$result"
  [[ "$code" == "200" ]] || return 1
  awk -v value="$latency" 'BEGIN { exit !(value <= 8) }'
}

probe_public() {
  probe_url "$PUBLIC_HEALTH_URL"
}

probe_ack() {
  probe_url "http://${ACK_ALB_HOST}:18080/api/health" -H 'Host: nexusflow.hk'
}

ready_replicas() {
  local deployment="$1"
  kubectl -n "$ACK_NAMESPACE" get deployment "$deployment" \
    -o jsonpath='{.status.readyReplicas}' 2>/dev/null
}

check_ack_capacity() {
  local api_ready gateway_ready web_ready
  api_ready=$(ready_replicas nexusflow-api)
  gateway_ready=$(ready_replicas nexusflow-gateway)
  web_ready=$(ready_replicas nexusflow-web)
  [[ "${api_ready:-0}" -ge 4 ]]
  [[ "${gateway_ready:-0}" -ge 2 ]]
  [[ "${web_ready:-0}" -ge 2 ]]
}

check_ack_inflight() {
  local pod metric value total=0
  local pods=()
  mapfile -t pods < <(
    kubectl -n "$ACK_NAMESPACE" get pods \
      -l app.kubernetes.io/component=api \
      --field-selector=status.phase=Running \
      -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}'
  )
  [[ "${#pods[@]}" -ge 4 ]] || return 1

  for pod in "${pods[@]}"; do
    metric=$(kubectl get --raw \
      "/api/v1/namespaces/${ACK_NAMESPACE}/pods/${pod}:3001/proxy/_internal/metrics") || return 1
    value=$(awk '$1 == "nexusflow_public_api_inflight_requests" { print $2 }' <<<"$metric")
    [[ "$value" =~ ^[0-9]+$ ]] || return 1
    if (( value > MAX_PUBLIC_INFLIGHT_PER_POD )); then
      log "ACK inflight threshold exceeded on ${pod}: ${value} > ${MAX_PUBLIC_INFLIGHT_PER_POD}"
      return 1
    fi
    total=$((total + value))
  done

  if (( total > MAX_PUBLIC_INFLIGHT_TOTAL )); then
    log "ACK total inflight threshold exceeded: ${total} > ${MAX_PUBLIC_INFLIGHT_TOTAL}"
    return 1
  fi
}

rule_actions() {
  aliyun_alb ListRules --MaxResults 100 \
    | jq -ce --arg rule_id "$RULE_ID" \
      '.Rules[] | select(.RuleId == $rule_id) | .RuleActions'
}

verify_weight() {
  local ack_weight="$1"
  local actions
  actions=$(rule_actions)
  if [[ "$ack_weight" -eq 0 ]]; then
    jq -e --arg ecs "$ECS_SERVER_GROUP_ID" '
      length == 1 and
      .[0].Type == "ForwardGroup" and
      (.[0].ForwardGroupConfig.ServerGroupTuples | length) == 1 and
      .[0].ForwardGroupConfig.ServerGroupTuples[0].ServerGroupId == $ecs
    ' >/dev/null <<<"$actions"
    return
  fi

  local ecs_weight=$((100 - ack_weight))
  jq -e \
    --arg ecs "$ECS_SERVER_GROUP_ID" \
    --arg ack "$ACK_SERVER_GROUP_ID" \
    --argjson ecs_weight "$ecs_weight" \
    --argjson ack_weight "$ack_weight" '
      length == 1 and
      .[0].Type == "ForwardGroup" and
      (.[0].ForwardGroupConfig.ServerGroupTuples | length) == 2 and
      any(.[0].ForwardGroupConfig.ServerGroupTuples[];
        .ServerGroupId == $ecs and .Weight == $ecs_weight) and
      any(.[0].ForwardGroupConfig.ServerGroupTuples[];
        .ServerGroupId == $ack and .Weight == $ack_weight)
    ' >/dev/null <<<"$actions"
}

set_weight() {
  local ack_weight="$1"
  case "$ack_weight" in
    0|1|5|10) ;;
    *) log "refusing unsupported ACK weight: $ack_weight"; return 2 ;;
  esac

  if [[ "$ack_weight" -eq 0 ]]; then
    aliyun_alb UpdateRulesAttribute --force \
      --Rules.1.RuleId "$RULE_ID" \
      --Rules.1.RuleActions.1.Type ForwardGroup \
      --Rules.1.RuleActions.1.Order 1 \
      --Rules.1.RuleActions.1.ForwardGroupConfig.ServerGroupTuples.1.ServerGroupId "$ECS_SERVER_GROUP_ID" \
      --Rules.1.RuleActions.1.ForwardGroupConfig.ServerGroupTuples.1.Weight 100 \
      >/dev/null
  else
    local ecs_weight=$((100 - ack_weight))
    aliyun_alb UpdateRulesAttribute --force \
      --Rules.1.RuleId "$RULE_ID" \
      --Rules.1.RuleActions.1.Type ForwardGroup \
      --Rules.1.RuleActions.1.Order 1 \
      --Rules.1.RuleActions.1.ForwardGroupConfig.ServerGroupTuples.1.ServerGroupId "$ECS_SERVER_GROUP_ID" \
      --Rules.1.RuleActions.1.ForwardGroupConfig.ServerGroupTuples.1.Weight "$ecs_weight" \
      --Rules.1.RuleActions.1.ForwardGroupConfig.ServerGroupTuples.2.ServerGroupId "$ACK_SERVER_GROUP_ID" \
      --Rules.1.RuleActions.1.ForwardGroupConfig.ServerGroupTuples.2.Weight "$ack_weight" \
      >/dev/null
  fi

  for _ in $(seq 1 20); do
    if verify_weight "$ack_weight"; then
      log "traffic weight confirmed: ECS=$((100 - ack_weight)) ACK=$ack_weight"
      return 0
    fi
    sleep 1
  done
  log "listener did not converge to ACK weight $ack_weight"
  return 1
}

preflight() {
  probe_public || return 1
  probe_ack || return 1
  check_ack_capacity || return 1
  check_ack_inflight || return 1
  verify_weight 0 || return 1
  log 'preflight passed: production ECS-only, ACK isolated health and capacity healthy'
}

observe() {
  local expected_weight="$1"
  local duration_seconds="$2"
  local deadline=$((SECONDS + duration_seconds))
  local consecutive_failures=0

  while (( SECONDS < deadline )); do
    if probe_public && probe_ack && check_ack_capacity && check_ack_inflight && verify_weight "$expected_weight"; then
      consecutive_failures=0
    else
      consecutive_failures=$((consecutive_failures + 1))
      log "gray probe failure ${consecutive_failures}/2 at ACK weight $expected_weight"
    fi

    if (( consecutive_failures >= 2 )); then
      log 'rollback threshold reached'
      return 1
    fi
    sleep "$PROBE_INTERVAL_SECONDS"
  done
  log "observation passed for ${duration_seconds}s at ACK weight $expected_weight"
}

rollback() {
  log 'rolling back to ECS 100% / ACK 0%'
  set_weight 0
}

run_morning_gray() {
  preflight || return 1
  set_weight 1 || return 1
  observe 1 600 || return 1
  set_weight 5 || return 1
  observe 5 900 || return 1
  set_weight 10 || return 1
  observe 10 7200 || return 1

  log 'morning gray completed: holding ECS 90% / ACK 10%'
}

run_with_rollback() {
  if run_morning_gray; then
    return 0
  fi
  rollback
  return 1
}

usage() {
  echo "usage: $0 preflight | set-weight <0|1|5|10> | observe <weight> <seconds> | rollback | run-morning"
}

case "${1:-}" in
  preflight) preflight ;;
  set-weight) [[ $# -eq 2 ]] || { usage; exit 2; }; set_weight "$2" ;;
  observe) [[ $# -eq 3 ]] || { usage; exit 2; }; observe "$2" "$3" ;;
  rollback) rollback ;;
  run-morning) run_with_rollback ;;
  *) usage; exit 2 ;;
esac
