import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import { db, closeDb } from "../src/db/client";
import { getOverview, getDaily, getByModel, getRecent, logUsage } from "../src/data/usage";
import { hashSessionToken } from "../src/data/session-token-security";
import { fillUsageDays, parseUsageDate, shanghaiDate } from "../src/utils/usage-dates";
import usageRouter from "../src/routes/usage";

async function main() {
  assert.equal(process.env.NODE_ENV, "test");
  assert.match(process.env.PG_DATABASE || "", /test/);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(process.env.PG_HOST || "127.0.0.1"), "requires an isolated local PostgreSQL");
  assert.notEqual(process.env.USE_PG_MEM, "true");
  const user = `usage-qa-${randomUUID()}`;
  const other = `${user}-other`;
  const token = randomUUID();
  const today = shanghaiDate(new Date());
  const start = new Date(`${today}T00:00:00+08:00`);
  const yesterday = new Date(start.getTime() - 1).toISOString();
  const sls = require("../src/services/sls") as { getSlsClient: () => any; logToSLS: (fields: Record<string, any>) => void };
  const originalClient = sls.getSlsClient;
  let server: Server | undefined;
  try {
    for (const id of [user, other]) await db.execute(
      "INSERT INTO users (id,email,nickname) VALUES (?,?,?)", [id, `${id}@example.test`, "Usage test"]);
    await db.execute("INSERT INTO sessions (id,user_id,token,token_hash,expires_at) VALUES (?,?,?,?,?)",
      [user, user, `stored-${user}`, hashSessionToken(token), new Date(Date.now() + 3600000).toISOString()]);
    for (let i = 0; i < 12; i++) await db.execute(
      "INSERT INTO usage_logs (user_id,log_id,model,total_tokens,cost,status,created_at) VALUES (?,?,?,?,?,?,?)",
      [user, `${user}-${i}`, `qa-model-${i}`, 100, i < 10 ? 0.123456 : 0, i === 11 ? "error" : "success", yesterday]);
    await db.execute("INSERT INTO usage_logs (user_id,log_id,model,total_tokens,cost,created_at) VALUES (?,?,?,?,?,?)",
      [other, `${other}-log`, "other-model", 99999, 99, start.toISOString()]);
    const overview = await getOverview(user);
    assert.equal(overview.totalRequests, 12, "include free and failed requests");
    assert.equal(overview.successRate, 91.7, "same denominator as total requests");
    assert.equal(overview.totalTokens, 1200);
    const models = await getByModel(user);
    assert.equal(models.length, 12, "retain models beyond top ten");
    assert.equal(models.reduce((n, r) => n + r.requests, 0), overview.totalRequests);
    assert.ok(Math.abs(models.reduce((n, r) => n + r.cost, 0) - overview.totalCost) < 0.000001);
    assert.equal(models[0].model, "qa-model-0", "ties have deterministic order");
    const daily = await getDaily(user);
    assert.equal(daily.length, 7);
    assert.equal(daily[6].fullDate, today);
    assert.equal(daily[6].requests, 0, "no requests today must not show yesterday");
    assert.equal(daily[5].requests, 12, "Shanghai midnight boundary");
    assert.equal(daily[5].cost, 1.23456);
    // An interrupted request can have delivered billable output. Status must
    // affect success rate, but must not erase its recorded usage or paid cost.
    await db.execute("UPDATE usage_logs SET cost = ?, total_tokens = ?, prompt_tokens = ?, cached_tokens = ? WHERE log_id = ?",
      [0.03, 150, 125, 50, `${user}-11`]);
    const interruptedOverview = await getOverview(user);
    assert.equal(interruptedOverview.totalRequests, 12);
    assert.equal(interruptedOverview.successRate, 91.7);
    assert.equal(interruptedOverview.totalTokens, 1250);
    assert.equal(interruptedOverview.totalPromptTokens, 125);
    assert.equal(interruptedOverview.totalCachedTokens, 50);
    assert.equal(interruptedOverview.totalCost, 1.26456);
    assert.equal((await getDaily(user))[5].cost, interruptedOverview.totalCost);
    const interruptedModels = await getByModel(user);
    assert.equal(interruptedModels.reduce((sum, row) => sum + row.tokens, 0), interruptedOverview.totalTokens);
    assert.ok(Math.abs(interruptedModels.reduce((sum, row) => sum + row.cost, 0) - interruptedOverview.totalCost) < 0.000001);
    await db.execute("UPDATE usage_logs SET cost = 0, total_tokens = 100, prompt_tokens = 0, cached_tokens = 0 WHERE log_id = ?", [`${user}-11`]);
    const recent: any[] = await getRecent(user);
    assert.equal(new Date(recent[0].time).getTime(), new Date(yesterday).getTime());
    assert.match(recent[0].time, /^\d{4}-\d{2}-\d{2}T.*\+08:00$/);
    assert.equal((await getDaily(`${user}-empty`)).every(row => row.requests === 0), true);
    assert.equal((await getOverview(`${user}-empty`)).successRate, 0);
    const rollover = fillUsageDays([], new Date("2026-12-31T16:00:00Z"));
    assert.equal(rollover[6].fullDate, "2027-01-01");
    assert.equal(rollover[0].fullDate, "2026-12-26");
    assert.equal(fillUsageDays([], new Date("2024-03-01T00:00:00Z"))[5].fullDate, "2024-02-29");
    assert.equal(parseUsageDate("2026-10-09")?.toISOString(), "2026-10-08T16:00:00.000Z");
    assert.equal(parseUsageDate("2026-10-09", true)?.toISOString(), "2026-10-09T15:59:59.999Z");
    for (const invalid of ["0000-01-01", "2026-02-29", "2026-02-30", "2026-13-01", "2026-10-09T24:00:00Z", "2026-10-09T12:00:00", "not-a-date", ["2026-10-09"]]) {
      assert.equal(parseUsageDate(invalid), null);
    }

    // Real PostgreSQL exercises the inclusive/exclusive seven-day SQL boundaries.
    for (const [suffix, time] of [
      ["before-window", start.getTime() - 6 * 86400000 - 1],
      ["start-window", start.getTime() - 6 * 86400000],
      ["after-window", start.getTime() + 86400000],
    ] as const) await db.execute(
      "INSERT INTO usage_logs (user_id,log_id,model,created_at) VALUES (?,?,?,?)",
      [user, `${user}-${suffix}`, "boundary-model", new Date(time).toISOString()]);
    const bounded = await getDaily(user);
    assert.equal(bounded[0].requests, 1);
    assert.equal(bounded.reduce((sum, row) => sum + row.requests, 0), 13);

    const app = express();
    app.use("/api/usage", usageRouter);
    app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ success: false, code: "unexpected_test_error" });
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/usage`;
    const call = async (path: string, auth: string | null = token) => {
      const response = await fetch(`${base}${path}`, { headers: auth ? { Authorization: `Bearer ${auth}` } : {} });
      return { status: response.status, body: await response.json() as any };
    };
    assert.equal((await call("/overview", null)).status, 401);
    assert.equal((await call("/overview", "expired-or-invalid-synthetic-token")).status, 401);
    assert.equal((await call("/overview?scope=all")).status, 403);
    const limits = ["-1", "0", "1.5", "NaN", "Infinity", "1&limit=2", "99999999999999999999"];
    for (const path of ["/", "/recent", "/monitor/recent", "/logs/search"]) {
      for (const limit of limits) assert.equal((await call(`${path}?limit=${limit}`)).status, 400, `${path} limit=${limit}`);
    }
    assert.equal((await call("/recent?limit=1")).body.data.length, 1);
    for (const filter of ["from=bad", "from=2026-02-30", "from=2026-10-10&to=2026-10-09", "from=2026-10-09T12:00:00", "from=2026-10-09&from=2026-10-10"]) {
      assert.equal((await call(`/logs/search?${filter}`)).status, 400, filter);
    }
    const yesterdayDay = shanghaiDate(new Date(start.getTime() - 1));
    const filtered = await call(`/logs/search?from=${yesterdayDay}&to=${yesterdayDay}`);
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.data.length, 12);
    assert.equal(new Date(filtered.body.data[0].time).getTime(), new Date(yesterday).getTime());
    await db.execute("INSERT INTO usage_logs (user_id,log_id,model,created_at) VALUES (?,?,?,?)",
      [user, `${user}-microseconds`, "boundary-model", `${yesterdayDay}T23:59:59.999999+08:00`]);
    assert.equal((await call(`/logs/search?from=${yesterdayDay}&to=${yesterdayDay}`)).body.data.length, 13,
      "date-only upper bounds include PostgreSQL microseconds at the end of the day");

    // Current discounts must never rewrite the saved settlement-time facts.
    await db.execute("UPDATE usage_logs SET retail_list_cost = ?, retail_discount_rate = ? WHERE log_id = ?", [0.246912, 0.5, `${user}-0`]);
    await db.execute("UPDATE usage_logs SET retail_list_cost = ?, retail_discount_rate = ? WHERE log_id = ?", [0.25, 0, `${user}-10`]);
    await db.execute("INSERT INTO user_model_discounts (id,user_id,model_id,discount_rate,is_enabled) VALUES (?,?,?,?,?)", [user, user, "*", 0.2, true]);
    const history = (await call("/recent")).body.data;
    const historical = history.find((row: any) => row.log_id === `${user}-0`);
    assert.equal(historical.discount_rate, 0.5);
    assert.equal(historical.list_cost, 0.246912);
    const free = history.find((row: any) => row.log_id === `${user}-10`);
    assert.equal(free.discount_rate, 0);
    assert.equal(free.list_cost, 0.25);
    const legacy = history.find((row: any) => row.log_id === `${user}-1`);
    assert.equal("discount_rate" in legacy, false);
    assert.equal("list_cost" in legacy, false);

    let calls = 0;
    let mode = "match";
    const ownedId = `${user}-0`;
    sls.getSlsClient = () => mode === "unconfigured" ? null : {
      getLogs: async (_project: string, _store: string, _from: Date, _to: Date, options: { query: string }) => {
        calls++;
        // Full-text search (no field index in production); ownership is enforced on the results.
        assert.equal(options.query, JSON.stringify(ownedId));
        if (mode === "error") throw Object.assign(new Error("SYNTHETIC_SECRET_MESSAGE"), { code: "SYNTHETIC_SECRET_CODE" });
        if (mode === "empty") return [];
        if (mode === "foreign") return [{ logId: ownedId, userId: other, request: "SYNTHETIC FOREIGN BODY" }];
        if (mode === "wrong-id") return [{ logId: "foreign-id", userId: user, request: "SYNTHETIC WRONG ID BODY" }];
        if (mode === "missing-identity") return [{ request: "SYNTHETIC UNATTRIBUTED BODY" }];
        return [{ logId: ownedId, userId: user, request: "SYNTHETIC OWN BODY", response: "SYNTHETIC OWN RESPONSE" }];
      },
    };
    const detailPath = `/logs/${ownedId}/detail`;
    assert.equal((await call(detailPath, null)).status, 401);
    assert.equal((await call(`/logs/${other}-log/detail`)).status, 404);
    assert.equal((await call("/logs/nonexistent/detail")).status, 404);
    assert.equal(calls, 0, "unauthorized IDs must not reach SLS");
    assert.equal((await call(detailPath)).body.data.request, "SYNTHETIC OWN BODY");
    for (mode of ["foreign", "wrong-id", "missing-identity", "empty"]) {
      const response = await call(detailPath);
      assert.equal(response.status, 200);
      assert.equal(response.body.data, null, `fail closed for ${mode}`);
    }
    mode = "unconfigured";
    assert.equal((await call(detailPath)).status, 503);
    mode = "error";
    const logged: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { logged.push(args); };
    try {
      const failed = await call(detailPath);
      assert.equal(failed.status, 503);
      assert.equal(JSON.stringify(failed.body).includes("SYNTHETIC_SECRET"), false);
      assert.equal(JSON.stringify(logged).includes("SYNTHETIC_SECRET"), false);
    } finally { console.error = originalError; }
    mode = "match";
    assert.equal((await call(detailPath)).status, 200, "retry rechecks ownership and recovers");

    // The child is the consumption actor in both stores; paying parent is not
    // substituted into either identity field and cannot read its child's body.
    await db.execute("UPDATE users SET parent_user_id = ? WHERE id = ?", [user, other]);
    const originalLog = sls.logToSLS;
    const events: Record<string, any>[] = [];
    sls.logToSLS = event => { events.push(event); };
    const childLogId = `${other}-writer`;
    try {
      await logUsage({ logId: childLogId, apiKeyId: null, userId: other, model: "synthetic-child-model", promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, status: "error", latencyMs: 0 });
    } finally { sls.logToSLS = originalLog; }
    const childRow = await db.queryOne<{ user_id: string }>("SELECT user_id FROM usage_logs WHERE log_id = ?", [childLogId]);
    assert.equal(childRow?.user_id, other);
    assert.equal(events[0].userId, childRow?.user_id);
    assert.equal((await call(`/logs/${childLogId}/detail`)).status, 404);

    // Exercise the installed Alibaba SDK without making any network request.
    const httpx = require("httpx");
    const originalRequest = httpx.request;
    const originalRead = httpx.read;
    const originalKey = process.env.SLS_ACCESS_KEY_ID;
    const originalSecret = process.env.SLS_ACCESS_KEY_SECRET;
    const protocols: string[] = [];
    httpx.request = async (url: string) => { protocols.push(new URL(url).protocol); return { headers: { "content-type": "application/json" } }; };
    httpx.read = async () => JSON.stringify([{ logId: "synthetic-sdk-log", userId: "synthetic-sdk-user" }]);
    process.env.SLS_ACCESS_KEY_ID = "synthetic-test-only-key";
    process.env.SLS_ACCESS_KEY_SECRET = "synthetic-test-only-secret";
    try {
      const client = originalClient();
      const result = await client.getLogs("nexusflow", "nexusflow", new Date(0), new Date(1000), { query: "synthetic-sdk-log" });
      assert.equal(Array.isArray(result), true, "installed SDK returns parsed JSON array directly");
      assert.equal(result[0].logId, "synthetic-sdk-log");
      await client.postLogStoreLogs("nexusflow", "nexusflow", { logs: [{ timestamp: 1, content: { logId: "synthetic-sdk-log" } }] });
      assert.deepEqual(protocols, ["https:", "https:"], "both query and upload must use encrypted transport");
    } finally {
      httpx.request = originalRequest;
      httpx.read = originalRead;
      if (originalKey === undefined) delete process.env.SLS_ACCESS_KEY_ID; else process.env.SLS_ACCESS_KEY_ID = originalKey;
      if (originalSecret === undefined) delete process.env.SLS_ACCESS_KEY_SECRET; else process.env.SLS_ACCESS_KEY_SECRET = originalSecret;
    }
    console.log("PASS: real PostgreSQL totals/success/long tail/precision/isolation; Shanghai seven-day and date filters; timestamps; historical discounts; HTTP limits; auth/global denial; SLS exact owner binding, child actor identity, redaction, status and retry; installed SDK query/upload HTTPS and array contract (network stubbed)");
  } finally {
    sls.getSlsClient = originalClient;
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await db.execute("DELETE FROM usage_logs WHERE user_id IN (?,?)", [user, other]);
    await db.execute("DELETE FROM users WHERE id IN (?,?)", [user, other]);
  }
}
main().then(() => closeDb()).then(() => process.exit(0)).catch(async error => { console.error(error); await closeDb(); process.exit(1); });
