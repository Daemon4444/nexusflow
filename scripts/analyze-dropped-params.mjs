#!/usr/bin/env node
/**
 * NF_PARAM_MODE=shadow report (P5): which customers send parameters the
 * legacy allow-list drops, and which would be rejected as billing_guarded
 * under enforce. For people only, before switching to enforce and to
 * decide whom to notify.
 *
 *   node scripts/analyze-dropped-params.mjs <sls-export>... [--json]
 *
 * Input: SLS log exports (NDJSON, or a JSON array) containing the
 * `status:"shadow_diff", shadowArea:"params"` records written by the
 * pipeline. Records only ever carry parameter *names*. usage_logs does not
 * record parameter names, so SLS is the only source.
 */
import fs from "node:fs";

function parseRecords(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  return trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

export function aggregate(records) {
  const customers = new Map();
  for (const record of records) {
    if (record.status !== "shadow_diff" || record.shadowArea !== "params") continue;
    const key = record.userId || "(anonymous)";
    const entry = customers.get(key) || { userId: key, requests: 0, dropped: {}, wouldReject: {}, models: {} };
    entry.requests += 1;
    for (const name of asList(record.dropped)) entry.dropped[name] = (entry.dropped[name] || 0) + 1;
    for (const name of asList(record.wouldReject)) entry.wouldReject[name] = (entry.wouldReject[name] || 0) + 1;
    if (record.model) entry.models[record.model] = (entry.models[record.model] || 0) + 1;
    customers.set(key, entry);
  }
  return [...customers.values()].sort((a, b) => b.requests - a.requests || a.userId.localeCompare(b.userId));
}

function render(rows) {
  const lines = ["# 参数影子统计（NF_PARAM_MODE=shadow）", "", "| 用户 | 请求数 | 旧逻辑丢弃的参数 | enforce 将拒绝（billing_guarded） | 模型 |", "|---|---|---|---|---|"];
  const fmt = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name}×${count}`).join(", ") || "-";
  for (const row of rows) lines.push(`| ${row.userId} | ${row.requests} | ${fmt(row.dropped)} | ${fmt(row.wouldReject)} | ${fmt(row.models)} |`);
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const files = args.filter((arg) => arg !== "--json");
  if (!files.length) {
    console.error("usage: node scripts/analyze-dropped-params.mjs <sls-export>... [--json]");
    process.exit(64);
  }
  const records = files.flatMap((file) => parseRecords(fs.readFileSync(file, "utf8")));
  const rows = aggregate(records);
  process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : render(rows));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
