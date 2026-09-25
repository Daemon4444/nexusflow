import { db } from "../db/client";

// PG server TZ is Asia/Shanghai. Use ::text to avoid JS Date UTC offset issues.
const SHANGHAI_TODAY = "(NOW() AT TIME ZONE 'Asia/Shanghai')::date";
const SHANGHAI_NOW = "NOW() AT TIME ZONE 'Asia/Shanghai'";

/**
 * Hourly request/success/error/cost stats for the last N hours.
 * Uses generate_series with hourly intervals.
 */
export async function getDashboardHourlyStats(hours: number) {
  const rows = await db.queryMany<any>(
    `SELECT
       to_char(d.ts, 'YYYY-MM-DD HH24:00') as bucket,
       to_char(d.ts, 'HH24:00') as label,
       COALESCE(COUNT(ul.id), 0)::int as requests,
       COALESCE(COUNT(ul.id) FILTER (WHERE ul.status = 'success'), 0)::int as success,
       COALESCE(COUNT(ul.id) FILTER (WHERE ul.status = 'error'), 0)::int as errors,
       ROUND(COALESCE(SUM(ul.cost), 0)::numeric, 2)::float as cost
     FROM generate_series(
       date_trunc('hour', ${SHANGHAI_NOW}) - (? - 1) * INTERVAL '1 hour',
       date_trunc('hour', ${SHANGHAI_NOW}),
       '1 hour'
     ) d(ts)
     LEFT JOIN usage_logs ul
       ON ul.created_at >= d.ts AT TIME ZONE 'Asia/Shanghai'
       AND ul.created_at < (d.ts + INTERVAL '1 hour') AT TIME ZONE 'Asia/Shanghai'
     GROUP BY d.ts
     ORDER BY d.ts`,
    [hours]
  );
  return rows.map((r: any) => {
    const requests = Number(r.requests);
    const success = Number(r.success);
    return {
      date: String(r.bucket),
      label: String(r.label),
      requests,
      success,
      errors: Number(r.errors),
      cost: Number(r.cost),
      successRate: requests > 0 ? Math.round((success / requests) * 1000) / 10 : 0,
    };
  });
}

/**
 * Daily request/success/error/cost stats for the last N days.
 * Uses generate_series to guarantee one row per day (no gaps).
 */
export async function getDashboardDailyStats(days: number) {
  const rows = await db.queryMany<any>(
    `SELECT
       to_char(d.date, 'YYYY-MM-DD') as date,
       to_char(d.date, 'MM-DD') as label,
       COALESCE(COUNT(ul.id), 0)::int as requests,
       COALESCE(COUNT(ul.id) FILTER (WHERE ul.status = 'success'), 0)::int as success,
       COALESCE(COUNT(ul.id) FILTER (WHERE ul.status = 'error'), 0)::int as errors,
       ROUND(COALESCE(SUM(ul.cost), 0)::numeric, 2)::float as cost
     FROM generate_series(
       ${SHANGHAI_TODAY} - (? - 1) * INTERVAL '1 day',
       ${SHANGHAI_TODAY},
       '1 day'
     ) d(date)
     LEFT JOIN usage_logs ul
       ON ul.created_at >= d.date AT TIME ZONE 'Asia/Shanghai'
       AND ul.created_at < (d.date + INTERVAL '1 day') AT TIME ZONE 'Asia/Shanghai'
     GROUP BY d.date
     ORDER BY d.date`,
    [days]
  );
  return rows.map((r: any) => {
    const requests = Number(r.requests);
    const success = Number(r.success);
    return {
      date: String(r.date),
      label: String(r.label),
      requests,
      success,
      errors: Number(r.errors),
      cost: Number(r.cost),
      successRate: requests > 0 ? Math.round((success / requests) * 1000) / 10 : 0,
    };
  });
}

/**
 * Cumulative user count per day for the last N days.
 */
export async function getUserGrowth(days: number) {
  const before = await db.queryOne<any>(
    `SELECT COUNT(*)::int as cnt FROM users
     WHERE created_at < (${SHANGHAI_TODAY} - (? - 1) * INTERVAL '1 day') AT TIME ZONE 'Asia/Shanghai'`,
    [days]
  );
  const baseCount = Number(before?.cnt || 0);

  const rows = await db.queryMany<any>(
    `SELECT
       to_char(d.date, 'YYYY-MM-DD') as date,
       COALESCE(COUNT(u.id), 0)::int as new_users
     FROM generate_series(
       ${SHANGHAI_TODAY} - (? - 1) * INTERVAL '1 day',
       ${SHANGHAI_TODAY},
       '1 day'
     ) d(date)
     LEFT JOIN users u
       ON u.created_at >= d.date AT TIME ZONE 'Asia/Shanghai'
       AND u.created_at < (d.date + INTERVAL '1 day') AT TIME ZONE 'Asia/Shanghai'
     GROUP BY d.date
     ORDER BY d.date`,
    [days]
  );

  let cumulative = baseCount;
  return rows.map((r: any) => {
    cumulative += Number(r.new_users);
    return {
      date: String(r.date),
      newUsers: Number(r.new_users),
      totalUsers: cumulative,
    };
  });
}

