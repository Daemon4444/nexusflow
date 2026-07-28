#!/usr/bin/env bash

set -euo pipefail
umask 077

INCOMING_DIR="${NEXUSFLOW_BACKUP_VERIFY_INCOMING_DIR:-/var/lib/nexusflow-backup-restore/incoming}"
ARCHIVE_DIR="${NEXUSFLOW_OFFSITE_BACKUP_DIR:-/root/offsite/nexusflow-db}"
AGE_RECIPIENTS_FILE="${NEXUSFLOW_BACKUP_AGE_RECIPIENTS_FILE:-/etc/nexusflow/backup-age-recipients.txt}"
AGE_IDENTITY_FILE="${NEXUSFLOW_BACKUP_AGE_IDENTITY_FILE:-/etc/nexusflow/backup-age-identity.txt}"
CONTAINER_RUNTIME="${NEXUSFLOW_CONTAINER_RUNTIME:-docker}"
POSTGRES_IMAGE="${NEXUSFLOW_POSTGRES_IMAGE:-postgres:16-alpine}"
MINIMUM_BYTES="${NEXUSFLOW_MIN_BACKUP_BYTES:-65536}"
RESTORE_READY_ATTEMPTS="${NEXUSFLOW_RESTORE_READY_ATTEMPTS:-30}"
ACTIVE_INCOMING=""
ACTIVE_CONTAINER=""

log() {
  printf '[offsite-restore-verify] %s\n' "$*" >&2
}

die() {
  printf '[offsite-restore-verify] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup_active_resources() {
  if test -n "$ACTIVE_CONTAINER"; then
    "$CONTAINER_RUNTIME" rm -f "$ACTIVE_CONTAINER" >/dev/null 2>&1 || true
    ACTIVE_CONTAINER=""
  fi
  if test -n "$ACTIVE_INCOMING"; then
    case "$ACTIVE_INCOMING" in
      "$INCOMING_DIR"/nexusflow-pre-release-*.dump.age.incoming.*)
        test ! -e "$ACTIVE_INCOMING" || unlink "$ACTIVE_INCOMING"
        ;;
      *) log "refusing to remove unexpected incoming path" ;;
    esac
    ACTIVE_INCOMING=""
  fi
}

case "$INCOMING_DIR:$ARCHIVE_DIR:$AGE_RECIPIENTS_FILE:$AGE_IDENTITY_FILE:$POSTGRES_IMAGE" in
  *[!A-Za-z0-9_./:@-]*) die "offsite restore paths or image contain unsafe characters" ;;
esac
case "$CONTAINER_RUNTIME" in
  docker|podman) ;;
  *) die "NEXUSFLOW_CONTAINER_RUNTIME must be docker or podman" ;;
esac
for positive_integer in "$MINIMUM_BYTES" "$RESTORE_READY_ATTEMPTS"; do
  case "$positive_integer" in
    ''|*[!0-9]*) die "minimum bytes and restore attempts must be positive integers" ;;
  esac
  test "$positive_integer" -gt 0 ||
    die "minimum bytes and restore attempts must be positive"
done

ensure_private_directory() {
  local directory="$1"
  local owner
  local group
  local mode
  test -d "$directory" && test ! -L "$directory" ||
    die "private path must be a pre-created real directory"
  owner="$(stat -c '%u' "$directory")"
  group="$(stat -c '%g' "$directory")"
  mode="$(stat -c '%a' "$directory")"
  test "$owner:$group:$mode" = "0:0:700" ||
    die "private directory must be root:root mode 0700"
}

validate_private_file() {
  local file="$1"
  local owner
  local group
  local mode
  test -f "$file" && test ! -L "$file" ||
    die "private file must be a regular non-symlink"
  owner="$(stat -c '%u' "$file")"
  group="$(stat -c '%g' "$file")"
  mode="$(stat -c '%a' "$file")"
  test "$owner:$group:$mode" = "0:0:600" ||
    die "private file must be root:root mode 0600"
}

