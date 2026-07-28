#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/release-common.sh
source "$SCRIPT_DIR/release-common.sh"

ROOT="${NEXUSFLOW_ROOT:-/root/distiny/nexusflow}"
RELEASES_ROOT="${NEXUSFLOW_RELEASES_ROOT:-/root/distiny/nexusflow-releases}"
CURRENT_LINK="${NEXUSFLOW_CURRENT_LINK:-/root/distiny/nexusflow-current}"
PREVIOUS_LINK="${NEXUSFLOW_PREVIOUS_LINK:-/root/distiny/nexusflow-previous}"
BACKEND_ENV="${NEXUSFLOW_BACKEND_ENV:-$ROOT/backend/.env}"
COMMAND="${1:-}"
ARTIFACT=""
BUILD_SHA=""
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage:
  deploy-production.sh install --artifact <archive> --sha <full-git-sha>
  deploy-production.sh activate --sha <full-git-sha> [--dry-run]
  deploy-production.sh rollback [--dry-run]
  deploy-production.sh verify [--sha <full-git-sha>]
  deploy-production.sh preflight
  deploy-production.sh status

`activate` and `rollback` fail unless NEXUSFLOW_DRAIN_CONFIRMED=true. This
single-node primitive must only run after the ALB orchestrator proves that the
node receives no traffic. An activation that fails but fully restores and
persists the previous release exits with status 20 so the orchestrator can
distinguish a verified automatic rollback from an incomplete recovery.
EOF
}

test -n "$COMMAND" || {
  usage
  exit 1
}
shift

while test "$#" -gt 0; do
  case "$1" in
    --artifact)
      test "$#" -ge 2 || release_die "--artifact requires a value"
      ARTIFACT="$2"
      shift 2
      ;;
    --sha)
      test "$#" -ge 2 || release_die "--sha requires a value"
      BUILD_SHA="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      release_die "unknown argument: $1"
      ;;
  esac
done

release_require_command node
release_require_command sha256sum
release_require_command stat
release_require_command tar

release_directory() {
  printf '%s/%s' "$RELEASES_ROOT" "$1"
}

current_release() {
  local resolved=""
  if resolved="$(release_resolve_path "$CURRENT_LINK" 2>/dev/null)"; then
    printf '%s' "$resolved"
  else
    printf '%s' "$ROOT"
  fi
}

read_backend_sha() {
  local directory="$1"
  node -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).sha;
    if (!/^[0-9a-f]{40}$/i.test(value)) process.exit(1);
    process.stdout.write(value.toLowerCase());
  ' "$directory/backend/dist/build-info.json"
}

has_managed_release_capabilities() {
  local directory="$1"
  test -f "$directory/.release-capabilities.json" || return 1
  node -e '
    const fs = require("fs");
    let value;
    try {
      value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    } catch {
      process.exit(1);
    }
    if (
      (value?.version !== 2 &&
        !(
          value?.version === 3 &&
          value?.frontendRuntimeImmutable === true
        )) ||
      value?.loopbackListeners !== true ||
      value?.managedProductionEnv !== true ||
      value?.sessionHashOnlyCutover !== true ||
      value?.providerCostTiers !== true
    ) {
      process.exit(1);
    }
  ' "$directory/.release-capabilities.json"
}

require_managed_release_capabilities() {
  local directory="$1"
  test -f "$directory/.release-manifest.sha256" ||
    release_die "release manifest is unavailable for capability verification"
  sed -n 's/^[^ ]*  //p' "$directory/.release-manifest.sha256" |
    grep -Fx './.release-capabilities.json' >/dev/null ||
    release_die "managed-production capabilities are not covered by the immutable manifest"
  has_managed_release_capabilities "$directory" ||
    release_die "release is missing required managed-production safety capabilities"
}

reject_release_proxy_environment() {
  local key
  for key in \
    HTTP_PROXY HTTPS_PROXY ALL_PROXY \
    http_proxy https_proxy all_proxy; do
    if test -n "${!key:-}"; then
      release_die "managed production release rejects outbound proxy environment key $key"
    fi
  done
}

