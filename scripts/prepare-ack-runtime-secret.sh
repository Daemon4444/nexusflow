#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  prepare-ack-runtime-secret.sh --env-file PATH [--namespace NAME] [--secret-name NAME] [--apply]

Without --apply, only validates file permissions, key names, required values and
forbidden proxy variables. Secret values are never printed. With --apply, the
validated env file is sent directly to kubectl and no rendered Secret is saved.
USAGE
}

env_file=""
namespace="nexusflow-staging"
secret_name="nexusflow-runtime-secrets"
apply=false

while (($#)); do
  case "$1" in
    --env-file) env_file="${2:-}"; shift 2 ;;
    --namespace) namespace="${2:-}"; shift 2 ;;
    --secret-name) secret_name="${2:-}"; shift 2 ;;
    --apply) apply=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "$env_file" && -f "$env_file" ]] || {
  echo "A readable --env-file is required" >&2
  exit 2
}

if stat -c '%a' "$env_file" >/dev/null 2>&1; then
  permission_mode=$(stat -c '%a' "$env_file")
else
  permission_mode=$(stat -f '%Lp' "$env_file")
fi
permission_bits=$((8#$permission_mode))
if (( (permission_bits & 0077) != 0 )); then
  echo "Env file must not be readable or writable by group/other (mode: $permission_mode)" >&2
  exit 1
fi

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/nexusflow-ack-secret.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT
keys_file="$work_dir/keys"
awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1}' "$env_file" > "$keys_file"

duplicates=$(sort "$keys_file" | uniq -d)
if [[ -n "$duplicates" ]]; then
  echo "Duplicate env keys are not allowed:" >&2
  printf '%s\n' "$duplicates" >&2
  exit 1
fi

for forbidden in HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy; do
  if grep -Fxq "$forbidden" "$keys_file"; then
    echo "Forbidden managed-runtime proxy variable: $forbidden" >&2
    exit 1
  fi
done

required_keys=(
  ADMIN_EMAILS
  ALIPAY_APP_ID ALIPAY_GATEWAY ALIPAY_NOTIFY_URL ALIPAY_PRIVATE_KEY
  ALIPAY_PUBLIC_KEY ALIPAY_RETURN_URL
  DASHSCOPE_API_KEY
  OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_SECRET OSS_BUCKET OSS_ENDPOINT
  PG_DATABASE PG_HOST PG_PASSWORD PG_PORT PG_USER
  PROVIDER_OUTBOUND_HOST_ALLOWLIST PROVIDER_SECRET_KEY PUBLIC_BASE_URL
  REDIS_HOST REDIS_PASSWORD REDIS_PORT
  SLS_ACCESS_KEY_ID SLS_ACCESS_KEY_SECRET SLS_LOGSTORE SLS_PROJECT SLS_REGION
  SMTP_FROM SMTP_HOST SMTP_PASS SMTP_PORT SMTP_USER
)

for key in "${required_keys[@]}"; do
  if ! grep -Fxq "$key" "$keys_file"; then
    echo "Missing required runtime key: $key" >&2
    exit 1
  fi
  if ! awk -F= -v key="$key" '$1 == key { value=substr($0, index($0, "=") + 1); found=1 } END { exit !(found && length(value) > 0) }' "$env_file"; then
    echo "Required runtime key is empty: $key" >&2
    exit 1
  fi
done

key_count=$(wc -l < "$keys_file" | tr -d ' ')
echo "ACK runtime env validation passed ($key_count keys; values not displayed)"

if [[ "$apply" != true ]]; then
  exit 0
fi

command -v kubectl >/dev/null 2>&1 || {
  echo "kubectl is required for --apply" >&2
  exit 1
}

kubectl get namespace "$namespace" >/dev/null
kubectl create secret generic "$secret_name" \
  --namespace "$namespace" \
  --from-env-file="$env_file" \
  --dry-run=client \
  -o json \
  | kubectl apply -f - >/dev/null

stored_count=$(kubectl get secret "$secret_name" -n "$namespace" -o json \
  | jq '.data | keys | length')
if [[ "$stored_count" != "$key_count" ]]; then
  echo "Secret key-count mismatch: expected $key_count, stored $stored_count" >&2
  exit 1
fi
echo "Secret applied to $namespace/$secret_name ($stored_count keys; values not displayed)"
