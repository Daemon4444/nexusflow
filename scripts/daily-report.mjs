#!/usr/bin/env node

/**
 * NexusFlow Daily Report Script
 *
 * Queries PostgreSQL for yesterday's dashboard metrics and pushes
 * a formatted report to a webhook (WeChat Work / DingTalk / Feishu / generic).
 *
 * Usage:
 *   node scripts/daily-report.mjs --dry-run
 *   node scripts/daily-report.mjs --webhook https://your-webhook-url
 *   node scripts/daily-report.mjs --days 7
 *
 * Cron (every day at 09:00 Asia/Shanghai):
 *   0 9 * * * cd /root/distiny/nexusflow && node scripts/daily-report.mjs >> /var/log/nexusflow-daily-report.log 2>&1
 *
 * Environment:
 *   Reads scripts/daily-report.env for DAILY_REPORT_WEBHOOK and PG_* overrides.
 */

import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ENV_FILE = resolve(__dirname, "daily-report.env");

// ============================================================
// Config
// ============================================================

function parseEnvFile(filepath) {
  const vars = {};
  if (!existsSync(filepath)) return vars;
  for (const line of readFileSync(filepath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, webhook: null, days: 1 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") opts.dryRun = true;
    else if (args[i] === "--webhook" && args[i + 1]) opts.webhook = args[++i];
    else if (args[i] === "--days" && args[i + 1]) opts.days = Math.max(1, parseInt(args[++i], 10) || 1);
  }
  return opts;
}

const fileEnv = parseEnvFile(ENV_FILE);
const args = parseArgs();

const PG_CONFIG = {
  host: fileEnv.PG_HOST || process.env.PG_HOST || "127.0.0.1",
  port: Number(fileEnv.PG_PORT || process.env.PG_PORT || 5432),
  user: fileEnv.PG_USER || process.env.PG_USER || "quadrant",
  password: fileEnv.PG_PASSWORD || process.env.PG_PASSWORD || "quadrant_dev_password",
  database: fileEnv.PG_DATABASE || process.env.PG_DATABASE || "quadrant",
  max: 3,
  connectionTimeoutMillis: 5000,
};

const WEBHOOK_URL = args.webhook || fileEnv.DAILY_REPORT_WEBHOOK || process.env.DAILY_REPORT_WEBHOOK || "";

// ============================================================
// Database helpers
// ============================================================

const pool = new pg.Pool(PG_CONFIG);

async function queryOne(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows[0] || null;
}

async function queryMany(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

// ============================================================
// Data collection
// ============================================================

/**
 * Get daily stats for a specific date offset.
 * offset=1 means yesterday, offset=2 means day before yesterday.
 */
async function getDailyStats(offset) {
  const row = await queryOne(
    `SELECT
       COUNT(*)::int as requests,
       COUNT(*) FILTER (WHERE status = 'success')::int as success,
       COUNT(*) FILTER (WHERE status = 'error')::int as errors,
       ROUND(COALESCE(SUM(cost), 0)::numeric, 2)::float as cost,
       COALESCE(SUM(prompt_tokens), 0)::int as prompt_tokens,
       COALESCE(SUM(completion_tokens), 0)::int as completion_tokens,
       COALESCE(SUM(total_tokens), 0)::int as total_tokens
     FROM usage_logs
     WHERE created_at >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date - $1 * INTERVAL '1 day'
       AND created_at < (NOW() AT TIME ZONE 'Asia/Shanghai')::date - ($1 - 1) * INTERVAL '1 day'`,
    [offset]
  );
  const r = row;
  const requests = Number(r?.requests || 0);
  const success = Number(r?.success || 0);
  return {
    requests,
    success,
    errors: Number(r?.errors || 0),
    cost: Number(r?.cost || 0),
    promptTokens: Number(r?.prompt_tokens || 0),
    completionTokens: Number(r?.completion_tokens || 0),
    totalTokens: Number(r?.total_tokens || 0),
    successRate: requests > 0 ? Math.round((success / requests) * 1000) / 10 : 0,
  };
}

async function getModelDistribution() {
  const rows = await queryMany(
    `SELECT
       model,
       COUNT(*)::int as requests,
       COALESCE(SUM(total_tokens), 0)::int as tokens,
       ROUND(COALESCE(SUM(cost), 0)::numeric, 2)::float as cost
     FROM usage_logs
     WHERE created_at >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date - INTERVAL '1 day'
       AND created_at < (NOW() AT TIME ZONE 'Asia/Shanghai')::date
     GROUP BY model
     ORDER BY requests DESC
     LIMIT 5`
  );
  const totalRequests = rows.reduce((s, r) => s + Number(r.requests), 0) || 1;
  return rows.map((r) => ({
    model: r.model,
    requests: Number(r.requests),
    tokens: Number(r.tokens),
    cost: Number(r.cost),
    pct: Math.round((Number(r.requests) / totalRequests) * 100),
  }));
}

async function getActiveUsers() {
  const row = await queryOne(
    `SELECT
       (SELECT COUNT(DISTINCT user_id)::int FROM usage_logs
        WHERE created_at >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date - INTERVAL '1 day'
          AND created_at < (NOW() AT TIME ZONE 'Asia/Shanghai')::date) as dau,
       (SELECT COUNT(*)::int FROM users
        WHERE created_at >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date - INTERVAL '1 day'
          AND created_at < (NOW() AT TIME ZONE 'Asia/Shanghai')::date) as new_users,
       (SELECT COUNT(*)::int FROM users) as total_users`
  );
  return {
    dau: Number(row?.dau || 0),
    newUsers: Number(row?.new_users || 0),
    totalUsers: Number(row?.total_users || 0),
  };
}

async function getTopUsers(limit = 3) {
  const rows = await queryMany(
    `SELECT
       ul.user_id,
       u.email as user_email,
       u.nickname as user_nickname,
       COUNT(*)::int as requests,
       ROUND(COALESCE(SUM(ul.cost), 0)::numeric, 2)::float as cost
     FROM usage_logs ul
     LEFT JOIN users u ON ul.user_id = u.id
     WHERE ul.created_at >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date - INTERVAL '1 day'
       AND ul.created_at < (NOW() AT TIME ZONE 'Asia/Shanghai')::date
       AND ul.user_id IS NOT NULL
     GROUP BY ul.user_id, u.email, u.nickname
     ORDER BY cost DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    email: r.user_email || "",
    nickname: r.user_nickname || "",
    requests: Number(r.requests),
    cost: Number(r.cost),
  }));
}

async function getRevenueStats() {
  const row = await queryOne(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'recharge' THEN amount ELSE 0 END), 0)::float as recharge,
       COALESCE(ABS(SUM(CASE WHEN type = 'consumption' THEN amount ELSE 0 END)), 0)::float as consumption
     FROM transactions
     WHERE created_at >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date - INTERVAL '1 day'
       AND created_at < (NOW() AT TIME ZONE 'Asia/Shanghai')::date`
  );
  return {
    recharge: Number(row?.recharge || 0),
    consumption: Number(row?.consumption || 0),
  };
}

// ============================================================
// Report formatting
// ============================================================

function trend(now, prev) {
  if (prev === 0 && now === 0) return { text: "持平", color: "grey", arrow: "➖" };
  if (prev === 0) return { text: "NEW", color: "green", arrow: "🆕" };
  const pct = ((now - prev) / prev) * 100;
  if (pct >= 0) return { text: `+${pct.toFixed(1)}%`, color: "green", arrow: "📈" };
  return { text: `${pct.toFixed(1)}%`, color: "red", arrow: "📉" };
}

function fmtNum(n) {
  return n.toLocaleString("en-US");
}

function fmtCost(n) {
  return n >= 10000 ? `${(n / 10000).toFixed(2)}万` : n.toFixed(2);
}

function fmtTokens(n) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
}

function progress(pct) {
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  return `▰`.repeat(filled) + `▱`.repeat(empty);
}

// ============================================================
// Feishu Card Builder (rich interactive card)
// ============================================================

function buildFeishuCard(data) {
  const { today, prevDay, models, users, topUsers, revenue, reportDays } = data;

  const dateLabel = reportDays > 1
    ? `${formatDate(reportDays)} ~ ${formatDate(1)}`
    : formatDate(1);

  const tReq = trend(today.requests, prevDay.requests);
  const tCost = trend(today.cost, prevDay.cost);
  const tTok = trend(today.totalTokens, prevDay.totalTokens);

  const elements = [];

  // --- Section 1: Key Metrics (2x2 grid using column_set) ---
  elements.push({
    tag: "column_set",
    flex_mode: "none",
    background_style: "grey",
    columns: [
      {
        tag: "column", width: "weighted", weight: 1,
        elements: [
          { tag: "div", text: { tag: "lark_md", content: "📡 **调用总量**" } },
          { tag: "div", text: { tag: "lark_md", content: `**${fmtNum(today.requests)}** 次` } },
          { tag: "div", text: { tag: "lark_md", content: `${tReq.arrow} ${tReq.text}` } },
        ],
      },
      {
        tag: "column", width: "weighted", weight: 1,
        elements: [
          { tag: "div", text: { tag: "lark_md", content: "✅ **成功率**" } },
          { tag: "div", text: { tag: "lark_md", content: `**${today.successRate}%**` } },
          { tag: "div", text: { tag: "lark_md", content: `${fmtNum(today.success)} / ${fmtNum(today.requests)}` } },
        ],
      },
    ],
  });

  elements.push({ tag: "column_set", flex_mode: "none", background_style: "grey", columns: [
    {
      tag: "column", width: "weighted", weight: 1,
      elements: [
        { tag: "div", text: { tag: "lark_md", content: "💰 **消耗费用**" } },
        { tag: "div", text: { tag: "lark_md", content: `**¥${fmtCost(today.cost)}**` } },
        { tag: "div", text: { tag: "lark_md", content: `${tCost.arrow} ${tCost.text}` } },
      ],
    },
    {
      tag: "column", width: "weighted", weight: 1,
      elements: [
        { tag: "div", text: { tag: "lark_md", content: "🔤 **Token 消耗**" } },
        { tag: "div", text: { tag: "lark_md", content: `**${fmtTokens(today.totalTokens)}**` } },
        { tag: "div", text: { tag: "lark_md", content: `${tTok.arrow} ${tTok.text}` } },
      ],
    },
  ]});

  elements.push({ tag: "hr" });

  // --- Section 2: Model Distribution ---
  const modelLines = [];
  if (models.length > 0) {
    for (const m of models) {
      const bar = progress(m.pct);
      const name = m.model.length > 24 ? m.model.slice(0, 22) + "…" : m.model;
      modelLines.push(`**${name}**`);
      modelLines.push(`${bar}  ${m.pct}%  ${fmtNum(m.requests)}次  ¥${m.cost.toFixed(2)}`);
    }
  } else {
    modelLines.push("暂无模型调用数据");
  }
  elements.push({
    tag: "div",
    text: { tag: "lark_md", content: `🤖 **模型调用分布** (Top 5)\n\n${modelLines.join("\n")}` },
  });

  elements.push({ tag: "hr" });

  // --- Section 3: Users ---
  elements.push({
    tag: "column_set", flex_mode: "none",
    columns: [
      {
        tag: "column", width: "weighted", weight: 1,
        elements: [
          { tag: "div", text: { tag: "lark_md", content: `👤 **日活 DAU**\n\n**${fmtNum(users.dau)}**` } },
        ],
      },
      {
        tag: "column", width: "weighted", weight: 1,
        elements: [
          { tag: "div", text: { tag: "lark_md", content: `🆕 **新增用户**\n\n**${fmtNum(users.newUsers)}**` } },
        ],
      },
      {
        tag: "column", width: "weighted", weight: 1,
        elements: [
          { tag: "div", text: { tag: "lark_md", content: `👥 **累计用户**\n\n**${fmtNum(users.totalUsers)}**` } },
        ],
      },
    ],
  });

  // Top spenders
  if (topUsers.length > 0) {
    elements.push({ tag: "hr" });
    const medals = ["🥇", "🥈", "🥉"];
    const spenderLines = topUsers.map((u, i) => {
      const label = u.nickname || u.email || "unknown";
      return `${medals[i] || "  "} **${label}**  ${fmtNum(u.requests)}次  ¥${u.cost.toFixed(2)}`;
    });
    elements.push({
      tag: "div",
      text: { tag: "lark_md", content: `🏆 **消费排行 Top ${topUsers.length}**\n\n${spenderLines.join("\n")}` },
    });
  }

  elements.push({ tag: "hr" });

  // --- Section 4: Revenue ---
  elements.push({
    tag: "column_set", flex_mode: "none",
    columns: [
      {
        tag: "column", width: "weighted", weight: 1,
        elements: [
          { tag: "div", text: { tag: "lark_md", content: `💳 **昨日充值**\n\n**¥${fmtCost(revenue.recharge)}**` } },
        ],
      },
      {
        tag: "column", width: "weighted", weight: 1,
        elements: [
          { tag: "div", text: { tag: "lark_md", content: `📤 **昨日消耗**\n\n**¥${fmtCost(revenue.consumption)}**` } },
        ],
      },
    ],
  });

  // Footer note
  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: `NexusFlow · 报告时间 ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
      },
    ],
  });

  return {
    msg_type: "interactive",
    card: {
      header: {
        title: { tag: "plain_text", content: "📊 NexusFlow 每日运营报告" },
        subtitle: { tag: "plain_text", content: dateLabel },
        template: "indigo",
      },
      elements,
    },
  };
}

// ============================================================
// Markdown fallback (for WeChat Work / DingTalk / generic)
// ============================================================

function buildMarkdownReport(data) {
  const { today, prevDay, models, users, topUsers, revenue, reportDays } = data;

  const dateLabel = reportDays > 1
    ? `${formatDate(reportDays)} ~ ${formatDate(1)}`
    : formatDate(1);

  const tReq = trend(today.requests, prevDay.requests);
  const tCost = trend(today.cost, prevDay.cost);
  const tTok = trend(today.totalTokens, prevDay.totalTokens);

  const lines = [];
  lines.push(`## 📊 NexusFlow 每日报告 (${dateLabel})`);
  lines.push("");

  lines.push("### 📡 调用概览");
  lines.push("");
  lines.push(`| 指标 | 数值 | 环比 |`);
  lines.push(`|---|---|---|`);
  lines.push(`| 调用总量 | ${fmtNum(today.requests)} | ${tReq.arrow} ${tReq.text} |`);
  lines.push(`| 成功率 | ${today.successRate}% (${fmtNum(today.success)}/${fmtNum(today.requests)}) | - |`);
  lines.push(`| 消耗费用 | ¥${today.cost.toFixed(2)} | ${tCost.arrow} ${tCost.text} |`);
  lines.push(`| Token | ${fmtTokens(today.totalTokens)} | ${tTok.arrow} ${tTok.text} |`);
  lines.push("");

  lines.push("### 🤖 模型分布 (Top 5)");
  lines.push("");
  if (models.length > 0) {
    lines.push(`| 模型 | 调用 | 占比 | 费用 |`);
    lines.push(`|---|---|---|---|`);
    for (const m of models) {
      lines.push(`| ${m.model} | ${fmtNum(m.requests)} | ${m.pct}% | ¥${m.cost.toFixed(2)} |`);
    }
  } else {
    lines.push("暂无模型调用数据");
  }
  lines.push("");

  lines.push("### 👥 用户 & 💰 收入");
  lines.push("");
  lines.push(`- DAU: **${fmtNum(users.dau)}** | 新增: **${fmtNum(users.newUsers)}** | 累计: **${fmtNum(users.totalUsers)}**`);
  lines.push(`- 充值: **¥${fmtCost(revenue.recharge)}** | 消耗: **¥${fmtCost(revenue.consumption)}**`);
  if (topUsers.length > 0) {
    const medals = ["🥇", "🥈", "🥉"];
    lines.push("");
    lines.push("**消费排行:**");
    topUsers.forEach((u, i) => {
      const label = u.nickname || u.email || "unknown";
      lines.push(`${medals[i]} ${label} — ${fmtNum(u.requests)}次 ¥${u.cost.toFixed(2)}`);
    });
  }
  lines.push("");

  return lines.join("\n");
}

function buildPlainTextReport(data) {
  const { today, prevDay, models, users, topUsers, revenue } = data;

  const dateLabel = formatDate(1);
  const tReq = trend(today.requests, prevDay.requests);
  const tCost = trend(today.cost, prevDay.cost);
  const lines = [];

  lines.push(`NexusFlow Daily Report (${dateLabel})`);
  lines.push("=".repeat(40));
  lines.push("");
  lines.push(`Requests: ${fmtNum(today.requests)} (${tReq.text})`);
  lines.push(`Success:  ${fmtNum(today.success)} (${today.successRate}%)`);
  lines.push(`Cost:     ¥${today.cost.toFixed(2)} (${tCost.text})`);
  lines.push(`Tokens:   ${fmtTokens(today.totalTokens)}`);
  lines.push("");

  if (models.length > 0) {
    lines.push("--- Models (Top 5) ---");
    models.forEach((m, i) => {
      lines.push(`${i + 1}. ${m.model}  ${fmtNum(m.requests)} req (${m.pct}%)  ¥${m.cost.toFixed(2)}`);
    });
    lines.push("");
  }

  lines.push(`DAU: ${fmtNum(users.dau)} | New: ${fmtNum(users.newUsers)} | Total: ${fmtNum(users.totalUsers)}`);
  lines.push(`Recharge: ¥${fmtCost(revenue.recharge)} | Consumed: ¥${fmtCost(revenue.consumption)}`);

  return lines.join("\n");
}

// ============================================================
// Webhook sending
// ============================================================

function detectWebhookType(url) {
  if (url.includes("qyapi.weixin.qq.com")) return "wecom";
  if (url.includes("oapi.dingtalk.com")) return "dingtalk";
  if (url.includes("open.feishu.cn") || url.includes("open.larksuite.com")) return "feishu";
  return "generic";
}

function buildWebhookPayload(type, data, markdown, plainText) {
  switch (type) {
    case "feishu":
      return buildFeishuCard(data);

    case "wecom":
      return {
        msgtype: "markdown",
        markdown: { content: markdown },
      };

    case "dingtalk":
      return {
        msgtype: "markdown",
        markdown: {
          title: "NexusFlow 每日报告",
          text: markdown,
        },
      };

    default:
      return {
        source: "nexusflow",
        type: "daily_report",
        timestamp: new Date().toISOString(),
        title: "NexusFlow Daily Report",
        markdown,
        text: plainText,
      };
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_CODES = new Set([11232, 19006]);
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 30000];

async function sendWebhook(url, payload) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    const body = await resp.text();
    if (!resp.ok) {
      throw new Error(`Webhook returned HTTP ${resp.status}: ${body.slice(0, 500)}`);
    }

    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = null; }

    const code = parsed?.code ?? parsed?.StatusCode ?? 0;
    if (code === 0) {
      return { status: resp.status, body: body.slice(0, 500) };
    }

    if (RETRYABLE_CODES.has(code) && attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS[attempt];
      console.warn(`Webhook returned code ${code} (${parsed?.msg}), retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      await sleep(delay);
      continue;
    }

    throw new Error(`Webhook returned error code ${code}: ${parsed?.msg || body.slice(0, 200)}`);
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const reportDays = args.days || 1;
  console.log(`[${new Date().toISOString()}] Collecting NexusFlow metrics...`);

  try {
    const [today, prevDay, models, users, topUsers, revenue] = await Promise.all([
      reportDays > 1 ? getMultiDayStats(reportDays) : getDailyStats(1),
      reportDays > 1 ? getMultiDayStats(reportDays * 2, reportDays + 1) : getDailyStats(2),
      getModelDistribution(),
      getActiveUsers(),
      getTopUsers(3),
      getRevenueStats(),
    ]);

    const data = { today, prevDay, models, users, topUsers, revenue, reportDays };
    const markdown = buildMarkdownReport(data);
    const plainText = buildPlainTextReport(data);

    if (args.dryRun) {
      console.log("\n--- DRY RUN (plain text) ---\n");
      console.log(plainText);
      console.log("\n--- Feishu Card JSON ---\n");
      console.log(JSON.stringify(buildFeishuCard(data), null, 2));
      console.log("\n--- Markdown (fallback) ---\n");
      console.log(markdown);
      console.log("\n[DRY RUN] Webhook not sent.");
      return;
    }

    if (!WEBHOOK_URL) {
      console.error("Error: No webhook URL configured.");
      console.error("Set DAILY_REPORT_WEBHOOK in scripts/daily-report.env or use --webhook <url>");
      console.error("\nReport output:\n");
      console.log(plainText);
      process.exitCode = 1;
      return;
    }

    const webhookType = detectWebhookType(WEBHOOK_URL);
    console.log(`Webhook type: ${webhookType}`);

    const payload = buildWebhookPayload(webhookType, data, markdown, plainText);
    try {
      const result = await sendWebhook(WEBHOOK_URL, payload);
      console.log(`Webhook sent successfully (HTTP ${result.status})`);
      console.log(`Response: ${result.body}`);
    } catch (err) {
      console.error(`[ERROR] Webhook delivery failed after retries: ${err.message}`);
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

/**
 * Aggregate stats over multiple days (from `fromOffset` days ago to `toOffset` days ago).
 */
async function getMultiDayStats(fromOffset, toOffset = 1) {
  const row = await queryOne(
    `SELECT
       COUNT(*)::int as requests,
       COUNT(*) FILTER (WHERE status = 'success')::int as success,
       COUNT(*) FILTER (WHERE status = 'error')::int as errors,
       ROUND(COALESCE(SUM(cost), 0)::numeric, 2)::float as cost,
       COALESCE(SUM(prompt_tokens), 0)::int as prompt_tokens,
       COALESCE(SUM(completion_tokens), 0)::int as completion_tokens,
       COALESCE(SUM(total_tokens), 0)::int as total_tokens
     FROM usage_logs
     WHERE created_at >= (NOW() AT TIME ZONE 'Asia/Shanghai')::date - $1 * INTERVAL '1 day'
       AND created_at < (NOW() AT TIME ZONE 'Asia/Shanghai')::date - ($2 - 1) * INTERVAL '1 day'`,
    [fromOffset, toOffset]
  );
  const r = row;
  const requests = Number(r?.requests || 0);
  const success = Number(r?.success || 0);
  return {
    requests,
    success,
    errors: Number(r?.errors || 0),
    cost: Number(r?.cost || 0),
    promptTokens: Number(r?.prompt_tokens || 0),
    completionTokens: Number(r?.completion_tokens || 0),
    totalTokens: Number(r?.total_tokens || 0),
    successRate: requests > 0 ? Math.round((success / requests) * 1000) / 10 : 0,
  };
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exitCode = 1;
  pool.end().catch(() => {});
});