reload_release() {
  local directory="$1"
  local sha="$2"
  local managed_apps=""
  local app=""
  release_require_command pm2
  reject_release_proxy_environment

  # PM2's startOrReload keeps the existing cwd/exec path for an app with the
  # same name. Immutable releases therefore need an exact, drained-node
  # replacement of only the two NexusFlow apps. The caller automatically
  # restores the previous release if either deletion or startup fails.
  managed_apps="$(
    pm2 jlist |
      node -e '
        let body = "";
        process.stdin.on("data", (chunk) => { body += chunk; });
        process.stdin.on("end", () => {
          let processes;
          try {
            processes = JSON.parse(body);
          } catch {
            process.exit(1);
          }
          if (!Array.isArray(processes)) process.exit(1);
          const managed = new Set([
            "quadrant-backend",
            "quadrant-frontend",
          ]);
          const present = new Set(
            processes
              .map((entry) => entry?.name)
              .filter((name) => managed.has(name))
          );
          process.stdout.write([...present].sort().join("\n"));
        });
      '
  )" || {
    release_log "cannot inspect the current PM2 process definitions"
    return 1
  }

  while IFS= read -r app; do
    test -n "$app" || continue
    case "$app" in
      quadrant-backend|quadrant-frontend) ;;
      *)
        release_log "refusing to delete unexpected PM2 app: $app"
        return 1
        ;;
    esac
    pm2 delete "$app" || {
      release_log "cannot remove stale PM2 definition for $app"
      return 1
    }
  done <<< "$managed_apps"

  NEXUSFLOW_APP_ROOT="$directory" \
  NEXUSFLOW_CURRENT_LINK="$CURRENT_LINK" \
  NEXUSFLOW_RELEASE_RUNTIME=true \
  ENABLE_MOCK_PAYMENT=false \
  ENABLE_SEED_API_KEYS=false \
  USE_PG_MEM=false \
  NODE_ENV=production \
  BUILD_SHA="$sha" \
  BUILD_TIME="$(date -u +%FT%TZ)" \
    pm2 start "$directory/ecosystem.config.js" --update-env || {
      release_log "cannot start PM2 from the requested immutable release"
      return 1
    }
}

verify_pm2_runtime_environment() {
  local directory="$1"
  local sha="$2"
  release_require_command pm2
  pm2 jlist |
    EXPECTED_ROOT="$directory" EXPECTED_SHA="$sha" node -e '
      let body = "";
      process.stdin.on("data", (chunk) => { body += chunk; });
      process.stdin.on("end", () => {
        let processes;
        try {
          processes = JSON.parse(body);
        } catch {
          process.exit(1);
        }
        const backends = processes.filter((entry) => entry?.name === "quadrant-backend");
        const frontends = processes.filter((entry) => entry?.name === "quadrant-frontend");
        const root = process.env.EXPECTED_ROOT;
        if (backends.length !== 2 || frontends.length !== 1) process.exit(1);
        const valid = backends.every((entry) => {
          const env = entry?.pm2_env || {};
          const requiredProviderHosts = [
            "api.anthropic.com",
            "dashscope.aliyuncs.com",
            "app-api.pixverse.ai",
            "ark.cn-beijing.volces.com",
            "token.genvia.ai",
          ];
          const configuredProviderHosts = new Set(
            String(env.PROVIDER_OUTBOUND_HOST_ALLOWLIST || "")
              .split(/[\s,]+/)
              .map((value) => value.trim().toLowerCase())
              .filter(Boolean)
          );
          const proxyKeys = [
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "ALL_PROXY",
            "http_proxy",
            "https_proxy",
            "all_proxy",
          ];
          return (
            env.status === "online" &&
            env.pm_cwd === `${root}/backend` &&
            env.pm_exec_path === `${root}/backend/dist/index.js` &&
            env.NODE_ENV === "production" &&
            env.NEXUSFLOW_RELEASE_RUNTIME === "true" &&
            env.ENABLE_MOCK_PAYMENT !== "true" &&
            env.ENABLE_SEED_API_KEYS !== "true" &&
            env.USE_PG_MEM !== "true" &&
            String(env.PORT) === "3001" &&
            env.BUILD_SHA === process.env.EXPECTED_SHA &&
            requiredProviderHosts.every((host) =>
              configuredProviderHosts.has(host)
            ) &&
            proxyKeys.every((key) => !String(env[key] || "").trim())
          );
        });
        const validFrontend = frontends.every((entry) => {
          const env = entry?.pm2_env || {};
          const executable = String(env.pm_exec_path || "");
          return (
            env.status === "online" &&
            env.pm_cwd === `${root}/frontend` &&
            (
              executable === `${root}/frontend/node_modules/next/dist/bin/next` ||
              executable === `${root}/node_modules/next/dist/bin/next`
            ) &&
            env.NODE_ENV === "production" &&
            String(env.PORT) === "19999"
          );
        });
        if (!valid || !validFrontend) process.exit(1);
      });
    ' || {
      release_log "PM2 runtime definitions are not bound to the expected immutable release"
      return 1
    }
}

