import assert from "node:assert/strict";
import { closeDb, db } from "../src/db/client";
import { adminAdjustCredit, getBillingUsageExport, reserveBalance, reserveBalanceWithReason, settleReservation } from "../src/data/billing";
import { logUsage } from "../src/data/usage";
import {
  normalizeDashScopeVideoResolution,
  normalizeDashScopeVideoSize,
  VideoParameterError,
} from "../src/utils/video-parameters";

async function main(): Promise<void> {
  // pg-mem does not implement PostgreSQL row-lock scheduling, so this test
  // verifies the availability calculation sequentially. The same code path is
  // exercised concurrently against real PostgreSQL in the deployment smoke.
  const attempts = [
    await reserveBalance("local-user-1", 20, "availability-a"),
    await reserveBalance("local-user-1", 20, "availability-b"),
  ];
  assert.equal(attempts.filter(Boolean).length, 1, "only one hold may fit");

  const reservation = attempts.find(Boolean)!;
  const before = await db.queryOne<{ balance: number }>(
    "SELECT balance FROM users WHERE id = ?",
    ["local-user-1"]
  );
  assert.equal(Number(before?.balance), 25.75, "a hold must not change displayed balance");

  const first = await settleReservation(reservation.id, 7.5, "integration settlement");
  assert.ok(first, "first settlement should create a transaction");
  const second = await settleReservation(reservation.id, 7.5, "integration settlement");
  assert.equal(second?.id, first.id, "repeat settlement must return the original transaction");

  const after = await db.queryOne<{ balance: number }>(
    "SELECT balance FROM users WHERE id = ?",
    ["local-user-1"]
  );
  assert.equal(Number(after?.balance), 18.25, "settlement should deduct exactly once");

  const txCount = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM transactions WHERE ref_id = ?",
    [`reservation:${reservation.id}`]
  );
  assert.equal(Number(txCount?.count), 1, "settlement must have one transaction");

  const active = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM billing_reservations WHERE status = 'active'"
  );
  assert.equal(Number(active?.count), 0, "no hold should remain active");

  await db.execute("UPDATE users SET balance = 2 WHERE id = ?", ["local-user-1"]);
  const creditAdjustment = await adminAdjustCredit({
    userId: "local-user-1",
    amountDelta: 10,
    description: "integration credit grant",
    actorId: "test-admin",
  });
  assert.ok(creditAdjustment, "admin should be able to grant credit");
  assert.equal(Number(creditAdjustment.credit_after), 10);

  const creditReservation = await reserveBalance("local-user-1", 8, "credit-availability");
  assert.ok(creditReservation, "cash plus credit should satisfy reservation");
  const creditSettlement = await settleReservation(creditReservation.id, 8, "credit settlement");
  assert.ok(creditSettlement);
  assert.equal(Number(creditSettlement.balance_after), 0, "cash must be consumed first");
  assert.equal(Number(creditSettlement.credit_amount), 6, "only the remainder should use credit");
  assert.equal(Number(creditSettlement.credit_after), 4, "credit balance should settle exactly once");

  const creditOwner = await db.queryOne<{ balance: number; credit_balance: number }>(
    "SELECT balance, credit_balance FROM users WHERE id = ?",
    ["local-user-1"]
  );
  assert.equal(Number(creditOwner?.balance), 0);
  assert.equal(Number(creditOwner?.credit_balance), 4);

  await db.execute(
    `INSERT INTO users
      (id, phone, email, nickname, balance, password_hash, parent_user_id, username, status,
       quota_limit, quota_used, quota_period, quota_reset_at, created_at, updated_at)
     VALUES (?, NULL, NULL, ?, 0, NULL, ?, ?, 'active', ?, 0, 'monthly', NOW(), NOW(), NOW())`,
    ["local-sub-quota", "额度测试子账号", "local-user-1", "local_sub_quota", 0.001]
  );
  const quotaFailure = await reserveBalanceWithReason(
    "local-sub-quota",
    0.01,
    "sub-quota-contract"
  );
  assert.equal(quotaFailure.reservation, null);
  assert.equal(quotaFailure.reason, "sub_account_quota_exceeded");

  await db.execute("UPDATE users SET status = 'suspended' WHERE id = ?", ["local-sub-quota"]);
  const suspendedFailure = await reserveBalanceWithReason(
    "local-sub-quota",
    0.0001,
    "sub-suspended-contract"
  );
  assert.equal(suspendedFailure.reservation, null);
  assert.equal(suspendedFailure.reason, "sub_account_suspended");

  assert.equal(normalizeDashScopeVideoSize({ size: "1280x720" }), "1280*720");
  assert.equal(
    normalizeDashScopeVideoSize({ resolution: "1080p", ratio: "9:16" }),
    "1080*1920"
  );
  assert.equal(normalizeDashScopeVideoResolution("1080p"), "1080P");
  assert.throws(
    () => normalizeDashScopeVideoSize({ resolution: "720P", ratio: "4:3" }),
    VideoParameterError
  );

  // Settlement-time retail pricing evidence is authoritative. In particular,
  // thinking output cannot be reconstructed later from prompt/output counts.
  await db.execute(
    `INSERT INTO users
      (id, phone, email, nickname, balance, password_hash, username, status, created_at, updated_at)
     VALUES (?, NULL, ?, ?, 10, NULL, ?, 'active', NOW(), NOW())`,
    ["billing-pricing-evidence-user", "billing-pricing-evidence@example.invalid", "计价证据测试", "billing_pricing_evidence"]
  );
  await db.execute(
    `INSERT INTO providers
      (id, name, slug, api_base_url, api_key, contact_name, contact_email, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'enabled')
     ON CONFLICT (id) DO NOTHING`,
    [
      "dashscope",
      "DashScope test provider",
      "dashscope",
      "https://example.invalid",
      "test-only",
      "Test",
      "test@example.invalid",
    ]
  );
  const thinkingLogId = await logUsage({
    logId: "billing-pricing-thinking",
    apiKeyId: null,
    userId: "billing-pricing-evidence-user",
    model: "qwen-plus",
    providerId: "dashscope",
    promptTokens: 1_000,
    completionTokens: 1_000,
    totalTokens: 2_000,
    cost: 0.0088,
    status: "success",
    latencyMs: 1,
    retailListCost: 0.0088,
    retailDiscountRate: 1,
    retailDiscountAmount: 0,
    thinkingOutput: true,
    providerCacheMode: "implicit",
    providerInputIncludesCache: true,
  });
  await logUsage({
    logId: "billing-pricing-nonthinking-discounted",
    apiKeyId: null,
    userId: "billing-pricing-evidence-user",
    model: "qwen-plus",
    providerId: "dashscope",
    promptTokens: 1_000,
    completionTokens: 1_000,
    totalTokens: 2_000,
    cost: 0.0014,
    status: "success",
    latencyMs: 1,
    retailListCost: 0.0028,
    retailDiscountRate: 0.5,
    retailDiscountAmount: 0.0014,
    thinkingOutput: false,
    providerCacheMode: "implicit",
    providerInputIncludesCache: true,
  });

  const pricingExport = await getBillingUsageExport("billing-pricing-evidence-user", {});
  const thinkingRow = pricingExport.rows.find((row) => row.billed_amount_cny === 0.0088);
  assert.ok(thinkingRow, "thinking usage must appear in billing export");
  assert.equal(thinkingRow.completion_unit_price_cny_per_1m, 8);
  assert.equal(thinkingRow.list_amount_cny, 0.0088);
  assert.equal(thinkingRow.discount_rate, 1);
  assert.equal(thinkingRow.rounding_delta_cny, 0);

  const nonThinkingRow = pricingExport.rows.find((row) => row.billed_amount_cny === 0.0014);
  assert.ok(nonThinkingRow, "non-thinking discounted usage must appear in billing export");
  assert.equal(nonThinkingRow.completion_unit_price_cny_per_1m, 2);
  assert.equal(nonThinkingRow.list_amount_cny, 0.0028);
  assert.equal(nonThinkingRow.discount_rate, 0.5);
  assert.equal(nonThinkingRow.discount_amount_cny, 0.0014);

  const storedEvidence = await db.queryOne<{
    retail_list_cost: number;
    thinking_output: boolean;
    provider_cache_mode: string;
    provider_cost: number;
    provider_cost_resolution: string;
  }>(
    `SELECT retail_list_cost, thinking_output, provider_cache_mode,
            provider_cost, provider_cost_resolution
       FROM usage_logs WHERE log_id = ?`,
    [thinkingLogId]
  );
  assert.equal(Number(storedEvidence?.retail_list_cost), 0.0088);
  assert.equal(Boolean(storedEvidence?.thinking_output), true);
  assert.equal(storedEvidence?.provider_cache_mode, "implicit");
  assert.equal(Number(storedEvidence?.provider_cost), 0.0088);
  assert.equal(storedEvidence?.provider_cost_resolution, "list_price_fallback");

  const discountedProviderCost = await db.queryOne<{
    provider_cost: number;
    provider_cost_resolution: string;
  }>(
    "SELECT provider_cost, provider_cost_resolution FROM usage_logs WHERE log_id = ?",
    ["billing-pricing-nonthinking-discounted"]
  );
  assert.equal(Number(discountedProviderCost?.provider_cost), 0.0028);
  assert.equal(discountedProviderCost?.provider_cost_resolution, "list_price_fallback");

  console.log("billing reservations, failure codes, and video parameter contracts: ok");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
