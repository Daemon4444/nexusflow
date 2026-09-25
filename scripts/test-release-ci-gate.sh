#!/usr/bin/env bash
#
# Offline tests for scripts/check-release-ci.sh. `gh` is replaced with a stub
# that returns canned check-run payloads, so no network or token is used.

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/check-release-ci.sh"
FIXTURE="$(mktemp -d /tmp/nexusflow-ci-gate.XXXXXX)"
SHA="0123456789abcdef0123456789abcdef01234567"

cleanup() {
  case "$FIXTURE" in
    /tmp/nexusflow-ci-gate.*) rm -rf -- "$FIXTURE" ;;
  esac
}
trap cleanup EXIT INT TERM

mkdir -p "$FIXTURE/bin"
cat > "$FIXTURE/bin/gh" <<'EOF'
#!/usr/bin/env bash
# Records the endpoint and replays the payload selected by the test.
printf '%s\n' "$*" >> "$GH_STUB_LOG"
cat "$GH_STUB_PAYLOAD"
EOF
chmod 0755 "$FIXTURE/bin/gh"

failures=0
pass() { printf 'ok - %s\n' "$1"; }
fail() { printf 'not ok - %s\n' "$1"; failures=$((failures + 1)); }

run_gate() {
  PATH="$FIXTURE/bin:$PATH" \
  GH_STUB_LOG="$FIXTURE/gh.log" \
  GH_STUB_PAYLOAD="$FIXTURE/payload.json" \
    "$GATE" "$@"
}

payload() {
  printf '%s\n' "$1" > "$FIXTURE/payload.json"
}

app='"app":{"slug":"github-actions"}'

# 1. CI passed.
payload "{\"total_count\":2,\"check_runs\":[
  {\"name\":\"security\",\"status\":\"completed\",\"conclusion\":\"success\",$app},
  {\"name\":\"frontend\",\"status\":\"completed\",\"conclusion\":\"success\",$app}]}"
if run_gate --sha "$SHA" >/dev/null 2>"$FIXTURE/err"; then
  pass "CI success allows the release"
else
  fail "CI success allows the release ($(cat "$FIXTURE/err"))"
fi
grep -q "repos/Daemon4444/nexusflow/commits/$SHA/check-runs" "$FIXTURE/gh.log" &&
  pass "gate queries check-runs for the exact SHA" ||
  fail "gate queries check-runs for the exact SHA"

# 2. CI failed.
payload "{\"check_runs\":[
  {\"name\":\"security\",\"status\":\"completed\",\"conclusion\":\"success\",$app},
  {\"name\":\"billing-routing\",\"status\":\"completed\",\"conclusion\":\"failure\",$app}]}"
if run_gate --sha "$SHA" >/dev/null 2>"$FIXTURE/err"; then
  fail "CI failure blocks the release"
else
  grep -q "billing-routing=failure" "$FIXTURE/err" &&
    pass "CI failure blocks the release and names the job" ||
    fail "CI failure message names the job"
fi

# 3. CI still running.
payload "{\"check_runs\":[
  {\"name\":\"security\",\"status\":\"in_progress\",\"conclusion\":null,$app}]}"
if run_gate --sha "$SHA" >/dev/null 2>"$FIXTURE/err"; then
  fail "CI in progress blocks the release"
else
  grep -q "still running" "$FIXTURE/err" &&
    pass "CI in progress blocks the release" ||
    fail "CI in progress message"
fi

# 3b. No CI result at all.
payload '{"check_runs":[]}'
if run_gate --sha "$SHA" >/dev/null 2>&1; then
  fail "missing CI result blocks the release"
else
  pass "missing CI result blocks the release"
fi

# 3c. Non-Actions check runs (e.g. a third-party app) do not count as CI.
payload '{"check_runs":[{"name":"external","status":"completed","conclusion":"success","app":{"slug":"other-app"}}]}'
if run_gate --sha "$SHA" >/dev/null 2>&1; then
  fail "non-Actions checks are not treated as CI"
else
  pass "non-Actions checks are not treated as CI"
fi

# 4. Explicit override: bypasses the failing result and reports the reason.
payload "{\"check_runs\":[{\"name\":\"security\",\"status\":\"completed\",\"conclusion\":\"failure\",$app}]}"
: > "$FIXTURE/gh.log"
if output="$(run_gate --sha "$SHA" --override-ci "GitHub Actions outage, hotfix approved" 2>/dev/null)"; then
  test "$output" = "ci-override:GitHub Actions outage, hotfix approved" &&
    pass "override passes and emits the reason for telemetry" ||
    fail "override output was: $output"
  test ! -s "$FIXTURE/gh.log" &&
    pass "override does not need GitHub access" ||
    fail "override does not need GitHub access"
else
  fail "override passes"
fi
if run_gate --sha "$SHA" --override-ci "short" >/dev/null 2>&1; then
  fail "override requires a meaningful reason"
else
  pass "override requires a meaningful reason"
fi

# Invalid SHA never reaches GitHub.
if run_gate --sha "abc" >/dev/null 2>&1; then
  fail "invalid SHA is rejected"
else
  pass "invalid SHA is rejected"
fi

# Required-names mode: a missing named job blocks.
payload "{\"check_runs\":[{\"name\":\"security\",\"status\":\"completed\",\"conclusion\":\"success\",$app}]}"
if NEXUSFLOW_CI_CHECK_NAMES="security,frontend" run_gate --sha "$SHA" >/dev/null 2>&1; then
  fail "a missing required job blocks the release"
else
  pass "a missing required job blocks the release"
fi

# deploy-all-production.sh must invoke the gate before any hook, preflight or
# build step and must forward the override reason to telemetry.
DEPLOY="$SCRIPT_DIR/deploy-all-production.sh"
gate_line="$(grep -n '"$CI_GATE" --sha "$BUILD_SHA"' "$DEPLOY" | head -n1 | cut -d: -f1)"
hook_line="$(grep -n 'release_validate_secure_hook "$TRAFFIC_HOOK"' "$DEPLOY" | head -n1 | cut -d: -f1)"
preflight_line="$(grep -n '"$SCRIPT_DIR/deploy-production.sh" preflight' "$DEPLOY" | head -n1 | cut -d: -f1)"
if test -n "$gate_line" && test "$gate_line" -lt "$hook_line" && test "$gate_line" -lt "$preflight_line"; then
  pass "deploy orchestrator runs the CI gate before any release action"
else
  fail "deploy orchestrator runs the CI gate before any release action"
fi
grep -q '"$RELEASE_STARTED_MESSAGE"' "$DEPLOY" &&
  grep -q 'CI gate overridden' "$DEPLOY" &&
  pass "override reason is carried into the started telemetry event" ||
  fail "override reason is carried into the started telemetry event"

if test "$failures" -ne 0; then
  printf '%d release CI gate test(s) failed\n' "$failures" >&2
  exit 1
fi
printf 'release-ci-gate-ok\n'
