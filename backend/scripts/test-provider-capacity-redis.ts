import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getProviderConcurrencyAsync,
  getProviderUsageStatsAsync,
  releaseProviderCapacityAsync,
  reserveProviderCapacityAsync,
  type ProviderCapacityLimits,
  type ProviderCapacityReservation,
} from "../src/services/rate-limiter";
import { acquireProviderCapacity } from "../src/services/scheduler";
import { closeRedis, getRedis } from "../src/services/redis";

function shanghaiDayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const runId = `__nexusflow_capacity_it_${randomUUID().replace(/-/g, "")}`;
const modelId = "isolated-model";
const providerBase = `provider:${runId}:${modelId}`;
const rpmKey = `rpm:${providerBase}`;
const capacityV2Prefix = "provider-capacity:v2";
const tpmEventsKey = `${capacityV2Prefix}:tpm-events:${providerBase}`;
const tpmWeightsKey = `${capacityV2Prefix}:tpm-weights:${providerBase}`;
const tpmTotalKey = `${capacityV2Prefix}:tpm-total:${providerBase}`;
const concurrencyKey = `${capacityV2Prefix}:concurrency-leases:${providerBase}`;
const dailyKey = `daily:${providerBase}:${shanghaiDayKey()}`;
const redis = getRedis();
const leaseKeys = new Set<string>();

const unlimited: ProviderCapacityLimits = {
  rpm: 0,
  tpm: 0,
  dailyLimit: 0,
  concurrentLimit: 0,
};

function track(result: ProviderCapacityReservation): ProviderCapacityReservation {
  if (result.allowed) leaseKeys.add(`${capacityV2Prefix}:lease:${result.leaseId}`);
  return result;
}

async function reserve(
  limits: ProviderCapacityLimits,
  estimatedTokens = 0
): Promise<ProviderCapacityReservation> {
  return track(await reserveProviderCapacityAsync({
    providerId: runId,
    modelId,
    limits,
    estimatedTokens,
  }));
}

async function release(
  reservation: ProviderCapacityReservation,
  actualTokens = 0
): Promise<void> {
  assert.equal(reservation.allowed, true);
  if (!reservation.allowed) return;
  await releaseProviderCapacityAsync({
    providerId: runId,
    modelId,
    leaseId: reservation.leaseId,
    actualTokens,
  });
}

async function clearCounters(): Promise<void> {
  await redis.del(
    rpmKey,
    tpmEventsKey,
    tpmWeightsKey,
    tpmTotalKey,
    concurrencyKey,
    dailyKey,
    ...leaseKeys
  );
}

