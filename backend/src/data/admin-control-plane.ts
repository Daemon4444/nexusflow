import { db } from "../db/client";
import { ALL_ADMIN_PERMISSIONS, ROLE_PERMISSIONS, listAdminRoleAssignments } from "./admin-access";

export interface AdminWindow {
  range: string;
  start: string | null;
  end: string;
  timezone: "Asia/Shanghai";
}

export interface PageInput {
  page: number;
  pageSize: number;
  offset: number;
}

function numberOrZero(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value: unknown): number {
  return Math.round(numberOrZero(value) * 1_000_000) / 1_000_000;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1_000_000) / 1_000_000;
}

function pagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function parseAdminPage(query: Record<string, unknown>): PageInput {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize) || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function parseAdminWindow(raw: unknown, defaultRange = "24h"): AdminWindow {
  const range = typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : defaultRange;
  const end = new Date();
  if (range === "all") {
    return { range, start: null, end: end.toISOString(), timezone: "Asia/Shanghai" };
  }
  const match = /^(\d+)(h|d)$/.exec(range);
  const amount = match ? Number(match[1]) : defaultRange.endsWith("h") ? Number(defaultRange.slice(0, -1)) : Number(defaultRange.slice(0, -1));
  const unit = match?.[2] || (defaultRange.endsWith("h") ? "h" : "d");
  const bounded = unit === "h" ? Math.min(24 * 90, Math.max(1, amount)) : Math.min(365, Math.max(1, amount));
  const milliseconds = bounded * (unit === "h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
  return {
    range: `${bounded}${unit}`,
    start: new Date(end.getTime() - milliseconds).toISOString(),
    end: end.toISOString(),
    timezone: "Asia/Shanghai",
  };
}

function windowWhere(column: string, window: AdminWindow, params: unknown[]): string {
  if (!window.start) {
    params.push(window.end);
    return `${column} <= ?`;
  }
  params.push(window.start, window.end);
  return `${column} >= ? AND ${column} <= ?`;
}

function truth(window: AdminWindow, sources: string[], coverage: Record<string, unknown> = {}) {
  return {
    window: { range: window.range, start: window.start, end: window.end },
    timezone: window.timezone,
    sources,
    coverage,
    unknownPolicy: "Missing facts are returned as null and are never inferred.",
  };
}

export async function getControlPlaneOverview(window: AdminWindow) {
  const usageParams: unknown[] = [];
  const usageClause = windowWhere("created_at", window, usageParams);
  const ledgerParams: unknown[] = [];
  const ledgerClause = windowWhere("created_at", window, ledgerParams);
  const [
    usage,
    ledger,
    accounts,
    reservations,
    topCustomers,
    series,
    openIncidents,
  ] = await Promise.all([
    db.queryOne<any>(
      `SELECT COUNT(*)::int AS requests,
              COALESCE(SUM(total_tokens), 0) AS tokens,
              COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0)::int AS successes,
              COALESCE(SUM(CASE WHEN status <> 'success' THEN 1 ELSE 0 END), 0)::int AS errors,
              AVG(latency_ms) AS avg_latency_ms,
              COUNT(latency_ms)::int AS latency_count,
              COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0)::int AS cost_eligible,
              COALESCE(SUM(CASE WHEN status = 'success' AND estimated IS NOT TRUE AND provider_cost IS NOT NULL THEN 1 ELSE 0 END), 0)::int AS cost_known,
              COALESCE(SUM(CASE WHEN status = 'success' AND estimated IS NOT TRUE THEN provider_cost ELSE 0 END), 0) AS provider_cost
         FROM usage_logs
        WHERE ${usageClause}`,
      usageParams as any[]
    ),
    db.queryOne<any>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'consumption' THEN amount ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN type = 'recharge' THEN amount ELSE 0 END), 0) AS recharge
         FROM transactions
        WHERE ${ledgerClause}`,
      ledgerParams as any[]
    ),
    db.queryOne<any>(
      `SELECT COALESCE(SUM(CASE WHEN parent_user_id IS NULL THEN 1 ELSE 0 END), 0)::int AS customers,
              COALESCE(SUM(CASE WHEN parent_user_id IS NULL THEN balance ELSE 0 END), 0) AS balance,
              COALESCE(SUM(CASE WHEN parent_user_id IS NULL THEN credit_balance ELSE 0 END), 0) AS credit
         FROM users
        WHERE status <> 'deleted'`
    ),
    db.queryOne<any>(
      `SELECT COALESCE(SUM(reserved_amount), 0) AS reserved
         FROM billing_reservations
        WHERE status = 'active' AND expires_at > NOW()`
    ),
    db.queryMany<any>(
      `SELECT u.id, u.nickname, u.email,
              COUNT(ul.id)::int AS requests,
              COALESCE(SUM(ul.total_tokens), 0) AS tokens,
              COALESCE(SUM(ul.cost), 0) AS cost,
              COALESCE(SUM(CASE WHEN ul.status = 'success' THEN 1 ELSE 0 END), 0)::int AS successes
         FROM users u
         JOIN usage_logs ul ON ul.user_id = u.id AND ${usageClause.replace(/\bcreated_at\b/g, "ul.created_at")}
        GROUP BY u.id, u.nickname, u.email
        ORDER BY requests DESC, tokens DESC
        LIMIT 10`,
      usageParams as any[]
    ),
    db.queryMany<any>(
      `SELECT to_char(timezone('Asia/Shanghai', created_at), '${window.range.endsWith("h") ? "YYYY-MM-DD HH24" : "YYYY-MM-DD"}') AS bucket,
              COUNT(*)::int AS requests,
              COALESCE(SUM(total_tokens), 0) AS tokens,
              COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0)::int AS successes
         FROM usage_logs
        WHERE ${usageClause}
        GROUP BY bucket
        ORDER BY bucket`,
      usageParams as any[]
    ),
    db.queryMany<any>(
      `SELECT id, severity, title, summary, source, started_at
         FROM incidents
        WHERE status <> 'resolved'
        ORDER BY started_at DESC
        LIMIT 10`
    ),
  ]);

  const requestCount = numberOrZero(usage?.requests);
  const successes = numberOrZero(usage?.successes);
  const latencyCount = numberOrZero(usage?.latency_count);
  const p95Row = latencyCount > 0
    ? await db.queryOne<{ latency_ms: string | number }>(
        `SELECT latency_ms
           FROM usage_logs
          WHERE ${usageClause} AND latency_ms IS NOT NULL
          ORDER BY latency_ms
          LIMIT 1 OFFSET ?`,
        [...usageParams, Math.max(0, Math.ceil(latencyCount * 0.95) - 1)] as any[]
      )
    : null;
  const p95LatencyMs = numberOrNull(p95Row?.latency_ms);
  const costEligible = numberOrZero(usage?.cost_eligible);
  const costKnown = numberOrZero(usage?.cost_known);
  const costCoverage = costEligible === 0 ? 1 : costKnown / costEligible;
  const upstreamCost = costCoverage === 1 ? money(usage?.provider_cost) : null;
  const revenue = money(ledger?.revenue);
  const grossProfit = upstreamCost === null ? null : money(revenue - upstreamCost);
  const grossMargin = grossProfit === null || revenue <= 0 ? null : ratio(grossProfit, revenue);

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      { key: "revenue", label: "收入", value: revenue, unit: "CNY", description: "交易账本 consumption 合计" },
      { key: "upstreamCost", label: "上游成本", value: upstreamCost, unit: "CNY", description: "仅在成功请求成本 100% 可追溯时展示" },
      { key: "grossProfit", label: "毛利", value: grossProfit, unit: "CNY" },
      { key: "grossMargin", label: "毛利率", value: grossMargin, unit: "ratio" },
      { key: "requests", label: "请求量", value: requestCount },
      { key: "tokens", label: "Tokens", value: numberOrZero(usage?.tokens) },
      { key: "activeCustomers", label: "客户数", value: numberOrZero(accounts?.customers) },
      { key: "successRate", label: "成功率", value: ratio(successes, requestCount), unit: "ratio" },
      { key: "p95LatencyMs", label: "P95 延迟", value: p95LatencyMs, unit: "ms", description: "usage_logs.latency_ms 离散 95 分位" },
      { key: "reservedBalance", label: "资金预占", value: money(reservations?.reserved), unit: "CNY" },
      { key: "creditExposure", label: "信控敞口", value: money(accounts?.credit), unit: "CNY" },
    ],
    timeSeries: series.map((row) => ({
      label: row.bucket,
      requests: numberOrZero(row.requests),
      tokens: numberOrZero(row.tokens),
      successRate: ratio(numberOrZero(row.successes), numberOrZero(row.requests)),
      p95LatencyMs: null,
    })),
    topCustomers: topCustomers.map((row) => ({
      id: row.id,
      nickname: row.nickname,
      email: row.email,
      requests: numberOrZero(row.requests),
      tokens: numberOrZero(row.tokens),
      cost: money(row.cost),
      successRate: ratio(numberOrZero(row.successes), numberOrZero(row.requests)),
    })),
    alerts: openIncidents.map((row) => ({
      id: row.id,
      level: row.severity === "sev1" || row.severity === "sev2" ? "critical" : "warning",
      title: row.title,
      detail: row.summary || null,
      createdAt: row.started_at,
      source: row.source,
    })),
    truth: truth(window, ["usage_logs", "transactions", "users", "billing_reservations", "incidents"], {
      upstreamCost: {
        known: costKnown,
        eligible: costEligible,
        ratio: costCoverage,
        excludesEstimatedUsage: true,
      },
      p95LatencyMs: { known: p95LatencyMs !== null, source: "usage_logs.latency_ms" },
    }),
  };
}

export async function listAdminCustomers(
  window: AdminWindow,
  input: PageInput & { q?: string; status?: string }
) {
  const conditions: string[] = [];
  const params: any[] = [];
  const q = (input.q || "").trim().toLowerCase();
  if (q) {
    conditions.push(
      "(LOWER(u.id) LIKE ? OR LOWER(COALESCE(u.email, '')) LIKE ? OR LOWER(COALESCE(u.username, '')) LIKE ? OR LOWER(u.nickname) LIKE ?)"
    );
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (input.status && !["all", "current"].includes(input.status)) {
    conditions.push("u.status = ?");
    params.push(input.status);
  } else if (input.status !== "all") {
    conditions.push("u.status <> 'deleted'");
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const count = await db.queryOne<{ total: string | number }>(
    `SELECT COUNT(*) AS total FROM users u ${where}`,
    params
  );

  const usageParams: any[] = [];
  const usageClause = windowWhere("created_at", window, usageParams);
  const rows = await db.queryMany<any>(
    `SELECT u.id, u.nickname, u.email, u.username, u.phone, u.parent_user_id,
            u.status, u.balance, u.credit_balance, u.created_at,
            COALESCE(a.total_requests, 0)::int AS total_requests,
            COALESCE(a.total_tokens, 0) AS total_tokens,
            COALESCE(a.total_cost, 0) AS total_cost,
            a.success_requests,
            a.last_active_at
       FROM users u
       LEFT JOIN (
         SELECT user_id,
                COUNT(*)::int AS total_requests,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(cost), 0) AS total_cost,
                COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0)::int AS success_requests,
                MAX(created_at) AS last_active_at
           FROM usage_logs
          WHERE ${usageClause}
          GROUP BY user_id
       ) a ON a.user_id = u.id
       ${where}
      ORDER BY a.last_active_at DESC NULLS LAST, u.created_at DESC
      LIMIT ? OFFSET ?`,
    [...usageParams, ...params, input.pageSize, input.offset]
  );
  const total = Number(count?.total || 0);
  return {
    items: rows.map((row) => {
      const requests = numberOrZero(row.total_requests);
      return {
        id: row.id,
        nickname: row.nickname,
        email: row.email || null,
        username: row.username || null,
        phone: row.phone || null,
        accountType: row.parent_user_id ? "sub" : "main",
        status: row.status || "active",
        balance: row.parent_user_id ? null : money(row.balance),
        creditBalance: row.parent_user_id ? null : money(row.credit_balance),
        availableBalance: row.parent_user_id ? null : money(numberOrZero(row.balance) + numberOrZero(row.credit_balance)),
        parentUserId: row.parent_user_id || null,
        createdAt: row.created_at,
        totalRequests: requests,
        totalTokens: numberOrZero(row.total_tokens),
        totalCost: money(row.total_cost),
        successRate: ratio(numberOrZero(row.success_requests), requests),
        lastActiveAt: row.last_active_at || null,
      };
    }),
    pagination: pagination(input.page, input.pageSize, total),
    truth: truth(window, ["users", "usage_logs"]),
  };
}

export async function getAdminCustomerControlPlane(userId: string, window: AdminWindow) {
  const customer = await db.queryOne<any>(
    `SELECT id, nickname, email, username, phone, parent_user_id, status,
            balance, credit_balance, created_at
       FROM users
      WHERE id = ?`,
    [userId]
  );
  if (!customer) return null;
  const usageParams: any[] = [userId];
  const usageClause = windowWhere("created_at", window, usageParams);
  const [usage, byModel, transactions, limits, discounts, recentRequests] = await Promise.all([
    db.queryOne<any>(
      `SELECT COUNT(*)::int AS total_requests,
              COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(cost), 0) AS total_cost,
              AVG(latency_ms) AS avg_latency,
              COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0)::int AS successes,
              MAX(created_at) AS last_active_at
         FROM usage_logs
        WHERE user_id = ? AND ${usageClause}`,
      usageParams
    ),
    db.queryMany<any>(
      `SELECT model, COUNT(*)::int AS requests,
              COALESCE(SUM(total_tokens), 0) AS tokens,
              COALESCE(SUM(cost), 0) AS cost
         FROM usage_logs
        WHERE user_id = ? AND ${usageClause}
        GROUP BY model
        ORDER BY requests DESC, tokens DESC`,
      usageParams
    ),
    db.queryMany<any>(
      `SELECT t.id, t.type, t.amount, t.balance_after, t.credit_after,
              t.description, t.created_at,
              COALESCE(a.username, a.nickname, a.email) AS actor
         FROM transactions t
         LEFT JOIN users a ON a.id = t.actor_user_id
        WHERE t.user_id = ? OR t.actor_user_id = ?
        ORDER BY t.created_at DESC
        LIMIT 100`,
      [userId, userId]
    ),
    db.queryMany<any>(
      `SELECT id, model, qpm, tpm, source
         FROM user_rate_limits
        WHERE user_id = ?
        ORDER BY model`,
      [userId]
    ),
    db.queryMany<any>(
      `SELECT id, model_id, discount_rate, is_enabled, notes
         FROM user_model_discounts
        WHERE user_id = ?
        ORDER BY updated_at DESC`,
      [customer.parent_user_id || userId]
    ),
    db.queryMany<any>(
      `SELECT id, log_id, user_id, model, provider_id, status,
              prompt_tokens, completion_tokens, total_tokens, cached_tokens,
              cost, latency_ms, created_at
         FROM usage_logs
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 30`,
      [userId]
    ),
  ]);
  const totalRequests = numberOrZero(usage?.total_requests);
  const totalByModel = byModel.reduce((sum, row) => sum + numberOrZero(row.requests), 0);
  return {
    customer: {
      id: customer.id,
      nickname: customer.nickname,
      email: customer.email || null,
      username: customer.username || null,
      phone: customer.phone || null,
      accountType: customer.parent_user_id ? "sub" : "main",
      status: customer.status || "active",
      balance: customer.parent_user_id ? null : money(customer.balance),
      creditBalance: customer.parent_user_id ? null : money(customer.credit_balance),
      availableBalance: customer.parent_user_id
        ? null
        : money(numberOrZero(customer.balance) + numberOrZero(customer.credit_balance)),
      parentUserId: customer.parent_user_id || null,
      createdAt: customer.created_at,
      totalRequests,
      totalTokens: numberOrZero(usage?.total_tokens),
      totalCost: money(usage?.total_cost),
      successRate: ratio(numberOrZero(usage?.successes), totalRequests),
      lastActiveAt: usage?.last_active_at || null,
    },
    usage: {
      totalRequests,
      totalTokens: numberOrZero(usage?.total_tokens),
      totalCost: money(usage?.total_cost),
      avgLatency: numberOrNull(usage?.avg_latency),
      successRate: ratio(numberOrZero(usage?.successes), totalRequests),
    },
    byModel: byModel.map((row) => ({
      model: row.model,
      requests: numberOrZero(row.requests),
      tokens: numberOrZero(row.tokens),
      cost: money(row.cost),
      percentage: ratio(numberOrZero(row.requests), totalByModel),
    })),
    transactions: transactions.map((row) => ({
      id: row.id,
      type: row.type,
      amount: numberOrNull(row.amount),
      balanceAfter: numberOrNull(row.balance_after),
      creditAfter: numberOrNull(row.credit_after),
      description: row.description,
      actor: row.actor || null,
      createdAt: row.created_at,
    })),
    limits: limits.map((row) => ({
      id: row.id,
      model: row.model,
      qpm: numberOrNull(row.qpm),
      tpm: numberOrNull(row.tpm),
      source: row.source || null,
    })),
    discounts: discounts.map((row) => ({
      id: row.id,
      modelId: row.model_id,
      discountRate: numberOrNull(row.discount_rate),
      enabled: !!row.is_enabled,
      notes: row.notes || null,
    })),
    recentRequests: recentRequests.map(mapTrafficRow),
    truth: truth(window, ["users", "usage_logs", "transactions", "user_rate_limits", "user_model_discounts"]),
  };
}

export async function getAdminFinanceOverview(
  window: AdminWindow,
  input: PageInput & { q?: string }
) {
  const ledgerParams: any[] = [];
  const ledgerClause = windowWhere("created_at", window, ledgerParams);
  const joinedLedgerClause = ledgerClause.replace(/\bcreated_at\b/g, "t.created_at");
  const q = (input.q || "").trim().toLowerCase();
  const searchConditions = q
    ? "AND (LOWER(t.id) LIKE ? OR LOWER(t.description) LIKE ? OR LOWER(COALESCE(u.email, '')) LIKE ? OR LOWER(u.nickname) LIKE ?)"
    : "";
  const searchParams = q ? Array(4).fill(`%${q}%`) : [];
  const [balances, ledger, costCoverage, reservations, count, rows, daily] = await Promise.all([
    db.queryOne<any>(
      `SELECT COALESCE(SUM(balance), 0) AS balance,
              COALESCE(SUM(credit_balance), 0) AS credit
         FROM users
        WHERE parent_user_id IS NULL AND status <> 'deleted'`
    ),
    db.queryOne<any>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'recharge' THEN amount ELSE 0 END), 0) AS recharge,
              COALESCE(SUM(CASE WHEN type = 'consumption' THEN amount ELSE 0 END), 0) AS consumption
         FROM transactions
        WHERE ${ledgerClause}`,
      ledgerParams
    ),
    db.queryOne<any>(
      `SELECT COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0)::int AS eligible,
              COALESCE(SUM(CASE WHEN status = 'success' AND estimated IS NOT TRUE AND provider_cost IS NOT NULL THEN 1 ELSE 0 END), 0)::int AS known,
              COALESCE(SUM(CASE WHEN status = 'success' AND estimated IS NOT TRUE THEN provider_cost ELSE 0 END), 0) AS provider_cost
         FROM usage_logs
        WHERE ${windowWhere("created_at", window, [])}`,
      window.start ? [window.start, window.end] : [window.end]
    ),
    db.queryOne<any>(
      `SELECT COALESCE(SUM(reserved_amount), 0) AS reserved
         FROM billing_reservations
        WHERE status = 'active' AND expires_at > NOW()`
    ),
    db.queryOne<{ total: string | number }>(
      `SELECT COUNT(*) AS total
         FROM transactions t
         JOIN users u ON u.id = t.user_id
        WHERE ${joinedLedgerClause} ${searchConditions}`,
      [...ledgerParams, ...searchParams]
    ),
    db.queryMany<any>(
      `SELECT t.id, t.user_id, u.email AS user_email, u.nickname AS user_nickname,
              t.type, t.amount, t.balance_after, t.credit_after,
              t.description, t.created_at,
              COALESCE(a.username, a.nickname, a.email) AS actor
         FROM transactions t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN users a ON a.id = t.actor_user_id
        WHERE ${joinedLedgerClause} ${searchConditions}
        ORDER BY t.created_at DESC
        LIMIT ? OFFSET ?`,
      [...ledgerParams, ...searchParams, input.pageSize, input.offset]
    ),
    db.queryMany<any>(
      `SELECT to_char(timezone('Asia/Shanghai', created_at), 'YYYY-MM-DD') AS date,
              COALESCE(SUM(CASE WHEN type = 'recharge' THEN amount ELSE 0 END), 0) AS recharge,
              COALESCE(SUM(CASE WHEN type = 'consumption' THEN amount ELSE 0 END), 0) AS consumption
         FROM transactions
        WHERE ${ledgerClause}
        GROUP BY date
        ORDER BY date`,
      ledgerParams
    ),
  ]);
  const eligible = numberOrZero(costCoverage?.eligible);
  const known = numberOrZero(costCoverage?.known);
  const coverageRatio = eligible === 0 ? 1 : known / eligible;
  const upstreamCost = coverageRatio === 1 ? money(costCoverage?.provider_cost) : null;
  const consumption = money(ledger?.consumption);
  const grossProfit = upstreamCost === null ? null : money(consumption - upstreamCost);
  const grossMargin = grossProfit === null || consumption <= 0 ? null : ratio(grossProfit, consumption);
  const balance = money(balances?.balance);
  const credit = money(balances?.credit);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      balance,
      creditBalance: credit,
      availableBalance: money(balance + credit),
      totalRecharge: money(ledger?.recharge),
      totalConsumption: consumption,
      upstreamCost,
      grossProfit,
      grossMargin,
      unsettledReservations: money(reservations?.reserved),
      receivables: null,
    },
    timeSeries: daily.map((row) => ({
      date: row.date,
      recharge: money(row.recharge),
      consumption: money(row.consumption),
      upstreamCost: null,
      grossProfit: null,
    })),
    customers: [],
    transactions: {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userEmail: row.user_email || null,
        userNickname: row.user_nickname || null,
        type: row.type,
        amount: numberOrNull(row.amount),
        balanceAfter: numberOrNull(row.balance_after),
        creditAfter: numberOrNull(row.credit_after),
        description: row.description,
        actor: row.actor || null,
        createdAt: row.created_at,
      })),
      pagination: pagination(input.page, input.pageSize, Number(count?.total || 0)),
    },
    truth: truth(window, ["users", "transactions", "billing_reservations", "usage_logs.provider_cost"], {
      upstreamCost: { known, eligible, ratio: coverageRatio, excludesEstimatedUsage: true },
      receivables: { known: false, reason: "No receivables ledger exists" },
      dailyCost: { known: false, reason: "No complete daily provider-cost attribution" },
    }),
  };
}

