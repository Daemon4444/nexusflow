#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Legacy defaults used only when a manifest predates the self-describing
// `expected` block (P0, 2026-09-25). New manifests carry their own contract.
const LEGACY_PRICE_BOOK_ID = "pb-19cfc14c11f74a74ac7438c5";
const LEGACY_EXPECTED = Object.freeze({
  priceBookId: LEGACY_PRICE_BOOK_ID,
  tiers: 13,
  models: 10,
  fullTiers: 7,
  partialTiers: 6,
});
const PRICE_BOOK_ID_PATTERN = /^pb-[0-9a-f]{24}$/;
let PRICE_BOOK_ID = LEGACY_PRICE_BOOK_ID;
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
    "expected",
    "activate",
    "deactivate",
    "verify-active",
    "verify-inactive",
    "cleanup-manifest",
  ].includes(command)) {
    fail("unknown provider-cost release command");
  }
  const allowed = new Set(
    command === "preflight" || command === "cleanup-manifest" || command === "expected"
      ? ["manifest"]
      : command === "activate"
        ? [
            "manifest",
            "release-dir",
            "backend-env",
            "expected-tiers",
            "expected-models",
            "expected-full-tiers",
            "expected-partial-tiers",
          ]
        : command === "deactivate" || command === "verify-active"
          ? [
              "release-dir",
              "backend-env",
              "expected-tiers",
              "expected-models",
            ]
          : ["release-dir", "backend-env"]
  );
  // Every database-touching command may name the reviewed price book.
  if (!["preflight", "cleanup-manifest", "expected"].includes(command)) {
    allowed.add("price-book-id");
  }
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
    cwd: path.join(runtime.releaseDirectory, "backend"),
    encoding: "utf8",
    env: {
      ...process.env,
      NEXUSFLOW_APP_ROOT: runtime.releaseDirectory,
      NEXUSFLOW_BACKEND_ENV: runtime.backendEnvironment,
      DOTENV_CONFIG_QUIET: "true",
      PROVIDER_COST_ROLLBACK_REASON:
        "Automatic compatibility transition before an application rollback",
    },
    maxBuffer: 1_100_000,
  });
  if (result.status !== 0) {
    const rawDetail = String(result.stderr || "");
    const detail = (
      privatePath
        ? rawDetail.replaceAll(privatePath, "[private-manifest]")
        : rawDetail
    )
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

function positiveIntegerOption(options, name, label) {
  const value = Number(options[name]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`${label} must be a positive integer`);
  }
  return value;
}