async function main(): Promise<void> {
  await redis.ping();

  try {
    // RPM: ten real concurrent contenders may atomically admit only two.
    await clearCounters();
    const rpmResults = await Promise.all(
      Array.from({ length: 10 }, () => reserve({ ...unlimited, rpm: 2 }))
    );
    assert.equal(rpmResults.filter((item) => item.allowed).length, 2);
    assert(rpmResults.filter((item) => !item.allowed).every((item) => item.reason === "rpm"));
    await Promise.all(rpmResults.filter((item) => item.allowed).map((item) => release(item)));

    // TPM: concurrent reservations cannot overbook and release reconciles the
    // estimate against the same per-request event.
    await clearCounters();
    const tpmResults = await Promise.all([
      reserve({ ...unlimited, tpm: 100 }, 60),
      reserve({ ...unlimited, tpm: 100 }, 60),
    ]);
    assert.equal(tpmResults.filter((item) => item.allowed).length, 1);
    const tpmWinner = tpmResults.find((item) => item.allowed)!;
    await release(tpmWinner, 40);
    assert.equal(Number(await redis.get(tpmTotalKey)), 40);
    const observedAfterReconcile = await getProviderUsageStatsAsync(runId, modelId);
    assert.equal(observedAfterReconcile.available, true);
    if (observedAfterReconcile.available) {
      assert.equal(observedAfterReconcile.tpm, 40);
    }
    const exactTpm = await reserve({ ...unlimited, tpm: 100 }, 60);
    assert.equal(exactTpm.allowed, true);
    await release(exactTpm, 60);

    // A real rolling window expires each request at its own timestamp. Keep
    // later traffic active while moving only the older request past 60s.
    assert.equal(tpmWinner.allowed, true);
    assert.equal(exactTpm.allowed, true);
    if (!tpmWinner.allowed || !exactTpm.allowed) throw new Error("expected TPM reservations");
    await redis.zadd(tpmEventsKey, Date.now() - 60_001, tpmWinner.leaseId);
    const afterFirstExpiry = await reserve({ ...unlimited, tpm: 100 }, 40);
    assert.equal(afterFirstExpiry.allowed, true);
    await release(afterFirstExpiry, 40);
    assert.equal(Number(await redis.get(tpmTotalKey)), 100);

    // Continued compliant traffic across another boundary must not accumulate
    // forever: the second old event expires while the newer 40 remains.
    await redis.zadd(tpmEventsKey, Date.now() - 60_001, exactTpm.leaseId);
    const afterSecondExpiry = await reserve({ ...unlimited, tpm: 100 }, 50);
    assert.equal(afterSecondExpiry.allowed, true);
    await release(afterSecondExpiry, 50);
    assert.equal(Number(await redis.get(tpmTotalKey)), 90);
    const rollingObservation = await getProviderUsageStatsAsync(runId, modelId);
    assert.equal(rollingObservation.available, true);
    if (rollingObservation.available) assert.equal(rollingObservation.tpm, 90);

    // Concurrency: exactly two leases; an idempotent release opens one slot.
    await clearCounters();
    const concurrencyResults = await Promise.all(
      Array.from({ length: 10 }, () => reserve({ ...unlimited, concurrentLimit: 2 }))
    );
    assert.equal(concurrencyResults.filter((item) => item.allowed).length, 2);
    const concurrencyWinners = concurrencyResults.filter((item) => item.allowed);
    await release(concurrencyWinners[0]);
    const replacement = await reserve({ ...unlimited, concurrentLimit: 2 });
    assert.equal(replacement.allowed, true);
    await release(concurrencyWinners[0]);
    assert.equal(await redis.zcard(concurrencyKey), 2);
    await release(concurrencyWinners[1]);
    await release(replacement);
    assert.equal(await redis.exists(concurrencyKey), 0);

    // Simulate a worker crash. The request's lease/event timestamps are moved
    // past their expiry without calling release; the next reservation must
    // recover both the concurrency slot and the TPM budget atomically.
    await clearCounters();
    const crashed = await reserve(
      { ...unlimited, tpm: 100, concurrentLimit: 1 },
      70
    );
    assert.equal(crashed.allowed, true);
    if (!crashed.allowed) throw new Error("expected crash-simulation reservation");
    const expiredAt = Date.now() - 60_001;
    await redis.zadd(tpmEventsKey, expiredAt, crashed.leaseId);
    await redis.set(
      `${capacityV2Prefix}:lease:${crashed.leaseId}`,
      `70:${expiredAt}`,
      "EX",
      3600
    );
    await redis.zadd(concurrencyKey, Date.now() - 1, crashed.leaseId);
    const recovered = await reserve(
      { ...unlimited, tpm: 100, concurrentLimit: 1 },
      30
    );
    assert.equal(recovered.allowed, true);
    assert.equal(await getProviderConcurrencyAsync(runId, modelId), 1);
    assert.equal(Number(await redis.get(tpmTotalKey)), 30);

    // Late release of the expired request is idempotent for concurrency and
    // must never re-add its actual usage to the new 60-second window.
    await release(crashed, 70);
    assert.equal(await getProviderConcurrencyAsync(runId, modelId), 1);
    assert.equal(Number(await redis.get(tpmTotalKey)), 30);
    await release(recovered, 30);
    assert.equal(await getProviderConcurrencyAsync(runId, modelId), 0);

    // If Redis commits a reservation but its acknowledgement is lost, the
    // scheduler must retry the same lease identity without double-consuming
    // RPM, daily, TPM, or concurrency.
    await clearCounters();
    const originalEvalForLostAck = redis.eval.bind(redis);
    let injectLostAck = true;
    (redis as any).eval = async (...args: any[]) => {
      const result = await (originalEvalForLostAck as any)(...args);
      if (injectLostAck) {
        injectLostAck = false;
        throw new Error("injected lost Redis acknowledgement");
      }
      return result;
    };
    let recoveredLostAck;
    try {
      recoveredLostAck = await acquireProviderCapacity(
        {
          providerId: runId,
          managed: true,
          rpm: 10,
          tpm: 100,
          dailyLimit: 10,
          concurrentLimit: 2,
        },
        modelId,
        40
      );
    } finally {
      (redis as any).eval = originalEvalForLostAck;
    }
    assert.equal(recoveredLostAck.ok, true);
    if (!recoveredLostAck.ok) throw new Error("lost acknowledgement was not recovered");
    assert.equal(await redis.zcard(rpmKey), 1);
    assert.equal(await redis.zcard(tpmEventsKey), 1);
    assert.equal(await redis.hlen(tpmWeightsKey), 1);
    assert.equal(Number(await redis.get(tpmTotalKey)), 40);
    assert.equal(Number(await redis.get(dailyKey)), 1);
    assert.equal(await redis.zcard(concurrencyKey), 1);
    await releaseProviderCapacityAsync({
      providerId: runId,
      modelId,
      leaseId: recoveredLostAck.lease.leaseId!,
      actualTokens: 35,
    });
    assert.equal(Number(await redis.get(tpmTotalKey)), 35);
    assert.equal(await redis.zcard(concurrencyKey), 0);

    // Alibaba Cloud Redis proxy rejects SET ... KEEPTTL inside EVAL even
    // though standalone Redis versions may accept it. Exercise a populated
    // rolling window while rejecting that syntax so production-compatible
    // explicit PTTL/PEXPIRE preservation cannot regress.
    await clearCounters();
    const originalEvalForProxyCompatibility = redis.eval.bind(redis);
    (redis as any).eval = async (...args: any[]) => {
      assert.equal(
        String(args[0]).includes("KEEPTTL"),
        false,
        "managed capacity Lua must not use proxy-incompatible KEEPTTL"
      );
      return (originalEvalForProxyCompatibility as any)(...args);
    };
    try {
      const firstProxyCompatible = await reserve({ ...unlimited, tpm: 100 }, 45);
      assert.equal(firstProxyCompatible.allowed, true);
      await release(firstProxyCompatible, 40);
      const populatedObservation = await getProviderUsageStatsAsync(runId, modelId);
      assert.equal(populatedObservation.available, true);
      if (populatedObservation.available) assert.equal(populatedObservation.tpm, 40);
      const immediateContinuation = await reserve({ ...unlimited, tpm: 100 }, 50);
      assert.equal(immediateContinuation.allowed, true);
      await release(immediateContinuation, 50);
    } finally {
      (redis as any).eval = originalEvalForProxyCompatibility;
    }

    // Daily is consumed by upstream attempts and intentionally survives release.
    await clearCounters();
    const dailyOne = await reserve({ ...unlimited, dailyLimit: 2 });
    const dailyTwo = await reserve({ ...unlimited, dailyLimit: 2 });
    const dailyThree = await reserve({ ...unlimited, dailyLimit: 2 });
    assert.equal(dailyOne.allowed, true);
    assert.equal(dailyTwo.allowed, true);
    assert.equal(dailyThree.allowed, false);
    if (!dailyThree.allowed) assert.equal(dailyThree.reason, "daily");
    await release(dailyOne);
    await release(dailyTwo);
    assert.equal(Number(await redis.get(dailyKey)), 2);

    // Invalid Redis state and a thrown Redis command both fail closed.
    await clearCounters();
    await redis.set(tpmEventsKey, "wrong-type");
    const invalidState = await acquireProviderCapacity(
      { providerId: runId, managed: true, rpm: 10, tpm: 10, dailyLimit: 10, concurrentLimit: 10 },
      modelId,
      1
    );
    assert.equal(invalidState.ok, false);
    if (!invalidState.ok) assert.equal(invalidState.code, "provider_capacity_store_unavailable");
    await redis.del(tpmEventsKey);

    const originalEval = redis.eval.bind(redis);
    (redis as any).eval = async () => {
      throw new Error("injected Redis command failure");
    };
    try {
      const unavailableStats = await getProviderUsageStatsAsync(runId, modelId);
      assert.equal(unavailableStats.available, false);
      if (!unavailableStats.available) {
        assert.equal(unavailableStats.rpm, null);
        assert.equal(unavailableStats.tpm, null);
      }
      const unavailable = await acquireProviderCapacity(
        { providerId: runId, managed: true, rpm: 10, tpm: 10, dailyLimit: 10, concurrentLimit: 10 },
        modelId,
        1
      );
      assert.equal(unavailable.ok, false);
      if (!unavailable.ok) assert.equal(unavailable.code, "provider_capacity_store_unavailable");
    } finally {
      (redis as any).eval = originalEval;
    }

    console.log(`provider capacity Redis checks passed (${runId})`);
  } finally {
    try {
      await clearCounters();
      const exactKeys = [
        rpmKey,
        tpmEventsKey,
        tpmWeightsKey,
        tpmTotalKey,
        concurrencyKey,
        dailyKey,
        ...leaseKeys,
      ];
      assert.equal(
        await redis.exists(...exactKeys),
        0,
        "isolated provider-capacity test keys must be removed"
      );
    } finally {
      await closeRedis();
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
