#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: prepare-ack-gateway-auth.sh --htpasswd-file PATH [--namespace NAME] [--apply]

Validates an existing Apache htpasswd file without printing usernames or hashes.
Without --apply this command is read-only. With --apply it streams the Secret
manifest directly to kubectl and does not save rendered credentials to disk.
EOF
}

htpasswd_file=""
namespace="nexusflow-staging"
apply=false
while (( $# > 0 )); do
  case "$1" in
    --htpasswd-file)
      htpasswd_file="${2:-}"
      shift 2
      ;;
    --namespace)
      namespace="${2:-}"
      shift 2
      ;;
    --apply)
      apply=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$htpasswd_file" || ! -f "$htpasswd_file" ]]; then
  echo "a readable --htpasswd-file is required" >&2
  exit 1
fi
if [[ ! "$namespace" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]; then
  echo "invalid Kubernetes namespace" >&2
  exit 1
fi

if stat -c '%a' "$htpasswd_file" >/dev/null 2>&1; then
  mode="$(stat -c '%a' "$htpasswd_file")"
else
  mode="$(stat -f '%Lp' "$htpasswd_file")"
fi
if (( (8#$mode & 8#077) != 0 )); then
  echo "htpasswd file must not be readable or writable by group/other" >&2
  exit 1
fi

entry_count=0
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" ]] && continue
  if [[ ! "$line" =~ ^[^:[:space:]]+:(\$2[aby]\$|\$apr1\$|\{SHA\}|\{SSHA\}).+ ]]; then
    echo "htpasswd file contains an unsupported or plaintext entry" >&2
    exit 1
  fi
  entry_count=$((entry_count + 1))
done < "$htpasswd_file"

if (( entry_count == 0 )); then
  echo "htpasswd file has no credential entries" >&2
  exit 1
fi
echo "gateway auth validation passed (${entry_count} hashed credential entry/entries; values not displayed)"

if [[ "$apply" != true ]]; then
  exit 0
fi
command -v kubectl >/dev/null 2>&1 || {
  echo "kubectl is required with --apply" >&2
  exit 1
}

kubectl create secret generic nexusflow-gateway-auth \
  --namespace "$namespace" \
  --from-file=".htpasswd=$htpasswd_file" \
  --dry-run=client -o json \
  | kubectl apply -f - >/dev/null

stored_keys="$(kubectl get secret nexusflow-gateway-auth \
  --namespace "$namespace" -o json | jq -r '.data | keys | length')"
if [[ "$stored_keys" != "1" ]]; then
  echo "gateway auth Secret verification failed" >&2
  exit 1
fi
echo "gateway auth Secret applied and key count verified (values not displayed)"
