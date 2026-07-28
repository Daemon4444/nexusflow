#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ReconcileError,
  reconcileOutbox,
} from "./reconcile-release-telemetry.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const fixture = fs.mkdtempSync(
  path.join(os.tmpdir(), "nexusflow-telemetry-reconcile-")
);
const appRoot = path.join(fixture, "app");
const outboxDir = path.join(fixture, "outbox");
const backendEnv = path.join(appRoot, "backend/.env");
const telemetryScript = path.join(appRoot, "scripts/release-telemetry.mjs");
const uid = typeof process.getuid === "function" ? process.getuid() : 0;
const gid = typeof process.getgid === "function" ? process.getgid() : 0;

function pendingPayload(releaseId) {
  return {
    version: 1,
    releaseId,
    sha: SHA,
    eventType: "succeeded",
    message: "Both nodes verified",
  };
}

function writePending(releaseId, mode = 0o600) {
  const filename = `${releaseId}--succeeded.json`;
  const target = path.join(outboxDir, filename);
  fs.writeFileSync(target, `${JSON.stringify(pendingPayload(releaseId))}\n`, {
    mode,
  });
  fs.chmodSync(target, mode);
  return target;
}

try {
  fs.mkdirSync(path.dirname(backendEnv), { recursive: true });
  fs.mkdirSync(path.dirname(telemetryScript), { recursive: true });
  fs.mkdirSync(outboxDir, { mode: 0o700 });
  fs.chmodSync(outboxDir, 0o700);
  fs.writeFileSync(backendEnv, "PG_HOST=fixture.invalid\n", { mode: 0o600 });
  fs.writeFileSync(telemetryScript, "#!/usr/bin/env node\n", { mode: 0o700 });

  const replayed = [];
  const first = writePending("release-reconcile-1");
  fs.writeFileSync(`${first}.reconciled`, "older archive\n", { mode: 0o600 });
  const reconciled = reconcileOutbox({
    appRoot,
    backendEnv,
    outboxDir,
    requireRoot: false,
    expectedUid: uid,
    expectedGid: gid,
    environment: {},
    spawnSync(command, args, options) {
      replayed.push({ command, args, options });
      return { status: 0 };
    },
  });
  assert.equal(reconciled, 1);
  assert.equal(fs.existsSync(first), false);
  assert.equal(fs.existsSync(`${first}.reconciled.1`), true);
  assert.equal(replayed.length, 1);
  assert.deepEqual(replayed[0].args.slice(1), [
    "deployment-event",
    "--release-id",
    "release-reconcile-1",
    "--sha",
    SHA,
    "--event-type",
    "succeeded",
    "--message",
    "Both nodes verified",
  ]);
  assert.equal(replayed[0].options.env.NEXUSFLOW_BACKEND_ENV, backendEnv);

  const retained = writePending("release-reconcile-2");
  assert.throws(
    () =>
      reconcileOutbox({
        appRoot,
        backendEnv,
        outboxDir,
        requireRoot: false,
        expectedUid: uid,
        expectedGid: gid,
        environment: {},
        spawnSync() {
          return { status: 1 };
        },
      }),
    (error) =>
      error instanceof ReconcileError &&
      /pending entry was retained/.test(error.message)
  );
  assert.equal(fs.existsSync(retained), true);

  fs.unlinkSync(retained);
  const publicEntry = writePending("release-reconcile-3", 0o644);
  assert.throws(
    () =>
      reconcileOutbox({
        appRoot,
        backendEnv,
        outboxDir,
        requireRoot: false,
        expectedUid: uid,
        expectedGid: gid,
        environment: {},
        spawnSync() {
          throw new Error("must not replay an unsafe entry");
        },
      }),
    (error) =>
      error instanceof ReconcileError &&
      /private release owner and mode 0600/.test(error.message)
  );
  assert.equal(fs.existsSync(publicEntry), true);

  console.log(
    "release-telemetry-reconcile-ok replayed=1 collision=suffixed failure=retained unsafe=rejected"
  );
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
