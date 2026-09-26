#!/usr/bin/env node
// Stepped load generator for NexusFlow /v1/chat/completions (docs/load-testing.md).
//
//   node scripts/load-test.mjs --model deepseek-v4-flash --key-file ~/.nf-loadtest.key \
//     --stages 5x100,20x500,50x1500 [--stream-ratio 0.3] [--max-tokens 8] \
//     [--base-url https://nexusflow.hk] [--pause-s 0] [--max-cost-cny 1] \
//     [--expect-capacity-rejects] [--confirm-production]
//
// Each stage is <concurrency>x<requests>. Output is one JSON line per stage
// and a final summary line, so runs can be diffed or pasted into a result
// record. Guards:
// - the key is read only from a file that is not group/world readable and is
//   never printed;
// - any host other than localhost/127.0.0.1 requires --confirm-production;
// - the worst-case cost (catalog price x requests x (prompt estimate +
//   max_tokens)) must stay under --max-cost-cny, otherwise nothing is sent;
// - escalation stops after a stage whose unexpected error rate exceeds
//   --stop-error-rate (capacity 429/503 count as expected only with
//   --expect-capacity-rejects).
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const PROMPT_TOKEN_ESTIMATE = 80;
const CAPACITY_ERRORS = new Set(["provider_capacity_exhausted", "capacity_exhausted", "rate_limit_error", "rate_limit_exceeded"]);

export function parseArgs(argv) {
  const options = {
    baseUrl: "https://nexusflow.hk",
    streamRatio: 0.3,
    maxTokens: 8,
    pauseS: 0,
    maxCostCny: 1,
    stopErrorRate: 0.02,
    expectCapacityRejects: false,
    confirmProduction: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      return value;
    };
    if (arg === "--model") options.model = next();
    else if (arg === "--key-file") options.keyFile = next();
    else if (arg === "--stages") options.stages = parseStages(next());
    else if (arg === "--stream-ratio") options.streamRatio = Number(next());
    else if (arg === "--max-tokens") options.maxTokens = Number(next());
    else if (arg === "--base-url") options.baseUrl = next().replace(/\/+$/, "");
    else if (arg === "--pause-s") options.pauseS = Number(next());
    else if (arg === "--max-cost-cny") options.maxCostCny = Number(next());
    else if (arg === "--stop-error-rate") options.stopErrorRate = Number(next());
    else if (arg === "--expect-capacity-rejects") options.expectCapacityRejects = true;
    else if (arg === "--confirm-production") options.confirmProduction = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!options.model || !options.keyFile || !options.stages) throw new Error("--model, --key-file and --stages are required");
  if (!(options.streamRatio >= 0 && options.streamRatio <= 1)) throw new Error("--stream-ratio must be within 0..1");
  if (!Number.isInteger(options.maxTokens) || options.maxTokens < 1 || options.maxTokens > 256) throw new Error("--max-tokens must be an integer 1..256");
  if (!(options.maxCostCny > 0)) throw new Error("--max-cost-cny must be > 0");
  return options;
}

export function parseStages(spec) {
  const stages = spec.split(",").map((part) => {
    const match = /^(\d+)x(\d+)$/.exec(part.trim());
    if (!match) throw new Error(`bad stage "${part}", expected <concurrency>x<requests>`);
    const concurrency = Number(match[1]);
    const requests = Number(match[2]);
    if (concurrency < 1 || concurrency > 500) throw new Error("concurrency must be 1..500");
    if (requests < concurrency || requests > 20000) throw new Error("requests must be >= concurrency and <= 20000");
    return { concurrency, requests };
  });
  if (stages.length === 0) throw new Error("no stages");
  return stages;
}

