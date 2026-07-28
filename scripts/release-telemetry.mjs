#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Client } = pg;

const EVENT_TYPES = new Set([
  "started",
  "node_started",
  "node_succeeded",
  "node_failed",
  "succeeded",
  "failed",
  "rollback_started",
  "rolled_back",
]);
const NODE_EVENT_TYPES = new Set(["node_started", "node_succeeded", "node_failed"]);
const NODE_STATUSES = new Set(["unknown", "healthy", "degraded", "offline"]);
const DEPENDENCY_STATUSES = new Set(["unknown", "ok", "degraded", "unavailable"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const ENVIRONMENT = /^[a-z][a-z0-9_-]{0,31}$/;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_METADATA_BYTES = 16 * 1024;
const MAX_MESSAGE_LENGTH = 2_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 15_000;
const SENSITIVE_METADATA_KEYS = new Set([
  "password",
  "passwd",
  "pwd",
  "secret",
  "appsecret",
  "clientsecret",
  "apikey",
  "accesskey",
  "accesskeyid",
  "accesskeysecret",
  "authorization",
  "cookie",
  "setcookie",
  "databaseurl",
  "pgpassword",
  "redispassword",
  "privatekey",
  "token",
  "bearertoken",
  "accesstoken",
  "refreshtoken",
  "sessionid",
  "sessiontoken",
  "credential",
  "credentials",
  "dsn",
  "connectionstring",
  "databaseuri",
  "postgresurl",
]);

const USAGE = `Usage:
  node scripts/release-telemetry.mjs deployment-event \\
    --release-id <stable-rollout-id> --sha <full-git-sha> \\
    --event-type <type> [--node-id <node>] [--environment <name>] \\
    [--actor-user-id <existing-user-id>] [--message <text>] \\
    [--metadata-json <object>] [--idempotency-key <key>] [--event-id <id>]

  node scripts/release-telemetry.mjs runtime-node \\
    --node-id <node> --hostname <hostname> --status <status> \\
    [--environment <name>] [--backend-sha <full-git-sha>] \\
    [--frontend-build-id <full-git-sha>] [--backend-built-at <RFC3339>] \\
    [--postgres-status <status>] [--redis-status <status>] \\
    [--started-at <RFC3339>] [--observed-at <RFC3339>] \\
    [--metadata-json <object>]

Event types:
  started, node_started, node_succeeded, node_failed, succeeded, failed,
  rollback_started, rolled_back

Node statuses:
  unknown, healthy, degraded, offline

Dependency statuses:
  unknown, ok, degraded, unavailable`;

class SafeTelemetryError extends Error {
  constructor(message) {
    super(message);
    this.name = "SafeTelemetryError";
  }
}

function requireValue(options, name) {
  const value = options.get(name);
  if (value === undefined || value.trim() === "") {
    throw new SafeTelemetryError(`--${name} is required`);
  }
  return value.trim();
}

function optionalValue(options, name) {
  const value = options.get(name);
  return value === undefined ? undefined : value.trim();
}

function validateSafeId(value, label) {
  if (!SAFE_ID.test(value)) {
    throw new SafeTelemetryError(
      `${label} must be 1-128 characters using letters, numbers, dot, underscore, colon, @, or hyphen`
    );
  }
  return value;
}

function validateSha(value, label) {
  if (!FULL_SHA.test(value)) {
    throw new SafeTelemetryError(`${label} must be a full 40-character Git SHA`);
  }
  return value.toLowerCase();
}

function validateEnvironment(value) {
  if (!ENVIRONMENT.test(value)) {
    throw new SafeTelemetryError(
      "--environment must start with a lowercase letter and contain at most 32 lowercase letters, numbers, underscores, or hyphens"
    );
  }
  return value;
}

function validateHostname(value) {
  if (value.length > 253 || value.endsWith(".")) {
    throw new SafeTelemetryError("--hostname must be a valid hostname without a trailing dot");
  }
  const labels = value.split(".");
  const valid = labels.every(
    (label) =>
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)
  );
  if (!valid) {
    throw new SafeTelemetryError("--hostname must be a valid hostname");
  }
  return value.toLowerCase();
}

function validateTimestamp(value, label) {
  if (!RFC3339.test(value)) {
    throw new SafeTelemetryError(`${label} must be an RFC3339 timestamp with a timezone`);
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new SafeTelemetryError(`${label} is not a valid timestamp`);
  }
  return timestamp.toISOString();
}

function inspectMetadata(value, depth = 0) {
  if (depth > 8) {
    throw new SafeTelemetryError("--metadata-json nesting is too deep");
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new SafeTelemetryError("--metadata-json contains a non-finite number");
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) {
      throw new SafeTelemetryError("--metadata-json arrays may contain at most 100 values");
    }
    value.forEach((item) => inspectMetadata(item, depth + 1));
    return;
  }
  if (typeof value !== "object") {
    throw new SafeTelemetryError("--metadata-json contains an unsupported value");
  }
  const entries = Object.entries(value);
  if (entries.length > 100) {
    throw new SafeTelemetryError("--metadata-json objects may contain at most 100 keys");
  }
  for (const [key, item] of entries) {
    if (!key || key.length > 64 || /[\u0000-\u001f\u007f]/.test(key)) {
      throw new SafeTelemetryError("--metadata-json contains an invalid key");
    }
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      SENSITIVE_METADATA_KEYS.has(normalizedKey) ||
      /(?:password|passwd|secret|apikey|authorization|cookie|privatekey|token)$/.test(
        normalizedKey
      )
    ) {
      throw new SafeTelemetryError(
        `--metadata-json key "${key}" is reserved for sensitive data and is not allowed`
      );
    }
    inspectMetadata(item, depth + 1);
  }
}

