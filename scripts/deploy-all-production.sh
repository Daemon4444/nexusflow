#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/release-common.sh
source "$SCRIPT_DIR/release-common.sh"

ROOT="${NEXUSFLOW_ROOT:-/root/distiny/nexusflow}"
PEER_HOST="${NEXUSFLOW_PEER_HOST:-172.27.219.55}"
PEER_ROOT="${NEXUSFLOW_PEER_ROOT:-/root/distiny/nexusflow}"
RELEASES_ROOT="${NEXUSFLOW_RELEASES_ROOT:-/root/distiny/nexusflow-releases}"
ARTIFACTS_ROOT="${NEXUSFLOW_ARTIFACTS_ROOT:-/root/distiny/nexusflow-artifacts}"
CURRENT_LINK="${NEXUSFLOW_CURRENT_LINK:-/root/distiny/nexusflow-current}"
PREVIOUS_LINK="${NEXUSFLOW_PREVIOUS_LINK:-/root/distiny/nexusflow-previous}"
BACKEND_ENV="${NEXUSFLOW_BACKEND_ENV:-$ROOT/backend/.env}"
TRAFFIC_HOOK="${NEXUSFLOW_TRAFFIC_HOOK:-$ROOT/scripts/nginx-health-traffic-hook.sh}"
DB_BACKUP_HOOK="${NEXUSFLOW_DB_BACKUP_HOOK:-$ROOT/scripts/db-backup-hook.sh}"
PROVIDER_COST_MANIFEST="${NEXUSFLOW_PROVIDER_COST_MANIFEST:-}"
PUBLIC_URL="${NEXUSFLOW_PUBLIC_URL:-https://nexusflow.hk}"
LOCK_FILE="${NEXUSFLOW_DEPLOY_LOCK_FILE:-/run/lock/nexusflow-production-release.lock}"
TELEMETRY_OUTBOX_DIR="${NEXUSFLOW_TELEMETRY_OUTBOX_DIR:-/var/lib/nexusflow-release-telemetry-outbox}"
LOCAL_NODE_ID="${NEXUSFLOW_LOCAL_NODE_ID:-main}"
PEER_NODE_ID="${NEXUSFLOW_PEER_NODE_ID:-peer}"
DRY_RUN=false
VERIFY_ONLY=false
BUILD_SHA=""
PROVIDER_COST_EXPECTED_TIERS=12
PROVIDER_COST_CONTROL="$SCRIPT_DIR/provider-cost-release.mjs"

usage() {
  cat <<'EOF'
Usage:
  deploy-all-production.sh [--sha <origin/main-sha>] [--dry-run]
  deploy-all-production.sh --verify-only [--sha <deployed-sha>]

The live release path is blue/green across the two ALB nodes:
  local-only -> deploy peer -> peer-only -> deploy local -> balanced.

The default root-owned traffic hook drains a node by making only exact ALB
health checks return 503, proving public node identity, and waiting for live
connections to close. The script also fails closed unless its database hook can
create and verify a fresh backup.
EOF
}

while test "$#" -gt 0; do
  case "$1" in
    --sha)
      test "$#" -ge 2 || release_die "--sha requires a value"
      BUILD_SHA="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --verify-only)
      VERIFY_ONLY=true
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

release_require_command curl
release_require_command flock
release_require_command git
release_require_command node
release_require_command scp
release_require_command ssh
release_require_command tar

case "$ROOT:$PEER_ROOT:$RELEASES_ROOT:$ARTIFACTS_ROOT:$CURRENT_LINK:$PREVIOUS_LINK:$PEER_HOST" in
  *[!A-Za-z0-9_./:@-]*) release_die "release paths and peer host may only contain safe path characters" ;;
esac

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || release_die "another NexusFlow production release is already running"

cd "$ROOT"
if "$VERIFY_ONLY"; then
  if test -z "$BUILD_SHA"; then
    BUILD_SHA="$(
      CURRENT_LINK="$CURRENT_LINK" ROOT="$ROOT" node -e '
        const fs = require("fs");
        const path = require("path");
        let current = process.env.ROOT;
        try {
          current = fs.realpathSync(process.env.CURRENT_LINK);
        } catch (error) {
          if (!error || error.code !== "ENOENT") throw error;
        }
        const info = JSON.parse(fs.readFileSync(path.join(current, "backend/dist/build-info.json"), "utf8"));
        process.stdout.write(String(info.sha || ""));
      '
    )"
  fi
else
  test -z "$(git status --porcelain)" ||
    release_die "refusing to release a dirty local working tree"
  git fetch --quiet origin main
  BUILD_SHA="${BUILD_SHA:-$(git rev-parse HEAD)}"
  test "$(git rev-parse HEAD)" = "$BUILD_SHA" ||
    release_die "requested release SHA is not local HEAD"
  test "$(git rev-parse origin/main)" = "$BUILD_SHA" ||
    release_die "local HEAD is not the current origin/main"
fi
release_validate_sha "$BUILD_SHA"
RELEASE_ID="${NEXUSFLOW_RELEASE_ID:-prod-${BUILD_SHA:0:12}-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
TELEMETRY_SCRIPT="$RELEASES_ROOT/$BUILD_SHA/scripts/release-telemetry.mjs"
SESSION_SECURITY_SCRIPT="$RELEASES_ROOT/$BUILD_SHA/scripts/session-token-security.mjs"
PROVIDER_COST_RELEASE_CONTROL="$RELEASES_ROOT/$BUILD_SHA/scripts/provider-cost-release.mjs"
RELEASE_BUILD_TIME=""
TELEMETRY_ACTIVE=false
RELEASE_SUCCEEDED=false
RELEASE_LIVE=false
TERMINAL_TELEMETRY_PENDING=false
TERMINAL_SUCCESS_MESSAGE="Both nodes and the balanced public path passed immutable release verification"
BASELINE_SHA=""
BASELINE_SESSION_HASH_CAPABLE=false
PEER_BASELINE_SESSION_HASH_CAPABLE=false
BASELINE_PROVIDER_COST_CAPABLE=false
PEER_BASELINE_PROVIDER_COST_CAPABLE=false
SESSION_ROLLBACK_PREPARED=false
SESSION_SECURITY_DOWNGRADED=false
SESSION_SECURITY_TRANSITION_OWNER=""
PROVIDER_COST_ACTIVATION_STARTED=false
PROVIDER_COST_BOOK_APPLIED=false
PROVIDER_COST_ROLLBACK_TRANSITION_STARTED=false
PROVIDER_COST_DEACTIVATED_FOR_ROLLBACK=false
PROVIDER_COST_ROLLBACK_COMMITTED=false
PROVIDER_COST_MANIFEST_CLEANED=false

