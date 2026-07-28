#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const FULL_SHA = /^[0-9a-f]{40}$/i;

export class ReconcileError extends Error {}

function validatePrivateStat(
  stat,
  type,
  expectedMode,
  expectedUid,
  expectedGid
) {
  if (
    stat.uid !== expectedUid ||
    stat.gid !== expectedGid ||
    (stat.mode & 0o777) !== expectedMode
  ) {
    throw new ReconcileError(
      `${type} must have the private release owner and mode 0${expectedMode.toString(8)}`
    );
  }
}

export function reconcileOutbox(options = {}) {
  const environment = options.environment || process.env;
  const outboxDir = path.resolve(
    options.outboxDir ||
      environment.NEXUSFLOW_TELEMETRY_OUTBOX_DIR ||
      "/var/lib/nexusflow-release-telemetry-outbox"
  );
  const appRoot = path.resolve(
    options.appRoot || environment.NEXUSFLOW_APP_ROOT || process.cwd()
  );
  const backendEnv = path.resolve(
    options.backendEnv ||
      environment.NEXUSFLOW_BACKEND_ENV ||
      path.join(appRoot, "backend/.env")
  );
  const telemetryScript = path.join(appRoot, "scripts/release-telemetry.mjs");
  const requireRoot = options.requireRoot !== false;
  const expectedUid = options.expectedUid ?? 0;
  const expectedGid = options.expectedGid ?? 0;
  const runProcess = options.spawnSync || spawnSync;

  if (
    requireRoot &&
    (typeof process.getuid !== "function" || process.getuid() !== 0)
  ) {
    throw new ReconcileError("reconciliation must run as root");
  }
  if (!fs.existsSync(outboxDir)) {
    throw new ReconcileError(`outbox directory is missing: ${outboxDir}`);
  }
  const directoryStat = fs.lstatSync(outboxDir);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new ReconcileError("outbox path must be a real directory");
  }
  validatePrivateStat(
    directoryStat,
    "outbox directory",
    0o700,
    expectedUid,
    expectedGid
  );
  if (!fs.existsSync(telemetryScript) || !fs.existsSync(backendEnv)) {
    throw new ReconcileError(
      "release telemetry script or backend environment is unavailable"
    );
  }

  const pending = fs
    .readdirSync(outboxDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  let reconciled = 0;
  for (const name of pending) {
    if (!/^[A-Za-z0-9._:@-]+--succeeded\.json$/.test(name)) {
      throw new ReconcileError(`unexpected outbox filename: ${name}`);
    }
    const source = path.join(outboxDir, name);
    const sourceStat = fs.lstatSync(source);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw new ReconcileError(`outbox entry is not a regular file: ${name}`);
    }
    validatePrivateStat(
      sourceStat,
      `outbox entry ${name}`,
      0o600,
      expectedUid,
      expectedGid
    );

    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(source, "utf8"));
    } catch {
      throw new ReconcileError(`outbox entry is not valid JSON: ${name}`);
    }
    if (
      payload?.version !== 1 ||
      !SAFE_ID.test(String(payload.releaseId || "")) ||
      !FULL_SHA.test(String(payload.sha || "")) ||
      payload.eventType !== "succeeded" ||
      typeof payload.message !== "string" ||
      payload.message.length > 2_000 ||
      payload.message.includes("\0")
    ) {
      throw new ReconcileError(`outbox entry failed schema validation: ${name}`);
    }
    if (name !== `${payload.releaseId}--succeeded.json`) {
      throw new ReconcileError(
        `outbox filename does not match its release ID: ${name}`
      );
    }

    const result = runProcess(
      process.execPath,
      [
        telemetryScript,
        "deployment-event",
        "--release-id",
        payload.releaseId,
        "--sha",
        payload.sha.toLowerCase(),
        "--event-type",
        "succeeded",
        "--message",
        payload.message,
      ],
      {
        env: {
          ...environment,
          NEXUSFLOW_APP_ROOT: appRoot,
          NEXUSFLOW_BACKEND_ENV: backendEnv,
        },
        stdio: ["ignore", "ignore", "inherit"],
      }
    );
    if (result.error || result.status !== 0) {
      throw new ReconcileError(
        `telemetry replay failed; pending entry was retained: ${name}`
      );
    }

    let destination = `${source}.reconciled`;
    let archiveSequence = 0;
    while (fs.existsSync(destination)) {
      archiveSequence += 1;
      destination = `${source}.reconciled.${archiveSequence}`;
    }
    fs.renameSync(source, destination);
    const directoryHandle = fs.openSync(outboxDir, "r");
    try {
      fs.fsyncSync(directoryHandle);
    } finally {
      fs.closeSync(directoryHandle);
    }
    reconciled += 1;
  }
  return reconciled;
}

function main() {
  try {
    const reconciled = reconcileOutbox();
    console.error(
      `[release-telemetry-reconcile] reconciled ${reconciled} pending terminal event(s)`
    );
  } catch (error) {
    const message =
      error instanceof ReconcileError
        ? error.message
        : "reconciliation failed without exposing private details";
    console.error(`[release-telemetry-reconcile] ERROR: ${message}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