export function parseMetadata(raw) {
  if (raw === undefined) return null;
  if (Buffer.byteLength(raw, "utf8") > MAX_METADATA_BYTES) {
    throw new SafeTelemetryError(
      `--metadata-json must not exceed ${MAX_METADATA_BYTES} bytes`
    );
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SafeTelemetryError("--metadata-json must be valid JSON");
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new SafeTelemetryError("--metadata-json must be a JSON object");
  }
  inspectMetadata(value);
  return value;
}

function parseOptionMap(args, allowed) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--") || token === "--") {
      throw new SafeTelemetryError(`unexpected positional argument: ${token}`);
    }
    const separator = token.indexOf("=");
    const name = token.slice(2, separator === -1 ? undefined : separator);
    if (!allowed.has(name)) {
      throw new SafeTelemetryError(`unknown option: --${name}`);
    }
    if (options.has(name)) {
      throw new SafeTelemetryError(`duplicate option: --${name}`);
    }
    let value;
    if (separator !== -1) {
      value = token.slice(separator + 1);
    } else {
      index += 1;
      value = args[index];
      if (value === undefined || value.startsWith("--")) {
        throw new SafeTelemetryError(`--${name} requires a value`);
      }
    }
    options.set(name, value);
  }
  return options;
}

export function deterministicEventId({
  releaseId,
  environment,
  eventType,
  nodeId,
  idempotencyKey,
}) {
  const identity = JSON.stringify([
    releaseId,
    environment,
    eventType,
    nodeId || null,
    idempotencyKey,
  ]);
  const digest = crypto.createHash("sha256").update(identity).digest("hex");
  return `dep_${digest.slice(0, 40)}`;
}