release_validate_secure_hook "$TRAFFIC_HOOK"
if ! "$VERIFY_ONLY"; then
  release_validate_secure_hook "$DB_BACKUP_HOOK"
  test -n "$PROVIDER_COST_MANIFEST" ||
    release_die "NEXUSFLOW_PROVIDER_COST_MANIFEST must identify the private staged price book"
  node "$PROVIDER_COST_CONTROL" preflight \
    --manifest "$PROVIDER_COST_MANIFEST"
fi

"$SCRIPT_DIR/deploy-production.sh" preflight

if ! "$VERIFY_ONLY"; then
  ssh -o BatchMode=yes -o ConnectTimeout=10 "root@$PEER_HOST" \
    "cd '$PEER_ROOT' \
     && test \"\$(git symbolic-ref --short HEAD)\" = main \
     && test -z \"\$(git status --porcelain)\" \
     && scripts/deploy-production.sh preflight" ||
    release_die "peer working tree is dirty or unreachable"
fi

release_log "checking non-mutating traffic-drain preconditions"
"$TRAFFIC_HOOK" preflight
"$TRAFFIC_HOOK" assert balanced
if ! "$VERIFY_ONLY"; then
  release_log "checking database backup and migration preconditions"
  "$DB_BACKUP_HOOK" preflight
  NEXUSFLOW_APP_ROOT="$ROOT" \
  NEXUSFLOW_BACKEND_ENV="$BACKEND_ENV" \
    node "$SCRIPT_DIR/migrate-with-lock.mjs" --check-only
fi

peer_release_command() {
  ssh -o BatchMode=yes -o ConnectTimeout=10 "root@$PEER_HOST" "$@"
}

telemetry_event() {
  local event_type="$1"
  local message="$2"
  local node_id="${3:-}"
  local args=(
    deployment-event
    --release-id "$RELEASE_ID"
    --sha "$BUILD_SHA"
    --event-type "$event_type"
    --message "$message"
  )
  if test -n "$node_id"; then
    args+=(--node-id "$node_id")
  fi
  NEXUSFLOW_APP_ROOT="$RELEASES_ROOT/$BUILD_SHA" \
  NEXUSFLOW_BACKEND_ENV="$BACKEND_ENV" \
    node "$TELEMETRY_SCRIPT" "${args[@]}"
}

telemetry_runtime_node() {
  local node_id="$1"
  local node_hostname="$2"
  local observed_at
  observed_at="$(node -e 'process.stdout.write(new Date().toISOString())')"
  NEXUSFLOW_APP_ROOT="$RELEASES_ROOT/$BUILD_SHA" \
  NEXUSFLOW_BACKEND_ENV="$BACKEND_ENV" \
    node "$TELEMETRY_SCRIPT" runtime-node \
      --node-id "$node_id" \
      --hostname "$node_hostname" \
      --environment production \
      --status healthy \
      --backend-sha "$BUILD_SHA" \
      --frontend-build-id "$BUILD_SHA" \
      --backend-built-at "$RELEASE_BUILD_TIME" \
      --postgres-status ok \
      --redis-status ok \
      --observed-at "$observed_at"
}

telemetry_retry() {
  local attempt=1
  while test "$attempt" -le 3; do
    if "$@"; then
      return 0
    fi
    if test "$attempt" -lt 3; then
      sleep 1
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

telemetry_event_required() {
  telemetry_retry telemetry_event "$@" ||
    release_die "release telemetry failed before a traffic mutation"
}

telemetry_event_best_effort() {
  local event_type="$1"
  if ! telemetry_retry telemetry_event "$@"; then
    release_log "warning: could not record release telemetry event $event_type; retry the same release ID"
  fi
}

telemetry_node_verified() {
  local node_id="$1"
  local node_hostname="$2"
  if ! telemetry_retry telemetry_runtime_node "$node_id" "$node_hostname"; then
    release_log "warning: could not update runtime truth for node $node_id"
  fi
  telemetry_event_best_effort \
    node_succeeded \
    "Direct node verification passed for immutable release" \
    "$node_id"
}

telemetry_mark_rollback_started() {
  telemetry_event_best_effort \
    rollback_started \
    "Automatic rollback started after a release failure"
}

telemetry_mark_rolled_back() {
  telemetry_event_best_effort \
    rolled_back \
    "Automatic rollback restored the previous verified release"
}

session_security_command() {
  NEXUSFLOW_APP_ROOT="$RELEASES_ROOT/$BUILD_SHA" \
  NEXUSFLOW_BACKEND_ENV="$BACKEND_ENV" \
    node "$SESSION_SECURITY_SCRIPT" "$@"
}

session_security_prepare_baseline_rollback() {
  if "$BASELINE_SESSION_HASH_CAPABLE"; then
    session_security_command posture --expect hash-only ||
      release_die "hash-capable rollback baseline requires hash-only session posture"
    SESSION_ROLLBACK_PREPARED=false
    return
  fi

  # A legacy baseline needs dual-read compatibility, but changing that state
  # revokes every session and weakens the database trigger. Record ownership
  # before the transaction so the EXIT trap can recover hash-only posture even
  # if the command commits and the SSH/session running this script is then
  # interrupted.
  if session_security_command posture --expect hash-only; then
    SESSION_SECURITY_DOWNGRADED=true
    SESSION_SECURITY_TRANSITION_OWNER="$RELEASE_ID"
    session_security_command transition \
      --direction rollback \
      --sha "$BASELINE_SHA" \
      --actor release-orchestrator \
      --reason "Compatibility transition before activating a legacy rollback baseline" ||
      release_die "could not prepare legacy session compatibility for rollback"
  else
    session_security_command posture --expect dual ||
      release_die "session security posture is neither verified hash-only nor legacy-compatible"
  fi
  session_security_command posture --expect dual ||
    release_die "legacy rollback session compatibility posture did not verify"
  SESSION_ROLLBACK_PREPARED=true
}

session_security_set_hash_only() {
  local reason="$1"
  session_security_command transition \
    --direction forward \
    --sha "$BUILD_SHA" \
    --actor release-orchestrator \
    --reason "$reason" || return 1
  session_security_command posture --expect hash-only || return 1
  SESSION_SECURITY_DOWNGRADED=false
  SESSION_SECURITY_TRANSITION_OWNER=""
  SESSION_ROLLBACK_PREPARED=false
}

session_security_forward_cutover() {
  session_security_set_hash_only \
    "Both immutable application nodes passed direct verification" ||
    release_die "session hash-only cutover failed; verified new peer remains the only target"
}

provider_cost_release_command() {
  local command="$1"
  shift
  test -f "$PROVIDER_COST_RELEASE_CONTROL" ||
    release_die "immutable provider-cost release control is missing"
  node "$PROVIDER_COST_RELEASE_CONTROL" "$command" \
    --release-dir "$RELEASES_ROOT/$BUILD_SHA" \
    --backend-env "$BACKEND_ENV" \
    "$@"
}

provider_cost_verify_active() {
  local active_rows
  active_rows="$(
    provider_cost_release_command verify-active \
      --expected-tiers "$PROVIDER_COST_EXPECTED_TIERS"
  )" || return 1
  test "$active_rows" = "$PROVIDER_COST_EXPECTED_TIERS"
}

