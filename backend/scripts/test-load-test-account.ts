import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { closeDb, db } from "../src/db/client";
import { releaseReservation, reserveBalance, settleReservation } from "../src/data/billing";
import { logUsage } from "../src/data/usage";
import {
  assertLoadTestUserId,
  cleanupLoadTestAccount,
  createLoadTestAccount,
  loadTestReport,
  loadTestUserId,
  parseBalance,
  percentile,
  reconcile,
} from "../src/cli/load-test-account";

async function main(): Promise<void> {
  // Guards: ids, balances and percentiles.
  assert.equal(loadTestUserId("run-1"), "nf-loadtest-run-1");
  assert.throws(() => loadTestUserId("Bad_ID"));
  assert.throws(() => loadTestUserId(""));
  assert.throws(() => assertLoadTestUserId("local-user-1"), /not a nf-loadtest-/);
  assert.throws(() => assertLoadTestUserId("nf-loadtest-"));
  assert.equal(parseBalance(undefined), 20);
  assert.throws(() => parseBalance("0"));
  assert.throws(() => parseBalance("101"));
  assert.throws(() => parseBalance("abc"));
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 3);
  assert.equal(percentile([1, 2, 3, 4], 0.99), 4);

  // Reconciliation compares money at ledger precision.
  const good = { initialBalance: 20, balance: 19.6805, usageCost: 0.3195, transactionAmount: -0.3195, successCount: 2, settledReservations: 2, openReservations: 0 };
  assert.equal(reconcile(good).ok, true);
  assert.equal(reconcile({ ...good, balance: 19.6804 }).ok, false);
  assert.equal(reconcile({ ...good, openReservations: 1 }).ok, false);
  assert.equal(reconcile({ ...good, settledReservations: 1 }).ok, false);

  // End to end on the migrated schema: create -> two billed calls + one
  // released failure -> reconciled report -> cleanup removes every row.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nf-loadtest-"));
  const keyFile = path.join(dir, "key");
  const userId = await createLoadTestAccount("ci", 20, keyFile);
  assert.equal(userId, "nf-loadtest-ci");
  assert.equal(fs.statSync(keyFile).mode & 0o777, 0o600, "key file must be 0600");
  const token = fs.readFileSync(keyFile, "utf8");
  assert.match(token, /^sk-air-[0-9a-f]{48}$/);
  const key = await db.queryOne<{ id: string; key: string; key_hash: string }>("SELECT id, key, key_hash FROM api_keys WHERE user_id = $1", [userId]);
  assert.equal(key?.key_hash, crypto.createHash("sha256").update(token).digest("hex"));
  assert.ok(!key?.key.includes(token.slice(12, -8)), "only the mask is stored");
  await assert.rejects(createLoadTestAccount("ci", 20, path.join(dir, "key2")), /already exists/);
  assert.equal(fs.existsSync(path.join(dir, "key2")), false, "a failed create must not leave a key file");
  await assert.rejects(createLoadTestAccount("ci2", 20, keyFile), /EEXIST/, "never overwrite a key file");

  for (const [index, cost] of [0.001824, 0.001512].entries()) {
    const reservation = await reserveBalance(userId, 1, `loadtest-ci-${index}`);
    assert.ok(reservation);
    await settleReservation(reservation.id, cost, "load test settlement");
    await logUsage({ apiKeyId: key!.id, userId, model: "qwen-flash", promptTokens: 10, completionTokens: 8, totalTokens: 18, cost, status: "success", latencyMs: 300 + index * 100 });
  }
  const failed = await reserveBalance(userId, 1, "loadtest-ci-failed");
  assert.ok(failed);
  await releaseReservation(failed.id, "request_failed");

  const report = await loadTestReport(userId, 20);
  assert.equal(report.reconciliation.ok, true, report.reconciliation.problems.join("; "));
  assert.equal(report.ledger.successCount, 2);
  assert.equal(report.usage[0].serverLatencyMs.p50, 400);
  const wrongInitial = await loadTestReport(userId, 25);
  assert.equal(wrongInitial.reconciliation.ok, false, "a wrong starting balance must not reconcile");

  await assert.rejects(cleanupLoadTestAccount("local-user-1"), /not a nf-loadtest-/);
  const deleted = await cleanupLoadTestAccount(userId);
  assert.equal(deleted.users, 1);
  assert.equal(deleted.usage_logs, 2);
  assert.equal(deleted.billing_reservations, 3);
  for (const table of ["users", "api_keys", "usage_logs", "billing_reservations", "transactions"]) {
    const column = table === "users" ? "id" : "user_id";
    const left: { n: string } | null = await db.queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = $1`, [userId]);
    assert.equal(Number(left?.n), 0, `${table} still has load-test rows`);
  }

  // An account that looks like a load-test id but has a customer email is refused.
  await db.execute("INSERT INTO users (id, email, nickname, balance) VALUES ($1, $2, $3, $4)", ["nf-loadtest-impostor", "someone@example.com", "x", 1]);
  await assert.rejects(cleanupLoadTestAccount("nf-loadtest-impostor"), /email is not/);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("load-test account tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