function parseDeploymentEvent(args) {
  const allowed = new Set([
    "release-id",
    "sha",
    "event-type",
    "node-id",
    "environment",
    "actor-user-id",
    "message",
    "metadata-json",
    "idempotency-key",
    "event-id",
  ]);
  const options = parseOptionMap(args, allowed);
  const releaseId = validateSafeId(requireValue(options, "release-id"), "--release-id");
  const sha = validateSha(requireValue(options, "sha"), "--sha");
  const eventType = requireValue(options, "event-type");
  if (!EVENT_TYPES.has(eventType)) {
    throw new SafeTelemetryError(`invalid --event-type: ${eventType}`);
  }
  const environment = validateEnvironment(optionalValue(options, "environment") || "production");
  const rawNodeId = optionalValue(options, "node-id");
  const nodeId = rawNodeId ? validateSafeId(rawNodeId, "--node-id") : null;
  if (NODE_EVENT_TYPES.has(eventType) && !nodeId) {
    throw new SafeTelemetryError(`--node-id is required for ${eventType}`);
  }
  if (!NODE_EVENT_TYPES.has(eventType) && nodeId) {
    throw new SafeTelemetryError(`--node-id is only valid for node-scoped event types`);
  }
  const rawActorId = optionalValue(options, "actor-user-id");
  const actorUserId = rawActorId
    ? validateSafeId(rawActorId, "--actor-user-id")
    : null;
  const message = optionalValue(options, "message") || "";
  if (message.length > MAX_MESSAGE_LENGTH || /[\u0000]/.test(message)) {
    throw new SafeTelemetryError(
      `--message must not contain NUL and must not exceed ${MAX_MESSAGE_LENGTH} characters`
    );
  }
  const metadata = parseMetadata(optionalValue(options, "metadata-json"));
  const rawEventId = optionalValue(options, "event-id");
  const rawIdempotencyKey = optionalValue(options, "idempotency-key");
  if (rawEventId && rawIdempotencyKey) {
    throw new SafeTelemetryError("--event-id and --idempotency-key are mutually exclusive");
  }
  const idempotencyKey = rawIdempotencyKey
    ? validateSafeId(rawIdempotencyKey, "--idempotency-key")
    : "default";
  const eventId = rawEventId
    ? validateSafeId(rawEventId, "--event-id")
    : deterministicEventId({
        releaseId,
        environment,
        eventType,
        nodeId,
        idempotencyKey,
      });
  return {
    eventId,
    releaseId,
    environment,
    sha,
    eventType,
    nodeId,
    actorUserId,
    message,
    metadata,
  };
}

function parseRuntimeNode(args, now) {
  const allowed = new Set([
    "node-id",
    "hostname",
    "environment",
    "backend-sha",
    "backend-built-at",
    "frontend-build-id",
    "status",
    "postgres-status",
    "redis-status",
    "started-at",
    "observed-at",
    "metadata-json",
  ]);
  const options = parseOptionMap(args, allowed);
  const nodeId = validateSafeId(requireValue(options, "node-id"), "--node-id");
  const hostname = validateHostname(requireValue(options, "hostname"));
  const environment = validateEnvironment(optionalValue(options, "environment") || "production");
  const status = requireValue(options, "status");
  if (!NODE_STATUSES.has(status)) {
    throw new SafeTelemetryError(`invalid --status: ${status}`);
  }
  const rawBackendSha = optionalValue(options, "backend-sha");
  const backendSha = rawBackendSha ? validateSha(rawBackendSha, "--backend-sha") : null;
  const rawFrontendBuildId = optionalValue(options, "frontend-build-id");
  const frontendBuildId = rawFrontendBuildId
    ? validateSha(rawFrontendBuildId, "--frontend-build-id")
    : null;
  if (backendSha && frontendBuildId && backendSha !== frontendBuildId) {
    throw new SafeTelemetryError(
      "--frontend-build-id must equal --backend-sha for an immutable NexusFlow release"
    );
  }
  const rawPostgresStatus = optionalValue(options, "postgres-status");
  const postgresStatus = rawPostgresStatus || (status === "healthy" ? null : "unknown");
  if (postgresStatus && !DEPENDENCY_STATUSES.has(postgresStatus)) {
    throw new SafeTelemetryError(`invalid --postgres-status: ${postgresStatus}`);
  }
  const rawRedisStatus = optionalValue(options, "redis-status");
  const redisStatus = rawRedisStatus || (status === "healthy" ? null : "unknown");
  if (redisStatus && !DEPENDENCY_STATUSES.has(redisStatus)) {
    throw new SafeTelemetryError(`invalid --redis-status: ${redisStatus}`);
  }
  if (
    status === "healthy" &&
    (!backendSha ||
      !frontendBuildId ||
      postgresStatus !== "ok" ||
      redisStatus !== "ok")
  ) {
    throw new SafeTelemetryError(
      "healthy nodes require matching --backend-sha/--frontend-build-id and both dependency statuses set to ok"
    );
  }
  const observedAt = optionalValue(options, "observed-at")
    ? validateTimestamp(optionalValue(options, "observed-at"), "--observed-at")
    : now.toISOString();
  if (new Date(observedAt).getTime() > now.getTime() + 5 * 60_000) {
    throw new SafeTelemetryError("--observed-at must not be more than five minutes in the future");
  }
  const backendBuiltAt = optionalValue(options, "backend-built-at")
    ? validateTimestamp(optionalValue(options, "backend-built-at"), "--backend-built-at")
    : null;
  const startedAt = optionalValue(options, "started-at")
    ? validateTimestamp(optionalValue(options, "started-at"), "--started-at")
    : null;
  if (startedAt && new Date(startedAt).getTime() > new Date(observedAt).getTime()) {
    throw new SafeTelemetryError("--started-at must not be later than --observed-at");
  }
  return {
    nodeId,
    hostname,
    environment,
    backendSha,
    backendBuiltAt,
    frontendBuildId,
    status,
    postgresStatus,
    redisStatus,
    startedAt,
    observedAt,
    metadata: parseMetadata(optionalValue(options, "metadata-json")),
  };
}