provider_cost_activate() {
  local tier_count
  PROVIDER_COST_ACTIVATION_STARTED=true
  tier_count="$(
    provider_cost_release_command activate \
      --manifest "$PROVIDER_COST_MANIFEST"
  )" || return 1
  test "$tier_count" = "$PROVIDER_COST_EXPECTED_TIERS" || return 1
  provider_cost_verify_active || return 1
  PROVIDER_COST_BOOK_APPLIED=true
  PROVIDER_COST_DEACTIVATED_FOR_ROLLBACK=false
  PROVIDER_COST_ROLLBACK_TRANSITION_STARTED=false
  PROVIDER_COST_ROLLBACK_COMMITTED=false
}

provider_cost_prepare_baseline_rollback() {
  if "$BASELINE_PROVIDER_COST_CAPABLE"; then
    provider_cost_verify_active ||
      release_die "provider-cost-capable rollback baseline requires its price book active"
    return
  fi
  if ! "$PROVIDER_COST_ACTIVATION_STARTED" &&
    ! "$PROVIDER_COST_BOOK_APPLIED"; then
    return
  fi
  if "$PROVIDER_COST_DEACTIVATED_FOR_ROLLBACK"; then
    provider_cost_release_command verify-inactive || return 1
    return
  fi

  # This ownership marker is set before the database transition. If the
  # process is interrupted after commit, EXIT recovery can observe the
  # inactive book and quarantine traffic on a verified tier-aware binary.
  PROVIDER_COST_ROLLBACK_TRANSITION_STARTED=true
  provider_cost_release_command deactivate \
    --expected-tiers "$PROVIDER_COST_EXPECTED_TIERS" || return 1
  provider_cost_release_command verify-inactive || return 1
  PROVIDER_COST_DEACTIVATED_FOR_ROLLBACK=true
  PROVIDER_COST_BOOK_APPLIED=false
}

provider_cost_commit_verified_baseline_rollback() {
  if "$BASELINE_PROVIDER_COST_CAPABLE"; then
    provider_cost_verify_active || return 1
  elif "$PROVIDER_COST_ROLLBACK_TRANSITION_STARTED"; then
    test "$(local_runtime_sha)" = "$BASELINE_SHA" || return 1
    test "$(peer_runtime_sha)" = "$BASELINE_SHA" || return 1
    provider_cost_release_command verify-inactive || return 1
  fi
  PROVIDER_COST_ROLLBACK_COMMITTED=true
  PROVIDER_COST_ACTIVATION_STARTED=false
}

provider_cost_recover_after_failed_rollback() {
  "$PROVIDER_COST_ROLLBACK_TRANSITION_STARTED" || return 0
  "$PROVIDER_COST_ROLLBACK_COMMITTED" && return 0

  # If the deactivation never committed, the fully active price book is
  # already safe for the new binary and no compatibility recovery is needed.
  if provider_cost_verify_active; then
    PROVIDER_COST_ROLLBACK_TRANSITION_STARTED=false
    PROVIDER_COST_DEACTIVATED_FOR_ROLLBACK=false
    PROVIDER_COST_BOOK_APPLIED=true
    return 0
  fi
  if ! provider_cost_release_command verify-inactive; then
    release_log "CRITICAL: provider cost price book is partially active; refusing automatic traffic balancing"
    return 1
  fi

  local local_sha=""
  local peer_sha=""
  local recovery_node=""
  local_sha="$(local_runtime_sha 2>/dev/null || true)"
  peer_sha="$(peer_runtime_sha 2>/dev/null || true)"

  # A completely verified legacy rollback must retain the deactivated book.
  if test "$local_sha" = "$BASELINE_SHA" &&
    test "$peer_sha" = "$BASELINE_SHA"; then
    PROVIDER_COST_ROLLBACK_COMMITTED=true
    return 0
  fi

  case "$RECOVERY_TRAFFIC_MODE" in
    local)
      if test "$local_sha" = "$BUILD_SHA" && direct_local_verify; then
        recovery_node=local
      fi
      ;;
    peer)
      if test "$peer_sha" = "$BUILD_SHA" && direct_peer_verify; then
        recovery_node=peer
      fi
      ;;
  esac
  if test -z "$recovery_node" &&
    test "$local_sha" = "$BUILD_SHA" &&
    direct_local_verify; then
    recovery_node=local
  fi
  if test -z "$recovery_node" &&
    test "$peer_sha" = "$BUILD_SHA" &&
    direct_peer_verify; then
    recovery_node=peer
  fi
  if test -z "$recovery_node"; then
    release_log "CRITICAL: provider cost book is inactive and no tier-aware runtime could be directly verified"
    return 1
  fi

  release_log "failed legacy rollback: restoring the price book while traffic is isolated on verified tier-aware node $recovery_node"
  "$TRAFFIC_HOOK" route "$recovery_node" || return 1
  "$TRAFFIC_HOOK" assert "$recovery_node" || return 1
  RECOVERY_TRAFFIC_MODE="$recovery_node"
  provider_cost_activate || {
    release_log "CRITICAL: traffic is isolated on a tier-aware binary, but its private price book could not be restored"
    return 1
  }
}

cleanup_provider_cost_manifest() {
  "$PROVIDER_COST_MANIFEST_CLEANED" && return 0
  test -n "$PROVIDER_COST_MANIFEST" || return 0
  node "$PROVIDER_COST_CONTROL" cleanup-manifest \
    --manifest "$PROVIDER_COST_MANIFEST" || return 1
  PROVIDER_COST_MANIFEST_CLEANED=true
}

