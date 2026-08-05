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
PUBLIC_VERSION_URL="${NEXUSFLOW_PUBLIC_VERSION_URL:-https://nexusflow.hk/api/version}"
PROBE_INTERVAL_SECONDS="${NEXUSFLOW_PROBE_INTERVAL_SECONDS:-10}"
MAX_PUBLIC_INFLIGHT_PER_POD="${NEXUSFLOW_MAX_PUBLIC_INFLIGHT_PER_POD:-20}"
MAX_PUBLIC_INFLIGHT_TOTAL="${NEXUSFLOW_MAX_PUBLIC_INFLIGHT_TOTAL:-60}"
ACK_BUILD_SHA="${NEXUSFLOW_ACK_BUILD_SHA:-09753c32b01c443a4d2272fad19ec5a5c272e234}"
DB_ENV_FILE="${NEXUSFLOW_DB_ENV_FILE:-/root/distiny/nexusflow/backend/.env}"
DB_MONITOR_SCRIPT="${NEXUSFLOW_DB_MONITOR_SCRIPT:-/usr/local/libexec/nexusflow-ack-gray-db-health.cjs}"
GRAY_STATE_DIR="${NEXUSFLOW_GRAY_STATE_DIR:-/var/lib/nexusflow-ack-gray}"
GRAY_STARTED_AT="${NEXUSFLOW_GRAY_STARTED_AT:-$(date --utc --iso-8601=seconds)}"
GRAY_LOG_FILE="${NEXUSFLOW_GRAY_LOG_FILE:-/var/log/nexusflow-ack-gray.log}"
LAST_ACK_INFLIGHT_TOTAL="unknown"
LAST_GRAY_DATABASE_SUMMARY='{}'

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

check_pod_restarts() {
  local restarts
  restarts=$(kubectl -n "$ACK_NAMESPACE" get pods -o json \
    | jq '[.items[].status.containerStatuses[]?.restartCount] | add // 0')
  [[ "$restarts" -eq 0 ]] || {
    log "ACK pod restart threshold exceeded: ${restarts}"
    return 1
  }
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
  LAST_ACK_INFLIGHT_TOTAL="$total"
}

check_custom_metrics_hpa() {
  local available metric_payload metric_count hpa_payload
  available=$(kubectl get apiservice v1beta1.custom.metrics.k8s.io \
    -o jsonpath='{.status.conditions[?(@.type=="Available")].status}' 2>/dev/null) || return 1
  if [[ "$available" != "True" ]]; then
    log "custom metrics APIService is unavailable: ${available:-missing}"
    return 1
  fi

  metric_payload=$(kubectl get --raw \
    "/apis/custom.metrics.k8s.io/v1beta1/namespaces/${ACK_NAMESPACE}/pods/*/nexusflow_public_api_inflight_requests" \
    2>/dev/null) || {
      log 'custom inflight metric query failed'
      return 1
    }
  metric_count=$(jq '[.items[] | select(.value | test("^[0-9]+(m)?$"))] | length' <<<"$metric_payload") || return 1
  if (( metric_count < 4 )); then
    log "custom inflight metric has too few pod series: ${metric_count} < 4"
    return 1
  fi

  hpa_payload=$(kubectl -n "$ACK_NAMESPACE" get hpa nexusflow-api -o json 2>/dev/null) || return 1
  if ! jq -e '
    any(.status.conditions[]?;
      .type == "ScalingActive" and .status == "True" and .reason == "ValidMetricFound") and
    any(.spec.metrics[]?;
      .type == "Pods" and
      .pods.metric.name == "nexusflow_public_api_inflight_requests")
  ' >/dev/null <<<"$hpa_payload"; then
    log 'HPA custom inflight metric is not active'
    return 1
  fi
}