export function parseCli(argv, now = new Date()) {
  if (!Array.isArray(argv)) throw new SafeTelemetryError("arguments must be an array");
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    if (argv.length > 1) throw new SafeTelemetryError("help does not accept additional arguments");
    return { command: "help" };
  }
  const [command, ...args] = argv;
  if (command === "deployment-event") {
    return { command, value: parseDeploymentEvent(args) };
  }
  if (command === "runtime-node") {
    return { command, value: parseRuntimeNode(args, now) };
  }
  throw new SafeTelemetryError(`unknown command: ${command}`);
}

function positiveIntegerFromEnv(env, name, fallback, maximum) {
  const raw = (env[name] || String(fallback)).trim();
  if (!/^\d+$/.test(raw)) {
    throw new SafeTelemetryError(`${name} must be a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new SafeTelemetryError(`${name} must be between 1 and ${maximum}`);
  }
  return value;
}

export function buildConnectionConfig(env = process.env) {
  const connectionTimeoutMillis = positiveIntegerFromEnv(
    env,
    "NEXUSFLOW_TELEMETRY_CONNECT_TIMEOUT_MS",
    DEFAULT_CONNECT_TIMEOUT_MS,
    60_000
  );
  const databaseUrl = (env.DATABASE_URL || "").trim();
  if (databaseUrl) {
    let parsed;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      throw new SafeTelemetryError("DATABASE_URL is not a valid PostgreSQL URL");
    }
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      throw new SafeTelemetryError("DATABASE_URL must use the postgres or postgresql scheme");
    }
    return {
      connectionString: databaseUrl,
      connectionTimeoutMillis,
      application_name: "nexusflow_release_telemetry",
    };
  }

  const required = ["PG_HOST", "PG_USER", "PG_PASSWORD", "PG_DATABASE"];
  const missing = required.filter((name) => !(env[name] || "").trim());
  if (missing.length) {
    throw new SafeTelemetryError(`database configuration is missing: ${missing.join(", ")}`);
  }
  const port = positiveIntegerFromEnv(env, "PG_PORT", 5432, 65_535);
  return {
    host: env.PG_HOST.trim(),
    port,
    user: env.PG_USER.trim(),
    password: env.PG_PASSWORD,
    database: env.PG_DATABASE.trim(),
    connectionTimeoutMillis,
    application_name: "nexusflow_release_telemetry",
  };
}

export async function recordDeploymentEvent(client, event) {
  const metadataJson = event.metadata === null ? null : JSON.stringify(event.metadata);
  const params = [
    event.eventId,
    event.releaseId,
    event.environment,
    event.sha,
    event.eventType,
    event.nodeId,
    event.actorUserId,
    event.message,
    metadataJson,
  ];
  const inserted = await client.query(
    `INSERT INTO deployment_events (
       id, release_id, environment, sha, event_type, node_id,
       actor_user_id, message, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    params
  );
  if (inserted.rows.length === 1) {
    return { outcome: "inserted", id: event.eventId };
  }

  const existing = await client.query(
    `SELECT (
       release_id = $2
       AND environment = $3
       AND sha IS NOT DISTINCT FROM $4
       AND event_type = $5
       AND node_id IS NOT DISTINCT FROM $6
       AND actor_user_id IS NOT DISTINCT FROM $7
       AND message = $8
       AND metadata IS NOT DISTINCT FROM $9::jsonb
     ) AS matches
     FROM deployment_events
     WHERE id = $1`,
    params
  );
  if (existing.rows[0]?.matches === true) {
    return { outcome: "already-recorded", id: event.eventId };
  }
  throw new SafeTelemetryError(
    "deployment event idempotency conflict: the event ID already exists with different facts"
  );
}

export async function upsertRuntimeNode(client, node) {
  const metadataJson = node.metadata === null ? null : JSON.stringify(node.metadata);
  const params = [
    node.nodeId,
    node.hostname,
    node.environment,
    node.backendSha,
    node.backendBuiltAt,
    node.frontendBuildId,
    node.status,
    node.postgresStatus,
    node.redisStatus,
    node.startedAt,
    node.observedAt,
    metadataJson,
  ];
  const result = await client.query(
    `INSERT INTO runtime_nodes (
       node_id, hostname, environment, backend_sha, backend_built_at,
       frontend_build_id, status, postgres_status, redis_status, started_at,
       last_seen_at, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     ON CONFLICT (node_id) DO UPDATE SET
       hostname = EXCLUDED.hostname,
       backend_sha = COALESCE(EXCLUDED.backend_sha, runtime_nodes.backend_sha),
       backend_built_at = COALESCE(EXCLUDED.backend_built_at, runtime_nodes.backend_built_at),
       frontend_build_id = COALESCE(EXCLUDED.frontend_build_id, runtime_nodes.frontend_build_id),
       status = EXCLUDED.status,
       postgres_status = COALESCE(EXCLUDED.postgres_status, runtime_nodes.postgres_status),
       redis_status = COALESCE(EXCLUDED.redis_status, runtime_nodes.redis_status),
       started_at = COALESCE(EXCLUDED.started_at, runtime_nodes.started_at),
       last_seen_at = EXCLUDED.last_seen_at,
       metadata = CASE
         WHEN EXCLUDED.metadata IS NULL THEN runtime_nodes.metadata
         WHEN runtime_nodes.metadata IS NULL THEN EXCLUDED.metadata
         ELSE runtime_nodes.metadata || EXCLUDED.metadata
       END,
       updated_at = NOW()
     WHERE runtime_nodes.environment = EXCLUDED.environment
       AND runtime_nodes.last_seen_at < EXCLUDED.last_seen_at
     RETURNING node_id`,
    params
  );
  if (result.rows.length === 1) {
    return { outcome: "upserted", id: node.nodeId };
  }

  const existing = await client.query(
    `SELECT environment,
            last_seen_at,
            (
              hostname = $2
              AND environment = $3
              AND ($4::text IS NULL OR backend_sha IS NOT DISTINCT FROM $4)
              AND (
                $5::timestamptz IS NULL
                OR backend_built_at IS NOT DISTINCT FROM $5::timestamptz
              )
              AND ($6::text IS NULL OR frontend_build_id IS NOT DISTINCT FROM $6)
              AND status = $7
              AND postgres_status IS NOT DISTINCT FROM $8
              AND redis_status IS NOT DISTINCT FROM $9
              AND (
                $10::timestamptz IS NULL
                OR started_at IS NOT DISTINCT FROM $10::timestamptz
              )
              AND last_seen_at = $11::timestamptz
              AND (
                $12::jsonb IS NULL
                OR COALESCE(metadata, '{}'::jsonb) @> $12::jsonb
              )
            ) AS matches
       FROM runtime_nodes
      WHERE node_id = $1`,
    params
  );
  if (!existing.rows.length) {
    throw new SafeTelemetryError("runtime node upsert did not persist a row");
  }
  if (existing.rows[0].environment !== node.environment) {
    throw new SafeTelemetryError(
      "runtime node environment conflict: a node ID cannot move between environments"
    );
  }
  if (existing.rows[0].matches === true) {
    return { outcome: "already-current", id: node.nodeId };
  }
  if (
    new Date(existing.rows[0].last_seen_at).getTime() ===
    new Date(node.observedAt).getTime()
  ) {
    throw new SafeTelemetryError(
      "runtime node observation conflict: the timestamp already exists with different facts"
    );
  }
  return { outcome: "ignored-stale", id: node.nodeId };
}

async function assertTelemetryTable(client, table) {
  const result = await client.query("SELECT to_regclass($1) AS relation", [`public.${table}`]);
  if (!result.rows[0]?.relation) {
    throw new SafeTelemetryError(
      `required table ${table} is unavailable; apply migration 014_admin_control_plane.sql first`
    );
  }
}

function loadBackendEnvironment(env) {
  const releaseRoot = path.resolve(env.NEXUSFLOW_APP_ROOT || process.cwd());
  const backendEnv = path.resolve(
    env.NEXUSFLOW_BACKEND_ENV || path.join(releaseRoot, "backend/.env")
  );
  if (!fs.existsSync(backendEnv)) return;
  const loaded = dotenv.config({ path: backendEnv, quiet: true });
  if (loaded.error) {
    throw new SafeTelemetryError("the backend environment file could not be loaded");
  }
}

export function formatErrorForLog(error) {
  if (error instanceof SafeTelemetryError) return error.message;
  const code =
    error &&
    typeof error === "object" &&
    typeof error.code === "string" &&
    /^[A-Z0-9]{5}$/.test(error.code)
      ? error.code
      : null;
  return code
    ? `database operation failed (code ${code})`
    : "release telemetry failed without exposing internal connection details";
}

async function main() {
  const parsed = parseCli(process.argv.slice(2));
  if (parsed.command === "help") {
    console.log(USAGE);
    return;
  }

  loadBackendEnvironment(process.env);
  const connectionConfig = buildConnectionConfig(process.env);
  const statementTimeoutMs = positiveIntegerFromEnv(
    process.env,
    "NEXUSFLOW_TELEMETRY_STATEMENT_TIMEOUT_MS",
    DEFAULT_STATEMENT_TIMEOUT_MS,
    60_000
  );
  const client = new Client(connectionConfig);
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query("SELECT set_config('statement_timeout', $1, false)", [
      `${statementTimeoutMs}ms`,
    ]);
    if (parsed.command === "deployment-event") {
      await assertTelemetryTable(client, "deployment_events");
      const result = await recordDeploymentEvent(client, parsed.value);
      console.error(`[release-telemetry] deployment-event ${result.outcome}`);
    } else {
      await assertTelemetryTable(client, "runtime_nodes");
      const result = await upsertRuntimeNode(client, parsed.value);
      console.error(`[release-telemetry] runtime-node ${result.outcome}`);
    }
  } finally {
    if (connected) await client.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`[release-telemetry] ERROR: ${formatErrorForLog(error)}`);
    process.exitCode = 1;
  });
}