write_terminal_telemetry_outbox() {
  OUTBOX_DIR="$TELEMETRY_OUTBOX_DIR" \
  RELEASE_ID_VALUE="$RELEASE_ID" \
  RELEASE_SHA_VALUE="$BUILD_SHA" \
  RELEASE_MESSAGE_VALUE="$TERMINAL_SUCCESS_MESSAGE" \
    node -e '
      const fs = require("fs");
      const path = require("path");
      process.umask(0o077);
      if (typeof process.getuid !== "function" || process.getuid() !== 0) {
        throw new Error("terminal telemetry outbox requires root");
      }
      const directory = path.resolve(process.env.OUTBOX_DIR);
      const releaseId = process.env.RELEASE_ID_VALUE;
      const sha = process.env.RELEASE_SHA_VALUE;
      const message = process.env.RELEASE_MESSAGE_VALUE;
      if (!/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/.test(releaseId)) {
        throw new Error("invalid release ID for telemetry outbox");
      }
      if (!/^[0-9a-f]{40}$/i.test(sha)) {
        throw new Error("invalid release SHA for telemetry outbox");
      }
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      const directoryStat = fs.lstatSync(directory);
      if (
        !directoryStat.isDirectory() ||
        directoryStat.isSymbolicLink() ||
        directoryStat.uid !== 0 ||
        directoryStat.gid !== 0 ||
        (directoryStat.mode & 0o777) !== 0o700
      ) {
        throw new Error("telemetry outbox must be root:root mode 0700");
      }
      const filename = `${releaseId}--succeeded.json`;
      const destination = path.join(directory, filename);
      const payload = `${JSON.stringify({
        version: 1,
        releaseId,
        sha: sha.toLowerCase(),
        eventType: "succeeded",
        message,
      })}\n`;
      if (fs.existsSync(destination)) {
        const stat = fs.lstatSync(destination);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.uid !== 0 ||
          stat.gid !== 0 ||
          (stat.mode & 0o777) !== 0o600 ||
          fs.readFileSync(destination, "utf8") !== payload
        ) {
          throw new Error("existing telemetry outbox entry is not an exact private retry");
        }
        process.stdout.write(destination);
        process.exit(0);
      }
      const temporary = `${destination}.tmp.${process.pid}`;
      const handle = fs.openSync(temporary, "wx", 0o600);
      try {
        fs.writeFileSync(handle, payload, "utf8");
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
      fs.renameSync(temporary, destination);
      const directoryHandle = fs.openSync(directory, "r");
      try {
        fs.fsyncSync(directoryHandle);
      } finally {
        fs.closeSync(directoryHandle);
      }
      process.stdout.write(destination);
    '
}

wait_local_drained() {
  "$SCRIPT_DIR/wait-node-drained.sh"
}

wait_peer_drained() {
  peer_release_command "cd '$PEER_ROOT' && scripts/wait-node-drained.sh"
}

direct_peer_verify() {
  peer_release_command \
    "cd '$PEER_ROOT' && NEXUSFLOW_APP_ROOT='$RELEASES_ROOT/$BUILD_SHA' scripts/verify-release.sh --release-dir '$RELEASES_ROOT/$BUILD_SHA' --sha '$BUILD_SHA'"
}

direct_local_verify() {
  "$SCRIPT_DIR/deploy-production.sh" verify --sha "$BUILD_SHA"
}

public_verify() {
  NEXUSFLOW_VERIFY_BACKEND_URL="$PUBLIC_URL" \
  NEXUSFLOW_VERIFY_FRONTEND_URL="$PUBLIC_URL" \
  NEXUSFLOW_VERIFY_FRONTEND_ROUTES="/ /login /dashboard" \
    "$SCRIPT_DIR/verify-release.sh" \
      --release-dir "$RELEASES_ROOT/$BUILD_SHA" \
      --sha "$BUILD_SHA"
}

local_runtime_sha() {
  curl --fail --silent --show-error \
    --connect-timeout 3 \
    --max-time 10 \
    http://127.0.0.1:3001/api/version |
    node -e '
      let body = "";
      process.stdin.on("data", (chunk) => { body += chunk; });
      process.stdin.on("end", () => {
        const sha = String(JSON.parse(body).sha || "").toLowerCase();
        if (!/^[0-9a-f]{40}$/.test(sha)) process.exit(1);
        process.stdout.write(sha);
      });
    '
}

peer_runtime_sha() {
  peer_release_command \
    "curl --fail --silent --show-error --connect-timeout 3 --max-time 10 http://127.0.0.1:3001/api/version" |
    node -e '
      let body = "";
      process.stdin.on("data", (chunk) => { body += chunk; });
      process.stdin.on("end", () => {
        const sha = String(JSON.parse(body).sha || "").toLowerCase();
        if (!/^[0-9a-f]{40}$/.test(sha)) process.exit(1);
        process.stdout.write(sha);
      });
    '
}

session_security_recover_after_failed_legacy_rollback() {
  "$SESSION_SECURITY_DOWNGRADED" || return 0

  # If the rollback transaction never changed the posture, recovery is already
  # complete. This also covers interruption immediately before DB commit.
  if session_security_command posture --expect hash-only; then
    SESSION_SECURITY_DOWNGRADED=false
    SESSION_SECURITY_TRANSITION_OWNER=""
    SESSION_ROLLBACK_PREPARED=false
    return 0
  fi

  local local_sha=""
  local peer_sha=""
  local recovery_node=""
  local_sha="$(local_runtime_sha 2>/dev/null || true)"
  peer_sha="$(peer_runtime_sha 2>/dev/null || true)"

  # Prefer the node already carrying traffic, but admit only a directly
  # verified hash-capable build. Routing it first keeps every legacy or unknown
  # runtime drained before the DB returns to hash-only.
  case "$RECOVERY_TRAFFIC_MODE" in
    local)
      if test "$local_sha" = "$BUILD_SHA" && direct_local_verify; then
        recovery_node=local
      fi
      ;;
    peer)
      if test "$peer_sha" = "$BUILD_SHA" && direct_peer_verify; then
        recovery_node=peer
      fi
      ;;
  esac
  if test -z "$recovery_node" &&
    test "$local_sha" = "$BUILD_SHA" &&
    direct_local_verify; then
    recovery_node=local
  fi
  if test -z "$recovery_node" &&
    test "$peer_sha" = "$BUILD_SHA" &&
    direct_peer_verify; then
    recovery_node=peer
  fi
  if test -z "$recovery_node"; then
    release_log "CRITICAL: legacy rollback compatibility remains active and no hash-capable runtime could be directly verified"
    release_log "manual recovery: keep legacy/unknown nodes drained, activate and verify $BUILD_SHA on one node, route only that node, then run the forward session transition"
    return 1
  fi

  release_log "failed legacy rollback: quarantining traffic on verified hash-capable node $recovery_node"
  "$TRAFFIC_HOOK" route "$recovery_node" || return 1
  "$TRAFFIC_HOOK" assert "$recovery_node" || return 1
  RECOVERY_TRAFFIC_MODE="$recovery_node"
  session_security_set_hash_only \
    "Automatic security recovery after a legacy rollback failed" || {
      release_log "CRITICAL: traffic is isolated on a new hash-writing binary, but the DB hash-only transition failed"
      release_log "manual recovery: rerun scripts/session-token-security.mjs transition --direction forward for $BUILD_SHA, verify hash-only posture, and keep the other node drained"
      return 1
    }
  release_log "hash-only session posture restored after failed legacy rollback; all prior sessions were revoked"
}

