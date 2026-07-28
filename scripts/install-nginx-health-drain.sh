#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_NODE_HELPER="$SCRIPT_DIR/nginx-health-drain-node.sh"
SOURCE_V1_LOCATION="${NEXUSFLOW_SOURCE_V1_LOCATION_CONFIG:-$SCRIPT_DIR/../ops/nginx/nexusflow-v1-location.conf}"
NODE_HELPER="${NEXUSFLOW_INSTALLED_NODE_DRAIN_HELPER:-/usr/local/sbin/nexusflow-nginx-health-drain-node}"
SITE_CONFIG="${1:-}"
NODE_ID="${2:-}"
CONFIG_ROOT="${NEXUSFLOW_NGINX_CONFIG_ROOT:-/etc/nginx/conf.d}"
SNIPPET_ROOT="${NEXUSFLOW_NGINX_SNIPPET_ROOT:-/etc/nginx/snippets}"
DRAIN_CONFIG="${NEXUSFLOW_NGINX_DRAIN_CONFIG:-/etc/nginx/nexusflow-drain.conf}"
AUDIO_GUARD_CONFIG="${NEXUSFLOW_NGINX_AUDIO_GUARD_CONFIG:-$CONFIG_ROOT/nexusflow-audio-guards.conf}"
V1_LOCATION_CONFIG="${NEXUSFLOW_NGINX_V1_LOCATION_CONFIG:-$SNIPPET_ROOT/nexusflow-v1-location.conf}"

die() {
  printf '[nginx-drain-install] ERROR: %s\n' "$*" >&2
  exit 1
}

