import assert from "node:assert/strict";
import {
  getFallbackState,
  latestObservationAt,
  observedAvailabilityPercentage,
  satisfiesMinimumObservedAvailability,
  summarizeRouteHealth,
  unavailableAvailabilityPercentage,
  unavailableHistoricalSeries,
} from "../src/services/provider-monitor-semantics";

const none = summarizeRouteHealth([], new Map());
assert.equal(none.health, "unknown");
assert.deepEqual(none.summary, { healthy: 0, degraded: 0, down: 0, unknown: 0 });

const unobserved = summarizeRouteHealth(["model-a"], new Map());
assert.equal(unobserved.health, "unknown");
assert.equal(unobserved.summary.unknown, 1);
assert.equal(unobserved.observedRoutes, 0);

const partial = summarizeRouteHealth(
  ["model-a", "model-b"],
  new Map([["model-a", "healthy"]])
);
assert.equal(partial.health, "unknown");
assert.deepEqual(partial.summary, { healthy: 1, degraded: 0, down: 0, unknown: 1 });

const healthy = summarizeRouteHealth(
  ["model-a", "model-b"],
  new Map([["model-a", "healthy"], ["model-b", "healthy"]])
);
assert.equal(healthy.health, "healthy");
assert.equal(healthy.observedRoutes, 2);

const degraded = summarizeRouteHealth(
  ["model-a", "model-b"],
  new Map([["model-a", "degraded"], ["model-b", "healthy"]])
);
assert.equal(degraded.health, "degraded");
assert.equal(getFallbackState(degraded.health), "monitoring");

const down = summarizeRouteHealth(
  ["model-a", "model-b"],
  new Map([["model-a", "down"], ["model-b", "degraded"]])
);
assert.equal(down.health, "down");
assert.equal(getFallbackState(down.health), "open");
assert.equal(getFallbackState("unknown"), "unknown");

assert.deepEqual(unavailableHistoricalSeries(), []);
assert.notEqual(unavailableHistoricalSeries(), unavailableHistoricalSeries());
assert.equal(unavailableAvailabilityPercentage(), null);
assert.equal(latestObservationAt(null, null), null);
assert.equal(
  latestObservationAt("2026-07-25T10:00:00.000Z", "2026-07-25T11:00:00.000Z"),
  "2026-07-25T11:00:00.000Z"
);
assert.equal(observedAvailabilityPercentage(1000, 999), 99.9);
assert.equal(observedAvailabilityPercentage(0, 0), null);
assert.equal(observedAvailabilityPercentage(10, 11), null);
assert.equal(satisfiesMinimumObservedAvailability(null, null, null), true);
assert.equal(satisfiesMinimumObservedAvailability(99.9, null, null), false);
assert.equal(satisfiesMinimumObservedAvailability(99.9, 1000, 999), true);
assert.equal(satisfiesMinimumObservedAvailability(99.91, 1000, 999), false);
assert.equal(satisfiesMinimumObservedAvailability(Number.NaN, 1000, 1000), false);

console.log("provider-monitor semantics tests passed");
