#!/usr/bin/env bash

set -euo pipefail
umask 077

SOURCE_HOST="${NEXUSFLOW_BACKUP_SOURCE_HOST:-root@123.57.18.215}"
SOURCE_DIR="${NEXUSFLOW_BACKUP_SOURCE_DIR:-/root/backups/nexusflow/releases}"
DEST_DIR="${NEXUSFLOW_OFFSITE_BACKUP_DIR:-/root/offsite/nexusflow-db}"
RETENTION_DAYS="${NEXUSFLOW_OFFSITE_RETENTION_DAYS:-21}"
MINIMUM_BYTES="${NEXUSFLOW_MIN_BACKUP_BYTES:-65536}"
LOCK_FILE="${NEXUSFLOW_OFFSITE_BACKUP_LOCK_FILE:-/run/lock/nexusflow-offsite-backup.lock}"
AGE_IDENTITY_FILE="${NEXUSFLOW_BACKUP_AGE_IDENTITY_FILE:-/etc/nexusflow/backup-age-identity.txt}"
POSTGRES_IMAGE="${NEXUSFLOW_POSTGRES_IMAGE:-postgres:16-alpine}"
CONTAINER_RUNTIME="${NEXUSFLOW_CONTAINER_RUNTIME:-docker}"

log() {
  printf '[offsite-db-backup] %s\n' "$*" >&2
}

die() {
  printf '[offsite-db-backup] ERROR: %s\n' "$*" >&2
  exit 1
}

for value in "$SOURCE_HOST" "$SOURCE_DIR" "$DEST_DIR" "$LOCK_FILE" "$AGE_IDENTITY_FILE" "$POSTGRES_IMAGE"; do
  case "$value" in
    *[!A-Za-z0-9_./:@-]*) die "backup source and destination contain unsafe characters" ;;
  esac
done
for value in "$RETENTION_DAYS" "$MINIMUM_BYTES"; do
  case "$value" in
    ''|*[!0-9]*) die "retention and minimum size must be positive integers" ;;
  esac
  test "$value" -gt 0 || die "retention and minimum size must be positive"
done

case "$CONTAINER_RUNTIME" in
  docker|podman) ;;
  *) die "NEXUSFLOW_CONTAINER_RUNTIME must be docker or podman" ;;
esac
for command in age "$CONTAINER_RUNTIME" flock scp ssh; do
  command -v "$command" >/dev/null 2>&1 || die "required command is unavailable: $command"
done
"$CONTAINER_RUNTIME" image inspect "$POSTGRES_IMAGE" >/dev/null 2>&1 ||
  die "required local image is unavailable: $POSTGRES_IMAGE"
"$CONTAINER_RUNTIME" run --rm "$POSTGRES_IMAGE" postgres --version |
  grep -Eq '^postgres \(PostgreSQL\) 16\.' ||
  die "offsite archive validation requires PostgreSQL major version 16"

validate_age_identity() {
  local owner
  local group
  local mode
  test -f "$AGE_IDENTITY_FILE" && test ! -L "$AGE_IDENTITY_FILE" ||
    die "offsite verification requires a regular non-symlink age identity file"
  owner="$(stat -c '%u' "$AGE_IDENTITY_FILE")"
  group="$(stat -c '%g' "$AGE_IDENTITY_FILE")"
  mode="$(stat -c '%a' "$AGE_IDENTITY_FILE")"
  test "$owner:$group:$mode" = "0:0:600" ||
    die "offsite age identity file must be root:root mode 0600"
}

verify_encrypted_archive() {
  local backup="$1"
  local -a pipeline_status=()
  age --decrypt --identity "$AGE_IDENTITY_FILE" "$backup" >/dev/null ||
    die "offsite backup failed complete authenticated age decryption"
  set +e
  age --decrypt --identity "$AGE_IDENTITY_FILE" "$backup" |
    "$CONTAINER_RUNTIME" run --rm --interactive \
      "$POSTGRES_IMAGE" \
      pg_restore --list >/dev/null
  pipeline_status=("${PIPESTATUS[@]}")
  set -e
  test "${pipeline_status[1]}" -eq 0 ||
    die "offsite backup failed PostgreSQL archive-list validation"
  case "${pipeline_status[0]}" in
    0|141) ;;
    *) die "offsite backup could not be streamed into archive validation" ;;
  esac
}

validate_age_identity