session_security_commit_verified_baseline_rollback() {
  if "$BASELINE_SESSION_HASH_CAPABLE"; then
    session_security_command posture --expect hash-only || return 1
  else
    test "$(local_runtime_sha)" = "$BASELINE_SHA" || return 1
    test "$(peer_runtime_sha)" = "$BASELINE_SHA" || return 1
    session_security_command posture --expect dual || return 1
  fi
  SESSION_SECURITY_DOWNGRADED=false
  SESSION_SECURITY_TRANSITION_OWNER=""
}

if "$VERIFY_ONLY"; then
  "$SCRIPT_DIR/deploy-production.sh" verify --sha "$BUILD_SHA"
  peer_release_command \
    "cd '$PEER_ROOT' && scripts/deploy-production.sh verify --sha '$BUILD_SHA'"
  public_verify
  "$TRAFFIC_HOOK" assert balanced
  if test -f "$RELEASES_ROOT/$BUILD_SHA/.release-capabilities.json"; then
    node -e '
      const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      if (value?.providerCostTiers !== true) process.exit(1);
    ' "$RELEASES_ROOT/$BUILD_SHA/.release-capabilities.json" ||
      release_die "deployed release has an invalid provider-cost capability"
    provider_cost_verify_active ||
      release_die "deployed provider cost price book is not fully active"
  fi
  release_log "both nodes and the public ALB path verified at $BUILD_SHA"
  exit 0
fi

if "$DRY_RUN"; then
  "$SCRIPT_DIR/build-release-artifact.sh" --sha "$BUILD_SHA" --dry-run
  release_log "dry-run release plan:"
  release_log "  1. build one immutable archive and SHA-256 manifest"
  release_log "  2. install that exact archive on local and peer"
  release_log "  3. create and verify a fresh PostgreSQL backup"
  release_log "  4. run migrations once under a PostgreSQL advisory lock"
  release_log "  5. record a stable release event after migration 014"
  release_log "  6. route local-only; activate and verify peer"
  release_log "  7. route peer-only; activate and verify local"
  release_log "  8. privately dry-run/apply and verify the reviewed provider cost price book"
  release_log "  9. restore balanced traffic and verify public chunks"
  release_log " 10. record verified runtime nodes and the terminal result"
  release_log " 11. deactivate the price book before any incompatible rollback target"
  exit 0
fi

BUNDLE="$(mktemp /tmp/nexusflow-release-source.XXXXXX.bundle)"
PEER_STATIC_ARCHIVE="$(mktemp /tmp/nexusflow-peer-static.XXXXXX.tar)"
ARTIFACT="$ARTIFACTS_ROOT/nexusflow-${BUILD_SHA}.tar.gz"
PEER_STAGING=""
REMOTE_BUNDLE=""
REMOTE_ARTIFACT=""
RECOVERY_TRAFFIC_MODE=""

cleanup_peer_staging() {
  test -n "$PEER_STAGING" || return 0
  [[ "$PEER_STAGING" =~ ^/tmp/nexusflow-release\.[A-Za-z0-9]{6,32}$ ]] ||
    return 1
  peer_release_command \
    "test -d '$PEER_STAGING' \
     && test ! -L '$PEER_STAGING' \
     && test \"\$(stat -c '%u:%g:%a' '$PEER_STAGING')\" = '0:0:700' \
     && rm -rf -- '$PEER_STAGING'"
}

cleanup_local() {
  local code=$?
  local pending_path=""
  rm -f -- "$BUNDLE" "$PEER_STATIC_ARCHIVE"
  if test -n "$PEER_STAGING"; then
    cleanup_peer_staging ||
      release_log "warning: validated peer staging cleanup failed: $PEER_STAGING"
  fi
  if test "$code" -ne 0 && "$SESSION_SECURITY_DOWNGRADED"; then
    release_log "release exited while legacy session compatibility was owned by $SESSION_SECURITY_TRANSITION_OWNER; attempting locked hash-only recovery"
    if ! session_security_recover_after_failed_legacy_rollback; then
      # Never let a generic EXIT recovery re-admit both nodes while the
      # database remains in legacy-compatible mode after a failed rollback.
      if test "$RECOVERY_TRAFFIC_MODE" = "balanced"; then
        RECOVERY_TRAFFIC_MODE=""
      fi
      release_log "CRITICAL: automatic session-security recovery is incomplete; do not balance traffic"
    fi
  fi
  if test "$code" -ne 0 &&
    "$PROVIDER_COST_ROLLBACK_TRANSITION_STARTED" &&
    ! "$PROVIDER_COST_ROLLBACK_COMMITTED"; then
    release_log "release exited during a provider-cost rollback transition; checking price-book compatibility"
    if ! provider_cost_recover_after_failed_rollback; then
      if test "$RECOVERY_TRAFFIC_MODE" = "balanced"; then
        RECOVERY_TRAFFIC_MODE=""
      fi
      release_log "CRITICAL: automatic provider-cost recovery is incomplete; do not balance traffic"
    fi
  fi
  if test "$code" -ne 0 && test -n "$RECOVERY_TRAFFIC_MODE"; then
    release_log "unexpected release exit; restoring safe traffic mode $RECOVERY_TRAFFIC_MODE"
    "$TRAFFIC_HOOK" route "$RECOVERY_TRAFFIC_MODE" ||
      release_log "automatic traffic recovery failed; keep the last known-good node serving"
  fi
  if test "$code" -ne 0 && "$RELEASE_LIVE" && ! "$RELEASE_SUCCEEDED" &&
    ! "$TERMINAL_TELEMETRY_PENDING"; then
    TERMINAL_TELEMETRY_PENDING=true
    pending_path="$(write_terminal_telemetry_outbox 2>/dev/null || true)"
    if test -n "$pending_path"; then
      release_log "terminal success telemetry is pending reconciliation: $pending_path"
    else
      release_log "terminal success telemetry and durable outbox persistence both failed"
    fi
  fi
  if test "$code" -ne 0 && "$TELEMETRY_ACTIVE" && ! "$RELEASE_SUCCEEDED" &&
    ! "$RELEASE_LIVE"; then
    telemetry_event_best_effort \
      failed \
      "Release attempt ended unsuccessfully; authoritative details remain in release logs"
  fi
  if ! cleanup_provider_cost_manifest; then
    release_log "CRITICAL: private provider-cost staging cleanup failed; remove the validated root-only staging directory manually"
  fi
  exit "$code"
}
trap cleanup_local EXIT
trap 'exit 130' INT TERM

PEER_STAGING="$(
  peer_release_command \
    "umask 077
     staging=\$(mktemp -d /tmp/nexusflow-release.XXXXXX)
     test -d \"\$staging\"
     test ! -L \"\$staging\"
     test \"\$(stat -c '%u:%g:%a' \"\$staging\")\" = '0:0:700'
     printf '%s' \"\$staging\""
)" || release_die "could not create a private peer release staging directory"
[[ "$PEER_STAGING" =~ ^/tmp/nexusflow-release\.[A-Za-z0-9]{6,32}$ ]] ||
  release_die "peer returned an unsafe release staging path"
