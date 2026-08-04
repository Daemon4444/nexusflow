#!/usr/bin/env node
"use strict";

const { createRequire } = require("node:module");

const packageJson = process.env.NEXUSFLOW_NODE_PACKAGE_JSON
  || "/root/distiny/nexusflow/package.json";
const requireFromApp = createRequire(packageJson);
const { Client } = requireFromApp("pg");

const startedAt = process.argv[2];
if (!startedAt || Number.isNaN(Date.parse(startedAt))) {
  console.error("invalid or missing gray start timestamp");
  process.exit(2);
}

const client = new Client({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  await client.connect();
  const result = await client.query(
    `WITH ack_usage AS (
       SELECT *
         FROM usage_logs
        WHERE created_at >= $1::timestamptz
          AND node_id LIKE 'nexusflow-api-%'
     ), ack_summary AS (
       SELECT
         COUNT(*)::int AS requests,
         COUNT(*) FILTER (
           WHERE http_status >= 500
              OR (status = 'error' AND http_status IS NULL)
         )::int AS platform_errors,
         COUNT(*) FILTER (WHERE estimated IS TRUE)::int AS estimated_responses,
         COUNT(*) FILTER (
           WHERE status = 'success'
             AND total_tokens > 0
             AND (
               provider_cost IS NULL
               OR provider_cost_resolution IS NULL
               OR provider_cost_resolution IN ('unknown', 'lookup_error')
             )
         )::int AS unknown_costs,
         COUNT(*) FILTER (
           WHERE reservation_id IS NOT NULL
             AND (reservation_status IS NULL OR reservation_status = 'active')
         )::int AS unclosed_reservations,
         COUNT(*) FILTER (
           WHERE status = 'success'
             AND cost > 0
             AND (
               reservation_status IS DISTINCT FROM 'settled'
               OR transaction_count <> 1
               OR ABS(COALESCE(actual_amount, -1) - cost) > 0.000001
             )
         )::int AS billing_mismatches
       FROM (
         SELECT u.*,
                r.status AS reservation_status,
                r.actual_amount,
                (SELECT COUNT(*)::int
                   FROM transactions t
                  WHERE t.type = 'consumption'
                    AND t.ref_id = 'reservation:' || u.reservation_id
                ) AS transaction_count
           FROM ack_usage u
           LEFT JOIN billing_reservations r ON r.id = u.reservation_id
       ) checked
     ), latency_regressions AS (
       SELECT COUNT(*)::int AS count
         FROM (
           SELECT ack.model,
                  ack.samples AS ack_samples,
                  ecs.samples AS ecs_samples,
                  ack.p95 AS ack_p95,
                  ecs.p95 AS ecs_p95
             FROM (
               SELECT model, COUNT(*)::int AS samples,
                      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
                 FROM usage_logs
                WHERE created_at >= $1::timestamptz
                  AND node_id LIKE 'nexusflow-api-%'
                  AND status = 'success'
                GROUP BY model
             ) ack
             JOIN (
               SELECT model, COUNT(*)::int AS samples,
                      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
                 FROM usage_logs
                WHERE created_at >= $1::timestamptz
                  AND node_id IS NULL
                  AND status = 'success'
                GROUP BY model
             ) ecs USING (model)
            WHERE ack.samples >= 5
              AND ecs.samples >= 5
              AND ack.p95 > ecs.p95 * 1.5
              AND ack.p95 - ecs.p95 > 1000
         ) regressions
     )
     SELECT ack_summary.*, latency_regressions.count AS latency_regressions
       FROM ack_summary CROSS JOIN latency_regressions`,
    [startedAt]
  );

  const summary = result.rows[0];
  const violations = Object.entries(summary)
    .filter(([key, value]) => key !== "requests" && Number(value) > 0)
    .map(([key, value]) => `${key}=${value}`);
  console.log(JSON.stringify(summary));
  if (violations.length > 0) {
    console.error(`ACK gray database gate failed: ${violations.join(" ")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`ACK gray database gate unavailable: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => undefined));
