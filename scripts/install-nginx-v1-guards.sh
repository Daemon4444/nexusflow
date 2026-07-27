#!/usr/bin/env bash
set -euo pipefail

ROOT="${NEXUSFLOW_ROOT:-/root/distiny/nexusflow}"
SITE_CONFIG="${1:-}"

if [[ -z "$SITE_CONFIG" || ! -f "$SITE_CONFIG" ]]; then
  echo "Usage: $0 /etc/nginx/conf.d/<nexusflow-site>.conf" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP="${SITE_CONFIG}.pre-v1-guards-${STAMP}"
cp -a "$SITE_CONFIG" "$BACKUP"

install -d -m 0755 /etc/nginx/snippets
install -m 0644 \
  "$ROOT/ops/nginx/nexusflow-v1-zones.conf" \
  /etc/nginx/conf.d/00-nexusflow-v1-zones.conf
install -m 0644 \
  "$ROOT/ops/nginx/nexusflow-v1-location.conf" \
  /etc/nginx/snippets/nexusflow-v1-location.conf

if ! grep -q "nexusflow-v1-location.conf" "$SITE_CONFIG"; then
  perl -0pi -e \
    's#(location /v1/ \{\n)#$1        include /etc/nginx/snippets/nexusflow-v1-location.conf;\n#g' \
    "$SITE_CONFIG"
  if ! grep -q "nexusflow-v1-location.conf" "$SITE_CONFIG"; then
    cp -a "$BACKUP" "$SITE_CONFIG"
    echo "Could not locate a location /v1/ block in $SITE_CONFIG" >&2
    exit 1
  fi
fi

if ! nginx -t; then
  cp -a "$BACKUP" "$SITE_CONFIG"
  nginx -t
  echo "nginx validation failed; restored $SITE_CONFIG from $BACKUP" >&2
  exit 1
fi
nginx -s reload

echo "Installed NexusFlow /v1 guards in $SITE_CONFIG"
