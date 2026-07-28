#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import pg from "pg";

const { Client } = pg;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const SAFE_ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const LOCK_NAME = "nexusflow-session-token-security-v1";

class SafeSessionSecurityError extends Error {}

function fail(message) {
  console.error(`[session-token-security] ERROR: ${message}`);
  process.exitCode = 1;
}

function formatError(error) {
  if (error instanceof SafeSessionSecurityError) return error.message;
  const code =
    error &&
    typeof error === "object" &&
    typeof error.code === "string" &&
    /^[A-Z0-9]{5}$/.test(error.code)
      ? error.code
      : null;
  return code
    ? `database operation failed (code ${code})`
    : "database operation failed without exposing connection details";
}

function parseArguments(argv) {
  const command = argv.shift();
  if (!["transition", "posture"].includes(command)) {
    throw new SafeSessionSecurityError(
      "usage: session-token-security.mjs transition --direction <forward|rollback> --sha <sha> --actor <actor> --reason <reason> | posture --expect <dual|hash-only>"
    );
  }
  const values = {};
  while (argv.length > 0) {
    const flag = argv.shift();
    const value = argv.shift();
    if (!flag?.startsWith("--") || value === undefined) {
      throw new SafeSessionSecurityError("session security arguments are incomplete");
    }
    const key = flag.slice(2);
    if (Object.hasOwn(values, key)) {
      throw new SafeSessionSecurityError(`duplicate session security argument: --${key}`);
    }
    values[key] = value;
  }
  if (command === "posture") {
    if (Object.keys(values).some((key) => key !== "expect")) {
      throw new SafeSessionSecurityError("posture accepts only --expect");
    }
    if (!["dual", "hash-only"].includes(values.expect)) {
      throw new SafeSessionSecurityError("--expect must be dual or hash-only");
    }
    return { command, expect: values.expect };
  }
  const allowed = new Set(["direction", "sha", "actor", "reason"]);
  if (Object.keys(values).some((key) => !allowed.has(key))) {
    throw new SafeSessionSecurityError("transition received an unknown argument");
  }
  if (!["forward", "rollback"].includes(values.direction)) {
    throw new SafeSessionSecurityError("--direction must be forward or rollback");
  }
  if (!FULL_SHA.test(values.sha || "")) {
    throw new SafeSessionSecurityError("--sha must be a full Git SHA");
  }
  if (!SAFE_ACTOR.test(values.actor || "")) {
    throw new SafeSessionSecurityError("--actor is invalid");
  }
  if (
    typeof values.reason !== "string" ||
    values.reason.length < 1 ||
    values.reason.length > 500 ||
    values.reason.includes("\0")
  ) {
    throw new SafeSessionSecurityError("--reason must contain 1-500 safe text characters");
  }
  return {
    command,
    direction: values.direction,
    sha: values.sha.toLowerCase(),
    actor: values.actor,
    reason: values.reason,
  };
}

function loadEnvironment() {
  const appRoot = path.resolve(process.env.NEXUSFLOW_APP_ROOT || process.cwd());
  const backendEnv = path.resolve(
    process.env.NEXUSFLOW_BACKEND_ENV || path.join(appRoot, "backend/.env")
  );
  if (!fs.existsSync(backendEnv)) {
    throw new SafeSessionSecurityError("backend environment is unavailable");
  }
  const loaded = dotenv.config({ path: backendEnv, quiet: true, override: false });
  if (loaded.error) {
    throw new SafeSessionSecurityError("backend environment could not be loaded");
  }
}

function connectionConfig() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (databaseUrl) return { connectionString: databaseUrl };
  const required = ["PG_HOST", "PG_USER", "PG_PASSWORD", "PG_DATABASE"];
  const missing = required.filter((key) => !String(process.env[key] || "").trim());
  if (missing.length > 0) {
    throw new SafeSessionSecurityError(
      `database configuration is missing: ${missing.join(", ")}`
    );
  }
  const port = Number(process.env.PG_PORT || "5432");
  if (!Number.isSafeInteger(port) || port <= 0) {
    throw new SafeSessionSecurityError("PG_PORT must be a positive integer");
  }
  return {
    host: process.env.PG_HOST,
    port,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
  };
}