validate_private_directory() {
  local owner
  local group
  local mode
  test -d "$DEST_DIR" && test ! -L "$DEST_DIR" ||
    die "offsite backup directory is missing or is a symlink: $DEST_DIR"
  owner="$(stat -c '%u' "$DEST_DIR")"
  group="$(stat -c '%g' "$DEST_DIR")"
  mode="$(stat -c '%a' "$DEST_DIR")"
  test "$owner:$group:$mode" = "0:0:700" ||
    die "offsite backup directory must be root:root mode 0700 ($owner:$group:$mode)"
}

validate_private_file() {
  local backup="$1"
  local owner
  local group
  local mode
  test -f "$backup" && test ! -L "$backup" ||
    die "offsite backup is not a regular file: $backup"
  owner="$(stat -c '%u' "$backup")"
  group="$(stat -c '%g' "$backup")"
  mode="$(stat -c '%a' "$backup")"
  test "$owner:$group:$mode" = "0:0:600" ||
    die "offsite backup must be root:root mode 0600: $backup ($owner:$group:$mode)"
}

mkdir -p "$(dirname "$LOCK_FILE")" "$DEST_DIR"
validate_private_directory
exec 9>"$LOCK_FILE"
flock -n 9 || die "another offsite database backup pull is already running"

source_directory_security="$(
  ssh \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o StrictHostKeyChecking=yes \
    "$SOURCE_HOST" \
    "stat -c '%u:%g:%a' '$SOURCE_DIR'"
)"
test "$source_directory_security" = "0:0:700" ||
  die "source backup directory must be root:root mode 0700"

mapfile -t remote_records < <(
  ssh \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o StrictHostKeyChecking=yes \
    "$SOURCE_HOST" \
    "find '$SOURCE_DIR' -maxdepth 1 -type f -name 'nexusflow-pre-release-*.dump.age' -printf '%f\t%U\t%G\t%m\n' | LC_ALL=C sort"
)
test "${#remote_records[@]}" -gt 0 || die "source has no verified-format database backups"

latest=""
for record in "${remote_records[@]}"; do
  IFS=$'\t' read -r filename source_owner source_group source_mode <<<"$record"
  printf '%s\n' "$filename" |
    grep -Eq '^nexusflow-pre-release-[0-9]{8}T[0-9]{6}Z-[0-9a-fA-F]{40}\.dump\.age$' ||
    die "source returned an unexpected backup filename"
  test "$source_owner:$source_group:$source_mode" = "0:0:600" ||
    die "source backup must be root:root mode 0600: $filename"
  latest="$filename"
  destination="$DEST_DIR/$filename"
  if test ! -f "$destination"; then
    partial="${destination}.partial.$$"
    cleanup_partial() {
      rm -f -- "$partial"
    }
    trap cleanup_partial EXIT INT TERM
    scp \
      -q \
      -o BatchMode=yes \
      -o ConnectTimeout=15 \
      -o StrictHostKeyChecking=yes \
      "$SOURCE_HOST:$SOURCE_DIR/$filename" \
      "$partial"
    chown 0:0 "$partial"
    chmod 0600 "$partial"
    validate_private_file "$partial"
    size="$(stat -c '%s' "$partial")"
    test "$size" -ge "$MINIMUM_BYTES" ||
      die "received backup is unexpectedly small: $filename ($size bytes)"
    verify_encrypted_archive "$partial"
    mv -- "$partial" "$destination"
    validate_private_file "$destination"
    trap - EXIT INT TERM
    log "received and verified $filename ($size bytes)"
  fi
  validate_private_file "$destination"
done

test -n "$latest" || die "could not resolve the latest source backup"
latest_path="$DEST_DIR/$latest"
validate_private_file "$latest_path"
latest_size="$(stat -c '%s' "$latest_path")"
test "$latest_size" -ge "$MINIMUM_BYTES" ||
  die "latest offsite backup is unexpectedly small: $latest ($latest_size bytes)"
verify_encrypted_archive "$latest_path"

while IFS= read -r -d '' existing; do
  validate_private_file "$existing"
done < <(
  find "$DEST_DIR" -maxdepth 1 -type f \
    -name 'nexusflow-pre-release-*.dump.age' \
    -print0
)

while IFS= read -r -d '' expired; do
  case "$expired" in
    "$DEST_DIR"/nexusflow-pre-release-*.dump.age) unlink "$expired" ;;
    *) die "refusing to remove unexpected backup path: $expired" ;;
  esac
done < <(
  find "$DEST_DIR" -maxdepth 1 -type f \
    -name 'nexusflow-pre-release-*.dump.age' \
    -mtime "+$RETENTION_DAYS" \
    -print0
)

log "latest offsite database backup verified: $latest_path ($latest_size bytes)"
