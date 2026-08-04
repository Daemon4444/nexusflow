#!/usr/bin/env bash
set -euo pipefail

# Read-only cloud gate for the ACK Serverless migration. It intentionally
# performs no create/update/delete API calls and never prints resource IDs.

required_commands=(aliyun jq)
for command_name in "${required_commands[@]}"; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "FAIL missing command: ${command_name}" >&2
    exit 1
  }
done

required_variables=(
  ACK_REGION ACK_VPC_ID ACK_VSWITCH_IDS ACK_SECURITY_GROUP_ID
  ACK_ALB_ID ACK_HTTPS_LISTENER_ID ACK_SERVER_GROUP_ID
  ACK_RDS_INSTANCE_ID ACK_REDIS_INSTANCE_ID ACK_DNS_DOMAIN
  ACK_GATEWAY_TRUSTED_PROXY_CIDRS
)
for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "FAIL missing environment variable: ${variable_name}" >&2
    exit 1
  fi
done

failures=0
warnings=0
pass() { printf 'PASS %s\n' "$1"; }
warn() { printf 'WARN %s\n' "$1"; warnings=$((warnings + 1)); }
fail() { printf 'FAIL %s\n' "$1"; failures=$((failures + 1)); }

capture() {
  local output_file="$1"
  shift
  if ! "$@" >"$output_file" 2>/dev/null; then
    return 1
  fi
  jq -e . "$output_file" >/dev/null 2>&1
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

if capture "$tmp_dir/identity.json" aliyun sts GetCallerIdentity; then
  pass "Alibaba Cloud credentials are valid"
else
  fail "Alibaba Cloud credentials are invalid or unavailable"
fi

service_roles=(
  AliyunCISDefaultRole
  AliyunCSDefaultRole
  AliyunCSKubernetesAuditRole
  AliyunCSManagedArmsRole
  AliyunCSManagedCmsRole
  AliyunCSManagedCsiPluginRole
  AliyunCSManagedCsiProvisionerRole
  AliyunCSManagedCsiRole
  AliyunCSManagedKubernetesRole
  AliyunCSManagedLogRole
  AliyunCSManagedNetworkRole
  AliyunCSServerlessKubernetesRole
)
missing_roles=0
for role_name in "${service_roles[@]}"; do
  if ! aliyun ram GetRole --RoleName "$role_name" >/dev/null 2>&1; then
    missing_roles=$((missing_roles + 1))
  fi
done
if (( missing_roles == 0 )); then
  pass "all required ACK service roles exist"
else
  fail "${missing_roles} required ACK service role(s) are missing"
fi

if capture "$tmp_dir/clusters.json" aliyun cs DescribeClustersV1 --region "$ACK_REGION"; then
  cluster_count="$(jq -r '.page_info.total_count // (.clusters | length) // 0' "$tmp_dir/clusters.json")"
  pass "ACK API is readable; existing cluster count=${cluster_count}"
else
  fail "ACK API is not readable (service activation or permission may still be blocked)"
fi

IFS=',' read -r -a vswitch_ids <<<"$ACK_VSWITCH_IDS"
vswitch_cidrs=()
for index in "${!vswitch_ids[@]}"; do
  vswitch_id="${vswitch_ids[$index]}"
  output="$tmp_dir/vswitch-${index}.json"
  if ! capture "$output" aliyun vpc DescribeVSwitchAttributes \
    --RegionId "$ACK_REGION" --VSwitchId "$vswitch_id"; then
    fail "vSwitch $((index + 1)) is not readable"
    continue
  fi
  if [[ "$(jq -r '.VpcId // ""' "$output")" != "$ACK_VPC_ID" ]]; then
    fail "vSwitch $((index + 1)) is outside the target VPC"
  elif [[ "$(jq -r '.Status // ""' "$output")" != "Available" ]]; then
    fail "vSwitch $((index + 1)) is not available"
  elif (( $(jq -r '.AvailableIpAddressCount // 0' "$output") < 256 )); then
    fail "vSwitch $((index + 1)) has fewer than 256 available IPs"
  else
    pass "vSwitch $((index + 1)) is available in the target VPC with sufficient IPs"
  fi
  vswitch_cidrs+=("$(jq -r '.CidrBlock // ""' "$output")")
done

# The gateway rate limits key on the client address recovered via
# set_real_ip_from. If the ALB hop CIDRs are not fully trusted, every request
# collapses onto the ALB address and rate limiting 429s all customers at once.
proxy_cidrs_ready=true
for cidr in "${vswitch_cidrs[@]}"; do
  if [[ -n "$cidr" && ",$ACK_GATEWAY_TRUSTED_PROXY_CIDRS," != *",$cidr,"* ]]; then
    proxy_cidrs_ready=false
  fi
done
if [[ "$proxy_cidrs_ready" == true ]]; then
  pass "gateway trustedProxyCidrs covers every ACK workload vSwitch CIDR"
else
  fail "gateway trustedProxyCidrs must include every ACK workload vSwitch CIDR, or rate limits collapse onto the ALB address"
fi

if capture "$tmp_dir/security-group.json" aliyun ecs DescribeSecurityGroupAttribute \
  --RegionId "$ACK_REGION" --SecurityGroupId "$ACK_SECURITY_GROUP_ID"; then
  if [[ "$(jq -r '.VpcId // ""' "$tmp_dir/security-group.json")" == "$ACK_VPC_ID" ]]; then
    pass "staging security group belongs to the target VPC"
  else
    fail "staging security group is outside the target VPC"
  fi
else
  fail "staging security group is not readable"
fi

if capture "$tmp_dir/rds-list.json" aliyun rds DescribeDBInstances --RegionId "$ACK_REGION"; then
  rds_match="$(jq --arg id "$ACK_RDS_INSTANCE_ID" '.Items.DBInstance[]? | select(.DBInstanceId == $id)' "$tmp_dir/rds-list.json")"
  if [[ -z "$rds_match" ]]; then
    fail "RDS instance is not present in the target region"
  elif [[ "$(jq -r '.VpcId // ""' <<<"$rds_match")" != "$ACK_VPC_ID" ]]; then
    fail "RDS instance is outside the target VPC"
  elif [[ "$(jq -r '.DBInstanceStatus // ""' <<<"$rds_match")" != "Running" ]]; then
    fail "RDS instance is not running"
  else
    pass "RDS is running in the target VPC"
  fi
else
  fail "RDS inventory is not readable"
fi

if capture "$tmp_dir/redis.json" aliyun r-kvstore DescribeInstances \
  --RegionId "$ACK_REGION" --InstanceIds "$ACK_REDIS_INSTANCE_ID"; then
  redis_match="$(jq -r '.Instances.KVStoreInstance[0] // empty' "$tmp_dir/redis.json")"
  if [[ -z "$redis_match" ]]; then
    fail "Redis instance is not present in the target region"
  elif [[ "$(jq -r '.VpcId // ""' <<<"$redis_match")" != "$ACK_VPC_ID" ]]; then
    fail "Redis instance is outside the target VPC"
  elif [[ "$(jq -r '.InstanceStatus // ""' <<<"$redis_match")" != "Normal" ]]; then
    fail "Redis instance is not normal"
  else
    pass "Redis is healthy in the target VPC"
  fi
else
  fail "Redis inventory is not readable"
fi

whitelist_ready=true
if capture "$tmp_dir/rds-whitelist.json" aliyun rds DescribeDBInstanceIPArrayList \
  --RegionId "$ACK_REGION" --DBInstanceId "$ACK_RDS_INSTANCE_ID"; then
  rds_ips="$(jq -r '[.Items.DBInstanceIPArray[]?.SecurityIPList] | join(",")' "$tmp_dir/rds-whitelist.json")"
  for cidr in "${vswitch_cidrs[@]}"; do
    if [[ -n "$cidr" && ",$rds_ips," != *",$cidr,"* && ",$rds_ips," != *",0.0.0.0/0,"* ]]; then
      whitelist_ready=false
    fi
  done
else
  whitelist_ready=false
fi
if [[ "$whitelist_ready" == true ]]; then
  pass "RDS whitelist covers the ACK workload vSwitch CIDRs"
else
  warn "RDS whitelist does not yet cover every ACK workload vSwitch CIDR"
fi

whitelist_ready=true
if capture "$tmp_dir/redis-whitelist.json" aliyun r-kvstore DescribeSecurityIps \
  --RegionId "$ACK_REGION" --InstanceId "$ACK_REDIS_INSTANCE_ID"; then
  redis_ips="$(jq -r '[.SecurityIpGroups.SecurityIpGroup[]?.SecurityIpList] | join(",")' "$tmp_dir/redis-whitelist.json")"
  for cidr in "${vswitch_cidrs[@]}"; do
    if [[ -n "$cidr" && ",$redis_ips," != *",$cidr,"* && ",$redis_ips," != *",0.0.0.0/0,"* ]]; then
      whitelist_ready=false
    fi
  done
else
  whitelist_ready=false
fi
if [[ "$whitelist_ready" == true ]]; then
  pass "Redis whitelist covers the ACK workload vSwitch CIDRs"
else
  warn "Redis whitelist does not yet cover every ACK workload vSwitch CIDR"
fi

heartbeat_interval_ms="${ACK_SSE_HEARTBEAT_INTERVAL_MS:-15000}"
if [[ ! "$heartbeat_interval_ms" =~ ^[0-9]+$ || "$heartbeat_interval_ms" -lt 5000 || "$heartbeat_interval_ms" -gt 45000 ]]; then
  fail "SSE heartbeat interval must be between 5000 and 45000 milliseconds"
fi
if capture "$tmp_dir/listener.json" aliyun alb GetListenerAttribute \
  --RegionId "$ACK_REGION" --ListenerId "$ACK_HTTPS_LISTENER_ID"; then
  if [[ "$(jq -r '.LoadBalancerId // ""' "$tmp_dir/listener.json")" != "$ACK_ALB_ID" ]]; then
    fail "HTTPS listener does not belong to the expected ALB"
  else
    idle_timeout_ms="$(( $(jq -r '.IdleTimeout // 0' "$tmp_dir/listener.json") * 1000 ))"
    request_timeout_ms="$(( $(jq -r '.RequestTimeout // 0' "$tmp_dir/listener.json") * 1000 ))"
    if (( heartbeat_interval_ms * 2 > idle_timeout_ms )); then
      fail "SSE heartbeat lacks a 2x safety margin below the ALB idle timeout"
    elif (( heartbeat_interval_ms * 2 > request_timeout_ms )); then
      fail "SSE heartbeat lacks a 2x safety margin below the ALB request timeout"
    else
      pass "SSE heartbeat safely fits within the ALB timeout limits"
    fi
  fi
else
  fail "HTTPS listener is not readable"
fi

if capture "$tmp_dir/server-groups.json" aliyun alb ListServerGroups --RegionId "$ACK_REGION"; then
  server_group="$(jq --arg id "$ACK_SERVER_GROUP_ID" '.ServerGroups[]? | select(.ServerGroupId == $id)' "$tmp_dir/server-groups.json")"
  if [[ -z "$server_group" ]]; then
    fail "production server group is not present"
  elif [[ "$(jq -r '.ConnectionDrainConfig.ConnectionDrainEnabled // false' <<<"$server_group")" != "true" ]]; then
    fail "production server group connection draining is disabled"
  elif (( $(jq -r '.ConnectionDrainConfig.ConnectionDrainTimeout // 0' <<<"$server_group") < 600 )); then
    fail "production server group drain timeout is below 600 seconds"
  else
    pass "production server group connection draining satisfies the gate"
  fi
else
  fail "ALB server groups are not readable"
fi

if capture "$tmp_dir/acr.json" aliyun cr ListInstance --RegionId "$ACK_REGION"; then
  if (( $(jq -r '.TotalCount // (.Instances | length) // 0' "$tmp_dir/acr.json") == 0 )); then
    fail "no ACR instance exists in the target region"
  else
    pass "ACR instance exists in the target region"
  fi
else
  fail "ACR inventory is not readable"
fi

if aliyun alidns DescribeDomainInfo --DomainName "$ACK_DNS_DOMAIN" >/dev/null 2>&1; then
  pass "DNS zone is manageable by the active Alibaba Cloud identity"
else
  warn "DNS zone is not manageable by the active Alibaba Cloud identity"
fi

printf '\nSUMMARY failures=%d warnings=%d\n' "$failures" "$warnings"
if (( failures > 0 )); then
  exit 1
fi