test "$(id -u)" = "0" || die "installer must run as root"
test "$#" -eq 2 || die "usage: $0 /etc/nginx/conf.d/<nexusflow-site>.conf <node-id>"
case "$SITE_CONFIG" in
  "$CONFIG_ROOT"/*.conf) ;;
  *) die "site config must be an explicit file under $CONFIG_ROOT" ;;
esac
case "$NODE_ID" in
  ''|*[!A-Za-z0-9_.-]*) die "invalid node ID" ;;
esac
case "$CONFIG_ROOT:$SNIPPET_ROOT:$SITE_CONFIG:$DRAIN_CONFIG:$AUDIO_GUARD_CONFIG:$V1_LOCATION_CONFIG:$NODE_HELPER:$SOURCE_V1_LOCATION" in
  *[!A-Za-z0-9_./:-]*) die "nginx control paths contain unsafe characters" ;;
esac
case "$AUDIO_GUARD_CONFIG" in
  "$CONFIG_ROOT"/*.conf) ;;
  *) die "audio ingress guard config must be an explicit file under $CONFIG_ROOT" ;;
esac
case "$V1_LOCATION_CONFIG" in
  "$SNIPPET_ROOT"/*.conf) ;;
  *) die "v1 location policy must be an explicit file under $SNIPPET_ROOT" ;;
esac
test -f "$SITE_CONFIG" || die "site config is missing: $SITE_CONFIG"
test -x "$SOURCE_NODE_HELPER" || die "node drain helper source is unavailable: $SOURCE_NODE_HELPER"
test -f "$SOURCE_V1_LOCATION" ||
  die "v1 location policy source is unavailable: $SOURCE_V1_LOCATION"
test "$(stat -c '%u' "$SITE_CONFIG")" = "0" || die "site config must be owned by root"
test "$(stat -c '%u' "$SOURCE_NODE_HELPER")" = "0" || die "node helper source must be owned by root"
test "$(stat -c '%u' "$SOURCE_V1_LOCATION")" = "0" ||
  die "v1 location policy source must be owned by root"
HELPER_MODE="$(stat -c '%a' "$SOURCE_NODE_HELPER")"
HELPER_PERMISSIONS=$((8#$HELPER_MODE))
test $((HELPER_PERMISSIONS & 0022)) -eq 0 ||
  die "node helper source must not be group/world writable (mode $HELPER_MODE)"
V1_SOURCE_MODE="$(stat -c '%a' "$SOURCE_V1_LOCATION")"
V1_SOURCE_PERMISSIONS=$((8#$V1_SOURCE_MODE))
test $((V1_SOURCE_PERMISSIONS & 0022)) -eq 0 ||
  die "v1 location policy source must not be group/world writable (mode $V1_SOURCE_MODE)"

nginx -t >/dev/null
nginx -T 2>&1 | grep -F "# configuration file $SITE_CONFIG:" >/dev/null ||
  die "site config is not loaded by nginx: $SITE_CONFIG"

server_count="$(grep -Ec '^[[:space:]]*server[[:space:]]*\{' "$SITE_CONFIG")"
test "$server_count" -gt 0 || die "site config has no server blocks"
v1_location_count="$(
  grep -Ec '^[[:space:]]*location[[:space:]]+(\^~[[:space:]]+)?/v1/[[:space:]]*\{' \
    "$SITE_CONFIG" || true
)"
test "$v1_location_count" -eq "$server_count" ||
  die "every NexusFlow server block must contain exactly one /v1/ location"
v1_include_count="$(
  awk -v managed="include $V1_LOCATION_CONFIG;" '
    {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+$/, "", line)
      if (line == managed) count++
    }
    END { print count + 0 }
  ' "$SITE_CONFIG"
)"
test "$v1_include_count" -eq "$server_count" ||
  die "every /v1/ location must include the release-managed v1 policy"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SITE_BACKUP="${SITE_CONFIG}.pre-health-drain-${STAMP}-$$"
DRAIN_BACKUP=""
HELPER_BACKUP=""
AUDIO_GUARD_BACKUP=""
V1_LOCATION_BACKUP=""
DRAIN_PARENT="$(dirname "$DRAIN_CONFIG")"
HELPER_PARENT="$(dirname "$NODE_HELPER")"
AUDIO_GUARD_PARENT="$(dirname "$AUDIO_GUARD_CONFIG")"
V1_LOCATION_PARENT="$(dirname "$V1_LOCATION_CONFIG")"
SITE_PARENT="$(dirname "$SITE_CONFIG")"
test -d "$DRAIN_PARENT" || die "drain config parent is missing: $DRAIN_PARENT"
test -d "$HELPER_PARENT" || die "installed helper parent is missing: $HELPER_PARENT"
test -d "$AUDIO_GUARD_PARENT" || die "audio guard config parent is missing: $AUDIO_GUARD_PARENT"
test -d "$V1_LOCATION_PARENT" ||
  die "v1 location policy parent is missing: $V1_LOCATION_PARENT"
test -d "$SITE_PARENT" || die "site config parent is missing: $SITE_PARENT"
TEMPORARY="$(mktemp "$DRAIN_PARENT/.nexusflow-drain.install.XXXXXX")"
HELPER_TEMPORARY="$(mktemp "$HELPER_PARENT/.nexusflow-drain-helper.install.XXXXXX")"
AUDIO_GUARD_TEMPORARY="$(mktemp "$AUDIO_GUARD_PARENT/.nexusflow-audio-guard.install.XXXXXX")"
V1_LOCATION_TEMPORARY="$(mktemp "$V1_LOCATION_PARENT/.nexusflow-v1-location.install.XXXXXX")"
SITE_TEMPORARY="$(mktemp "$SITE_PARENT/.nexusflow-site.install.XXXXXX")"
INSTALLED=false
HELPER_CHANGED=false
DRAIN_CHANGED=false
AUDIO_GUARD_CHANGED=false
V1_LOCATION_CHANGED=false

rollback_install() {
  local code=$?
  rm -f -- \
    "$TEMPORARY" \
    "$HELPER_TEMPORARY" \
    "$AUDIO_GUARD_TEMPORARY" \
    "$V1_LOCATION_TEMPORARY" \
    "$SITE_TEMPORARY"
  if test "$code" -ne 0 && ! "$INSTALLED"; then
    if test -f "$SITE_BACKUP"; then
      cp -a "$SITE_BACKUP" "$SITE_CONFIG"
    fi
    if "$DRAIN_CHANGED"; then
      if test -n "$DRAIN_BACKUP"; then
        cp -a "$DRAIN_BACKUP" "$DRAIN_CONFIG"
      else
        rm -f -- "$DRAIN_CONFIG"
      fi
    fi
    if "$HELPER_CHANGED"; then
      if test -n "$HELPER_BACKUP"; then
        cp -a "$HELPER_BACKUP" "$NODE_HELPER"
      else
        rm -f -- "$NODE_HELPER"
      fi
    fi
    if "$AUDIO_GUARD_CHANGED"; then
      if test -n "$AUDIO_GUARD_BACKUP"; then
        cp -a "$AUDIO_GUARD_BACKUP" "$AUDIO_GUARD_CONFIG"
      else
        rm -f -- "$AUDIO_GUARD_CONFIG"
      fi
    fi
    if "$V1_LOCATION_CHANGED"; then
      if test -n "$V1_LOCATION_BACKUP"; then
        cp -a "$V1_LOCATION_BACKUP" "$V1_LOCATION_CONFIG"
      else
        rm -f -- "$V1_LOCATION_CONFIG"
      fi
    fi
    if nginx -t >/dev/null 2>&1; then
      if ! nginx -s reload >/dev/null 2>&1; then
        printf '[nginx-drain-install] ERROR: restored files but nginx rollback reload failed\n' >&2
      fi
    else
      printf '[nginx-drain-install] ERROR: restored files but nginx rollback validation failed\n' >&2
    fi
  fi
  if test -n "$DRAIN_BACKUP"; then
    rm -f -- "$DRAIN_BACKUP"
  fi
  if test -n "$HELPER_BACKUP"; then
    rm -f -- "$HELPER_BACKUP"
  fi
  if test -n "$AUDIO_GUARD_BACKUP"; then
    rm -f -- "$AUDIO_GUARD_BACKUP"
  fi
  if test -n "$V1_LOCATION_BACKUP"; then
    rm -f -- "$V1_LOCATION_BACKUP"
  fi
  exit "$code"
}
trap rollback_install EXIT
trap 'exit 130' INT TERM

cp -a "$SITE_CONFIG" "$SITE_BACKUP"
if test -f "$NODE_HELPER"; then
  HELPER_BACKUP="$(mktemp "$HELPER_PARENT/.nexusflow-drain-helper.backup.XXXXXX")"
  cp -a "$NODE_HELPER" "$HELPER_BACKUP"
fi
cp "$SOURCE_NODE_HELPER" "$HELPER_TEMPORARY"
chown root:root "$HELPER_TEMPORARY"
chmod 0755 "$HELPER_TEMPORARY"
mv -f -- "$HELPER_TEMPORARY" "$NODE_HELPER"
HELPER_CHANGED=true

existing_node=""
existing_state="disabled"
if test -f "$DRAIN_CONFIG"; then
  DRAIN_BACKUP="$(mktemp "$DRAIN_PARENT/.nexusflow-drain.backup.XXXXXX")"
  cp -a "$DRAIN_CONFIG" "$DRAIN_BACKUP"
  DRAIN_CHANGED=true
  existing_node="$(sed -n 's/^# nexusflow-node-id: //p' "$DRAIN_CONFIG" | head -1)"
  existing_state="$(sed -n 's/^# nexusflow-drain-state: //p' "$DRAIN_CONFIG" | head -1)"
  test "$existing_node" = "$NODE_ID" ||
    die "existing drain config belongs to ${existing_node:-<unknown>}, not $NODE_ID"
  case "$existing_state" in
    enabled|disabled) ;;
    *) die "existing drain config has no valid managed state" ;;
  esac
fi

if test -f "$AUDIO_GUARD_CONFIG"; then
  AUDIO_GUARD_BACKUP="$(mktemp "$AUDIO_GUARD_PARENT/.nexusflow-audio-guard.backup.XXXXXX")"
  cp -a "$AUDIO_GUARD_CONFIG" "$AUDIO_GUARD_BACKUP"
fi
"$NODE_HELPER" render-audio-guard > "$AUDIO_GUARD_TEMPORARY"
chown root:root "$AUDIO_GUARD_TEMPORARY"
chmod 0644 "$AUDIO_GUARD_TEMPORARY"
mv -f -- "$AUDIO_GUARD_TEMPORARY" "$AUDIO_GUARD_CONFIG"
AUDIO_GUARD_CHANGED=true

if test -f "$V1_LOCATION_CONFIG"; then
  V1_LOCATION_BACKUP="$(mktemp "$V1_LOCATION_PARENT/.nexusflow-v1-location.backup.XXXXXX")"
  cp -a "$V1_LOCATION_CONFIG" "$V1_LOCATION_BACKUP"
fi
cp "$SOURCE_V1_LOCATION" "$V1_LOCATION_TEMPORARY"
chown root:root "$V1_LOCATION_TEMPORARY"
chmod 0644 "$V1_LOCATION_TEMPORARY"
mv -f -- "$V1_LOCATION_TEMPORARY" "$V1_LOCATION_CONFIG"
V1_LOCATION_CHANGED=true

"$NODE_HELPER" render "$existing_state" "$NODE_ID" > "$TEMPORARY"
chown root:root "$TEMPORARY"
chmod 0644 "$TEMPORARY"
mv -f -- "$TEMPORARY" "$DRAIN_CONFIG"
DRAIN_CHANGED=true

awk -v managed="include $DRAIN_CONFIG;" '
  {
    line = $0
    sub(/^[[:space:]]+/, "", line)
    sub(/[[:space:]]+$/, "", line)
    if (line == managed) next
    print
    if ($0 ~ /^[[:space:]]*server[[:space:]]*\{[[:space:]]*$/) {
      print "    " managed
    }
  }
' "$SITE_CONFIG" > "$SITE_TEMPORARY"
chown root:root "$SITE_TEMPORARY"
chmod 0644 "$SITE_TEMPORARY"
mv -f -- "$SITE_TEMPORARY" "$SITE_CONFIG"
include_count="$(
  awk -v managed="include $DRAIN_CONFIG;" '
    {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+$/, "", line)
      if (line == managed) count++
    }
    END { print count + 0 }
  ' "$SITE_CONFIG"
)"
test "$include_count" -eq "$server_count" ||
  die "expected one drain include in each of $server_count server blocks, found $include_count"

chown root:root \
  "$SITE_CONFIG" \
  "$DRAIN_CONFIG" \
  "$AUDIO_GUARD_CONFIG" \
  "$V1_LOCATION_CONFIG"
chmod 0644 \
  "$SITE_CONFIG" \
  "$DRAIN_CONFIG" \
  "$AUDIO_GUARD_CONFIG" \
  "$V1_LOCATION_CONFIG"
nginx -t >/dev/null
if ! nginx -s reload; then
  die "nginx reload failed"
fi
"$NODE_HELPER" direct-probe >/dev/null

INSTALLED=true
trap - EXIT INT TERM
rm -f -- \
  "$TEMPORARY" \
  "$HELPER_TEMPORARY" \
  "$AUDIO_GUARD_TEMPORARY" \
  "$V1_LOCATION_TEMPORARY" \
  "$SITE_TEMPORARY"
if test -n "$DRAIN_BACKUP"; then
  rm -f -- "$DRAIN_BACKUP"
fi
if test -n "$HELPER_BACKUP"; then
  rm -f -- "$HELPER_BACKUP"
fi
if test -n "$AUDIO_GUARD_BACKUP"; then
  rm -f -- "$AUDIO_GUARD_BACKUP"
fi
if test -n "$V1_LOCATION_BACKUP"; then
  rm -f -- "$V1_LOCATION_BACKUP"
fi
printf '[nginx-drain-install] installed node=%s site=%s backup=%s\n' \
  "$NODE_ID" "$SITE_CONFIG" "$SITE_BACKUP" >&2