check_gray_database() {
  local result
  result=$(node --env-file="$DB_ENV_FILE" "$DB_MONITOR_SCRIPT" "$GRAY_STARTED_AT") || {
    LAST_GRAY_DATABASE_SUMMARY="${result:-{}}"
    log "database gray gate failed: ${result:-no summary}"
    return 1
  }
  LAST_GRAY_DATABASE_SUMMARY="$result"
}

verify_distribution() {
  local ack_weight="$1"
  local samples min_ack max_ack
  case "$ack_weight" in
    1) samples=1000; min_ack=2; max_ack=30 ;;
    5) samples=200; min_ack=3; max_ack=20 ;;
    10) samples=100; min_ack=3; max_ack=25 ;;
    *) return 0 ;;
  esac

  local results_file ack_hits probe_nonce
  results_file=$(mktemp)
  probe_nonce=$(date +%s%N)
  if ! seq "$samples" | xargs -P 20 -I{} \
    curl -fsS --connect-timeout 3 --max-time 12 \
    -H 'Cache-Control: no-cache' \
    "${PUBLIC_VERSION_URL}?gray_probe=${probe_nonce}-{}" \
    >>"$results_file"; then
    rm -f "$results_file"
    log "traffic distribution probe failed at ACK weight $ack_weight"
    return 1
  fi
  ack_hits=$({ grep -o "$ACK_BUILD_SHA" "$results_file" || true; } | wc -l | tr -d ' ')
  rm -f "$results_file"
  if (( ack_hits < min_ack || ack_hits > max_ack )); then
    log "traffic distribution outside guardrail: ACK ${ack_hits}/${samples} at weight ${ack_weight}"
    return 1
  fi
  log "traffic distribution confirmed: ACK ${ack_hits}/${samples} at weight ${ack_weight}"
}

update_rule_with_retry() {
  local attempt output
  for attempt in $(seq 1 30); do
    if output=$(aliyun_alb UpdateRulesAttribute --force "$@" 2>&1); then
      return 0
    fi
    if grep -q 'IncorrectStatus.Rule' <<<"$output"; then
      log "ALB rule is still configuring; retrying update (${attempt}/30)"
      sleep 2
      continue
    fi
    printf '%s\n' "$output" >&2
    return 1
  done
  log 'ALB rule did not become writable within 60s'
  return 1
}

rule_actions() {
  aliyun_alb ListRules --MaxResults 100 \
    | jq -ce --arg rule_id "$RULE_ID" \
      '.Rules[] | select(.RuleId == $rule_id) | .RuleActions'
}

rule_available() {
  aliyun_alb ListRules --MaxResults 100 \
    | jq -e --arg rule_id "$RULE_ID" '
      .Rules[] |
      select(.RuleId == $rule_id) |
      .RuleStatus == "Available"
    ' >/dev/null
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
    update_rule_with_retry \
      --Rules.1.RuleId "$RULE_ID" \
      --Rules.1.RuleActions.1.Type ForwardGroup \
      --Rules.1.RuleActions.1.Order 1 \
      --Rules.1.RuleActions.1.ForwardGroupConfig.ServerGroupTuples.1.ServerGroupId "$ECS_SERVER_GROUP_ID" \
      --Rules.1.RuleActions.1.ForwardGroupConfig.ServerGroupTuples.1.Weight 100 \
      >/dev/null
  else
    local ecs_weight=$((100 - ack_weight))
    update_rule_with_retry \
      --Rules.1.RuleId "$RULE_ID" \
      --Rules.1.RuleActions.1.Type ForwardGroup \
      --Rules.1.RuleActions.1.Order 1 \
      --Rules.1.RuleActions.1.ForwardGroupConfig.ServerGroupTuples.1.ServerGroupId "$ECS_SERVER_GROUP_ID" \
      --Rules.1.RuleActions.1.ForwardGroupConfig.ServerGroupTuples.1.Weight "$ecs_weight" \
      --Rules.1.RuleActions.1.ForwardGroupConfig.ServerGroupTuples.2.ServerGroupId "$ACK_SERVER_GROUP_ID" \
      --Rules.1.RuleActions.1.ForwardGroupConfig.ServerGroupTuples.2.Weight "$ack_weight" \
      >/dev/null
  fi

  for _ in $(seq 1 60); do
    if rule_available && verify_weight "$ack_weight"; then
      sleep 2
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
  check_pod_restarts || return 1
  check_ack_inflight || return 1
  check_custom_metrics_hpa || return 1
  check_gray_database || return 1
  verify_weight 0 || return 1
  log 'preflight passed: production ECS-only, ACK isolated health and capacity healthy'
}

