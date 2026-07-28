#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/release-common.sh
source "$SCRIPT_DIR/release-common.sh"

ROOT="${NEXUSFLOW_ROOT:-/root/distiny/nexusflow}"
CURRENT_LINK="${NEXUSFLOW_CURRENT_LINK:-/root/distiny/nexusflow-current}"
BACKUP_DIR="${NEXUSFLOW_DB_BACKUP_DIR:-/root/backups/nexusflow/releases}"
BACKUP_HOOK="${NEXUSFLOW_DB_BACKUP_HOOK:-$ROOT/scripts/db-backup-hook.sh}"
RETENTION_DAYS="${NEXUSFLOW_DB_BACKUP_RETENTION_DAYS:-14}"
LOCK_FILE="${NEXUSFLOW_DB_BACKUP_LOCK_FILE:-/run/lock/nexusflow-db-backup.lock}"

case "$ROOT:$CURRENT_LINK:$BACKUP_DIR:$BACKUP_HOOK:$LOCK_FILE" in
  *[!A-Za-z0-9_./:@-]*) release_die "backup paths may only contain safe path characters" ;;
esac
case "$RETENTION_DAYS" in
  ''|*[!0-9]*) release_die "NEXUSFLOW_DB_BACKUP_RETENTION_DAYS must be a positive integer" ;;
esac
test "$RETENTION_DAYS" -gt 0 ||
  release_die "NEXUSFLOW_DB_BACKUP_RETENTION_DAYS must be positive"

release_require_command flock
release_require_command node
release_validate_secure_hook "$BACKUP_HOOK"

validate_private_backup_directory() {
  local owner
  local group
  local mode
  test -d "$BACKUP_DIR" && test ! -L "$BACKUP_DIR" ||
    release_die "backup directory is missing or is a symlink: $BACKUP_DIR"
  owner="$(stat -c '%u' "$BACKUP_DIR")"
  group="$(stat -c '%g' "$BACKUP_DIR")"
  mode="$(stat -c '%a' "$BACKUP_DIR")"
  test "$owner:$group:$mode" = "0:0:700" ||
    release_die "backup directory must be root:root mode 0700 ($owner:$group:$mode)"
}

validate_private_backup_file() {
  local backup="$1"
  local owner
  local group
  local mode
  validate_private_backup_directory
  test -f "$backup" && test ! -L "$backup" ||
    release_die "backup is not a regular file: $backup"
  owner="$(stat -c '%u' "$backup")"
  group="$(stat -c '%g' "$backup")"
  mode="$(stat -c '%a' "$backup")"
  test "$owner:$group:$mode" = "0:0:600" ||
    release_die "backup must be root:root mode 0600: $backup ($owner:$group:$mode)"
}

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || release_die "another NexusFlow database backup is already running"

APP_ROOT="$ROOT"
if resolved="$(release_resolve_path "$CURRENT_LINK" 2>/dev/null)"; then
  APP_ROOT="$resolved"
fi

BUILD_INFO="$APP_ROOT/backend/dist/build-info.json"
test -r "$BUILD_INFO" || release_die "deployed build metadata is unreadable: $BUILD_INFO"
BUILD_SHA="$(
  node -e '
    const fs = require("fs");
    const sha = String(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).sha || "");
    if (!/^[0-9a-f]{40}$/i.test(sha)) process.exit(1);
    process.stdout.write(sha.toLowerCase());
  ' "$BUILD_INFO"
)" || release_die "deployed build metadata has no valid SHA"

BACKUP_PATH="$("$BACKUP_HOOK" backup "$BUILD_SHA")"
test -n "$BACKUP_PATH" && test -f "$BACKUP_PATH" ||
  release_die "database backup hook returned no verified backup"
"$BACKUP_HOOK" restore-verify "$BACKUP_PATH"
validate_private_backup_file "$BACKUP_PATH"

while IFS= read -r -d '' existing; do
  validate_private_backup_file "$existing"
done < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f \
    -name 'nexusflow-pre-release-*.dump.age' \
    -print0
)

while IFS= read -r -d '' expired; do
  case "$expired" in
    "$BACKUP_DIR"/nexusflow-pre-release-*.dump.age) unlink "$expired" ;;
    *) release_die "refusing to remove unexpected backup path: $expired" ;;
  esac
done < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f \
    -name 'nexusflow-pre-release-*.dump.age' \
    -mtime "+$RETENTION_DAYS" \
    -print0
)

release_log "daily database backup verified: $BACKUP_PATH"