validate_key_material() {
  local recipient_owner
  local recipient_group
  local recipient_mode
  local recipient_permissions
  local marker="nexusflow-offsite-age-preflight-v1"
  local decrypted

  test -f "$AGE_RECIPIENTS_FILE" && test ! -L "$AGE_RECIPIENTS_FILE" ||
    die "age recipients file must be a regular non-symlink"
  recipient_owner="$(stat -c '%u' "$AGE_RECIPIENTS_FILE")"
  recipient_group="$(stat -c '%g' "$AGE_RECIPIENTS_FILE")"
  recipient_mode="$(stat -c '%a' "$AGE_RECIPIENTS_FILE")"
  recipient_permissions=$((8#$recipient_mode))
  test "$recipient_owner:$recipient_group" = "0:0" ||
    die "age recipients file must be root:root"
  test $((recipient_permissions & 0022)) -eq 0 ||
    die "age recipients file must not be group/world writable"

  validate_private_file "$AGE_IDENTITY_FILE"
  decrypted="$(
    printf '%s' "$marker" |
      age --encrypt --recipients-file "$AGE_RECIPIENTS_FILE" 2>/dev/null |
      age --decrypt --identity "$AGE_IDENTITY_FILE" 2>/dev/null
  )" ||
    die "offsite age keypair failed a non-interactive round-trip"
  test "$decrypted" = "$marker" ||
    die "offsite age identity cannot decrypt the configured recipients"
}

preflight() {
  local hook_mode
  local hook_permissions
  local postgres_version
  test "$(id -u)" = "0" || die "offsite restore verifier must run as root"
  for command in age "$CONTAINER_RUNTIME" sha256sum stat; do
    command -v "$command" >/dev/null 2>&1 ||
      die "required command is unavailable: $command"
  done
  test -f "${BASH_SOURCE[0]}" && test ! -L "${BASH_SOURCE[0]}" ||
    die "offsite restore verifier must be a regular non-symlink file"
  test "$(stat -c '%u:%g' "${BASH_SOURCE[0]}")" = "0:0" ||
    die "offsite restore verifier must be owned by root:root"
  hook_mode="$(stat -c '%a' "${BASH_SOURCE[0]}")"
  hook_permissions=$((8#$hook_mode))
  test $((hook_permissions & 0022)) -eq 0 ||
    die "offsite restore verifier must not be group/world writable"
  ensure_private_directory "$INCOMING_DIR"
  ensure_private_directory "$ARCHIVE_DIR"
  validate_key_material
  "$CONTAINER_RUNTIME" image inspect "$POSTGRES_IMAGE" >/dev/null 2>&1 ||
    die "required PostgreSQL 16 image is unavailable"
  postgres_version="$(
    "$CONTAINER_RUNTIME" run --rm "$POSTGRES_IMAGE" postgres --version
  )" ||
    die "could not execute PostgreSQL client image"
  printf '%s\n' "$postgres_version" |
    grep -Eq '^postgres \(PostgreSQL\) 16\.' ||
    die "restore verifier requires PostgreSQL major version 16"
  log "offsite key, permissions, and PostgreSQL 16 verifier preflight passed"
}

validate_encrypted_archive() {
  local backup="$1"
  local size
  local -a pipeline_status=()

  validate_private_file "$backup"
  size="$(stat -c '%s' "$backup")"
  test "$size" -ge "$MINIMUM_BYTES" ||
    die "encrypted backup is unexpectedly small"

  age --decrypt --identity "$AGE_IDENTITY_FILE" "$backup" >/dev/null ||
    die "encrypted backup failed complete authenticated decryption"

  # pg_restore --list reads only the TOC and can legitimately close its input
  # before age reaches EOF. A prior full decryption authenticated every byte,
  # so SIGPIPE (141) is acceptable only when pg_restore itself returned zero.
  set +e
  age --decrypt --identity "$AGE_IDENTITY_FILE" "$backup" |
    "$CONTAINER_RUNTIME" run --rm --interactive \
      "$POSTGRES_IMAGE" \
      pg_restore --list >/dev/null
  pipeline_status=("${PIPESTATUS[@]}")
  set -e
  test "${pipeline_status[1]}" -eq 0 ||
    die "decrypted backup failed PostgreSQL archive-list validation"
  case "${pipeline_status[0]}" in
    0|141) ;;
    *) die "age failed while streaming the authenticated archive TOC" ;;
  esac
}