REMOTE_BUNDLE="$PEER_STAGING/source.bundle"
REMOTE_ARTIFACT="$PEER_STAGING/nexusflow-${BUILD_SHA}.tar.gz"

release_log "synchronizing the exact release source to peer"
git bundle create "$BUNDLE" HEAD
scp -q "$BUNDLE" "root@$PEER_HOST:$REMOTE_BUNDLE"
peer_release_command \
  "test -f '$REMOTE_BUNDLE' \
   && test ! -L '$REMOTE_BUNDLE' \
   && chown 0:0 '$REMOTE_BUNDLE' \
   && chmod 0600 '$REMOTE_BUNDLE' \
   && test \"\$(stat -c '%u:%g:%a' '$REMOTE_BUNDLE')\" = '0:0:600' \
   && cd '$PEER_ROOT' \
   && git fetch '$REMOTE_BUNDLE' HEAD \
   && git merge --ff-only FETCH_HEAD \
   && test \"\$(git rev-parse HEAD)\" = '$BUILD_SHA' \
   && git update-ref refs/remotes/origin/main '$BUILD_SHA' \
   && test \"\$(git rev-parse origin/main)\" = '$BUILD_SHA'"

release_log "verifying the common rollback baseline on both nodes"
BASELINE_SHA="$(local_runtime_sha)" ||
  release_die "local runtime did not report a valid rollback SHA"
PEER_BASELINE_SHA="$(peer_runtime_sha)" ||
  release_die "peer runtime did not report a valid rollback SHA"
release_validate_sha "$BASELINE_SHA"
release_validate_sha "$PEER_BASELINE_SHA"
test "$BASELINE_SHA" = "$PEER_BASELINE_SHA" ||
  release_die "nodes do not share one rollback baseline; refusing to release"
"$SCRIPT_DIR/deploy-production.sh" verify --sha "$BASELINE_SHA"
peer_release_command \
  "cd '$PEER_ROOT' && scripts/deploy-production.sh verify --sha '$BASELINE_SHA'"
BASELINE_RELEASE_DIRECTORY="$(release_resolve_path "$CURRENT_LINK" 2>/dev/null || printf '%s' "$ROOT")"
if test -f "$BASELINE_RELEASE_DIRECTORY/.release-capabilities.json" &&
  node -e '
    const value = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (
      value?.sessionHashOnlyCutover !== true ||
      value?.providerCostTiers !== true
    ) process.exit(1);
  ' "$BASELINE_RELEASE_DIRECTORY/.release-capabilities.json"; then
  BASELINE_SESSION_HASH_CAPABLE=true
  BASELINE_PROVIDER_COST_CAPABLE=true
fi
PEER_BASELINE_CAPABILITIES="$(
  peer_release_command \
    "current=''
     candidate=''
     if candidate=\$(readlink -f '$CURRENT_LINK' 2>/dev/null) \
       && test -d \"\$candidate\"; then
       current=\"\$candidate\"
     else
       current='$PEER_ROOT'
     fi
     if test -f \"\$current/.release-capabilities.json\"; then
       node -e '
         const value = JSON.parse(require(\"fs\").readFileSync(process.argv[1], \"utf8\"));
         if (
           value?.sessionHashOnlyCutover !== true ||
           value?.providerCostTiers !== true
         ) process.exit(1);
       ' \"\$current/.release-capabilities.json\" || exit 1
       printf managed
     else
       printf legacy
     fi"
)" || release_die "peer rollback baseline has a malformed release capability marker"
if test "$PEER_BASELINE_CAPABILITIES" = "managed"; then
  PEER_BASELINE_SESSION_HASH_CAPABLE=true
  PEER_BASELINE_PROVIDER_COST_CAPABLE=true
elif test "$PEER_BASELINE_CAPABILITIES" != "legacy"; then
  release_die "peer rollback baseline returned an invalid release capability state"
fi
test "$BASELINE_SESSION_HASH_CAPABLE" = "$PEER_BASELINE_SESSION_HASH_CAPABLE" ||
  release_die "rollback baseline session capabilities differ between nodes"
test "$BASELINE_PROVIDER_COST_CAPABLE" = "$PEER_BASELINE_PROVIDER_COST_CAPABLE" ||
  release_die "rollback baseline provider-cost capabilities differ between nodes"

release_log "capturing the peer's active Next.js static assets"
peer_release_command \
  "current=''
   candidate=''
   if candidate=\$(readlink -f '$CURRENT_LINK' 2>/dev/null) \
     && test -d \"\$candidate\"; then
     current=\"\$candidate\"
   else
     current='$PEER_ROOT'
   fi
   test -d \"\$current/frontend/.next/static\" \
   && tar -C \"\$current/frontend/.next/static\" -cf - ." \
  > "$PEER_STATIC_ARCHIVE"
tar -tf "$PEER_STATIC_ARCHIVE" >/dev/null ||
  release_die "peer static asset archive is invalid"

release_log "building the immutable artifact once"
"$SCRIPT_DIR/build-release-artifact.sh" \
  --sha "$BUILD_SHA" \
  --output "$ARTIFACT" \
  --extra-static-archive "$PEER_STATIC_ARCHIVE" >/dev/null

release_log "installing the exact artifact locally"
"$SCRIPT_DIR/deploy-production.sh" install --artifact "$ARTIFACT" --sha "$BUILD_SHA"

release_log "distributing the exact artifact to peer"
scp -q "$ARTIFACT" "root@$PEER_HOST:$REMOTE_ARTIFACT"
scp -q "${ARTIFACT}.sha256" "root@$PEER_HOST:${REMOTE_ARTIFACT}.sha256"
peer_release_command \
  "test -f '$REMOTE_ARTIFACT' \
   && test ! -L '$REMOTE_ARTIFACT' \
   && test -f '${REMOTE_ARTIFACT}.sha256' \
   && test ! -L '${REMOTE_ARTIFACT}.sha256' \
   && chown 0:0 '$REMOTE_ARTIFACT' '${REMOTE_ARTIFACT}.sha256' \
   && chmod 0600 '$REMOTE_ARTIFACT' '${REMOTE_ARTIFACT}.sha256' \
   && test \"\$(stat -c '%u:%g:%a' '$REMOTE_ARTIFACT')\" = '0:0:600' \
   && test \"\$(stat -c '%u:%g:%a' '${REMOTE_ARTIFACT}.sha256')\" = '0:0:600' \
   && cd '$PEER_ROOT' \
   && scripts/deploy-production.sh install \
        --artifact '$REMOTE_ARTIFACT' \
        --sha '$BUILD_SHA'"

release_log "creating the mandatory pre-migration database backup"
BACKUP_PATH="$("$DB_BACKUP_HOOK" backup "$BUILD_SHA")"
test -n "$BACKUP_PATH" || release_die "database backup hook returned no backup path"
"$DB_BACKUP_HOOK" verify "$BACKUP_PATH"
"$DB_BACKUP_HOOK" restore-verify "$BACKUP_PATH"

release_log "running database migrations once under advisory lock"
NEXUSFLOW_APP_ROOT="$RELEASES_ROOT/$BUILD_SHA" \
NEXUSFLOW_BACKEND_ENV="$BACKEND_ENV" \
  node "$RELEASES_ROOT/$BUILD_SHA/scripts/migrate-with-lock.mjs"

test -f "$TELEMETRY_SCRIPT" ||
  release_die "release telemetry recorder is missing from the installed artifact"
test -f "$SESSION_SECURITY_SCRIPT" ||
  release_die "session security transition hook is missing from the installed artifact"
test -f "$PROVIDER_COST_RELEASE_CONTROL" ||
  release_die "provider-cost release control is missing from the installed artifact"
RELEASE_BUILD_TIME="$(
  node -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).builtAt;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) process.exit(1);
    process.stdout.write(new Date(value).toISOString());
  ' "$RELEASES_ROOT/$BUILD_SHA/backend/dist/build-info.json"
)" || release_die "release build timestamp is invalid"
LOCAL_HOSTNAME="$(hostname -f 2>/dev/null || hostname)"
PEER_HOSTNAME="$(peer_release_command 'hostname -f 2>/dev/null || hostname')"
TELEMETRY_ACTIVE=true
release_log "release telemetry ID: $RELEASE_ID"
telemetry_event_required \
  started \
  "Immutable artifact, backup, and migration gates passed; rollout started"
