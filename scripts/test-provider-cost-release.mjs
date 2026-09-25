import assert from "node:assert/strict";
import crypto from "node:crypto";
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
let lastStderr = "";

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
    env: {
      ...process.env,
      PROVIDER_COST_RELEASE_TEST_STATE: state,
      PROVIDER_COST_RELEASE_EXPECTED_CWD: fs.realpathSync(
        path.join(release, "backend")
      ),
    },
  });
  lastStderr = String(result.stderr || "");
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
if (process.cwd() !== process.env.PROVIDER_COST_RELEASE_EXPECTED_CWD) {
  console.error("provider-cost CLI started outside the immutable backend directory");
  process.exit(1);
}
if (process.env.DOTENV_CONFIG_QUIET !== "true") {
  console.error("provider-cost CLI did not suppress dotenv control-plane output");
  process.exit(1);
}
if (args.includes("--manifest")) {
  if (current.manifestFailure === true) {
    console.error("rejected private input " + args[args.indexOf("--manifest") + 1]);
    process.exit(1);
  }
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
    priceBookId: wrong ? "pb-000000000000000000000000" : "pb-19cfc14c11f74a74ac7438c5",
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
  if (current.queryFailure === true) {
    console.error("provider-cost query failed safely");
    process.exit(1);
  }
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
    priceBookId: "pb-19cfc14c11f74a74ac7438c5",
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
  const expectedArgs = [
    "--expected-tiers", "3",
    "--expected-models", "2",
  ];
  const importExpectedArgs = [
    ...expectedArgs,
    "--expected-full-tiers", "2",
    "--expected-partial-tiers", "1",
  ];
  run("preflight", ["--manifest", manifest]);
  assert.equal(
    run("activate", [
      "--manifest", manifest,
      ...runtimeArgs,
      ...importExpectedArgs,
    ]),
    "3"
  );
  assert.equal(
    run("verify-active", [...runtimeArgs, ...expectedArgs]),
    "3"
  );
  run("deactivate", [...runtimeArgs, ...expectedArgs]);
  run("verify-inactive", runtimeArgs);
  assert.equal(
    run("activate", [
      "--manifest", manifest,
      ...runtimeArgs,
      ...importExpectedArgs,
    ]),
    "3"
  );

  fs.writeFileSync(state, JSON.stringify({
    activeRows: 1,
    everApplied: true,
  }));
  run("deactivate", [...runtimeArgs, ...expectedArgs], 1);
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).activeRows, 1);

  fs.writeFileSync(state, JSON.stringify({
    activeRows: 2,
    futureRows: 1,
    everApplied: true,
  }));
  run("deactivate", [...runtimeArgs, ...expectedArgs], 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(state, "utf8")), {
    activeRows: 2,
    futureRows: 1,
    everApplied: true,
  });
  assert.doesNotMatch(lastStderr, /\[private-manifest\]/);

  fs.writeFileSync(state, JSON.stringify({
    activeRows: 0,
    queryFailure: true,
  }));
  run("verify-inactive", runtimeArgs, 1);
  assert.match(lastStderr, /provider-cost query failed safely/);
  assert.doesNotMatch(lastStderr, /\[private-manifest\]/);

  fs.writeFileSync(state, JSON.stringify({
    activeRows: 3,
    everApplied: true,
    wrongPriceBook: true,
  }));
  run("activate", [
    "--manifest", manifest,
    ...runtimeArgs,
    ...importExpectedArgs,
  ], 1);

  fs.writeFileSync(state, JSON.stringify({
    activeRows: 0,
    everApplied: false,
  }));
  run("activate", [
    "--manifest", manifest,
    ...runtimeArgs,
    "--expected-tiers", "3",
    "--expected-models", "3",
    "--expected-full-tiers", "2",
    "--expected-partial-tiers", "1",
  ], 1);
  assert.equal(
    JSON.parse(fs.readFileSync(state, "utf8")).activeRows,
    0,
    "an unexpected reviewed count must fail before provider-cost mutation"
  );

  fs.writeFileSync(state, JSON.stringify({
    activeRows: 0,
    everApplied: false,
    manifestFailure: true,
  }));
  run("activate", [
    "--manifest", manifest,
    ...runtimeArgs,
    ...importExpectedArgs,
  ], 1);
  assert.match(lastStderr, /\[private-manifest\]/);
  assert.ok(!lastStderr.includes(manifest), "private manifest path must be redacted");

  // P0: manifest-carried release contract (`expected`), hash-protected, with
  // a warned fallback to the legacy 13/10/7/6 contract.
  assert.equal(
    run("expected", ["--manifest", manifest]),
    "pb-19cfc14c11f74a74ac7438c5 13 10 7 6 legacy_default"
  );
  assert.match(lastStderr, /legacy hard-coded release contract/);
  const sourceSha = "c".repeat(64);
  const content = {
    schemaVersion: 1,
    providerId: "dashscope",
    source: { reference: "reviewed.xlsx", sha256: sourceSha },
    rows: [
      { modelId: "m1", decision: "ELIGIBLE_FULL" },
      { modelId: "m1", decision: "ELIGIBLE_PARTIAL" },
      { modelId: "m2", decision: "ELIGIBLE_FULL" },
    ],
  };
  const canonical = (value) => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  };
  const contentSha256 = crypto.createHash("sha256").update(canonical(content)).digest("hex");
  const selfDescribing = {
    ...content,
    expected: {
      priceBookId: `pb-${sourceSha.slice(0, 24)}`,
      models: 2, tiers: 3, fullTiers: 2, partialTiers: 1, contentSha256,
    },
  };
  const writeManifest = (value) => {
    fs.writeFileSync(manifest, JSON.stringify(value));
    fs.chmodSync(manifest, 0o600);
  };
  writeManifest(selfDescribing);
  assert.equal(
    run("expected", ["--manifest", manifest]),
    `pb-${sourceSha.slice(0, 24)} 3 2 2 1 manifest`
  );
  // A tampered row breaks the content hash.
  writeManifest({ ...selfDescribing, rows: [...content.rows, { modelId: "m3", decision: "ELIGIBLE_FULL" }] });
  run("expected", ["--manifest", manifest], 1);
  assert.match(lastStderr, /content hash/);
  // Declared counts must equal the rows even when the hash is recomputed.
  writeManifest({ ...selfDescribing, expected: { ...selfDescribing.expected, tiers: 4 } });
  run("expected", ["--manifest", manifest], 1);
  // The price book must derive from source.sha256.
  writeManifest({ ...selfDescribing, expected: { ...selfDescribing.expected, priceBookId: "pb-000000000000000000000000" } });
  run("expected", ["--manifest", manifest], 1);
  // Unknown expected fields are rejected.
  writeManifest({ ...selfDescribing, expected: { ...selfDescribing.expected, extra: 1 } });
  run("expected", ["--manifest", manifest], 1);
  // Runtime commands accept the manifest's price book and reject malformed IDs.
  fs.writeFileSync(state, JSON.stringify({ activeRows: 0, everApplied: false }));
  run("verify-inactive", [...runtimeArgs, "--price-book-id", "pb-19cfc14c11f74a74ac7438c5"]);
  run("verify-inactive", [...runtimeArgs, "--price-book-id", "not-a-book"], 1);
  // A different reviewed book makes the CLI's summary fail validation.
  run("verify-inactive", [...runtimeArgs, "--price-book-id", `pb-${sourceSha.slice(0, 24)}`], 1);
  writeManifest({ private: true });

  fs.chmodSync(manifest, 0o640);
  run("preflight", ["--manifest", manifest], 1);
  fs.chmodSync(manifest, 0o600);
  run("cleanup-manifest", ["--manifest", manifest]);
  assert.equal(fs.existsSync(staging), false);
  console.log("provider-cost-release-state-regressions-ok");
} finally {
  cleanup();
}