verify_loopback_listeners() {
  release_require_command ss
  ss -H -ltn |
    node -e '
      let body = "";
      process.stdin.on("data", (chunk) => { body += chunk; });
      process.stdin.on("end", () => {
        const expected = new Map([
          ["3001", false],
          ["19999", false],
        ]);
        for (const line of body.split("\n")) {
          const fields = line.trim().split(/\s+/);
          if (fields.length < 4) continue;
          const local = fields[3];
          for (const port of expected.keys()) {
            if (!local.endsWith(`:${port}`)) continue;
            const host = local.slice(0, -(port.length + 1)).replace(/^\[|\]$/g, "");
            if (host !== "127.0.0.1" && host !== "::1") process.exit(1);
            expected.set(port, true);
          }
        }
        if ([...expected.values()].some((found) => !found)) process.exit(1);
      });
    ' || {
      release_log "backend/frontend listeners must exist only on loopback ports 3001/19999"
      return 1
    }
}

verify_legacy_runtime() {
  local directory="$1"
  local sha="$2"
  release_require_command curl
  curl --fail --silent --show-error http://127.0.0.1:3001/api/health >/dev/null ||
    return 1
  curl --fail --silent --show-error http://127.0.0.1:3001/api/version |
    EXPECTED_SHA="$sha" node -e '
      let body = "";
      process.stdin.on("data", (chunk) => { body += chunk; });
      process.stdin.on("end", () => {
        if (JSON.parse(body).sha !== process.env.EXPECTED_SHA) process.exit(1);
      });
    ' || return 1
  curl --fail --silent --show-error http://127.0.0.1:19999/ >/dev/null ||
    return 1
  release_log "legacy runtime rollback target is healthy: $directory"
}

verify_runtime() {
  local directory="$1"
  local sha="$2"
  if test -f "$directory/.release-manifest.sha256"; then
    "$SCRIPT_DIR/verify-release.sh" --release-dir "$directory" --sha "$sha" ||
      return 1
    verify_backend_env_link "$directory" || return 1
  else
    verify_legacy_runtime "$directory" "$sha" || return 1
  fi
  if test -e "$directory/.release-capabilities.json"; then
    if ! has_managed_release_capabilities "$directory"; then
      release_log "managed-production release capabilities are malformed"
      return 1
    fi
    verify_pm2_runtime_environment "$directory" "$sha" || return 1
    verify_loopback_listeners || return 1
  else
    release_log "legacy baseline compatibility: managed PM2/loopback capabilities are not asserted"
  fi
}

verify_backend_env_link() {
  local directory="$1"
  local configured
  local linked

  validate_backend_env_source
  test -L "$directory/backend/.env" ||
    release_die "release backend environment must be an explicit symlink: $directory/backend/.env"
  configured="$(release_resolve_path "$BACKEND_ENV")" ||
    release_die "configured backend environment cannot be resolved: $BACKEND_ENV"
  linked="$(release_resolve_path "$directory/backend/.env")" ||
    release_die "release backend environment symlink is broken: $directory/backend/.env"
  test "$linked" = "$configured" ||
    release_die "release backend environment points outside the configured source"
}