observe() {
  local expected_weight="$1"
  local duration_seconds="$2"
  local deadline=$((SECONDS + duration_seconds))
  local consecutive_failures=0
  local check_count=0

  while (( SECONDS < deadline )); do
    check_count=$((check_count + 1))
    if probe_public && probe_ack && check_ack_capacity && check_pod_restarts \
      && check_ack_inflight && check_custom_metrics_hpa \
      && check_gray_database && verify_weight "$expected_weight"; then
      consecutive_failures=0
      if (( check_count % 30 == 0 )); then
        log "gray observation healthy: ACK weight=${expected_weight}, remaining=$((deadline - SECONDS))s, inflight_total=${LAST_ACK_INFLIGHT_TOTAL}, database=${LAST_GRAY_DATABASE_SUMMARY}"
      fi
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

gray_abort() {
  local reason="$1"
  trap - EXIT HUP INT TERM
  log "gray controller aborted (${reason}); forcing ECS 100% / ACK 0%"
  rollback || log 'emergency rollback command failed; operator intervention required'
  exit 1
}

run_morning_gray() {
  install -d -o root -g root -m 0750 "$GRAY_STATE_DIR"
  printf '%s\n' "$GRAY_STARTED_AT" >"${GRAY_STATE_DIR}/started-at"
  preflight || return 1
  set_weight 1 || return 1
  verify_distribution 1 || return 1
  observe 1 600 || return 1
  set_weight 5 || return 1
  verify_distribution 5 || return 1
  observe 5 900 || return 1
  set_weight 10 || return 1
  verify_distribution 10 || return 1
  observe 10 7200 || return 1

  log 'morning gray completed: holding ECS 90% / ACK 10%'
}

deadman() {
  if [[ -r "${GRAY_STATE_DIR}/started-at" ]]; then
    GRAY_STARTED_AT=$(<"${GRAY_STATE_DIR}/started-at")
  fi
  if grep -q "^$(date --iso-8601).*morning gray completed" "$GRAY_LOG_FILE" 2>/dev/null \
    && probe_public && probe_ack && check_ack_capacity && check_pod_restarts \
    && check_ack_inflight && check_custom_metrics_hpa \
    && check_gray_database && verify_weight 10; then
    log 'deadman confirmed completed and healthy ACK 10% gray'
    return 0
  fi
  log 'deadman did not find a healthy completed gray; forcing ECS 100%'
  rollback
  return 1
}

run_with_rollback() {
  trap 'gray_abort EXIT' EXIT
  trap 'gray_abort SIGHUP' HUP
  trap 'gray_abort SIGINT' INT
  trap 'gray_abort SIGTERM' TERM
  if run_morning_gray; then
    trap - EXIT HUP INT TERM
    return 0
  fi
  gray_abort FAILURE
}

usage() {
  echo "usage: $0 preflight | set-weight <0|1|5|10> | observe <weight> <seconds> | rollback | run-morning | deadman"
}

case "${1:-}" in
  preflight) preflight ;;
  set-weight) [[ $# -eq 2 ]] || { usage; exit 2; }; set_weight "$2" ;;
  observe) [[ $# -eq 3 ]] || { usage; exit 2; }; observe "$2" "$3" ;;
  rollback) rollback ;;
  run-morning) run_with_rollback ;;
  deadman) deadman ;;
  *) usage; exit 2 ;;
esac
