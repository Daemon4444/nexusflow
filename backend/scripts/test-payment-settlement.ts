import assert from "node:assert/strict";
import { closeDb, db } from "../src/db/client";
import {
  createPaymentOrder,
  getPaymentOrder,
  markOrderPending,
  settlePaidPaymentOrder,
  settleQueriedPaymentOrder,
} from "../src/data/paymentOrders";

async function main(): Promise<void> {
  const balanceBefore = Number(
    (await db.queryOne<{ balance: number | string }>(
      "SELECT balance FROM users WHERE id = 'local-user-1'"
    ))?.balance || 0
  );

  await createPaymentOrder({
    orderNo: "payment-atomic-concurrent",
    userId: "local-user-1",
    amount: 10,
    method: "page",
  });
  await markOrderPending("payment-atomic-concurrent");
  const firstSettlement = await settlePaidPaymentOrder({
      orderNo: "payment-atomic-concurrent",
      paidAmount: 10,
      providerTradeNo: "trade-one",
      notifyPayload: "{\"path\":\"notify\"}",
    });
  const firstLedgerVisible = await db.queryOne<any>(
    "SELECT id, type, ref_id FROM transactions WHERE COALESCE(ref_id, '') = ?",
    ["alipay:payment-atomic-concurrent"]
  );
  const allPaymentLedgers = await db.queryMany<any>(
    "SELECT id, type, ref_id FROM transactions WHERE type = 'recharge'"
  );
  assert(
    firstLedgerVisible,
    `first payment ledger must be visible before replay: ${JSON.stringify({ firstSettlement, allPaymentLedgers })}`
  );
  assert.equal(firstLedgerVisible.type, "recharge");
  const replaySettlement = await settlePaidPaymentOrder({
      orderNo: "payment-atomic-concurrent",
      paidAmount: 10,
      providerTradeNo: "trade-one",
      notifyPayload: "{\"path\":\"poll\"}",
    });
  const concurrent = [firstSettlement, replaySettlement];
  assert(concurrent.every((result) => result.status === "settled"));
  const concurrentSettled = concurrent.filter(
    (result): result is Extract<typeof result, { status: "settled" }> =>
      result.status === "settled"
  );
  assert.equal(concurrentSettled.filter((result) => !result.replayed).length, 1);
  assert.equal(concurrentSettled.filter((result) => result.replayed).length, 1);

  const balanceAfter = Number(
    (await db.queryOne<{ balance: number | string }>(
      "SELECT balance FROM users WHERE id = 'local-user-1'"
    ))?.balance || 0
  );
  assert.equal(balanceAfter, balanceBefore + 10);
  const ledgerCount = await db.queryOne<{ count: number | string }>(
    "SELECT COUNT(*) AS count FROM transactions WHERE COALESCE(ref_id, '') = ?",
    ["alipay:payment-atomic-concurrent"]
  );
  assert.equal(Number(ledgerCount?.count), 1);
  const settledOrder = await getPaymentOrder("payment-atomic-concurrent");
  assert.equal(settledOrder?.status, "paid");
  assert.equal(!!settledOrder?.processed, true);

  // A validation failure cannot expose processed=true or mutate the balance.
  await createPaymentOrder({
    orderNo: "payment-amount-mismatch",
    userId: "local-user-1",
    amount: 20,
    method: "qr",
  });
  await markOrderPending("payment-amount-mismatch");
  const mismatch = await settlePaidPaymentOrder({
    orderNo: "payment-amount-mismatch",
    paidAmount: 19,
  });
  assert.equal(mismatch.status, "amount_mismatch");
  const mismatchOrder = await getPaymentOrder("payment-amount-mismatch");
  assert.equal(mismatchOrder?.status, "pending");
  assert.equal(!!mismatchOrder?.processed, false);

  // The active polling path must use the provider's amount, with exact
  // cent-level comparison. Underpayment, overpayment, NaN and sub-cent values
  // all fail closed without a ledger or processed order.
  const rejectedProviderAmounts: Array<{ suffix: string; amount: number }> = [
    { suffix: "under", amount: 19.99 },
    { suffix: "over", amount: 20.01 },
    { suffix: "nan", amount: Number.NaN },
    { suffix: "subcent", amount: 19.999 },
  ];
  for (const candidate of rejectedProviderAmounts) {
    const orderNo = `payment-poll-${candidate.suffix}`;
    await createPaymentOrder({
      orderNo,
      userId: "local-user-1",
      amount: 20,
      method: "page",
    });
    await markOrderPending(orderNo);
    const result = await settleQueriedPaymentOrder({
      orderNo,
      providerAmount: candidate.amount,
      providerTradeNo: `trade-${candidate.suffix}`,
    });
    assert(
      result.status === "amount_mismatch"
      || result.status === "invalid_provider_amount"
    );
    const rejectedOrder = await getPaymentOrder(orderNo);
    assert.equal(rejectedOrder?.status, "pending");
    assert.equal(!!rejectedOrder?.processed, false);
    const rejectedLedger = await db.queryOne(
      "SELECT id FROM transactions WHERE COALESCE(ref_id, '') = ?",
      [`alipay:${orderNo}`]
    );
    assert.equal(rejectedLedger, null);
  }

  // Harmless IEEE-754 representation noise still maps to the same integer
  // number of cents; no tolerance permits a different cent.
  await createPaymentOrder({
    orderNo: "payment-poll-cent-exact",
    userId: "local-user-1",
    amount: 0.3,
    method: "page",
  });
  await markOrderPending("payment-poll-cent-exact");
  const centExact = await settleQueriedPaymentOrder({
    orderNo: "payment-poll-cent-exact",
    providerAmount: 0.1 + 0.2,
    providerTradeNo: "trade-cent-exact",
  });
  assert.equal(centExact.status, "settled");

  // Repair the exact old crash state: paid/processed was persisted but no
  // ledger row exists. An idempotent retry creates the missing money once.
  await createPaymentOrder({
    orderNo: "payment-legacy-crash-repair",
    userId: "local-user-1",
    amount: 3,
    method: "page",
  });
  await db.execute(
    `UPDATE payment_orders
        SET status = 'paid', processed = TRUE, paid_at = NOW()
      WHERE order_no = ?`,
    ["payment-legacy-crash-repair"]
  );
  const repaired = await settlePaidPaymentOrder({
    orderNo: "payment-legacy-crash-repair",
    paidAmount: 3,
    providerTradeNo: "legacy-trade",
  });
  assert.equal(repaired.status, "settled");
  if (repaired.status === "settled") assert.equal(repaired.replayed, false);
  const repairReplay = await settlePaidPaymentOrder({
    orderNo: "payment-legacy-crash-repair",
    paidAmount: 3,
    providerTradeNo: "legacy-trade",
  });
  assert.equal(repairReplay.status, "settled");
  if (repairReplay.status === "settled") assert.equal(repairReplay.replayed, true);
  const repairLedgerCount = await db.queryOne<{ count: number | string }>(
    "SELECT COUNT(*) AS count FROM transactions WHERE COALESCE(ref_id, '') = ?",
    ["alipay:payment-legacy-crash-repair"]
  );
  assert.equal(Number(repairLedgerCount?.count), 1);

  console.log("payment settlement atomicity checks passed");
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