if "$BASELINE_SESSION_HASH_CAPABLE"; then
  session_security_command posture --expect hash-only ||
    release_die "hash-capable baseline does not have hash-only session posture"
else
  session_security_command posture --expect dual ||
    release_die "legacy baseline does not have dual-read session posture"
fi

rollback_peer_while_local_serves() {
  RECOVERY_TRAFFIC_MODE=local
  release_log "rolling peer back while local remains the only ALB target"
  "$TRAFFIC_HOOK" assert local || return 1
  wait_peer_drained || return 1
  provider_cost_prepare_baseline_rollback || return 1
  session_security_prepare_baseline_rollback
  peer_release_command \
    "cd '$PEER_ROOT' \
     && NEXUSFLOW_DRAIN_CONFIRMED=true \
        NEXUSFLOW_SESSION_ROLLBACK_PREPARED='$SESSION_ROLLBACK_PREPARED' \
        scripts/deploy-production.sh rollback" || return 1
  peer_release_command \
    "cd '$PEER_ROOT' && scripts/deploy-production.sh verify --sha '$BASELINE_SHA'" ||
    return 1
}

rollback_both_from_peer() {
  telemetry_mark_rollback_started
  RECOVERY_TRAFFIC_MODE=peer
  release_log "restoring both previous releases"
  "$TRAFFIC_HOOK" route peer || return 1
  wait_local_drained || return 1
  provider_cost_prepare_baseline_rollback || return 1
  session_security_prepare_baseline_rollback
  NEXUSFLOW_DRAIN_CONFIRMED=true \
  NEXUSFLOW_SESSION_ROLLBACK_PREPARED="$SESSION_ROLLBACK_PREPARED" \
    "$SCRIPT_DIR/deploy-production.sh" rollback || return 1
  "$SCRIPT_DIR/deploy-production.sh" verify --sha "$BASELINE_SHA" || return 1
  "$TRAFFIC_HOOK" route local || return 1
  RECOVERY_TRAFFIC_MODE=local
  rollback_peer_while_local_serves || return 1
  session_security_commit_verified_baseline_rollback ||
    release_die "both rollback runtimes are not consistent with the required session posture"
  provider_cost_commit_verified_baseline_rollback ||
    release_die "both rollback runtimes are not consistent with the required provider-cost posture"
  "$TRAFFIC_HOOK" route balanced || return 1
  RECOVERY_TRAFFIC_MODE=balanced
  telemetry_mark_rolled_back
}

rollback_both_from_local() {
  telemetry_mark_rollback_started
  RECOVERY_TRAFFIC_MODE=local
  release_log "restoring both previous releases with local as the known-good target"
  "$TRAFFIC_HOOK" route local || return 1
  provider_cost_prepare_baseline_rollback || return 1
  session_security_prepare_baseline_rollback
  rollback_peer_while_local_serves || return 1
  "$TRAFFIC_HOOK" route peer || return 1
  RECOVERY_TRAFFIC_MODE=peer
  wait_local_drained || return 1
  NEXUSFLOW_DRAIN_CONFIRMED=true \
  NEXUSFLOW_SESSION_ROLLBACK_PREPARED="$SESSION_ROLLBACK_PREPARED" \
    "$SCRIPT_DIR/deploy-production.sh" rollback || return 1
  "$SCRIPT_DIR/deploy-production.sh" verify --sha "$BASELINE_SHA" || return 1
  session_security_commit_verified_baseline_rollback ||
    release_die "both rollback runtimes are not consistent with the required session posture"
  provider_cost_commit_verified_baseline_rollback ||
    release_die "both rollback runtimes are not consistent with the required provider-cost posture"
  "$TRAFFIC_HOOK" route balanced || return 1
  RECOVERY_TRAFFIC_MODE=balanced
  telemetry_mark_rolled_back
}

telemetry_event_required \
  node_started \
  "Node rollout sequence started; traffic exclusion is required before activation" \
  "$PEER_NODE_ID"
release_log "draining peer through the ALB"
RECOVERY_TRAFFIC_MODE=balanced
"$TRAFFIC_HOOK" route local
RECOVERY_TRAFFIC_MODE=local
if ! wait_peer_drained; then
  "$TRAFFIC_HOOK" route balanced
  RECOVERY_TRAFFIC_MODE=balanced
  telemetry_event_best_effort \
    node_failed \
    "Node activation or verification did not complete successfully" \
    "$PEER_NODE_ID"
  release_die "peer did not drain; no release was activated"
fi

PEER_ACTIVATION_STATUS=0
if peer_release_command \
  "cd '$PEER_ROOT' \
   && NEXUSFLOW_DRAIN_CONFIRMED=true \
      scripts/deploy-production.sh activate --sha '$BUILD_SHA'"; then
  :
else
  PEER_ACTIVATION_STATUS=$?
  telemetry_event_best_effort \
    node_failed \
    "Node activation or verification did not complete successfully" \
    "$PEER_NODE_ID"
  telemetry_mark_rollback_started
  if test "$PEER_ACTIVATION_STATUS" = "20" &&
    peer_release_command \
      "cd '$PEER_ROOT' && scripts/deploy-production.sh verify --sha '$BASELINE_SHA'"; then
    "$TRAFFIC_HOOK" route balanced
    RECOVERY_TRAFFIC_MODE=balanced
    telemetry_mark_rolled_back
    release_die "peer activation failed; peer performed its local automatic rollback"
  fi
  release_die "peer activation did not complete a durable automatic rollback; peer remains drained"
