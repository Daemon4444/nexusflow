#!/usr/bin/env bash
# Offline tests for check-backup-freshness.sh and the cron template.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CHECK="$SCRIPT_DIR/check-backup-freshness.sh"
FIXTURE="$(mktemp -d /tmp/nexusflow-backup-freshness.XXXXXX)"
trap 'case "$FIXTURE" in /tmp/nexusflow-backup-freshness.*) rm -rf -- "$FIXTURE";; esac' EXIT
failures=0
expect() {
  local label="$1" want="$2"; shift 2
  local got=0
  "$@" >/dev/null 2>"$FIXTURE/err" || got=$?
  if { test "$want" = 0 && test "$got" = 0; } || { test "$want" != 0 && test "$got" != 0; }; then
    printf 'ok - %s\n' "$label"
  else
    printf 'not ok - %s (exit %s) %s\n' "$label" "$got" "$(cat "$FIXTURE/err")"
    failures=$((failures + 1))
  fi
}
now="$(date +%s)"
mkdir -p "$FIXTURE/backups"
export NEXUSFLOW_DB_BACKUP_DIR="$FIXTURE/backups"
export NEXUSFLOW_BACKUP_NOW_EPOCH="$now"

expect "empty directory fails" 1 "$CHECK"
head -c 70000 /dev/zero > "$FIXTURE/backups/a.dump.age"
touch -d "@$((now - 3600))" "$FIXTURE/backups/a.dump.age"
expect "fresh backup passes" 0 "$CHECK"
touch -d "@$((now - 27 * 3600))" "$FIXTURE/backups/a.dump.age"
expect "27h old backup fails" 1 "$CHECK"
head -c 100 /dev/zero > "$FIXTURE/backups/b.dump.age"
touch -d "@$((now - 60))" "$FIXTURE/backups/b.dump.age"
expect "tiny newest backup fails" 1 "$CHECK"
head -c 70000 /dev/zero > "$FIXTURE/backups/c.dump.age"
touch -d "@$((now - 30))" "$FIXTURE/backups/c.dump.age"
head -c 70000 /dev/zero > "$FIXTURE/backups/ignored.dump"
expect "newest valid backup wins" 0 "$CHECK"
expect "missing directory fails" 1 env NEXUSFLOW_DB_BACKUP_DIR="$FIXTURE/none" "$CHECK"

cat > "$FIXTURE/notify" <<NOTIFY
#!/usr/bin/env bash
printf '%s|%s\n' "\$1" "\$2" > "$FIXTURE/notified"
NOTIFY
chmod +x "$FIXTURE/notify"
rm -f "$FIXTURE/backups/"*
NEXUSFLOW_BACKUP_NOTIFY_COMMAND="$FIXTURE/notify" "$CHECK" >/dev/null 2>&1 || true
if grep -q '^critical|' "$FIXTURE/notified" 2>/dev/null; then
  printf 'ok - failure invokes notify command\n'
else
  printf 'not ok - failure invokes notify command\n'; failures=$((failures + 1))
fi

CRON="$ROOT/ops/cron/nexusflow-db-backup.cron"
if grep -q '^PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin$' "$CRON" &&
  grep -q '>> /var/log/nexusflow/db-backup.log 2>&1' "$CRON" &&
  grep -q 'daily-db-backup.sh' "$CRON" && grep -q 'check-backup-freshness.sh' "$CRON"; then
  printf 'ok - cron template pins PATH and log redirection\n'
else
  printf 'not ok - cron template pins PATH and log redirection\n'; failures=$((failures + 1))
fi

test "$failures" -eq 0 || { printf '%d backup freshness test(s) failed\n' "$failures" >&2; exit 1; }
printf 'backup-freshness-ok\n'