restore_encrypted_archive() {
  local backup="$1"
  local container
  local attempt
  local -a pipeline_status=()

  validate_encrypted_archive "$backup"
  container="nexusflow-offsite-restore-$$-$(date -u +%Y%m%d%H%M%S)"
  case "$container" in
    nexusflow-offsite-restore-[A-Za-z0-9_-]*) ;;
    *) die "could not construct a safe restore container name" ;;
  esac
  "$CONTAINER_RUNTIME" container inspect "$container" >/dev/null 2>&1 &&
    die "restore verification container already exists"
  ACTIVE_CONTAINER="$container"

  "$CONTAINER_RUNTIME" run -d \
    --name "$container" \
    --env POSTGRES_PASSWORD=restore_verification_only \
    "$POSTGRES_IMAGE" >/dev/null

  attempt=1
  until "$CONTAINER_RUNTIME" exec "$container" \
    pg_isready -U postgres -d postgres >/dev/null 2>&1; do
    test "$attempt" -lt "$RESTORE_READY_ATTEMPTS" ||
      die "isolated PostgreSQL 16 restore target did not become ready"
    sleep 1
    attempt=$((attempt + 1))
  done

  set +e
  age --decrypt --identity "$AGE_IDENTITY_FILE" "$backup" |
    "$CONTAINER_RUNTIME" exec --interactive "$container" \
      pg_restore \
        --exit-on-error \
        --no-owner \
        --no-acl \
        --username postgres \
        --dbname postgres >/dev/null
  pipeline_status=("${PIPESTATUS[@]}")
  set -e
  test "${pipeline_status[1]}" -eq 0 ||
    die "isolated PostgreSQL 16 restore failed"
  case "${pipeline_status[0]}" in
    0|141) ;;
    *) die "age failed while streaming into the isolated restore" ;;
  esac

  "$CONTAINER_RUNTIME" exec "$container" \
    psql \
      --username postgres \
      --dbname postgres \
      --no-password \
      --set ON_ERROR_STOP=1 \
      --tuples-only \
      --command "
        SELECT (
          to_regclass('public.users') IS NOT NULL
          AND to_regclass('public.schema_migrations') IS NOT NULL
          AND (SELECT COUNT(*) FROM schema_migrations) >= 1
          AND (
            SELECT COUNT(*)
              FROM pg_catalog.pg_tables
             WHERE schemaname = 'public'
          ) >= 5
        )::integer;
      " | grep -Eq '^[[:space:]]*1[[:space:]]*$' ||
    die "isolated restore failed core-schema consistency checks"

  "$CONTAINER_RUNTIME" rm -f "$container" >/dev/null
  ACTIVE_CONTAINER=""
}

archive_verified_backup() {
  local incoming="$1"
  local filename="$2"
  local destination="$ARCHIVE_DIR/$filename"

  if test -e "$destination"; then
    validate_private_file "$destination"
    test "$(sha256sum "$incoming" | awk '{print $1}')" =
      "$(sha256sum "$destination" | awk '{print $1}')" ||
      die "offsite archive already has different bytes for this backup name"
    unlink "$incoming"
  else
    mv -T "$incoming" "$destination"
    validate_private_file "$destination"
  fi
  sync -f "$ARCHIVE_DIR" >/dev/null 2>&1 || true
  log "authenticated PostgreSQL 16 restore passed; encrypted backup archived as $filename"
}

receive_restore_and_archive() {
  local filename="$1"
  local incoming
  printf '%s\n' "$filename" |
    grep -Eq '^nexusflow-pre-release-[0-9]{8}T[0-9]{6}Z-[0-9a-fA-F]{40}\.dump\.age$' ||
    die "incoming backup filename is not release-controlled"

  preflight
  incoming="$INCOMING_DIR/${filename}.incoming.$$"
  test ! -e "$incoming" || die "incoming backup path already exists"
  : > "$incoming"
  chown 0:0 "$incoming"
  chmod 0600 "$incoming"
  ACTIVE_INCOMING="$incoming"
  trap cleanup_active_resources EXIT
  trap 'exit 130' INT TERM
  cat > "$incoming"
  validate_private_file "$incoming"
  restore_encrypted_archive "$incoming"
  archive_verified_backup "$incoming" "$filename"
  ACTIVE_INCOMING=""
  trap - EXIT INT TERM
}

case "${1:-}" in
  preflight)
    test "$#" -eq 1 || die "usage: $0 preflight"
    preflight
    ;;
  restore-verify-stdin)
    test "$#" -eq 2 || die "usage: $0 restore-verify-stdin <backup-filename>"
    receive_restore_and_archive "$2"
    ;;
  *)
    die "usage: $0 {preflight|restore-verify-stdin <backup-filename>}"
    ;;
esac
