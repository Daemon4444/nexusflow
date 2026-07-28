#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_NODE_HELPER="$SCRIPT_DIR/nginx-health-drain-node.sh"
NODE_HELPER="${NEXUSFLOW_INSTALLED_NODE_DRAIN_HELPER:-/usr/local/sbin/nexusflow-nginx-health-drain-node}"
SITE_CONFIG="${1:-}"
NODE_ID="${2:-}"
CONFIG_ROOT="${NEXUSFLOW_NGINX_CONFIG_ROOT:-/etc/nginx/conf.d}"
DRAIN_CONFIG="${NEXUSFLOW_NGINX_DRAIN_CONFIG:-/etc/nginx/nexusflow-drain.conf}"
AUDIO_GUARD_CONFIG="${NEXUSFLOW_NGINX_AUDIO_GUARD_CONFIG:-$CONFIG_ROOT/nexusflow-audio-guards.conf}"
INCLUDE_LINE="    include $DRAIN_CONFIG;"

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
case "$CONFIG_ROOT:$SITE_CONFIG:$DRAIN_CONFIG:$AUDIO_GUARD_CONFIG:$NODE_HELPER" in
  *[!A-Za-z0-9_./:-]*) die "nginx control paths contain unsafe characters" ;;
esac
case "$AUDIO_GUARD_CONFIG" in
  "$CONFIG_ROOT"/*.conf) ;;
  *) die "audio ingress guard config must be an explicit file under $CONFIG_ROOT" ;;
esac
test -f "$SITE_CONFIG" || die "site config is missing: $SITE_CONFIG"
test -x "$SOURCE_NODE_HELPER" || die "node drain helper source is unavailable: $SOURCE_NODE_HELPER"
test "$(stat -c '%u' "$SITE_CONFIG")" = "0" || die "site config must be owned by root"
test "$(stat -c '%u' "$SOURCE_NODE_HELPER")" = "0" || die "node helper source must be owned by root"
HELPER_MODE="$(stat -c '%a' "$SOURCE_NODE_HELPER")"
HELPER_PERMISSIONS=$((8#$HELPER_MODE))
test $((HELPER_PERMISSIONS & 0022)) -eq 0 ||
  die "node helper source must not be group/world writable (mode $HELPER_MODE)"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SITE_BACKUP="${SITE_CONFIG}.pre-health-drain-${STAMP}-$$"
DRAIN_BACKUP=""
HELPER_BACKUP=""
AUDIO_GUARD_BACKUP=""
DRAIN_PARENT="$(dirname "$DRAIN_CONFIG")"
HELPER_PARENT="$(dirname "$NODE_HELPER")"
AUDIO_GUARD_PARENT="$(dirname "$AUDIO_GUARD_CONFIG")"
test -d "$DRAIN_PARENT" || die "drain config parent is missing: $DRAIN_PARENT"
test -d "$HELPER_PARENT" || die "installed helper parent is missing: $HELPER_PARENT"
test -d "$AUDIO_GUARD_PARENT" || die "audio guard config parent is missing: $AUDIO_GUARD_PARENT"
TEMPORARY="$(mktemp "$DRAIN_PARENT/.nexusflow-drain.install.XXXXXX")"
HELPER_TEMPORARY="$(mktemp "$HELPER_PARENT/.nexusflow-drain-helper.install.XXXXXX")"
AUDIO_GUARD_TEMPORARY="$(mktemp "$AUDIO_GUARD_PARENT/.nexusflow-audio-guard.install.XXXXXX")"
INSTALLED=false
HELPER_CHANGED=false
DRAIN_CHANGED=false
AUDIO_GUARD_CHANGED=false

rollback_install() {
  local code=$?
  rm -f -- "$TEMPORARY" "$HELPER_TEMPORARY" "$AUDIO_GUARD_TEMPORARY"
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
    nginx -t >/dev/null 2>&1 || true
    nginx -s reload >/dev/null 2>&1 || true
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

"$NODE_HELPER" render "$existing_state" "$NODE_ID" > "$TEMPORARY"
chown root:root "$TEMPORARY"
chmod 0644 "$TEMPORARY"
mv -f -- "$TEMPORARY" "$DRAIN_CONFIG"
DRAIN_CHANGED=true

server_count="$(grep -Ec '^[[:space:]]*server[[:space:]]*\{' "$SITE_CONFIG")"
test "$server_count" -gt 0 || die "site config has no server blocks"
include_count="$(grep -Fxc "$INCLUDE_LINE" "$SITE_CONFIG" || true)"
if test "$include_count" -eq 0; then
  perl -0pi -e \
    "s#(^[[:space:]]*server[[:space:]]*\\{[[:space:]]*\$)#\$1\\n$INCLUDE_LINE#mg" \
    "$SITE_CONFIG"
  include_count="$(grep -Fxc "$INCLUDE_LINE" "$SITE_CONFIG" || true)"
fi
test "$include_count" -eq "$server_count" ||
  die "expected one drain include in each of $server_count server blocks, found $include_count"

chown root:root "$SITE_CONFIG" "$DRAIN_CONFIG" "$AUDIO_GUARD_CONFIG"
chmod 0644 "$SITE_CONFIG" "$DRAIN_CONFIG" "$AUDIO_GUARD_CONFIG"
nginx -t >/dev/null
nginx -s reload
"$NODE_HELPER" direct-probe >/dev/null

INSTALLED=true
trap - EXIT INT TERM
rm -f -- "$TEMPORARY" "$HELPER_TEMPORARY" "$AUDIO_GUARD_TEMPORARY"
if test -n "$DRAIN_BACKUP"; then
  rm -f -- "$DRAIN_BACKUP"
fi
if test -n "$HELPER_BACKUP"; then
  rm -f -- "$HELPER_BACKUP"
fi
if test -n "$AUDIO_GUARD_BACKUP"; then
  rm -f -- "$AUDIO_GUARD_BACKUP"
fi
printf '[nginx-drain-install] installed node=%s site=%s backup=%s\n' \
  "$NODE_ID" "$SITE_CONFIG" "$SITE_BACKUP" >&2