validate_backend_env_source() {
  local resolved
  local owner
  local mode
  local permissions

  resolved="$(release_resolve_path "$BACKEND_ENV")" ||
    release_die "configured backend environment cannot be resolved: $BACKEND_ENV"
  test -f "$resolved" ||
    release_die "configured backend environment is not a regular file"
  owner="$(stat -c '%u' "$resolved")"
  mode="$(stat -c '%a' "$resolved")"
  permissions=$((8#$mode))
  test "$owner" = "0" ||
    release_die "configured backend environment must be owned by root"
  test $((permissions & 0077)) -eq 0 ||
    release_die "configured backend environment must not be accessible by group/world (mode $mode)"
  (
    cd "$ROOT"
    BACKEND_ENV_PATH="$resolved" node -e '
      const fs = require("fs");
      const dotenv = require("dotenv");
      const values = dotenv.parse(
        fs.readFileSync(process.env.BACKEND_ENV_PATH)
      );
      const keys = Object.keys(values);
      const reserved = new Set([
        "NODE_ENV",
        "PORT",
        "BUILD_ID",
        "BUILD_SHA",
        "BUILD_TIME",
        "NEXUSFLOW_NODE_ID",
        "NEXUSFLOW_RELEASE_RUNTIME",
        "ENABLE_MOCK_PAYMENT",
        "ENABLE_SEED_API_KEYS",
        "USE_PG_MEM",
      ]);
      const rejected = keys
        .filter((key) => reserved.has(key) || key.startsWith("BUILD_"))
        .sort();
      if (rejected.length > 0) {
        console.error(
          `backend environment defines release-reserved key(s): ${rejected.join(", ")}`
        );
        process.exit(1);
      }
      const proxyKeys = [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
      ];
      const configuredProxyKeys = proxyKeys.filter((key) =>
        String(values[key] || "").trim()
      );
      if (configuredProxyKeys.length > 0) {
        console.error(
          `backend environment defines forbidden proxy key(s): ${configuredProxyKeys.join(", ")}`
        );
        process.exit(1);
      }
      const requiredProviderHosts = [
        "api.anthropic.com",
        "dashscope.aliyuncs.com",
        "app-api.pixverse.ai",
        "ark.cn-beijing.volces.com",
        "token.genvia.ai",
      ];
      const configuredProviderHosts = new Set(
        String(values.PROVIDER_OUTBOUND_HOST_ALLOWLIST || "")
          .split(/[\s,]+/)
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean)
      );
      const missingProviderHosts = requiredProviderHosts.filter(
        (host) => !configuredProviderHosts.has(host)
      );
      if (missingProviderHosts.length > 0) {
        console.error(
          `backend environment is missing required provider outbound host(s): ${missingProviderHosts.join(", ")}`
        );
        process.exit(1);
      }
    '
  ) || release_die "configured backend environment failed managed production policy"
}

assert_manifest_excludes_backend_env() {
  local directory="$1"
  if sed -n 's/^[^ ]*  //p' "$directory/.release-manifest.sha256" |
    grep -Fx './backend/.env' >/dev/null; then
    release_die "release manifest must not contain the runtime backend environment"
  fi
}

validate_archive_for_install() {
  local artifact="$1"
  local staging="$2"
  local listing="$staging/.archive-listing"
  local entry

  tar -tzf "$artifact" > "$listing" ||
    release_die "artifact archive cannot be listed safely"
  while IFS= read -r entry; do
    case "$entry" in
      .|./|./*) ;;
      *) release_die "artifact contains an absolute or non-relative path" ;;
    esac
    case "/$entry/" in
      */../*) release_die "artifact contains parent-directory traversal" ;;
    esac
  done < "$listing"
  rm -f -- "$listing"
}

validate_extracted_filesystem() {
  local staging="$1"
  STAGING_ROOT="$staging" node -e '
    const fs = require("fs");
    const path = require("path");
    const root = path.resolve(process.env.STAGING_ROOT);
    const prefix = `${root}${path.sep}`;
    const pending = [root];
    const hardlinks = new Map();
    while (pending.length > 0) {
      const directory = pending.pop();
      for (const name of fs.readdirSync(directory)) {
        const candidate = path.join(directory, name);
        const stat = fs.lstatSync(candidate);
        if (stat.isDirectory()) {
          pending.push(candidate);
          continue;
        }
        if (stat.isSymbolicLink()) {
          const target = path.resolve(path.dirname(candidate), fs.readlinkSync(candidate));
          if (target !== root && !target.startsWith(prefix)) process.exit(1);
          continue;
        }
        if (!stat.isFile()) process.exit(1);
        if (stat.nlink > 1) {
          const key = `${stat.dev}:${stat.ino}`;
          const observed = hardlinks.get(key) || { count: 0, nlink: stat.nlink };
          if (observed.nlink !== stat.nlink) process.exit(1);
          observed.count += 1;
          hardlinks.set(key, observed);
        }
      }
    }
    if ([...hardlinks.values()].some((value) => value.count !== value.nlink)) {
      process.exit(1);
    }
  ' || release_die "artifact contains an escaping symlink or unsupported filesystem entry"
}

install_release() {
  test -n "$ARTIFACT" || release_die "install requires --artifact"
  test -n "$BUILD_SHA" || release_die "install requires --sha"
  release_validate_sha "$BUILD_SHA"
  test -f "$ARTIFACT" || release_die "artifact is missing: $ARTIFACT"
  test -f "${ARTIFACT}.sha256" || release_die "artifact checksum is missing: ${ARTIFACT}.sha256"
  test -r "$BACKEND_ENV" || release_die "backend environment is unreadable: $BACKEND_ENV"
  validate_backend_env_source

  local expected_digest
  local actual_digest
  local final
  local staging
  expected_digest="$(awk 'NR == 1 { print $1 }' "${ARTIFACT}.sha256")"
  actual_digest="$(sha256sum "$ARTIFACT" | awk '{ print $1 }')"
  test -n "$expected_digest" && test "$actual_digest" = "$expected_digest" ||
    release_die "artifact checksum mismatch: $ARTIFACT"

  final="$(release_directory "$BUILD_SHA")"
  if test -d "$final"; then
    "$SCRIPT_DIR/verify-release.sh" --release-dir "$final" --sha "$BUILD_SHA" --files-only
    require_managed_release_capabilities "$final"
    assert_manifest_excludes_backend_env "$final"
    verify_backend_env_link "$final"
    release_log "release is already installed and verified: $final"
    return
  fi

  mkdir -p "$RELEASES_ROOT"
  staging="$RELEASES_ROOT/.install-${BUILD_SHA}-$$"
  test ! -e "$staging" || release_die "staging path already exists: $staging"
  mkdir -p "$staging"

  cleanup_install() {
    case "$staging" in
      "$RELEASES_ROOT"/.install-"$BUILD_SHA"-*) rm -rf -- "$staging" ;;
      *) release_log "refusing to remove unexpected install path: $staging" ;;
    esac
  }
  trap cleanup_install EXIT

  validate_archive_for_install "$ARTIFACT" "$staging"
  tar -xzf "$ARTIFACT" -C "$staging"
  validate_extracted_filesystem "$staging"
  require_managed_release_capabilities "$staging"
  assert_manifest_excludes_backend_env "$staging"
  if test -e "$staging/backend/.env" || test -L "$staging/backend/.env"; then
    release_die "artifact unexpectedly contains backend/.env"
  fi
  ln -s "$BACKEND_ENV" "$staging/backend/.env"
  "$SCRIPT_DIR/verify-release.sh" --release-dir "$staging" --sha "$BUILD_SHA" --files-only
  verify_backend_env_link "$staging"
  mv -T "$staging" "$final"
  trap - EXIT
  release_log "installed immutable release: $final"
}

require_drained() {
  test "${NEXUSFLOW_DRAIN_CONFIRMED:-}" = "true" ||
    release_die "node activation requires NEXUSFLOW_DRAIN_CONFIRMED=true from the ALB orchestrator"
}

activate_release() {
  test -n "$BUILD_SHA" || release_die "activate requires --sha"
  release_validate_sha "$BUILD_SHA"
  require_drained

  local target
  local old
  local old_sha
  target="$(release_directory "$BUILD_SHA")"
  test -d "$target" || release_die "release is not installed: $target"
  "$SCRIPT_DIR/verify-release.sh" --release-dir "$target" --sha "$BUILD_SHA" --files-only
  require_managed_release_capabilities "$target"
  assert_manifest_excludes_backend_env "$target"
  verify_backend_env_link "$target"
  old="$(current_release)"

  if test "$old" = "$target"; then
    verify_runtime "$target" "$BUILD_SHA"
    release_log "release is already active: $BUILD_SHA"
    return
  fi

  old_sha="$(read_backend_sha "$old")" ||
    release_die "cannot determine rollback SHA for $old"

  if "$DRY_RUN"; then
    release_log "dry-run: would set previous=$old"
    release_log "dry-run: would atomically activate $target"
    release_log "dry-run: would reload PM2 and automatically roll back on verification failure"
    return
  fi

  release_atomic_link "$old" "$PREVIOUS_LINK"
  release_atomic_link "$target" "$CURRENT_LINK"

  if reload_release "$target" "$BUILD_SHA" && verify_runtime "$target" "$BUILD_SHA"; then
    if pm2 save; then
      release_log "activated $BUILD_SHA"
      return
    fi
    release_log "activation runtime passed but PM2 persistence failed; restoring $old"
  fi

  release_log "activation failed; restoring $old"
  release_atomic_link "$old" "$CURRENT_LINK"
  if reload_release "$old" "$old_sha" && verify_runtime "$old" "$old_sha"; then
    if pm2 save; then
      printf '[release] ERROR: activation failed and the previous release was restored\n' >&2
      exit 20
    fi
    release_die "activation failed; previous runtime was restored but PM2 persistence failed; keep this node drained"
  fi
  release_die "activation and automatic rollback both failed; keep this node drained"
}

rollback_release() {
  require_drained
  validate_backend_env_source
  local target
  local current
  local target_sha
  local current_sha
  target="$(release_resolve_path "$PREVIOUS_LINK" 2>/dev/null)" ||
    release_die "previous release pointer is unavailable"
  current="$(current_release)"
  test "$target" != "$current" || release_die "current and previous release pointers are identical"
  if has_managed_release_capabilities "$current" &&
    ! has_managed_release_capabilities "$target"; then
    test "${NEXUSFLOW_SESSION_ROLLBACK_PREPARED:-}" = "true" ||
      release_die "rollback to a legacy release requires the orchestrator's session-security compatibility transition"
  fi
  target_sha="$(read_backend_sha "$target")" ||
    release_die "cannot determine previous release SHA"
  current_sha="$(read_backend_sha "$current")" ||
    release_die "cannot determine current release SHA"

  if "$DRY_RUN"; then
    release_log "dry-run: would atomically roll back from $current to $target"
    return
  fi

  release_atomic_link "$target" "$CURRENT_LINK"
  if reload_release "$target" "$target_sha" && verify_runtime "$target" "$target_sha"; then
    release_atomic_link "$current" "$PREVIOUS_LINK"
    if pm2 save; then
      release_log "rolled back to $target_sha"
      return
    fi
    release_die "rollback runtime is healthy but PM2 persistence failed; keep this node drained"
  fi

  release_log "rollback target failed; restoring current release"
  release_atomic_link "$current" "$CURRENT_LINK"
  if reload_release "$current" "$current_sha" && verify_runtime "$current" "$current_sha"; then
    if pm2 save; then
      release_die "rollback target failed and the current release was restored"
    fi
    release_die "rollback target failed; current runtime was restored but PM2 persistence failed; keep this node drained"
  fi
  release_die "rollback target and current release verification both failed; keep this node drained"
}

verify_current() {
  local current
  local expected
  validate_backend_env_source
  current="$(current_release)"
  expected="${BUILD_SHA:-$(read_backend_sha "$current")}"
  release_validate_sha "$expected"
  verify_runtime "$current" "$expected"
}

show_status() {
  local current
  local previous="<none>"
  release_require_command pm2
  current="$(current_release)"
  previous="$(release_resolve_path "$PREVIOUS_LINK" 2>/dev/null || printf '<none>')"
  printf 'current=%s\nprevious=%s\n' "$current" "$previous"
  pm2 status
}

preflight_release_environment() {
  reject_release_proxy_environment
  validate_backend_env_source
  release_log "backend environment permissions and release-reserved keys passed"
}

case "$COMMAND" in
  install)
    install_release
    ;;
  activate)
    activate_release
    ;;
  rollback)
    rollback_release
    ;;
  verify)
    verify_current
    ;;
  preflight)
    preflight_release_environment
    ;;
  status)
    show_status
    ;;
  *)
    usage
    release_die "unknown command: $COMMAND"
    ;;
esac
