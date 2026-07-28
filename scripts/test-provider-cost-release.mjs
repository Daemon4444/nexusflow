import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const wrapper = path.join(repositoryRoot, "scripts/provider-cost-release.mjs");
const stagingRoot = typeof process.getuid === "function" && process.getuid() === 0
  ? "/run"
  : path.resolve(os.tmpdir());
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "provider-cost-release-test."));
const staging = fs.mkdtempSync(path.join(stagingRoot, "nexusflow-provider-cost."));
const manifest = path.join(staging, "manifest.json");
const release = path.join(fixture, "release");
const cliDirectory = path.join(release, "backend/dist/cli");
const backendEnvironment = path.join(fixture, "backend.env");
const state = path.join(fixture, "state.json");

function cleanup() {
  try {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
    if (fs.existsSync(fixture)) fs.rmSync(fixture, { recursive: true });
  } catch {
    // Best-effort test fixture cleanup.
  }
}

function run(command, args = [], expectedStatus = 0) {
  const result = spawnSync(process.execPath, [wrapper, command, ...args], {
    encoding: "utf8",
    env: { ...process.env, PROVIDER_COST_RELEASE_TEST_STATE: state },
  });
  assert.equal(
    result.status,
    expectedStatus,
    `${command}: ${result.stderr || result.stdout}`
  );
  return String(result.stdout || "");
}

try {
  fs.mkdirSync(cliDirectory, { recursive: true });
  fs.writeFileSync(manifest, "{\"private\":true}\n", { mode: 0o600 });
  fs.chmodSync(staging, 0o700);
  fs.chmodSync(manifest, 0o600);
  fs.writeFileSync(backendEnvironment, "DATABASE_URL=test\n", { mode: 0o600 });
  fs.writeFileSync(state, JSON.stringify({ activeRows: 0 }));
  fs.writeFileSync(
    path.join(cliDirectory, "import-provider-cost-manifest.js"),
    `const fs = require("node:fs");
const file = process.env.PROVIDER_COST_RELEASE_TEST_STATE;
const args = process.argv.slice(2);
const current = JSON.parse(fs.readFileSync(file, "utf8"));
const apply = args.includes("--apply");
if (args.includes("--manifest")) {
  const wasInactive = current.activeRows === 0 && current.everApplied === true;
  if (apply) {
    current.activeRows = 3;
    current.everApplied = true;
    fs.writeFileSync(file, JSON.stringify(current));
  }
  const wrong = current.wrongPriceBook === true;
  console.log(JSON.stringify({
    dryRun: !apply,
    idempotent: !wasInactive && current.everApplied === true,
    reactivationRequired: !apply && wasInactive,
    reactivated: apply && wasInactive,
    priceBookId: wrong ? "pb-000000000000000000000000" : "pb-03c8336c30be1e4f6d18ae9d",
    providerId: "dashscope",
    models: 2,
    tiers: 3,
    fullTiers: 2,
    partialTiers: 1,
    inactiveRoutes: 0,
    sourceSha256: "a".repeat(64),
    manifestSha256: "b".repeat(64)
  }));
} else {
  const before = current.activeRows;
  const future = current.futureRows || 0;
  const pending = before + future;
  if (apply) {
    if (future > 0) {
      console.error("future-effective pending rows");
      process.exit(1);
    }
    current.activeRows = 0;
    current.futureRows = 0;
    fs.writeFileSync(file, JSON.stringify(current));
  }
  console.log(JSON.stringify({
    dryRun: !apply,
    priceBookId: "pb-03c8336c30be1e4f6d18ae9d",
    activeRows: before,
    pendingRows: pending,
    futureRows: future,
    models: pending === 0 ? 0 : 2
  }));
}
`
  );

  const runtimeArgs = [
    "--release-dir", release,
    "--backend-env", backendEnvironment,
  ];
  run("preflight", ["--manifest", manifest]);
  assert.equal(
    run("activate", ["--manifest", manifest, ...runtimeArgs]),
    "3"
  );
  assert.equal(
    run("verify-active", [...runtimeArgs, "--expected-tiers", "3"]),
    "3"
  );
  run("deactivate", [...runtimeArgs, "--expected-tiers", "3"]);
  run("verify-inactive", runtimeArgs);
  assert.equal(
    run("activate", ["--manifest", manifest, ...runtimeArgs]),
    "3"
  );

  fs.writeFileSync(state, JSON.stringify({
    activeRows: 1,
    everApplied: true,
  }));
  run("deactivate", [...runtimeArgs, "--expected-tiers", "3"], 1);
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).activeRows, 1);

  fs.writeFileSync(state, JSON.stringify({
    activeRows: 2,
    futureRows: 1,
    everApplied: true,
  }));
  run("deactivate", [...runtimeArgs, "--expected-tiers", "3"], 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(state, "utf8")), {
    activeRows: 2,
    futureRows: 1,
    everApplied: true,
  });

  fs.writeFileSync(state, JSON.stringify({
    activeRows: 3,
    everApplied: true,
    wrongPriceBook: true,
  }));
  run("activate", ["--manifest", manifest, ...runtimeArgs], 1);

  fs.chmodSync(manifest, 0o640);
  run("preflight", ["--manifest", manifest], 1);
  fs.chmodSync(manifest, 0o600);
  run("cleanup-manifest", ["--manifest", manifest]);
  assert.equal(fs.existsSync(staging), false);
  console.log("provider-cost-release-state-regressions-ok");
} finally {
  cleanup();
}
