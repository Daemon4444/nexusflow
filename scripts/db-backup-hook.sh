#!/usr/bin/env bash

set -euo pipefail
umask 077

ROOT="${NEXUSFLOW_ROOT:-/root/distiny/nexusflow}"
BACKUP_DIR="${NEXUSFLOW_DB_BACKUP_DIR:-/root/backups/nexusflow/releases}"
BACKEND_ENV="${NEXUSFLOW_BACKEND_ENV:-$ROOT/backend/.env}"
POSTGRES_IMAGE="${NEXUSFLOW_POSTGRES_IMAGE:-postgres:16-alpine}"
MINIMUM_BYTES="${NEXUSFLOW_MIN_BACKUP_BYTES:-65536}"
DOCKER_NETWORK="${NEXUSFLOW_POSTGRES_DOCKER_NETWORK:-}"
DOCKER_NETWORK_ARGS=()
AGE_RECIPIENTS_FILE="${NEXUSFLOW_BACKUP_AGE_RECIPIENTS_FILE:-/etc/nexusflow/backup-age-recipients.txt}"
RESTORE_VERIFY_HOST="${NEXUSFLOW_BACKUP_RESTORE_VERIFY_HOST:-}"
RESTORE_VERIFY_HOOK="${NEXUSFLOW_BACKUP_RESTORE_VERIFY_HOOK:-/usr/local/sbin/nexusflow-db-backup-restore-verify}"

log() {
  printf '[db-backup] %s\n' "$*" >&2
}

die() {
  printf '[db-backup] ERROR: %s\n' "$*" >&2
  exit 1
}

if test -n "$DOCKER_NETWORK"; then
  case "$DOCKER_NETWORK" in
    *[!A-Za-z0-9_.-]*) die "NEXUSFLOW_POSTGRES_DOCKER_NETWORK contains unsafe characters" ;;
  esac
  DOCKER_NETWORK_ARGS=(--network "$DOCKER_NETWORK")
fi

case "$ROOT:$BACKUP_DIR:$BACKEND_ENV:$AGE_RECIPIENTS_FILE:$RESTORE_VERIFY_HOST:$RESTORE_VERIFY_HOOK:$POSTGRES_IMAGE" in
  *[!A-Za-z0-9_./:@-]*) die "database backup paths contain unsafe characters" ;;
esac
case "$MINIMUM_BYTES" in
  ''|*[!0-9]*) die "minimum backup size must be a positive integer" ;;
esac
test "$MINIMUM_BYTES" -gt 0 ||
  die "minimum backup size must be positive"