async function readPosture(client) {
  const relation = await client.query(
    "SELECT to_regclass('public.session_token_security_state') AS state_table, to_regclass('public.session_token_security_events') AS event_table"
  );
  if (!relation.rows[0]?.state_table || !relation.rows[0]?.event_table) {
    throw new SafeSessionSecurityError(
      "migration 017 session security tables are unavailable"
    );
  }
  const result = await client.query(`
    SELECT state.hash_only,
           COUNT(s.id)::bigint AS session_count,
           COUNT(s.id) FILTER (
             WHERE s.token NOT LIKE 'session-hash-v1:%'
           )::bigint AS legacy_bearer_count,
           COUNT(s.id) FILTER (
             WHERE s.token LIKE 'session-hash-v1:%'
           )::bigint AS hash_marker_count,
           COUNT(s.id) FILTER (
             WHERE s.token_hash IS NULL
           )::bigint AS missing_hash_count
      FROM session_token_security_state state
      LEFT JOIN sessions s ON TRUE
     WHERE state.singleton = TRUE
     GROUP BY state.hash_only
  `);
  if (result.rows.length !== 1) {
    throw new SafeSessionSecurityError("singleton session security state is missing");
  }
  const row = result.rows[0];
  return {
    hashOnly: row.hash_only === true,
    sessionCount: Number(row.session_count),
    legacyBearerCount: Number(row.legacy_bearer_count),
    hashMarkerCount: Number(row.hash_marker_count),
    missingHashCount: Number(row.missing_hash_count),
  };
}

function assertPosture(posture, expected) {
  const valid = expected === "hash-only"
    ? posture.hashOnly &&
      posture.legacyBearerCount === 0 &&
      posture.missingHashCount === 0
    : !posture.hashOnly;
  if (!valid) {
    throw new SafeSessionSecurityError(
      `session security posture does not satisfy ${expected}`
    );
  }
}

async function transition(client, parsed) {
  const target = parsed.direction === "forward";
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [LOCK_NAME]);
    const stateResult = await client.query(
      `SELECT hash_only
         FROM session_token_security_state
        WHERE singleton = TRUE
        FOR UPDATE`
    );
    if (stateResult.rows.length !== 1) {
      throw new SafeSessionSecurityError("singleton session security state is missing");
    }
    const current = stateResult.rows[0].hash_only === true;
    let revoked = 0;
    if (current !== target) {
      const deleted = await client.query("DELETE FROM sessions");
      revoked = deleted.rowCount || 0;
      await client.query(
        `UPDATE session_token_security_state
            SET hash_only = $1,
                release_sha = $2,
                updated_by = $3,
                updated_at = NOW()
          WHERE singleton = TRUE`,
        [target, parsed.sha, parsed.actor]
      );
      await client.query(
        `INSERT INTO session_token_security_events (
           id, transition, from_hash_only, to_hash_only, sessions_revoked,
           release_sha, actor, reason, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          crypto.randomUUID(),
          parsed.direction,
          current,
          target,
          revoked,
          parsed.sha,
          parsed.actor,
          parsed.reason,
        ]
      );
    }
    await client.query("COMMIT");
    return { changed: current !== target, revoked };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  loadEnvironment();
  const client = new Client(connectionConfig());
  await client.connect();
  try {
    await client.query("SELECT set_config('lock_timeout', $1, false)", ["15000ms"]);
    await client.query("SELECT set_config('statement_timeout', $1, false)", ["60000ms"]);
    if (parsed.command === "transition") {
      const result = await transition(client, parsed);
      const expected = parsed.direction === "forward" ? "hash-only" : "dual";
      const posture = await readPosture(client);
      assertPosture(posture, expected);
      console.error(
        `[session-token-security] ${parsed.direction} ${result.changed ? "changed" : "already-current"}; revoked=${result.revoked}`
      );
      return;
    }
    const posture = await readPosture(client);
    assertPosture(posture, parsed.expect);
    console.error(`[session-token-security] posture ${parsed.expect} verified`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  fail(formatError(error));
});
