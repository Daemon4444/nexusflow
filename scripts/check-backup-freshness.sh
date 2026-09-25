#!/usr/bin/env bash
#
# Fails (non-zero) when the newest encrypted database dump (*.dump.age) is
# older than the allowed age, is missing, or is implausibly small.
#
# Environment:
#   NEXUSFLOW_DB_BACKUP_DIR          directory to scan
#                                    (default /root/backups/nexusflow/releases)
#   NEXUSFLOW_BACKUP_MAX_AGE_HOURS   default 26
#   NEXUSFLOW_BACKUP_MIN_BYTES       default 65536 (matches db-backup-hook.sh)
#   NEXUSFLOW_BACKUP_NOTIFY_COMMAND  optional executable invoked with
#                                    "<severity> <reason>" on failure, e.g. a
#                                    wrapper around the backend notifier CLI.
#   NEXUSFLOW_BACKUP_NOW_EPOCH       test hook: override "now" (seconds)

set -euo pipefail

BACKUP_DIR="${NEXUSFLOW_DB_BACKUP_DIR:-/root/backups/nexusflow/releases}"
MAX_AGE_HOURS="${NEXUSFLOW_BACKUP_MAX_AGE_HOURS:-26}"
MIN_BYTES="${NEXUSFLOW_BACKUP_MIN_BYTES:-65536}"
NOTIFY_COMMAND="${NEXUSFLOW_BACKUP_NOTIFY_COMMAND:-}"

case "$MAX_AGE_HOURS:$MIN_BYTES" in
  *[!0-9:]*) printf '[backup-freshness] ERROR: numeric settings expected\n' >&2; exit 2 ;;
esac

report_failure() {
  local reason="$1"
  printf '[backup-freshness] %s FAIL: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$reason" >&2
  if test -n "$NOTIFY_COMMAND"; then
    "$NOTIFY_COMMAND" critical "$reason" || \
      printf '[backup-freshness] WARNING: notify command failed\n' >&2
  fi
  exit 1
}

test -d "$BACKUP_DIR" || report_failure "backup directory is missing: $BACKUP_DIR"

newest=""
newest_mtime=0
while IFS= read -r -d '' file; do
  mtime="$(stat -c '%Y' "$file")"
  if test "$mtime" -gt "$newest_mtime"; then
    newest="$file"
    newest_mtime="$mtime"
  fi
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump.age' -print0)

test -n "$newest" || report_failure "no *.dump.age backup exists in $BACKUP_DIR"

now="${NEXUSFLOW_BACKUP_NOW_EPOCH:-$(date +%s)}"
age_seconds=$((now - newest_mtime))
max_seconds=$((MAX_AGE_HOURS * 3600))
size="$(stat -c '%s' "$newest")"

if test "$age_seconds" -gt "$max_seconds"; then
  report_failure "newest backup $(basename "$newest") is $((age_seconds / 3600))h old (limit ${MAX_AGE_HOURS}h)"
fi
if test "$size" -lt "$MIN_BYTES"; then
  report_failure "newest backup $(basename "$newest") is only ${size} bytes (minimum ${MIN_BYTES})"
fi

printf '[backup-freshness] ok: %s age=%sh size=%s\n' \
  "$(basename "$newest")" "$((age_seconds / 3600))" "$size"