/**
 * DAU / WAU / MAU / total user counts.
 */
export async function getActiveUserCounts() {
  const row = await db.queryOne<any>(
    `SELECT
       (SELECT COUNT(DISTINCT user_id)::int FROM usage_logs WHERE created_at >= NOW() - INTERVAL '24 hours') as dau,
       (SELECT COUNT(DISTINCT user_id)::int FROM usage_logs WHERE created_at >= NOW() - INTERVAL '7 days') as wau,
       (SELECT COUNT(DISTINCT user_id)::int FROM usage_logs WHERE created_at >= NOW() - INTERVAL '30 days') as mau,
       (SELECT COUNT(*)::int FROM users) as "totalUsers"`
  );
  return {
    dau: Number(row?.dau || 0),
    wau: Number(row?.wau || 0),
    mau: Number(row?.mau || 0),
    totalUsers: Number(row?.totalUsers || 0),
  };
}

/**
 * Top users by cost in the last N days.
 */
export async function getTopUsersByUsage(limit: number, days: number) {
  const rows = await db.queryMany<any>(
    `SELECT
       ul.user_id,
       u.email as user_email,
       u.nickname as user_nickname,
       COUNT(*)::int as requests,
       COALESCE(SUM(ul.total_tokens), 0)::int as tokens,
       ROUND(COALESCE(SUM(ul.cost), 0)::numeric, 2)::float as cost,
       ROUND(
         (SUM(CASE WHEN ul.status = 'success' THEN 1 ELSE 0 END)::numeric / GREATEST(COUNT(*), 1)) * 100, 1
       )::float as "successRate"
     FROM usage_logs ul
     LEFT JOIN users u ON ul.user_id = u.id
     WHERE ul.created_at >= NOW() - (? * INTERVAL '1 day')
       AND ul.user_id IS NOT NULL
     GROUP BY ul.user_id, u.email, u.nickname
     ORDER BY cost DESC
     LIMIT ?`,
    [days, limit]
  );
  return rows.map((r: any) => ({
    userId: r.user_id,
    email: r.user_email || "",
    nickname: r.user_nickname || "",
    requests: Number(r.requests),
    tokens: Number(r.tokens),
    cost: Number(r.cost),
    successRate: Number(r.successRate),
  }));
}

/**
 * Revenue overview: daily recharge + consumption from transactions, plus all-time totals.
 */
export async function getRevenueOverview(days: number) {
  const daily = await db.queryMany<any>(
    `SELECT
       to_char(d.date, 'YYYY-MM-DD') as date,
       COALESCE(SUM(CASE WHEN t.type = 'recharge' THEN t.amount ELSE 0 END), 0)::float as recharge,
       COALESCE(SUM(CASE WHEN t.type = 'consumption' THEN t.amount ELSE 0 END), 0)::float as consumption
     FROM generate_series(
       ${SHANGHAI_TODAY} - (? - 1) * INTERVAL '1 day',
       ${SHANGHAI_TODAY},
       '1 day'
     ) d(date)
     LEFT JOIN transactions t
       ON t.created_at >= d.date AT TIME ZONE 'Asia/Shanghai'
       AND t.created_at < (d.date + INTERVAL '1 day') AT TIME ZONE 'Asia/Shanghai'
     GROUP BY d.date
     ORDER BY d.date`,
    [days]
  );

  const totals = await db.queryOne<any>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'recharge' THEN amount ELSE 0 END), 0)::float as "totalRecharge",
       COALESCE(SUM(CASE WHEN type = 'consumption' THEN amount ELSE 0 END), 0)::float as "totalConsumption"
     FROM transactions`
  );

  return {
    daily: daily.map((r: any) => ({
      date: String(r.date),
      recharge: Number(r.recharge),
      consumption: Math.abs(Number(r.consumption)),
    })),
    totalRecharge: Number(totals?.totalRecharge || 0),
    totalConsumption: Math.abs(Number(totals?.totalConsumption || 0)),
  };
}

/**
 * Model distribution: top 10 models by request count in the last 7 days.
 */
export async function getModelDistribution() {
  const rows = await db.queryMany<any>(
    `SELECT
       model,
       COUNT(*)::int as requests,
       COALESCE(SUM(total_tokens), 0)::double precision as tokens,
       ROUND(COALESCE(SUM(cost), 0)::numeric, 2)::float as cost
     FROM usage_logs
     WHERE created_at >= NOW() - INTERVAL '7 days'
     GROUP BY model
     ORDER BY requests DESC
     LIMIT 10`
  );

  const totalRequests = rows.reduce((s: number, r: any) => s + Number(r.requests), 0) || 1;
  const totalCost = rows.reduce((s: number, r: any) => s + Number(r.cost), 0) || 1;

  return rows.map((r: any) => ({
    model: r.model,
    requests: Number(r.requests),
    tokens: Number(r.tokens),
    cost: Number(r.cost),
    requestPct: Math.round((Number(r.requests) / totalRequests) * 1000) / 10,
    costPct: Math.round((Number(r.cost) / totalCost) * 1000) / 10,
  }));
}