function nonnegativeIntegerOption(options, name, label) {
  const value = Number(options[name]);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a nonnegative integer`);
  }
  return value;
}

function expectedImportSummary(options) {
  const expected = {
    tiers: positiveIntegerOption(
      options,
      "expected-tiers",
      "expected provider-cost tier count"
    ),
    models: positiveIntegerOption(
      options,
      "expected-models",
      "expected provider-cost model count"
    ),
    fullTiers: nonnegativeIntegerOption(
      options,
      "expected-full-tiers",
      "expected full provider-cost tier count"
    ),
    partialTiers: nonnegativeIntegerOption(
      options,
      "expected-partial-tiers",
      "expected partial provider-cost tier count"
    ),
  };
  if (expected.fullTiers + expected.partialTiers !== expected.tiers) {
    fail("expected provider-cost coverage counts do not equal the tier count");
  }
  return expected;
}

function validateImportSummary(value, dryRun, expected) {
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
    || value.models !== expected.models
    || value.tiers !== expected.tiers
    || value.fullTiers !== expected.fullTiers
    || value.partialTiers !== expected.partialTiers
  ) {
    fail("provider-cost import summary failed release validation");
  }
  if (dryRun && value.reactivated) {
    fail("provider-cost dry-run falsely reported a mutation");
  }
  if (!dryRun && value.reactivationRequired) {
    fail("provider-cost apply left reactivation pending");
  }
  return value;
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
    models: value.models,
  };
}

function queryPriceBookRows(runtime) {
  return validateDeactivationSummary(
    runCli(runtime, ["--deactivate-price-book", PRICE_BOOK_ID]),
    true
  );
}

function expectedTiers(options) {
  return positiveIntegerOption(
    options,
    "expected-tiers",
    "expected provider-cost tier count"
  );
}

function expectedModels(options) {
  return positiveIntegerOption(
    options,
    "expected-models",
    "expected provider-cost model count"
  );
}

function activate(runtime, manifestPath, expected) {
  const { manifest } = validatePrivateManifest(manifestPath);
  const dryRun = validateImportSummary(
    runCli(runtime, ["--manifest", manifest], manifest),
    true,
    expected
  );
  const applied = validateImportSummary(
    runCli(runtime, ["--manifest", manifest, "--apply"], manifest),
    false,
    expected
  );
  const rows = queryPriceBookRows(runtime);
  const stableFields = [
    "priceBookId",
    "providerId",
    "models",
    "tiers",
    "fullTiers",
    "partialTiers",
    "sourceSha256",
    "manifestSha256",
  ];
  if (
    stableFields.some((field) => dryRun[field] !== applied[field])
    || rows.activeRows !== expected.tiers
    || rows.pendingRows !== expected.tiers
    || rows.futureRows !== 0
    || rows.models !== expected.models
  ) {
    fail("provider-cost price book did not become fully active");
  }
  return expected.tiers;
}

function deactivate(runtime, tiers, models) {
  const before = queryPriceBookRows(runtime);
  if (
    before.futureRows !== 0
    || before.activeRows !== before.pendingRows
    || (before.pendingRows !== 0 && before.pendingRows !== tiers)
    || (before.pendingRows !== 0 && before.models !== models)
    || (before.pendingRows === 0 && before.models !== 0)
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
      || applied.models !== models
    ) {
      fail("provider-cost deactivation changed an unexpected number of tiers");
    }
  }
  const after = queryPriceBookRows(runtime);
  if (
    after.pendingRows !== 0
    || after.activeRows !== 0
    || after.futureRows !== 0
    || after.models !== 0
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

// Must match canonicalJson in backend/src/services/provider-cost-import.ts.
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
  return `{${entries.join(",")}}`;
}

// Returns the release contract of a private manifest. A manifest with an
// `expected` block must be internally consistent: its contentSha256 must be
// the canonical hash of every other field (so an edited row or count cannot
// pass), its price book ID must derive from source.sha256, and the declared
// counts must equal the counts computed from its rows. A manifest without the
// block falls back to the historic hard-coded contract with a warning.
export function deriveExpected(manifestValue) {
  if (!manifestValue || typeof manifestValue !== "object" || Array.isArray(manifestValue)) {
    fail("provider-cost manifest is not a JSON object");
  }
  const { expected, ...content } = manifestValue;
  if (expected === undefined) {
    return { ...LEGACY_EXPECTED, source: "legacy_default" };
  }
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    fail("provider-cost manifest expected block is invalid");
  }
  const allowedKeys = ["priceBookId", "models", "tiers", "fullTiers", "partialTiers", "contentSha256"];
  if (Object.keys(expected).some((key) => !allowedKeys.includes(key))) {
    fail("provider-cost manifest expected block has unknown fields");
  }
  const contentSha256 = crypto.createHash("sha256").update(canonicalJson(content)).digest("hex");
  if (expected.contentSha256 !== contentSha256) {
    fail("provider-cost manifest expected block does not match the manifest content hash");
  }
  const sourceSha = content?.source?.sha256;
  if (typeof sourceSha !== "string" || !/^[0-9a-f]{64}$/.test(sourceSha)) {
    fail("provider-cost manifest source hash is invalid");
  }
  if (expected.priceBookId !== `pb-${sourceSha.slice(0, 24)}`) {
    fail("provider-cost manifest expected price book does not derive from its source hash");
  }
  const rows = Array.isArray(content.rows) ? content.rows : [];
  const computed = {
    tiers: rows.length,
    models: new Set(rows.map((row) => row?.modelId)).size,
    fullTiers: rows.filter((row) => row?.decision === "ELIGIBLE_FULL").length,
    partialTiers: rows.filter((row) => row?.decision === "ELIGIBLE_PARTIAL").length,
  };
  for (const key of Object.keys(computed)) {
    if (!Number.isSafeInteger(expected[key]) || expected[key] !== computed[key]) {
      fail(`provider-cost manifest expected ${key} does not match its rows`);
    }
  }
  if (computed.tiers <= 0 || computed.fullTiers + computed.partialTiers !== computed.tiers) {
    fail("provider-cost manifest rows have an invalid coverage classification");
  }
  return { priceBookId: expected.priceBookId, ...computed, source: "manifest" };
}

function readExpected(manifestPath) {
  const { manifest } = validatePrivateManifest(manifestPath);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(manifest, "utf8"));
  } catch {
    fail("provider-cost manifest is not valid JSON");
  }
  const expected = deriveExpected(value);
  if (expected.source === "legacy_default") {
    console.error(
      "[provider-cost-release] WARNING: manifest has no expected block; using the legacy hard-coded release contract"
    );
  }
  return expected;
}

function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (options["price-book-id"] !== undefined) {
    if (!PRICE_BOOK_ID_PATTERN.test(options["price-book-id"])) {
      fail("--price-book-id must look like pb-<24 hex>");
    }
    PRICE_BOOK_ID = options["price-book-id"];
  }
  if (command === "expected") {
    const expected = readExpected(options.manifest);
    process.stdout.write(
      [expected.priceBookId, expected.tiers, expected.models, expected.fullTiers, expected.partialTiers, expected.source].join(" ")
    );
    return;
  }
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
    process.stdout.write(String(
      activate(runtime, options.manifest, expectedImportSummary(options))
    ));
    return;
  }
  if (command === "deactivate") {
    deactivate(runtime, expectedTiers(options), expectedModels(options));
    return;
  }
  const rows = queryPriceBookRows(runtime);
  if (command === "verify-active") {
    const tiers = expectedTiers(options);
    if (
      rows.activeRows !== tiers
      || rows.pendingRows !== tiers
      || rows.futureRows !== 0
      || rows.models !== expectedModels(options)
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

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
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
}
