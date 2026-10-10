import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { AddressInfo } from "node:net";
import { closeDb, db } from "../src/db/client";
import { getBillingDateRange, getBillingUsageExport, getMonthlyStats } from "../src/data/billing";
import { loginByEmail } from "../src/data/users";
import { upsertUserModelDiscount } from "../src/data/user-discounts";
import billingRouter from "../src/routes/billing";
import { errorHandler } from "../src/middleware/error";
import { shanghaiDate } from "../src/utils/usage-dates";

async function main() {
  assert.equal(process.env.NODE_ENV, "test");
  assert.match(process.env.PG_DATABASE || "", /test|ci/);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(process.env.PG_HOST || ""));
  assert.notEqual(process.env.USE_PG_MEM, "true");
  const prefix = `billing-reporting-${randomUUID()}`;
  const accounts = await Promise.all(["owner", "other"].map(name => loginByEmail(`${prefix}-${name}@example.test`)));
  assert.ok(accounts[0] && accounts[1]);
  const owner = accounts[0]!;
  const other = accounts[1]!;
  const app = express();
  app.use("/api/billing", billingRouter);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/billing`;
  const request = (path: string, token: string | undefined = owner.token) => fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  try {
    for (const [model, date] of [
      ["before", "2026-10-08T15:59:59.999Z"],
      ["start", "2026-10-08T16:00:00.000Z"],
      ["end", "2026-10-09T15:59:59.999Z"],
      ["last-microsecond", "2026-10-09T15:59:59.999999Z"],
      ["after", "2026-10-09T16:00:00.000Z"],
    ]) {
      await db.execute(
        "INSERT INTO usage_logs (user_id,model,total_tokens,cost,status,created_at) VALUES (?,?,?,?,?,?)",
        [owner.user.id, model, 1, 0.01, "success", date],
      );
    }
    await db.execute(
      "INSERT INTO usage_logs (user_id,model,total_tokens,cost,status,created_at) VALUES (?,?,?,?,?,?)",
      [other.user.id, "other-private", 1, 99, "success", "2026-10-09T01:00:00Z"],
    );
    const exported = await getBillingUsageExport(owner.user.id, { startDate: "2026-10-09", endDate: "2026-10-09" });
    assert.equal(exported.startDate, "2026-10-08T16:00:00.000Z");
    assert.equal(exported.endDate, "2026-10-09T15:59:59.999Z");
    assert.deepEqual(exported.rows.map(row => row.model), ["start", "end", "last-microsecond"]);
    const breakdown = await (await request("/sub-breakdown?startDate=2026-10-09&endDate=2026-10-09")).json() as any;
    assert.equal(breakdown.data.rows[0].call_count, 3, "microsecond end boundary is included in sub-account reports");
    const rollover = getBillingDateRange(undefined, undefined, new Date("2026-12-31T16:00:00Z"));
    assert.equal(rollover.startDate.toISOString(), "2026-12-31T16:00:00.000Z");
    assert.equal(rollover.endDate.toISOString(), "2027-01-01T15:59:59.999Z");
    const instant = getBillingDateRange("2026-10-08T16:00:00Z", "2026-10-08T17:00:00Z");
    assert.equal(instant.endDate.toISOString(), "2026-10-08T17:00:00.000Z");
    for (const date of ["2026-02-30", "not-a-date", "2026-10-09T10:00:00"]) {
      const response = await request(`/export.csv?startDate=${date}&endDate=2026-10-09`);
      assert.equal(response.status, 400, `reject invalid date ${date}`);
    }
    assert.equal((await request("/export.csv?startDate=2026-10-10&endDate=2026-10-09")).status, 400);
    const csv = await request("/export.csv?startDate=2026-10-09&endDate=2026-10-09");
    assert.match(csv.headers.get("content-disposition") || "", /2026-10-09-to-2026-10-09/);
    assert.doesNotMatch(await csv.text(), /other-private/);
    assert.equal((await fetch(`${base}/transactions`)).status, 401);

    const today = shanghaiDate(new Date());
    const firstOfMonth = new Date(`${today.slice(0, 7)}-01T00:00:00+08:00`).toISOString();
    for (const [suffix, rate, discount] of [["legacy", null, null], ["snapshot", 0.8, 0.25]] as const) {
      await db.execute(
        `INSERT INTO transactions (id,user_id,type,amount,balance_after,description,created_at,discount_rate,discount_amount_cny)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [`${prefix}-${suffix}`, owner.user.id, "consumption", 1, 24.75, "API: qwen-plus", firstOfMonth, rate, discount],
      );
    }
    for (const rate of [0.5, 0.25, 0]) {
      await upsertUserModelDiscount({ userId: owner.user.id, modelId: "qwen-plus", discountRate: rate });
      const payload = await (await request("/transactions")).json() as any;
      const legacy = payload.data.rows.find((row: any) => row.id === `${prefix}-legacy`);
      const snapshot = payload.data.rows.find((row: any) => row.id === `${prefix}-snapshot`);
      assert.equal(legacy.discountRate, undefined, "unknown historical discount must remain unknown");
      assert.equal(legacy.discountAmountCny, undefined);
      assert.equal(Number(legacy.amount), 1);
      assert.equal(snapshot.discountRate, 0.8);
      assert.equal(snapshot.discountAmountCny, 0.25);
    }
    const otherTransactions = await (await request("/transactions", other.token)).json() as any;
    assert.equal(otherTransactions.data.total, 0, "ledger remains owner-scoped");
    for (const query of ["limit=-1", "limit=1.5", "offset=-1", "offset=Infinity", "limit=101"]) {
      assert.equal((await request(`/transactions?${query}`)).status, 400);
    }
    const page = await (await request("/transactions?limit=1&offset=1")).json() as any;
    assert.equal(page.data.rows.length, 1);
    assert.equal(page.data.total, 2);
    const monthly = await getMonthlyStats(owner.user.id);
    assert.equal(monthly.length, 1);
    assert.equal(monthly[0].month, today.slice(0, 7), "Shanghai first-of-month belongs to that month");
    assert.equal(monthly[0].consumption, 2);
    console.log(`Billing reporting passed: Shanghai date boundaries, year rollover, exact timestamps, historical snapshots, owner isolation and pagination (TZ=${process.env.TZ || "host"})`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const account of [owner, other]) {
      await db.execute("DELETE FROM usage_logs WHERE user_id = ?", [account.user.id]);
      await db.execute("DELETE FROM transactions WHERE user_id = ?", [account.user.id]);
      await db.execute("DELETE FROM users WHERE id = ?", [account.user.id]);
    }
  }
}

main().then(() => closeDb()).catch(async error => {
  console.error(error);
  await closeDb();
  process.exitCode = 1;
});
