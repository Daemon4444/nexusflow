/** Synthetic local subprocesses only. No cloud, credentials or customer payloads. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { db } from "../src/db/client";
import { findCapturedPayload } from "../src/services/payload-capture";

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nf-capture-regression-"));
  const exe = path.join(root, "rclone");
  process.env.NF_PAYLOAD_CAPTURE_DIR = path.join(root, "spool");
  process.env.NF_PAYLOAD_CAPTURE_REMOTE = "synthetic:";
  process.env.RCLONE_BIN = exe;
  const originalQuery = db.query;
  (db as any).query = async () => ({ rows: [] });
  const params = { logId: "synthetic-log", owner: "synthetic-user", completedAt: new Date("2026-10-11T02:45:00Z") };
  fs.writeFileSync(path.join(root, "record.gz"), gzipSync(JSON.stringify({ log_id: params.logId, user_id: params.owner, request: "synthetic", response: "synthetic" }) + "\n"));
  function script(body: string, listing = "echo 10-synthetic.jsonl.gz") {
    fs.writeFileSync(exe, `#!/bin/sh\nif [ "$1" = "lsf" ]; then\n${listing}\nelse\n${body}\nfi\n`);
    fs.chmodSync(exe, 0o700);
  }
  try {
    script(`cat '${root}/record.gz'`);
    assert.equal((await findCapturedPayload(params))?.request, "synthetic");
    script("exit 0", "exit 0");
    assert.equal(await findCapturedPayload(params), null, "successful empty listing is absence");
    script("exit 0", "exit 3");
    assert.equal(await findCapturedPayload(params), null, "missing directory is not storage failure");
    script("exit 0", "exit 1");
    await assert.rejects(findCapturedPayload(params), /capture_lookup_failed/);
    script("exit 0", 'chmod -x "$0"\necho 10-synthetic.jsonl.gz');
    await assert.rejects(findCapturedPayload(params), /capture_lookup_failed/, "spawn EACCES must reject, not terminate worker");
    script("printf 'not-gzip'");
    await assert.rejects(findCapturedPayload(params), /capture_lookup_failed/);
    script("exit 1");
    await assert.rejects(findCapturedPayload(params), /capture_lookup_failed/);
    script("exec sleep 30");
    const started = Date.now();
    await assert.rejects(findCapturedPayload(params), /capture_lookup_failed|capture_lookup_timeout/);
    assert(Date.now() - started < 20_000, "one bounded archive lookup (18 s budget)");
    script(`cat '${root}/record.gz'; exec sleep 30`);
    const early = Date.now();
    assert.equal((await findCapturedPayload(params))?.log_id, params.logId);
    assert(Date.now() - early < 1000, "matching record must stop/reap the reader early");
    console.log("PASS: archive success, absence, listing failure, spawn EACCES, invalid gzip, nonzero exit, deadline, early cleanup");
  } finally {
    db.query = originalQuery;
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
