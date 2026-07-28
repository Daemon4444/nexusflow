#!/usr/bin/env bash

set -euo pipefail

release_log() {
  printf '[release] %s\n' "$*" >&2
}

release_die() {
  printf '[release] ERROR: %s\n' "$*" >&2
  exit 1
}

release_require_command() {
  command -v "$1" >/dev/null 2>&1 || release_die "required command is unavailable: $1"
}

release_validate_sha() {
  case "${1:-}" in
    [0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]) ;;
    *) release_die "expected a full 40-character Git SHA, received: ${1:-<empty>}" ;;
  esac
}

release_resolve_path() {
  node -e '
    const fs = require("fs");
    try {
      process.stdout.write(fs.realpathSync(process.argv[1]));
    } catch (error) {
      if (error && error.code === "ENOENT") process.exit(2);
      throw error;
    }
  ' "$1"
}

release_atomic_link() {
  local target="$1"
  local link="$2"
  local parent
  local temporary

  test -d "$target" || release_die "link target is not a directory: $target"
  parent="$(dirname "$link")"
  mkdir -p "$parent"
  temporary="${link}.tmp.$$"
  ln -s "$target" "$temporary"
  mv -Tf "$temporary" "$link"
}

release_validate_secure_hook() {
  local hook="$1"
  local owner
  local mode
  local permissions

  test -f "$hook" || release_die "required hook is missing: $hook"
  test -x "$hook" || release_die "required hook is not executable: $hook"
  owner="$(stat -c '%u' "$hook")"
  mode="$(stat -c '%a' "$hook")"
  test "$owner" = "0" || release_die "hook must be owned by root: $hook"
  permissions=$((8#$mode))
  test $((permissions & 0022)) -eq 0 ||
    release_die "hook must not be group/world writable: $hook (mode $mode)"
}

release_manifest_verify() {
  local directory="$1"
  local expected_files
  local actual_files
  test -f "$directory/.release-manifest.sha256" ||
    release_die "release manifest is missing: $directory/.release-manifest.sha256"
  expected_files="$(mktemp)"
  actual_files="$(mktemp)"
  cleanup_manifest_lists() {
    rm -f -- "$expected_files" "$actual_files"
  }
  trap cleanup_manifest_lists RETURN
  (
    cd "$directory"
    sha256sum --quiet -c .release-manifest.sha256
  ) || release_die "release manifest verification failed: $directory"
  sed -n 's/^[0-9a-fA-F]\{64\}  //p' \
    "$directory/.release-manifest.sha256" |
    LC_ALL=C sort > "$expected_files"
  (
    cd "$directory"
    find . -type f \
      ! -path './.release-manifest.sha256' \
      ! -path './frontend/.next/cache/*' \
      -print |
      LC_ALL=C sort
  ) > "$actual_files"
  cmp -s "$expected_files" "$actual_files" ||
    release_die "release contains a missing or unmanifested regular file: $directory"
  trap - RETURN
  cleanup_manifest_lists
}

release_build_sha_from_directory() {
  local directory="$1"
  local build_id
  test -f "$directory/frontend/.next/BUILD_ID" ||
    release_die "frontend BUILD_ID is missing in $directory"
  build_id="$(tr -d '\r\n' < "$directory/frontend/.next/BUILD_ID")"
  release_validate_sha "$build_id"
  printf '%s' "$build_id"
}
