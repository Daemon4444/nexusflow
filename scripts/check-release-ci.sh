#!/usr/bin/env bash
#
# Release CI gate: refuse to release a commit whose GitHub "ci" workflow did
# not conclude with success. It is read-only and runs before any release
# action.
#
# Usage:
#   check-release-ci.sh --sha <40-char-sha> [--override-ci "<reason>"]
#
# Data source (first available):
#   1. `gh api repos/{owner}/{repo}/commits/{sha}/check-runs`
#   2. `curl` with $GITHUB_TOKEN against the same REST endpoint
#
# Environment:
#   NEXUSFLOW_GITHUB_REPOSITORY  owner/repo (default Daemon4444/nexusflow)
#   NEXUSFLOW_CI_CHECK_NAMES     comma-separated check-run names that must all
#                                succeed (default: every check run of the
#                                "ci" workflow; see below)
#   NEXUSFLOW_GITHUB_API_URL     API base (default https://api.github.com)
#
# Exit codes: 0 = CI green (or explicit override), 1 = refused.
# On override the reason is printed on stdout as `ci-override:<reason>` so the
# orchestrator can attach it to release telemetry.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/release-common.sh
source "$SCRIPT_DIR/release-common.sh"

REPOSITORY="${NEXUSFLOW_GITHUB_REPOSITORY:-Daemon4444/nexusflow}"
API_URL="${NEXUSFLOW_GITHUB_API_URL:-https://api.github.com}"
SHA=""
OVERRIDE_REASON=""
OVERRIDE_SET=false

while test "$#" -gt 0; do
  case "$1" in
    --sha)
      test "$#" -ge 2 || release_die "--sha requires a value"
      SHA="$2"
      shift 2
      ;;
    --override-ci)
      test "$#" -ge 2 || release_die "--override-ci requires a reason"
      OVERRIDE_REASON="$2"
      OVERRIDE_SET=true
      shift 2
      ;;
    *)
      release_die "unknown ci-gate argument: $1"
      ;;
  esac
done

release_validate_sha "$SHA"
case "$REPOSITORY" in
  */*) ;;
  *) release_die "NEXUSFLOW_GITHUB_REPOSITORY must be owner/repo" ;;
esac
case "$REPOSITORY" in
  *[!A-Za-z0-9_./-]*) release_die "NEXUSFLOW_GITHUB_REPOSITORY contains unsafe characters" ;;
esac

if "$OVERRIDE_SET"; then
  # A reason is mandatory and must be printable, bounded text so it can be
  # carried in the release telemetry message without escaping problems.
  trimmed="$(printf '%s' "$OVERRIDE_REASON" | tr -d '\r\n\t' | sed 's/^ *//; s/ *$//')"
  test "${#trimmed}" -ge 8 ||
    release_die "--override-ci requires a meaningful reason (at least 8 characters)"
  test "${#trimmed}" -le 300 ||
    release_die "--override-ci reason must not exceed 300 characters"
  release_log "WARNING: CI gate explicitly overridden for $SHA: $trimmed"
  printf 'ci-override:%s\n' "$trimmed"
  exit 0
fi

fetch_check_runs() {
  local endpoint="repos/$REPOSITORY/commits/$SHA/check-runs?per_page=100"
  if command -v gh >/dev/null 2>&1; then
    gh api -H "Accept: application/vnd.github+json" "$endpoint"
    return
  fi
  test -n "${GITHUB_TOKEN:-}" ||
    release_die "neither gh nor GITHUB_TOKEN is available to verify CI for $SHA"
  release_require_command curl
  # The token is passed through a header file descriptor so it never appears
  # in the process argument list.
  curl -fsS \
    -H "Accept: application/vnd.github+json" \
    -H @<(printf 'Authorization: Bearer %s\n' "$GITHUB_TOKEN") \
    "$API_URL/$endpoint"
}

payload="$(fetch_check_runs)" ||
  release_die "could not read GitHub check runs for $SHA"

verdict="$(
  NEXUSFLOW_CI_CHECK_NAMES="${NEXUSFLOW_CI_CHECK_NAMES:-}" node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      let body;
      try { body = JSON.parse(input); } catch { console.log("invalid"); return; }
      const runs = Array.isArray(body.check_runs) ? body.check_runs : [];
      const required = (process.env.NEXUSFLOW_CI_CHECK_NAMES || "")
        .split(",").map((name) => name.trim()).filter(Boolean);
      // Without an explicit list, every check run on the commit that belongs
      // to a GitHub Actions app counts as part of the "ci" workflow. The CI
      // workflow is the only Actions workflow in this repository.
      const relevant = required.length
        ? runs.filter((run) => required.includes(run.name))
        : runs.filter((run) => !run.app || run.app.slug === "github-actions");
      if (required.length) {
        const seen = new Set(relevant.map((run) => run.name));
        const missing = required.filter((name) => !seen.has(name));
        if (missing.length) { console.log(`missing:${missing.join(",")}`); return; }
      }
      if (!relevant.length) { console.log("missing:ci"); return; }
      const pending = relevant.filter((run) => run.status !== "completed");
      if (pending.length) { console.log(`pending:${pending.map((r) => r.name).join(",")}`); return; }
      const failed = relevant.filter((run) => !["success", "skipped", "neutral"].includes(run.conclusion));
      if (failed.length) {
        console.log(`failure:${failed.map((r) => `${r.name}=${r.conclusion}`).join(",")}`);
        return;
      }
      console.log(`success:${relevant.length}`);
    });
  ' <<<"$payload"
)"

case "$verdict" in
  success:*)
    release_log "CI gate passed for $SHA (${verdict#success:} check runs succeeded)"
    ;;
  pending:*)
    release_die "CI is still running for $SHA (${verdict#pending:}); wait for it to finish or pass --override-ci \"<reason>\""
    ;;
  failure:*)
    release_die "CI did not succeed for $SHA (${verdict#failure:}); fix CI or pass --override-ci \"<reason>\""
    ;;
  missing:*)
    release_die "no CI result found for $SHA (${verdict#missing:}); pass --override-ci \"<reason>\" only if CI is known to be unavailable"
    ;;
  *)
    release_die "GitHub returned an unreadable check-run payload for $SHA"
    ;;
esac
