#!/usr/bin/env node
/**
 * Daily check that payload capture is complete: every chat/messages/responses
 * usage_logs row of a Beijing day whose caller is captured (same rule as
 * backend/src/services/payload-capture.ts: own row, parent row, then '*')
 * must have its log_id in that day's archive in R2 under any label, or still
 * in this node's local spool. Read-only; exits 1 when anything is missing.
 *
 * Usage (from the checkout root, on an app node):
 *   node scripts/payload-capture-reconcile.mjs              # yesterday
 *   node scripts/payload-capture-reconcile.mjs 2026-10-09   # a given day
 */
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "backend/package.json"));
require("dotenv").config({ path: path.join(ROOT, "backend/.env"), quiet: true });
const { Client } = require("pg");

const DIR = process.env.NF_PAYLOAD_CAPTURE_DIR || "/var/lib/nexusflow/payload-capture";
const REMOTE = process.env.NF_PAYLOAD_CAPTURE_REMOTE || "nfarc:";
const PROTOCOLS = ["openai-chat", "anthropic-messages", "openai-responses"];

function yesterdayBeijing() {
  return new Date(Date.now() + 8 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
}

async function collectLogIds(stream, into) {
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    // log_id is the first field; avoid parsing multi-MB lines in full.
    const match = /^\{"log_id":"([^"]+)"/.exec(line.slice(0, 80));
    if (match) into.add(match[1]);
  }
}

function listRemote(dir, dirsOnly) {
  try {
    const args = ["lsf", dir];
    if (dirsOnly) args.push("--dirs-only");
    return execFileSync("rclone", args, { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function archivedLogIds(day) {
  const ids = new Set();
  let files = 0;
  for (const labelDir of listRemote(REMOTE, true)) {
    const dayDir = `${REMOTE}${labelDir}capture/${day}/`;
    for (const file of listRemote(dayDir, false)) {
      files += 1;
      const child = spawn("rclone", ["cat", dayDir + file], { stdio: ["ignore", "pipe", "inherit"] });
      await collectLogIds(child.stdout.pipe(zlib.createGunzip()), ids);
    }
  }
  if (fs.existsSync(DIR)) {
    for (const label of fs.readdirSync(DIR)) {
      const localDir = path.join(DIR, label, day);
      if (!fs.existsSync(localDir)) continue;
      for (const file of fs.readdirSync(localDir)) {
        if (/\.jsonl(\.sealed)?$/.test(file)) await collectLogIds(fs.createReadStream(path.join(localDir, file)), ids);
      }
    }
  }
  return { ids, files };
}

function captured(rules, userId, parentUserId) {
  const rule = rules.get(userId) || (parentUserId && rules.get(parentUserId)) || rules.get("*");
  return Boolean(rule && rule.enabled);
}

async function main() {
  const day = process.argv[2] || yesterdayBeijing();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`bad day: ${day}`);
  const db = new Client({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
  });
  await db.connect();
  let rows;
  let rules;
  try {
    const ruleRows = await db.query("SELECT user_id, enabled FROM payload_capture_users");
    rules = new Map(ruleRows.rows.map((row) => [row.user_id, row]));
    ({ rows } = await db.query(
      `SELECT u.log_id, u.user_id, s.parent_user_id
         FROM usage_logs u
         LEFT JOIN users s ON s.id = u.user_id
        WHERE u.protocol = ANY($1)
          AND u.created_at >= ($2::date)::timestamp AT TIME ZONE 'Asia/Shanghai'
          AND u.created_at <  ($2::date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai'`,
      [PROTOCOLS, day]
    ));
  } finally {
    await db.end();
  }
  const expected = rows.filter((row) => row.log_id && captured(rules, row.user_id, row.parent_user_id));
  const { ids, files } = await archivedLogIds(day);
  const missing = expected.filter((row) => !ids.has(row.log_id));
  const byOwner = {};
  for (const row of missing) {
    const owner = row.parent_user_id || row.user_id;
    byOwner[owner] = (byOwner[owner] || 0) + 1;
  }
  console.log(JSON.stringify({ day, usageRows: rows.length, expected: expected.length, archived: ids.size, archiveFiles: files, missing: missing.length, missingByOwner: byOwner, sampleMissing: missing.slice(0, 5).map((row) => row.log_id) }));
  if (missing.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`payload-capture reconcile failed: ${error.message}`);
  process.exit(2);
});
