import assert from "node:assert/strict";
import {
  controlPlaneMode,
  featureFlagSnapshot,
  paramMode,
  protocolMode,
  requireSecondApprover,
  trafficMode,
} from "../src/config/feature-flags";
import {
  recordShadowDiff,
  runShadow,
  setShadowCounterClient,
  shadowCounterKey,
} from "../src/services/shadow";

async function main(): Promise<void> {
  // Every switch defaults to the legacy behaviour.
  assert.deepEqual(featureFlagSnapshot({}), {
    NF_CP_MODE: "legacy",
    NF_TRAFFIC_MODE: "legacy",
    NF_PARAM_MODE: "legacy",
    NF_PROTOCOL_MODE: "legacy",
    NF_CP_REQUIRE_SECOND_APPROVER: false,
  });
  assert.equal(controlPlaneMode({ NF_CP_MODE: "shadow" }), "shadow");
  assert.equal(controlPlaneMode({ NF_CP_MODE: " ENFORCE " }), "enforce");
  assert.equal(trafficMode({ NF_TRAFFIC_MODE: "on" }), "legacy", "invalid values stay legacy");
  assert.equal(paramMode({ NF_PARAM_MODE: "shadow" }), "shadow");
  assert.equal(protocolMode({ NF_PROTOCOL_MODE: "shadow" }), "legacy", "protocol has no shadow mode");
  assert.equal(protocolMode({ NF_PROTOCOL_MODE: "enforce" }), "enforce");
  assert.equal(requireSecondApprover({ NF_CP_REQUIRE_SECOND_APPROVER: "true" }), true);
  assert.equal(requireSecondApprover({ NF_CP_REQUIRE_SECOND_APPROVER: "1" }), false);

  assert.equal(shadowCounterKey("params", new Date("2026-09-25T23:59:00Z")), "nf:shadow:params:20260925");

  const counters = new Map<string, number>();
  const expiries = new Map<string, number>();
  setShadowCounterClient({
    async incr(key) {
      const value = (counters.get(key) || 0) + 1;
      counters.set(key, value);
      return value;
    },
    async expire(key, seconds) {
      expiries.set(key, seconds);
      return 1;
    },
  });
  await runShadow("traffic", () => [{ a: 1 }, { b: 2 }]);
  recordShadowDiff("traffic", { c: 3 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(counters.get(shadowCounterKey("traffic")), 3);
  assert.equal(expiries.get(shadowCounterKey("traffic")), 14 * 24 * 60 * 60);

  // A failing shadow computation never throws.
  await runShadow("params", () => {
    throw new Error("boom");
  });
  await runShadow("params", async () => {
    throw new Error("async boom");
  });
  // A failing counter never throws either.
  setShadowCounterClient({
    async incr() {
      throw new Error("redis down");
    },
    async expire() {
      return 0;
    },
  });
  recordShadowDiff("params", { x: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  setShadowCounterClient(undefined);
  console.log("feature flag and shadow tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