validate_age_recipient_configuration() {
  local recipient_owner
  local recipient_group
  local recipient_mode
  local recipient_permissions
  local marker="nexusflow-age-preflight-v1"

  test -f "$AGE_RECIPIENTS_FILE" && test ! -L "$AGE_RECIPIENTS_FILE" ||
    die "age recipients file must be a regular non-symlink file"
  recipient_owner="$(stat -c '%u' "$AGE_RECIPIENTS_FILE")"
  recipient_group="$(stat -c '%g' "$AGE_RECIPIENTS_FILE")"
  recipient_mode="$(stat -c '%a' "$AGE_RECIPIENTS_FILE")"
  recipient_permissions=$((8#$recipient_mode))
  test "$recipient_owner:$recipient_group" = "0:0" ||
    die "age recipients file must be owned by root:root"
  test $((recipient_permissions & 0022)) -eq 0 ||
    die "age recipients file must not be group/world writable"

  printf '%s' "$marker" |
    age --encrypt --recipients-file "$AGE_RECIPIENTS_FILE" >/dev/null 2>&1 ||
    die "age recipients file cannot encrypt non-interactively"
}

remote_restore_preflight() {
  test -n "$RESTORE_VERIFY_HOST" ||
    die "NEXUSFLOW_BACKUP_RESTORE_VERIFY_HOST is required; the age private identity must remain offsite"
  command -v ssh >/dev/null 2>&1 || die "ssh is unavailable"
  ssh \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o StrictHostKeyChecking=yes \
    "$RESTORE_VERIFY_HOST" \
    "$RESTORE_VERIFY_HOOK preflight" >/dev/null ||
    die "offsite encrypted-restore verifier preflight failed"
}

ensure_secure_backup_directory() {
  local owner
  local group
  local mode

  if test ! -e "$BACKUP_DIR"; then
    mkdir -p "$BACKUP_DIR"
  fi
  test -d "$BACKUP_DIR" && test ! -L "$BACKUP_DIR" ||
    die "backup directory must be a real directory, not a symlink: $BACKUP_DIR"
  owner="$(stat -c '%u' "$BACKUP_DIR")"
  group="$(stat -c '%g' "$BACKUP_DIR")"
  mode="$(stat -c '%a' "$BACKUP_DIR")"
  test "$owner:$group:$mode" = "0:0:700" ||
    die "backup directory must be root:root mode 0700: $BACKUP_DIR ($owner:$group:$mode)"
}

validate_secure_backup_file() {
  local backup="$1"
  local owner
  local group
  local mode
  local filename

  ensure_secure_backup_directory
  test -f "$backup" && test ! -L "$backup" ||
    die "backup file must be a regular non-symlink file: $backup"
  test "$(dirname "$backup")" = "$BACKUP_DIR" ||
    die "backup file is outside the configured backup directory"
  filename="$(basename "$backup")"
  printf '%s\n' "$filename" |
    grep -Eq '^nexusflow-pre-release-[0-9]{8}T[0-9]{6}Z-[0-9a-fA-F]{40}\.dump\.age(\.partial\.[0-9]+)?$' ||
    die "backup filename is not release-controlled: $filename"
  owner="$(stat -c '%u' "$backup")"
  group="$(stat -c '%g' "$backup")"
  mode="$(stat -c '%a' "$backup")"
  test "$owner:$group:$mode" = "0:0:600" ||
    die "backup file must be root:root mode 0600: $filename ($owner:$group:$mode)"
}

database_value() {
  local key="$1"
  (
    cd "$ROOT"
    BACKEND_ENV="$BACKEND_ENV" node -e '
      const fs = require("fs");
      const dotenv = require("dotenv");
      const parsed = dotenv.parse(fs.readFileSync(process.env.BACKEND_ENV));
      const value = parsed[process.argv[1]];
      if (value !== undefined) process.stdout.write(String(value));
    ' "$key"
  )
}

database_url_part() {
  local part="$1"
  (
    cd "$ROOT"
    BACKEND_ENV="$BACKEND_ENV" node -e '
      const fs = require("fs");
      const dotenv = require("dotenv");
      const raw = String(
        dotenv.parse(fs.readFileSync(process.env.BACKEND_ENV)).DATABASE_URL || ""
      );
      let parsed;
      try {
        parsed = new URL(raw);
      } catch {
        process.exit(2);
      }
      if (!["postgres:", "postgresql:"].includes(parsed.protocol)) process.exit(2);
      const authorityPassword = decodeURIComponent(parsed.password || "");
      const queryPassword = parsed.searchParams.get("password") || "";
      if (authorityPassword && queryPassword && authorityPassword !== queryPassword) {
        process.exit(2);
      }
      parsed.password = "";
      parsed.searchParams.delete("password");
      if (process.argv[1] === "safe") {
        process.stdout.write(parsed.toString());
      } else if (process.argv[1] === "password") {
        process.stdout.write(authorityPassword || queryPassword);
      } else {
        process.exit(2);
      }
    ' "$part"
  )
}

load_database_environment() {
  DATABASE_URL_VALUE="$(database_value DATABASE_URL)"
  DATABASE_URL_CONFIGURED=false
  DATABASE_URL_SAFE_VALUE=""
  DATABASE_URL_PASSWORD_VALUE=""
  PGHOST_VALUE=""
  PGPORT_VALUE=""
  PGUSER_VALUE=""
  PGPASSWORD_VALUE=""
  PGDATABASE_VALUE=""

  if test -n "$DATABASE_URL_VALUE"; then
    DATABASE_URL_SAFE_VALUE="$(database_url_part safe)" ||
      die "DATABASE_URL is not a valid PostgreSQL URL"
    DATABASE_URL_PASSWORD_VALUE="$(database_url_part password)" ||
      die "DATABASE_URL is not a valid PostgreSQL URL"
    DATABASE_URL_VALUE=""
    DATABASE_URL_CONFIGURED=true
    return
  fi

  PGHOST_VALUE="$(database_value PG_HOST)"
  PGPORT_VALUE="$(database_value PG_PORT)"
  PGUSER_VALUE="$(database_value PG_USER)"
  PGPASSWORD_VALUE="$(database_value PG_PASSWORD)"
  PGDATABASE_VALUE="$(database_value PG_DATABASE)"
  PGPORT_VALUE="${PGPORT_VALUE:-5432}"

  test -n "$PGHOST_VALUE" || die "PG_HOST is missing from $BACKEND_ENV"
  test -n "$PGUSER_VALUE" || die "PG_USER is missing from $BACKEND_ENV"
  test -n "$PGPASSWORD_VALUE" || die "PG_PASSWORD is missing from $BACKEND_ENV"
  test -n "$PGDATABASE_VALUE" || die "PG_DATABASE is missing from $BACKEND_ENV"
  case "$PGPORT_VALUE" in
    ''|*[!0-9]*) die "PG_PORT must be a positive integer" ;;
  esac
  test "$PGPORT_VALUE" -gt 0 || die "PG_PORT must be positive"
}

postgres_container() {
  if "$DATABASE_URL_CONFIGURED"; then
    DATABASE_URL_SAFE="$DATABASE_URL_SAFE_VALUE" \
    PGPASSWORD="$DATABASE_URL_PASSWORD_VALUE" \
      docker run --rm \
      "${DOCKER_NETWORK_ARGS[@]}" \
        --env DATABASE_URL_SAFE \
        --env PGPASSWORD \
        "$@"
  else
    PGHOST="$PGHOST_VALUE" \
    PGPORT="$PGPORT_VALUE" \
    PGUSER="$PGUSER_VALUE" \
    PGPASSWORD="$PGPASSWORD_VALUE" \
    PGDATABASE="$PGDATABASE_VALUE" \
      docker run --rm \
        "${DOCKER_NETWORK_ARGS[@]}" \
        --env PGHOST \
        --env PGPORT \
        --env PGUSER \
        --env PGPASSWORD \
        --env PGDATABASE \
        "$@"
  fi
}

verify_backup() {
  local backup="$1"
  local header
  local size

  validate_secure_backup_file "$backup"
  size="$(stat -c '%s' "$backup")"
  test "$size" -ge "$MINIMUM_BYTES" ||
    die "backup is unexpectedly small: $backup ($size bytes)"
  IFS= read -r header < "$backup" ||
    die "encrypted backup header is unreadable"
  test "$header" = "age-encryption.org/v1" ||
    die "backup is not an age v1 encrypted envelope"
  log "private encrypted backup envelope validated $(basename "$backup") ($size bytes)"
}

restore_verify_backup() {
  local backup="$1"
  local filename

  verify_backup "$backup"
  filename="$(basename "$backup")"
  remote_restore_preflight
  ssh \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o StrictHostKeyChecking=yes \
    "$RESTORE_VERIFY_HOST" \
    "$RESTORE_VERIFY_HOOK restore-verify-stdin '$filename'" < "$backup" ||
    die "offsite PostgreSQL 16 restore verification failed for $filename"
  log "offsite authenticated PostgreSQL 16 restore verified and archived $filename"
}

preflight() {
  local env_mode
  local env_owner
  local env_permissions

  command -v docker >/dev/null 2>&1 || die "docker is unavailable"
  command -v node >/dev/null 2>&1 || die "node is unavailable"
  command -v age >/dev/null 2>&1 || die "age is unavailable"
  validate_age_recipient_configuration
  test -r "$BACKEND_ENV" || die "backend environment file is unreadable: $BACKEND_ENV"
  env_owner="$(stat -c '%u' "$BACKEND_ENV")"
  env_mode="$(stat -c '%a' "$BACKEND_ENV")"
  env_permissions=$((8#$env_mode))
  test "$env_owner" = "0" || die "backend environment file must be owned by root"
  test $((env_permissions & 0077)) -eq 0 ||
    die "backend environment file must not be accessible by group/world (mode $env_mode)"
  docker image inspect "$POSTGRES_IMAGE" >/dev/null 2>&1 ||
    die "required local image is unavailable: $POSTGRES_IMAGE"
  docker run --rm "$POSTGRES_IMAGE" postgres --version |
    grep -Eq '^postgres \(PostgreSQL\) 16\.' ||
    die "backup client image must be PostgreSQL major version 16"
  remote_restore_preflight
  load_database_environment
  if "$DATABASE_URL_CONFIGURED"; then
    postgres_container \
      "$POSTGRES_IMAGE" \
      sh -eu -c 'psql --no-password --set ON_ERROR_STOP=1 --dbname "$DATABASE_URL_SAFE" --command "SELECT 1"' \
      >/dev/null 2>&1 ||
      die "production PostgreSQL did not accept the backup preflight connection"
  else
    postgres_container \
      "$POSTGRES_IMAGE" \
      psql --no-password --set ON_ERROR_STOP=1 --command "SELECT 1" >/dev/null 2>&1 ||
      die "production PostgreSQL did not accept the backup preflight connection"
  fi
  log "preflight passed: production PostgreSQL authentication and query succeeded"
}

create_backup() {
  local sha="$1"
  local timestamp
  local filename
  local output
  local partial

  [[ "$sha" =~ ^[0-9a-fA-F]{40}$ ]] || die "invalid release SHA"

  preflight
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  filename="nexusflow-pre-release-${timestamp}-${sha}.dump.age"
  output="$BACKUP_DIR/$filename"
  partial="${output}.partial.$$"
  ensure_secure_backup_directory
  test ! -e "$output" || die "refusing to overwrite an existing backup: $output"
  test ! -e "$partial" || die "refusing to overwrite an existing partial backup: $partial"
  load_database_environment

  cleanup_partial() {
    case "$partial" in
      "$BACKUP_DIR"/nexusflow-pre-release-*.dump.age.partial.*) rm -f -- "$partial" ;;
      *) log "refusing to remove unexpected partial backup path: $partial" ;;
    esac
  }
  trap cleanup_partial EXIT

  log "streaming PostgreSQL custom-format backup into age encryption"
  if "$DATABASE_URL_CONFIGURED"; then
    postgres_container \
      "$POSTGRES_IMAGE" \
      sh -eu -c \
        'exec pg_dump --format=custom --no-owner --no-acl --dbname "$DATABASE_URL_SAFE"' |
      age \
        --encrypt \
        --recipients-file "$AGE_RECIPIENTS_FILE" \
        --output "$partial"
  else
    postgres_container \
      "$POSTGRES_IMAGE" \
      pg_dump --format=custom --no-owner --no-acl |
      age \
        --encrypt \
        --recipients-file "$AGE_RECIPIENTS_FILE" \
        --output "$partial"
  fi

  chown 0:0 "$partial"
  chmod 0600 "$partial"
  verify_backup "$partial"
  mv -- "$partial" "$output"
  validate_secure_backup_file "$output"
  trap - EXIT
  printf '%s\n' "$output"
}

case "${1:-}" in
  preflight)
    preflight
    ;;
  backup)
    test "$#" -eq 2 || die "usage: $0 backup <git-sha>"
    create_backup "$2"
    ;;
  verify)
    test "$#" -eq 2 || die "usage: $0 verify <backup-path>"
    verify_backup "$2"
    ;;
  restore-verify)
    test "$#" -eq 2 || die "usage: $0 restore-verify <backup-path>"
    restore_verify_backup "$2"
    ;;
  *)
    die "usage: $0 {preflight|backup <git-sha>|verify <backup-path>|restore-verify <backup-path>}"
    ;;
esac
