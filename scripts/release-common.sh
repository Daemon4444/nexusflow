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
  local verification_manifest
  local capability_manifest
  local legacy_runtime_render_outputs="false"
  test -f "$directory/.release-manifest.sha256" ||
    release_die "release manifest is missing: $directory/.release-manifest.sha256"
  expected_files="$(mktemp)"
  actual_files="$(mktemp)"
  verification_manifest="$(mktemp)"
  capability_manifest="$(mktemp)"
  cleanup_manifest_lists() {
    rm -f -- \
      "$expected_files" \
      "$actual_files" \
      "$verification_manifest" \
      "$capability_manifest"
  }
  trap cleanup_manifest_lists RETURN

  if node -e '
      const fs = require("fs");
      const input = fs.readFileSync(process.argv[1], "utf8");
      const lines = input.split("\n").filter(Boolean);
      const seen = new Set();
      let capabilityLine = "";
      for (const line of lines) {
        if (!/^[0-9a-fA-F]{64}  .+/.test(line)) process.exit(1);
        const path = line.slice(66);
        if (seen.has(path)) process.exit(1);
        seen.add(path);
        if (path === "./.release-capabilities.json") {
          if (capabilityLine) process.exit(1);
          capabilityLine = line;
        }
      }
      if (!capabilityLine) process.exit(1);
      fs.writeFileSync(process.argv[2], `${capabilityLine}\n`, { mode: 0o600 });
    ' \
      "$directory/.release-manifest.sha256" \
      "$capability_manifest" &&
    (
      cd "$directory"
      sha256sum --quiet -c "$capability_manifest"
    ) &&
    node -e '
      const fs = require("fs");
      let value;
      try {
        value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      } catch {
        process.exit(1);
      }
      if (
        value?.version !== 2 ||
        value?.loopbackListeners !== true ||
        value?.managedProductionEnv !== true ||
        value?.sessionHashOnlyCutover !== true ||
        value?.providerCostTiers !== true ||
        value?.frontendRuntimeImmutable === true
      ) {
        process.exit(1);
      }
    ' "$directory/.release-capabilities.json"; then
    legacy_runtime_render_outputs="true"
  fi

  if test "$legacy_runtime_render_outputs" = "true"; then
    release_log "using narrow rendered-output compatibility for legacy v2 release: $directory"
    node -e '
      const fs = require("fs");
      const input = fs.readFileSync(process.argv[1], "utf8");
      const exact = new Set([
        "./frontend/.next/server/app/models.html",
        "./frontend/.next/server/app/models.meta",
        "./frontend/.next/server/app/models.rsc",
        "./frontend/.next/server/app/models.segments/!KGRhc2hib2FyZCk/models/__PAGE__.segment.rsc",
        "./frontend/.next/server/app/models.segments/_full.segment.rsc",
        "./frontend/.next/server/app/models.segments/_tree.segment.rsc",
        "./frontend/.next/server/app/pricing.html",
        "./frontend/.next/server/app/pricing.meta",
        "./frontend/.next/server/app/pricing.rsc",
        "./frontend/.next/server/app/pricing.segments/!KGRhc2hib2FyZCk/pricing/__PAGE__.segment.rsc",
        "./frontend/.next/server/app/pricing.segments/_full.segment.rsc",
        "./frontend/.next/server/app/pricing.segments/_tree.segment.rsc",
      ]);
      const lines = input.split("\n").filter(Boolean);
      const seen = new Set();
      const retained = lines.filter((line) => {
        if (!/^[0-9a-fA-F]{64}  /.test(line)) process.exit(1);
        const path = line.slice(66);
        if (seen.has(path)) process.exit(1);
        seen.add(path);
        return !exact.has(path);
      });
      fs.writeFileSync(process.argv[2], `${retained.join("\n")}\n`, {
        mode: 0o600,
      });
    ' \
      "$directory/.release-manifest.sha256" \
      "$verification_manifest" ||
      release_die "legacy release manifest compatibility filtering failed: $directory"
  else
    cp -- "$directory/.release-manifest.sha256" "$verification_manifest"
  fi

  (
    cd "$directory"
    sha256sum --quiet -c "$verification_manifest"
  ) || release_die "release manifest verification failed: $directory"
  sed -n 's/^[0-9a-fA-F]\{64\}  //p' \
    "$directory/.release-manifest.sha256" |
    LC_ALL=C sort > "$expected_files"
  (
    cd "$directory"
    find . -type f \
      ! -path './.release-manifest.sha256' \
      ! -path './frontend/.next/cache/*' \
      ! -path './backend/uploads/*' \
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