export function isLocalHost(baseUrl) {
  const host = new URL(baseUrl).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

export function readKeyFile(file) {
  const stat = fs.statSync(file);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${file} must not be readable by group/others (chmod 600)`);
  const key = fs.readFileSync(file, "utf8").trim();
  if (!/^sk-air-[0-9a-f]{48}$/.test(key)) throw new Error(`${file} does not contain a NexusFlow API key`);
  return key;
}

/** Worst case in CNY: every request uses the prompt estimate plus max_tokens. */
export function estimateMaxCost(model, stages, maxTokens) {
  const requests = stages.reduce((sum, s) => sum + s.requests, 0);
  const input = Number(model.promptPrice ?? model.inputPrice ?? NaN);
  const output = Number(model.completionPrice ?? model.outputPrice ?? NaN);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
  return (requests * (PROMPT_TOKEN_ESTIMATE * input + maxTokens * output)) / 1_000_000;
}

export function percentile(sorted, q) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export function errorKey(status, bodyText) {
  let detail = bodyText.slice(0, 80);
  try {
    const parsed = JSON.parse(bodyText);
    const error = parsed.error ?? {};
    detail = error.code || error.type || String(error.message ?? "").slice(0, 80) || detail;
  } catch {
    // Non-JSON error bodies are summarised by their prefix.
  }
  return `${status}:${detail}`;
}

export function summarizeStage(stage, results, durationMs) {
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const codes = {};
  const errors = {};
  let unexpected = 0;
  let capacityRejects = 0;
  let streams = 0;
  let streamsDone = 0;
  for (const r of results) {
    codes[r.status] = (codes[r.status] ?? 0) + 1;
    if (r.stream && r.ok) {
      streams += 1;
      if (r.done) streamsDone += 1;
    }
    if (r.error) {
      errors[r.error] = (errors[r.error] ?? 0) + 1;
      const code = r.error.slice(r.error.indexOf(":") + 1);
      if (CAPACITY_ERRORS.has(code)) capacityRejects += 1;
      else unexpected += 1;
    }
  }
  return {
    concurrency: stage.concurrency,
    requests: stage.requests,
    durationS: Number((durationMs / 1000).toFixed(1)),
    rps: Number((results.length / (durationMs / 1000)).toFixed(1)),
    codes,
    errors,
    capacityRejects,
    unexpectedErrors: unexpected,
    latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), p99: percentile(latencies, 0.99), max: latencies.length ? latencies[latencies.length - 1] : null },
    streamsEndedWithDone: `${streamsDone}/${streams}`,
    streamIntegrityOk: streamsDone === streams,
  };
}

export function shouldStop(summary, options) {
  const errors = options.expectCapacityRejects ? summary.unexpectedErrors : summary.unexpectedErrors + summary.capacityRejects;
  if (!summary.streamIntegrityOk) return "stream ended without [DONE]";
  if (errors / summary.requests > options.stopErrorRate) return `error rate ${(errors / summary.requests * 100).toFixed(1)}% > ${(options.stopErrorRate * 100).toFixed(1)}%`;
  return null;
}

async function oneRequest(options, key, index) {
  const stream = Math.random() < options.streamRatio;
  const body = { model: options.model, max_tokens: options.maxTokens, messages: [{ role: "user", content: `load test ${index}: reply OK` }] };
  if (stream) body.stream = true;
  const started = Date.now();
  try {
    const response = await fetch(`${options.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    return {
      status: String(response.status),
      ok: response.ok,
      stream,
      done: stream && response.ok ? text.includes("data: [DONE]") : false,
      error: response.ok ? null : errorKey(response.status, text),
      ms: Date.now() - started,
    };
  } catch (error) {
    return { status: "network", ok: false, stream, done: false, error: `network:${error?.name ?? "Error"}`, ms: Date.now() - started };
  }
}

export async function runStage(options, key, stage) {
  const results = [];
  let next = 0;
  const started = Date.now();
  const worker = async () => {
    while (next < stage.requests) {
      const index = next++;
      results.push(await oneRequest(options, key, index));
    }
  };
  await Promise.all(Array.from({ length: stage.concurrency }, worker));
  return summarizeStage(stage, results, Date.now() - started);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isLocalHost(options.baseUrl) && !options.confirmProduction) {
    throw new Error(`${options.baseUrl} is not local; re-run with --confirm-production after the runbook go/no-go`);
  }
  const key = readKeyFile(options.keyFile);
  const catalog = await (await fetch(`${options.baseUrl}/api/models`)).json();
  const list = Array.isArray(catalog) ? catalog : catalog.models ?? catalog.data ?? [];
  const model = list.find((m) => m.id === options.model);
  if (!model) throw new Error(`${options.model} is not in the public catalog`);
  const maxCost = estimateMaxCost(model, options.stages, options.maxTokens);
  if (maxCost === null) throw new Error(`${options.model} has no published token price; refusing to estimate cost`);
  if (maxCost > options.maxCostCny) throw new Error(`worst-case cost ¥${maxCost.toFixed(4)} exceeds --max-cost-cny ${options.maxCostCny}`);
  console.log(JSON.stringify({ event: "plan", model: options.model, baseUrl: options.baseUrl, stages: options.stages, maxCostCny: Number(maxCost.toFixed(4)) }));

  const summaries = [];
  for (const [i, stage] of options.stages.entries()) {
    if (i > 0 && options.pauseS > 0) await new Promise((resolve) => setTimeout(resolve, options.pauseS * 1000));
    const summary = await runStage(options, key, stage);
    summaries.push(summary);
    console.log(JSON.stringify({ event: "stage", ...summary }));
    const reason = shouldStop(summary, options);
    if (reason) {
      console.log(JSON.stringify({ event: "stopped", afterStage: i + 1, reason }));
      process.exitCode = 2;
      break;
    }
  }
  const total = summaries.reduce((sum, s) => sum + s.requests, 0);
  const peak = summaries.reduce((best, s) => Math.max(best, s.rps), 0);
  console.log(JSON.stringify({ event: "summary", stagesRun: summaries.length, requests: total, peakRps: peak }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`[load-test] ${error.message}`);
    process.exitCode = 1;
  });
}
