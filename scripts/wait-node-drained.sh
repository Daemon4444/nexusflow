#!/usr/bin/env bash

set -euo pipefail

PORT="${NEXUSFLOW_DRAIN_PORT:-80}"
TIMEOUT="${NEXUSFLOW_DRAIN_TIMEOUT_SECONDS:-300}"
REQUIRED_ZERO_SAMPLES="${NEXUSFLOW_DRAIN_ZERO_SAMPLES:-3}"

die() {
  printf '[drain-check] ERROR: %s\n' "$*" >&2
  exit 1
}

for value in "$PORT" "$TIMEOUT" "$REQUIRED_ZERO_SAMPLES"; do
  case "$value" in
    ''|*[!0-9]*) die "port, timeout and sample count must be positive integers" ;;
  esac
  test "$value" -gt 0 || die "port, timeout and sample count must be positive"
done

command -v ss >/dev/null 2>&1 || die "ss is unavailable"

deadline=$((SECONDS + TIMEOUT))
zero_samples=0

while test "$SECONDS" -lt "$deadline"; do
  active="$(
    ss -Htn state established "( sport = :$PORT )" 2>/dev/null |
      wc -l |
      tr -d ' '
  )"
  if test "$active" -eq 0; then
    zero_samples=$((zero_samples + 1))
    if test "$zero_samples" -ge "$REQUIRED_ZERO_SAMPLES"; then
      printf '[drain-check] port %s has no established connections\n' "$PORT" >&2
      exit 0
    fi
  else
    zero_samples=0
  fi
  sleep 2
done

die "port $PORT still has established connections after ${TIMEOUT}s"