fi

if ! direct_peer_verify; then
  telemetry_event_best_effort \
    node_failed \
    "Node activation or verification did not complete successfully" \
    "$PEER_NODE_ID"
  telemetry_mark_rollback_started
  rollback_peer_while_local_serves
  "$TRAFFIC_HOOK" route balanced
  RECOVERY_TRAFFIC_MODE=balanced
  telemetry_mark_rolled_back
  release_die "peer verification failed; previous release restored"
fi
telemetry_node_verified "$PEER_NODE_ID" "$PEER_HOSTNAME"
# Peer now runs the new build while the old local node is still serving.
# An unexpected exit must keep peer excluded; balancing here would mix builds.
RECOVERY_TRAFFIC_MODE=local

if ! telemetry_retry telemetry_event \
  node_started \
  "Node rollout sequence started; traffic exclusion is required before activation" \
  "$LOCAL_NODE_ID"; then
  telemetry_mark_rollback_started
  rollback_peer_while_local_serves
  "$TRAFFIC_HOOK" route balanced
  RECOVERY_TRAFFIC_MODE=balanced
  telemetry_mark_rolled_back
  release_die "release telemetry failed before the local-node traffic mutation; peer was restored"
fi
release_log "atomically routing all traffic to the verified peer"
"$TRAFFIC_HOOK" route peer
RECOVERY_TRAFFIC_MODE=peer
if ! wait_local_drained; then
  telemetry_event_best_effort \
    node_failed \
    "Node activation or verification did not complete successfully" \
    "$LOCAL_NODE_ID"
  telemetry_mark_rollback_started
  "$TRAFFIC_HOOK" route local
  rollback_peer_while_local_serves
  "$TRAFFIC_HOOK" route balanced
  RECOVERY_TRAFFIC_MODE=balanced
  telemetry_mark_rolled_back
  release_die "local did not drain; peer release was rolled back"
fi
if ! public_verify; then
  telemetry_event_best_effort \
    node_failed \
    "Node activation or verification did not complete successfully" \
    "$PEER_NODE_ID"
  telemetry_mark_rollback_started
  "$TRAFFIC_HOOK" route local
  rollback_peer_while_local_serves
  "$TRAFFIC_HOOK" route balanced
  RECOVERY_TRAFFIC_MODE=balanced
  telemetry_mark_rolled_back
  release_die "public peer-only verification failed; previous release restored"
fi

release_log "activating local while it is drained"
LOCAL_ACTIVATION_STATUS=0
if NEXUSFLOW_DRAIN_CONFIRMED=true \
  "$SCRIPT_DIR/deploy-production.sh" activate --sha "$BUILD_SHA"; then
  :
else
  LOCAL_ACTIVATION_STATUS=$?
  telemetry_event_best_effort \
    node_failed \
    "Node activation or verification did not complete successfully" \
    "$LOCAL_NODE_ID"
  telemetry_mark_rollback_started
  if test "$LOCAL_ACTIVATION_STATUS" = "20" &&
    "$SCRIPT_DIR/deploy-production.sh" verify --sha "$BASELINE_SHA"; then
    "$TRAFFIC_HOOK" route local
    rollback_peer_while_local_serves
    "$TRAFFIC_HOOK" route balanced
    RECOVERY_TRAFFIC_MODE=balanced
    telemetry_mark_rolled_back
    release_die "local activation failed; both application nodes were restored"
  fi
  release_die "local activation did not complete a durable automatic rollback; local remains drained and peer keeps serving"
fi
telemetry_node_verified "$LOCAL_NODE_ID" "$LOCAL_HOSTNAME"

release_log "privately validating and activating the reviewed provider cost price book"
if ! provider_cost_activate; then
  if rollback_both_from_peer; then
    release_die "provider cost price book activation failed; both application nodes were restored"
  fi
  release_die "provider cost price book activation failed and the previous release could not be safely restored; verified new peer remains the only target"
fi

release_log "revoking existing sessions and enabling hash-only bearer storage"
session_security_forward_cutover

release_log "restoring balanced traffic"
"$TRAFFIC_HOOK" route balanced
RECOVERY_TRAFFIC_MODE=balanced
if ! public_verify; then
  rollback_both_from_peer
  release_die "balanced public verification failed; both application nodes were restored"
fi

if ! direct_peer_verify; then
  telemetry_event_best_effort \
    node_failed \
    "Node activation or verification did not complete successfully" \
    "$PEER_NODE_ID"
  rollback_both_from_local
  release_die "final peer verification failed; both application nodes were restored"
fi
if ! "$SCRIPT_DIR/deploy-production.sh" verify --sha "$BUILD_SHA"; then
  telemetry_event_best_effort \
    node_failed \
    "Node activation or verification did not complete successfully" \
    "$LOCAL_NODE_ID"
  rollback_both_from_peer
  release_die "final local verification failed; both application nodes were restored"
fi
"$TRAFFIC_HOOK" assert balanced
session_security_command posture --expect hash-only ||
  release_die "final session token posture is not hash-only"
provider_cost_verify_active ||
  release_die "final provider cost price book is not fully active"
test "$SESSION_SECURITY_DOWNGRADED" = "false" ||
  release_die "final release cannot succeed while a legacy session transition is owned by this release"
test "$(local_runtime_sha)" = "$BUILD_SHA" ||
  release_die "final local runtime SHA changed before terminal success"
test "$(peer_runtime_sha)" = "$BUILD_SHA" ||
  release_die "final peer runtime SHA changed before terminal success"
RELEASE_LIVE=true
RECOVERY_TRAFFIC_MODE=""
cleanup_provider_cost_manifest ||
  release_die "release is live, but private provider-cost staging cleanup failed"
if telemetry_retry telemetry_event succeeded "$TERMINAL_SUCCESS_MESSAGE"; then
  RELEASE_SUCCEEDED=true
else
  if OUTBOX_PATH="$(write_terminal_telemetry_outbox)"; then
    TERMINAL_TELEMETRY_PENDING=true
  else
    release_die "terminal success telemetry failed and its durable outbox could not be written; release remains live and balanced"
  fi
  release_log "terminal success telemetry is pending reconciliation: $OUTBOX_PATH"
  release_die "release is live and balanced, but terminal success telemetry is pending"
fi

if cleanup_peer_staging; then
  PEER_STAGING=""
else
  release_log "warning: peer temporary artifact cleanup failed"
fi

RECOVERY_TRAFFIC_MODE=""
release_log "both production nodes are running immutable release $BUILD_SHA"
release_log "database backup: $BACKUP_PATH"
