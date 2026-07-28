#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PRICE_BOOK_ID = "pb-03c8336c30be1e4f6d18ae9d";
const MAX_MANIFEST_BYTES = 1_000_000;
const STAGING_DIRECTORY = /^nexusflow-provider-cost\.[A-Za-z0-9]{6,32}$/;

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  const command = argv.shift() || "";
  const options = {};
  while (argv.length > 0) {
    const key = argv.shift();
    if (!key?.startsWith("--") || argv.length === 0) {
      fail("invalid provider-cost release arguments");
    }
    const name = key.slice(2);
    if (Object.hasOwn(options, name)) {
      fail("duplicate provider-cost release option");
    }
    options[name] = argv.shift();
  }
  if (![
    "preflight",
    "activate",
    "deactivate",
    "verify-active",
    "verify-inactive",
    "cleanup-manifest",
  ].includes(command)) {
    fail("unknown provider-cost release command");
  }
  const allowed = new Set(
    command === "preflight" || command === "cleanup-manifest"
      ? ["manifest"]
      : command === "activate"
        ? ["manifest", "release-dir", "backend-env"]
        : command === "deactivate" || command === "verify-active"
          ? ["release-dir", "backend-env", "expected-tiers"]
          : ["release-dir", "backend-env"]
  );
  if (Object.keys(options).some((name) => !allowed.has(name))) {
    fail("unsupported provider-cost release option");
  }
  return { command, options };
}

function requireAbsolute(value, label) {
  if (!value || !path.isAbsolute(value)) {
    fail(`${label} must be an absolute path`);
  }
  return path.resolve(value);
}

function privateStagingRoot() {
  return typeof process.getuid === "function" && process.getuid() === 0
    ? "/run"
    : path.resolve(os.tmpdir());
}

function expectedOwner() {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    return { uid: 0, gid: 0 };
  }
  return {
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
    gid: typeof process.getgid === "function" ? process.getgid() : 0,
  };
}