function mapTrafficRow(row: any) {
  return {
    id: String(row.id),
    requestId: row.log_id || null,
    userId: row.user_id,
    userEmail: row.user_email || null,
    userNickname: row.user_nickname || null,
    apiKeyId: row.api_key_id || null,
    apiKeyName: row.api_key_name || null,
    model: row.model,
    provider: row.provider_id || null,
    channelId: row.channel_id || null,
    protocol: row.protocol || null,
    nodeId: row.node_id || null,
    status: row.status,
    httpStatus: numberOrNull(row.http_status),
    errorCode: row.error_code || null,
    estimated: row.estimated === null || row.estimated === undefined ? null : !!row.estimated,
    promptTokens: numberOrNull(row.prompt_tokens),
    completionTokens: numberOrNull(row.completion_tokens),
    totalTokens: numberOrNull(row.total_tokens),
    cachedTokens: numberOrNull(row.cached_tokens),
    cost: numberOrNull(row.cost),
    providerCost: numberOrNull(row.provider_cost),
    costVersionId: row.cost_version_id || null,
    reservationId: row.reservation_id || null,
    transactionId: row.transaction_id || null,
    latencyMs: numberOrNull(row.latency_ms),
    createdAt: row.created_at,
  };
}

export async function listAdminTraffic(
  window: AdminWindow,
  input: PageInput & { q?: string; status?: string; provider?: string; model?: string; userId?: string }
) {
  const conditions: string[] = [];
  const params: any[] = [];
  conditions.push(windowWhere("ul.created_at", window, params));
  if (input.status) { conditions.push("ul.status = ?"); params.push(input.status); }
  if (input.provider) { conditions.push("ul.provider_id = ?"); params.push(input.provider); }
  if (input.model) { conditions.push("ul.model = ?"); params.push(input.model); }
  if (input.userId) { conditions.push("ul.user_id = ?"); params.push(input.userId); }
  if (input.q) {
    const like = `%${input.q.trim().toLowerCase()}%`;
    conditions.push(
      "(LOWER(COALESCE(ul.log_id, '')) LIKE ? OR LOWER(COALESCE(u.email, '')) LIKE ? OR LOWER(COALESCE(u.nickname, '')) LIKE ? OR LOWER(ul.model) LIKE ?)"
    );
    params.push(like, like, like, like);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const [count, rows] = await Promise.all([
    db.queryOne<{ total: string | number }>(
      `SELECT COUNT(*) AS total
         FROM usage_logs ul
         LEFT JOIN users u ON u.id = ul.user_id
         ${where}`,
      params
    ),
    db.queryMany<any>(
      `SELECT ul.*, u.email AS user_email, u.nickname AS user_nickname,
              ak.name AS api_key_name
         FROM usage_logs ul
         LEFT JOIN users u ON u.id = ul.user_id
         LEFT JOIN api_keys ak ON ak.id = ul.api_key_id
         ${where}
        ORDER BY ul.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, input.pageSize, input.offset]
    ),
  ]);
  return {
    items: rows.map(mapTrafficRow),
    pagination: pagination(input.page, input.pageSize, Number(count?.total || 0)),
    truth: truth(window, ["usage_logs", "users", "api_keys"], {
      structuralFields: "Historical fields remain null unless captured at request time.",
      payloads: "Request and response bodies are intentionally excluded.",
    }),
  };
}

export async function getAdminTrafficDetail(identifier: string) {
  const row = await db.queryOne<any>(
    `SELECT ul.*, u.email AS user_email, u.nickname AS user_nickname,
            ak.name AS api_key_name
       FROM usage_logs ul
       LEFT JOIN users u ON u.id = ul.user_id
       LEFT JOIN api_keys ak ON ak.id = ul.api_key_id
      WHERE ul.log_id = ? OR CAST(ul.id AS TEXT) = ?
      ORDER BY ul.created_at DESC
      LIMIT 1`,
    [identifier, identifier]
  );
  if (!row) return null;
  return {
    request: null,
    response: null,
    user_email: row.user_email || null,
    user_nickname: row.user_nickname || null,
    structural: mapTrafficRow(row),
    note: "Raw prompts and responses are not stored in the control-plane database.",
    truth: {
      sources: ["usage_logs", "users", "api_keys"],
      contentPayloads: "not persisted/exposed",
    },
  };
}

export async function listAdminAuditEvents(
  input: PageInput & { actorId?: string; action?: string; outcome?: string; resourceType?: string }
) {
  const conditions: string[] = [];
  const params: any[] = [];
  if (input.actorId) { conditions.push("actor_user_id = ?"); params.push(input.actorId); }
  if (input.action) { conditions.push("action = ?"); params.push(input.action); }
  if (input.outcome) { conditions.push("outcome = ?"); params.push(input.outcome); }
  if (input.resourceType) { conditions.push("resource_type = ?"); params.push(input.resourceType); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [count, rows, pendingIntents] = await Promise.all([
    db.queryOne<{ total: string | number }>(`SELECT COUNT(*) AS total FROM admin_audit_events ${where}`, params),
    db.queryMany<any>(
      `SELECT *
         FROM admin_audit_events
         ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, input.pageSize, input.offset]
    ),
    db.queryMany<any>(
      `SELECT id, actor_user_id, actor_role, actor_email, request_id, action,
              resource_type, resource_id, status, reason, ip_address,
              user_agent, method, path, response_status, metadata,
              created_at, updated_at
         FROM admin_audit_intents
        WHERE status = 'pending'
        ORDER BY created_at DESC
        LIMIT 100`
    ),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      actorId: row.actor_user_id,
      actorEmail: row.actor_email,
      actorRole: row.actor_role,
      requestId: row.request_id,
      outcome: row.outcome,
      reason: row.reason || null,
      ipAddress: row.ip_address || null,
      userAgent: row.user_agent || null,
      before: row.before_data,
      after: row.after_data,
      metadata: row.metadata,
      createdAt: row.created_at,
    })),
    pagination: pagination(input.page, input.pageSize, Number(count?.total || 0)),
    pendingIntents: pendingIntents.map((row) => ({
      id: row.id,
      actorId: row.actor_user_id,
      actorEmail: row.actor_email,
      actorRole: row.actor_role,
      requestId: row.request_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      status: row.status,
      reason: row.reason || null,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      method: row.method,
      path: row.path,
      responseStatus: row.response_status,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    truth: {
      sources: ["admin_audit_events", "admin_audit_intents"],
      redaction: "Recursive sensitive-key redaction is applied before persistence.",
      pending: "A pending intent means mutation completion is unknown and requires review.",
    },
  };
}

export async function getAdminReleases() {
  const [events, nodes, incidents] = await Promise.all([
    db.queryMany<any>(
      `SELECT *
         FROM deployment_events
        ORDER BY created_at DESC
        LIMIT 200`
    ),
    db.queryMany<any>(
      `SELECT *
         FROM runtime_nodes
        ORDER BY last_seen_at DESC`
    ),
    db.queryMany<any>(
      `SELECT i.*, COALESCE(ec.event_count, 0)::int AS event_count
         FROM incidents i
         LEFT JOIN (
           SELECT incident_id, COUNT(*)::int AS event_count
             FROM incident_events
            GROUP BY incident_id
         ) ec ON ec.incident_id = i.id
        ORDER BY i.started_at DESC
        LIMIT 100`
    ),
  ]);
  const byRelease = new Map<string, any[]>();
  for (const event of events) {
    const list = byRelease.get(event.release_id) || [];
    list.push(event);
    byRelease.set(event.release_id, list);
  }
  const releases = [...byRelease.entries()].map(([releaseId, releaseEvents]) => {
    const sorted = [...releaseEvents].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return {
      id: releaseId,
      sha: last.sha || first.sha || null,
      status: last.event_type,
      environment: last.environment,
      actor: last.actor_user_id || null,
      startedAt: first.created_at,
      completedAt: ["succeeded", "failed", "rolled_back"].includes(last.event_type) ? last.created_at : null,
      notes: last.message || null,
      events: sorted,
      nodes: nodes
        .filter((node) => !last.sha || node.backend_sha === last.sha)
        .map((node) => ({
          id: node.node_id,
          status: node.status,
          sha: node.backend_sha,
          buildId: node.frontend_build_id,
          health: node.postgres_status && node.redis_status
            ? `${node.postgres_status}/${node.redis_status}`
            : null,
        })),
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    releases,
    nodes,
    incidents,
    truth: {
      sources: ["deployment_events", "runtime_nodes", "incidents", "incident_events"],
      releaseCoverage: releases.length ? "recorded events only" : "unknown: no deployment events recorded",
      nodeCoverage: nodes.length ? "reporting nodes only" : "unknown: no runtime nodes reporting",
    },
  };
}

export async function getAdminAccessOverview() {
  const assignments = await listAdminRoleAssignments();
  const byUser = new Map<string, typeof assignments>();
  for (const assignment of assignments.filter((item) => item.is_active)) {
    const list = byUser.get(assignment.user_id) || [];
    list.push(assignment);
    byUser.set(assignment.user_id, list);
  }
  return {
    items: [...byUser.entries()].map(([userId, rows]) => {
      const role = rows.some((item) => item.role === "admin") ? "admin" : rows[0]?.role || "viewer";
      const permissions = [...new Set(rows.flatMap((item) => ROLE_PERMISSIONS[item.role]))];
      return {
        id: userId,
        email: rows[0]?.email || "",
        nickname: rows[0]?.nickname || null,
        role,
        roles: rows.map((item) => item.role),
        permissions: ALL_ADMIN_PERMISSIONS.filter((permission) => permissions.includes(permission)),
        status: "active",
        mfaEnabled: null,
        lastLoginAt: null,
        assignments: rows,
      };
    }),
    roles: Object.entries(ROLE_PERMISSIONS)
      .filter(([id]) => id !== "super_admin")
      .map(([id, permissions]) => ({ id, name: id, permissions })),
    assignments,
    truth: {
      sources: ["admin_role_assignments", "users"],
      bootstrapPrincipals: "Environment bootstrap super-admins are intentionally not enumerated.",
      mfa: "unknown: no MFA state is stored",
      lastLogin: "unknown: sessions do not persist login history",
    },
  };
}
