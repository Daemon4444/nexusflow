#!/usr/bin/env bash
# Ships finished hourly payload-capture spool files (see
# backend/src/services/payload-capture.ts) to R2 through the encrypted rclone
# remote, then removes them locally. Runs hourly from cron on every app node.
#
# Spool:  $NF_PAYLOAD_CAPTURE_DIR/<label>/<YYYY-MM-DD>/<HH>-<node>.jsonl  (Beijing time)
# R2:     $NF_PAYLOAD_CAPTURE_REMOTE<label>/capture/<YYYY-MM-DD>/<HH>-<node>.jsonl.gz
#
# A file is shipped once its hour is over and it has been quiet for
# QUIET_MINUTES (a long request finishing late appends to the hour it
# started in). A line appended after shipping creates the file again; it is
# shipped under a -late<epoch> name so nothing already in R2 is overwritten.
set -euo pipefail

DIR="${NF_PAYLOAD_CAPTURE_DIR:-/var/lib/nexusflow/payload-capture}"
REMOTE="${NF_PAYLOAD_CAPTURE_REMOTE:-nfarc:}"
QUIET_MINUTES="${QUIET_MINUTES:-15}"
LEDGER="$DIR/.shipped.log"

[ -d "$DIR" ] || exit 0
current_hour_file="$(TZ=Asia/Shanghai date +%Y-%m-%d)/$(TZ=Asia/Shanghai date +%H)-"
failures=0

while IFS= read -r -d '' file; do
  rel="${file#"$DIR"/}"                    # label/day/HH-node.jsonl
  label="${rel%%/*}"
  rest="${rel#*/}"                         # day/HH-node.jsonl
  case "$rest" in "$current_hour_file"*) continue ;; esac

  sealed="$file.sealed"
  mv "$file" "$sealed"
  sleep 2                                  # let an append that already opened the file finish
  lines="$(wc -l < "$sealed" | tr -d ' ')"
  gzip -9 -c "$sealed" > "$sealed.gz"

  target="${REMOTE}${label}/capture/${rest}.gz"
  if [ -n "$(rclone lsf "$target" 2>/dev/null)" ]; then
    target="${REMOTE}${label}/capture/${rest%.jsonl}-late$(date +%s).jsonl.gz"
  fi
  if rclone copyto "$sealed.gz" "$target" --retries 5 --low-level-retries 10 -q \
    && [ "$(rclone lsf --format s "$target")" = "$(stat -c %s "$sealed.gz")" ]; then
    printf '%s\t%s\t%s\t%s\n' "$(date -Is)" "$target" "$lines" "$(stat -c %s "$sealed.gz")" >> "$LEDGER"
    rm -f "$sealed" "$sealed.gz"
  else
    # Leave the sealed file for the next run; put it back under its name.
    echo "upload failed: $target" >&2
    rm -f "$sealed.gz"
    if [ -e "$file" ]; then cat "$file" >> "$sealed" && rm -f "$file"; fi
    mv "$sealed" "$file"
    failures=$((failures + 1))
  fi
done < <(find "$DIR" -mindepth 3 -maxdepth 3 -type f -name '*.jsonl' -mmin "+$QUIET_MINUTES" -print0)

# Sealed files left over from an interrupted run go back into the queue.
while IFS= read -r -d '' stale; do
  original="${stale%.sealed}"
  rm -f "$stale.gz"
  if [ -e "$original" ]; then cat "$original" >> "$stale" && rm -f "$original"; fi
  mv "$stale" "$original"
done < <(find "$DIR" -mindepth 3 -maxdepth 3 -type f -name '*.jsonl.sealed' -mmin +60 -print0)

exit "$failures"