function validatePrivateManifest(manifestPath) {
  const manifest = requireAbsolute(manifestPath, "provider-cost manifest");
  const directory = path.dirname(manifest);
  const stagingRoot = privateStagingRoot();
  const { uid, gid } = expectedOwner();

  if (
    path.dirname(directory) !== stagingRoot
    || !STAGING_DIRECTORY.test(path.basename(directory))
    || path.basename(manifest) !== "manifest.json"
  ) {
    fail("provider-cost manifest is not in an approved private staging directory");
  }

  const directoryStat = fs.lstatSync(directory);
  if (
    !directoryStat.isDirectory()
    || directoryStat.isSymbolicLink()
    || directoryStat.uid !== uid
    || directoryStat.gid !== gid
    || (directoryStat.mode & 0o777) !== 0o700
  ) {
    fail("provider-cost staging directory must be private and owner-controlled");
  }
  const entries = fs.readdirSync(directory);
  if (entries.length !== 1 || entries[0] !== "manifest.json") {
    fail("provider-cost staging directory must contain only manifest.json");
  }

  const noFollow = fs.constants.O_NOFOLLOW || 0;
  const descriptor = fs.openSync(manifest, fs.constants.O_RDONLY | noFollow);
  try {
    const stat = fs.fstatSync(descriptor);
    if (
      !stat.isFile()
      || stat.uid !== uid
      || stat.gid !== gid
      || (stat.mode & 0o777) !== 0o600
      || stat.size <= 0
      || stat.size > MAX_MANIFEST_BYTES
    ) {
      fail("provider-cost manifest must be a private 0600 regular file");
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return { manifest, directory, stagingRoot };
}

function validateRuntimeOptions(options) {
  const releaseDirectory = requireAbsolute(options["release-dir"], "release directory");
  const backendEnvironment = requireAbsolute(options["backend-env"], "backend environment");
  const cli = path.join(
    releaseDirectory,
    "backend/dist/cli/import-provider-cost-manifest.js"
  );
  const cliStat = fs.lstatSync(cli);
  if (!cliStat.isFile() || cliStat.isSymbolicLink()) {
    fail("immutable provider-cost import CLI is missing");
  }
  const environmentStat = fs.statSync(backendEnvironment);
  if (!environmentStat.isFile()) {
    fail("backend environment is not a regular file");
  }
  return { releaseDirectory, backendEnvironment, cli };
}

function runCli(runtime, args, privatePath = "") {
  const result = spawnSync(process.execPath, [runtime.cli, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      NEXUSFLOW_APP_ROOT: runtime.releaseDirectory,
      NEXUSFLOW_BACKEND_ENV: runtime.backendEnvironment,
      PROVIDER_COST_ROLLBACK_REASON:
        "Automatic compatibility transition before an application rollback",
    },
    maxBuffer: 1_100_000,
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || "")
      .replaceAll(privatePath, "[private-manifest]")
      .trim()
      .slice(0, 2_000);
    fail(detail
      ? `provider-cost control plane rejected the transition: ${detail}`
      : "provider-cost control plane rejected the transition");
  }
  let value;
  try {
    value = JSON.parse(String(result.stdout || ""));
  } catch {
    fail("provider-cost control plane returned an invalid summary");
  }
  return value;
}

function validateImportSummary(value, dryRun) {
  if (
    !value
    || value.dryRun !== dryRun
    || value.priceBookId !== PRICE_BOOK_ID
    || value.providerId !== "dashscope"
    || !Number.isSafeInteger(value.models)
    || value.models <= 0
    || !Number.isSafeInteger(value.tiers)
    || value.tiers <= 0
    || !Number.isSafeInteger(value.fullTiers)
    || !Number.isSafeInteger(value.partialTiers)
    || value.fullTiers + value.partialTiers !== value.tiers
    || typeof value.idempotent !== "boolean"
    || typeof value.reactivationRequired !== "boolean"
    || typeof value.reactivated !== "boolean"
    || !/^[0-9a-f]{64}$/.test(String(value.sourceSha256 || ""))
    || !/^[0-9a-f]{64}$/.test(String(value.manifestSha256 || ""))
  ) {
    fail("provider-cost import summary failed release validation");
  }
  if (dryRun && value.reactivated) {
    fail("provider-cost dry-run falsely reported a mutation");
  }
  if (!dryRun && value.reactivationRequired) {
    fail("provider-cost apply left reactivation pending");
  }
  return value.tiers;
}

function validateDeactivationSummary(value, dryRun) {
  if (
    !value
    || value.dryRun !== dryRun
    || value.priceBookId !== PRICE_BOOK_ID
    || !Number.isSafeInteger(value.activeRows)
    || value.activeRows < 0
    || !Number.isSafeInteger(value.pendingRows)
    || value.pendingRows < value.activeRows
    || !Number.isSafeInteger(value.futureRows)
    || value.futureRows < 0
    || value.activeRows + value.futureRows !== value.pendingRows
    || !Number.isSafeInteger(value.models)
    || value.models < 0
  ) {
    fail("provider-cost deactivation summary failed release validation");
  }
  return {
    activeRows: value.activeRows,
    pendingRows: value.pendingRows,
    futureRows: value.futureRows,
  };
}

function queryPriceBookRows(runtime) {
  return validateDeactivationSummary(
    runCli(runtime, ["--deactivate-price-book", PRICE_BOOK_ID]),
    true
  );
}

function expectedTiers(options) {
  const value = Number(options["expected-tiers"]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail("expected provider-cost tier count must be a positive integer");
  }
  return value;
}

function activate(runtime, manifestPath) {
  const { manifest } = validatePrivateManifest(manifestPath);
  const dryRun = runCli(runtime, ["--manifest", manifest], manifest);
  const tiers = validateImportSummary(dryRun, true);
  const applied = runCli(runtime, ["--manifest", manifest, "--apply"], manifest);
  const appliedTiers = validateImportSummary(applied, false);
  const rows = queryPriceBookRows(runtime);
  if (
    appliedTiers !== tiers
    || rows.activeRows !== tiers
    || rows.pendingRows !== tiers
    || rows.futureRows !== 0
  ) {
    fail("provider-cost price book did not become fully active");
  }
  return tiers;
}

function deactivate(runtime, tiers) {
  const before = queryPriceBookRows(runtime);
  if (
    before.futureRows !== 0
    || before.activeRows !== before.pendingRows
    || (before.pendingRows !== 0 && before.pendingRows !== tiers)
  ) {
    fail("provider-cost price book has unsafe pending rows; refusing rollback");
  }
  if (before.pendingRows === tiers) {
    const applied = validateDeactivationSummary(
      runCli(runtime, [
        "--deactivate-price-book",
        PRICE_BOOK_ID,
        "--apply",
      ]),
      false
    );
    if (
      applied.pendingRows !== tiers
      || applied.activeRows !== tiers
      || applied.futureRows !== 0
    ) {
      fail("provider-cost deactivation changed an unexpected number of tiers");
    }
  }
  const after = queryPriceBookRows(runtime);
  if (
    after.pendingRows !== 0
    || after.activeRows !== 0
    || after.futureRows !== 0
  ) {
    fail("provider-cost price book remained active after rollback preparation");
  }
}

function cleanupManifest(manifestPath) {
  const { manifest, directory, stagingRoot } = validatePrivateManifest(manifestPath);
  fs.unlinkSync(manifest);
  fs.rmdirSync(directory);
  const descriptor = fs.openSync(stagingRoot, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === "preflight") {
    validatePrivateManifest(options.manifest);
    return;
  }
  if (command === "cleanup-manifest") {
    cleanupManifest(options.manifest);
    return;
  }

  const runtime = validateRuntimeOptions(options);
  if (command === "activate") {
    process.stdout.write(String(activate(runtime, options.manifest)));
    return;
  }
  if (command === "deactivate") {
    deactivate(runtime, expectedTiers(options));
    return;
  }
  const rows = queryPriceBookRows(runtime);
  if (command === "verify-active") {
    const tiers = expectedTiers(options);
    if (
      rows.activeRows !== tiers
      || rows.pendingRows !== tiers
      || rows.futureRows !== 0
    ) {
      fail("provider-cost price book is not fully active");
    }
    process.stdout.write(String(rows.activeRows));
    return;
  }
  if (
    rows.pendingRows !== 0
    || rows.activeRows !== 0
    || rows.futureRows !== 0
  ) {
    fail("provider-cost price book still has unexpired rows");
  }
}

try {
  main();
} catch (error) {
  console.error(
    `[provider-cost-release] ${
      error instanceof Error ? error.message : "unknown release gate failure"
    }`
  );
  process.exitCode = 1;
}
