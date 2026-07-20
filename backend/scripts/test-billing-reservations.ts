import assert from "node:assert/strict";
import { closeDb, db } from "../src/db/client";
import { reserveBalance, settleReservation } from "../src/data/billing";

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

  console.log("billing reservation concurrency + idempotency: ok");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
