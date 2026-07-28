import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closeDb, db } from "../src/db/client";
import {
  createPaymentOrder,
  getPaymentOrder,
  markOrderPending,
  settlePaidPaymentOrder,
} from "../src/data/paymentOrders";

async function main(): Promise<void> {
  const databaseName = String(process.env.PG_DATABASE || "");
  if (
    process.env.PAYMENT_SETTLEMENT_INTEGRATION !== "true"
    || !/(^|[_-])(ci|test)([_-]|$)/i.test(databaseName)
  ) {
    throw new Error("refusing payment integration test outside an explicit CI/test database");
  }

  const runId = randomUUID().replace(/-/g, "");
  const userId = `payment-ci-user-${runId}`;
  const orderNo = `payment-ci-order-${runId}`;
  const faultOrderNo = `payment-ci-fault-${runId}`;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO users (
       id, email, nickname, balance, credit_balance, status, created_at, updated_at
     ) VALUES (?, ?, ?, 0, 0, 'active', ?, ?)`,
    [userId, `${runId}@payment-ci.invalid`, "payment-ci", now, now]
  );

  try {
    await createPaymentOrder({
      orderNo,
      userId,
      amount: 10,
      method: "page",
    });
    await markOrderPending(orderNo);
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        settlePaidPaymentOrder({
          orderNo,
          paidAmount: 10,
          providerTradeNo: `provider-trade-${index}`,
          notifyPayload: JSON.stringify({ path: index % 2 ? "poll" : "notify" }),
        })
      )
    );
    assert(concurrent.every((result) => result.status === "settled"));
    const settled = concurrent.filter(
      (result): result is Extract<typeof result, { status: "settled" }> =>
        result.status === "settled"
    );
    assert.equal(settled.filter((result) => !result.replayed).length, 1);
    assert.equal(settled.filter((result) => result.replayed).length, 7);
    const afterConcurrent = await db.queryOne<{ balance: number | string }>(
      "SELECT balance FROM users WHERE id = ?",
      [userId]
    );
    assert.equal(Number(afterConcurrent?.balance), 10);
    const concurrentLedger = await db.queryOne<{ count: number | string }>(
      "SELECT COUNT(*) AS count FROM transactions WHERE ref_id = ?",
      [`alipay:${orderNo}`]
    );
    assert.equal(Number(concurrentLedger?.count), 1);
    const concurrentOrder = await getPaymentOrder(orderNo);
    assert.equal(concurrentOrder?.status, "paid");
    assert.equal(!!concurrentOrder?.processed, true);

    // Inject a failure after the unique ledger insert but before balance/order
    // updates. PostgreSQL must roll the entire transaction back; a retry then
    // performs exactly one complete settlement.
    await createPaymentOrder({
      orderNo: faultOrderNo,
      userId,
      amount: 4,
      method: "qr",
    });
    await markOrderPending(faultOrderNo);
    await assert.rejects(
      settlePaidPaymentOrder(
        { orderNo: faultOrderNo, paidAmount: 4 },
        { afterLedgerInsert: async () => { throw new Error("injected settlement crash"); } }
      ),
      /injected settlement crash/
    );
    const afterFault = await db.queryOne<{ balance: number | string }>(
      "SELECT balance FROM users WHERE id = ?",
      [userId]
    );
    assert.equal(Number(afterFault?.balance), 10);
    const faultLedgerBeforeRetry = await db.queryOne<{ count: number | string }>(
      "SELECT COUNT(*) AS count FROM transactions WHERE ref_id = ?",
      [`alipay:${faultOrderNo}`]
    );
    assert.equal(Number(faultLedgerBeforeRetry?.count), 0);
    const faultOrderBeforeRetry = await getPaymentOrder(faultOrderNo);
    assert.equal(faultOrderBeforeRetry?.status, "pending");
    assert.equal(!!faultOrderBeforeRetry?.processed, false);

    const retry = await settlePaidPaymentOrder({
      orderNo: faultOrderNo,
      paidAmount: 4,
      providerTradeNo: "retry-trade",
    });
    assert.equal(retry.status, "settled");
    if (retry.status === "settled") assert.equal(retry.replayed, false);
    const afterRetry = await db.queryOne<{ balance: number | string }>(
      "SELECT balance FROM users WHERE id = ?",
      [userId]
    );
    assert.equal(Number(afterRetry?.balance), 14);

    console.log("PostgreSQL payment settlement concurrency checks passed");
  } finally {
    await db.execute("DELETE FROM users WHERE id = ?", [userId]);
    await closeDb();
  }
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
