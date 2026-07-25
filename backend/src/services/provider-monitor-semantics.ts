export type ObservedHealthState = "healthy" | "degraded" | "down";
export type HealthState = ObservedHealthState | "unknown";
export type FallbackState = "closed" | "monitoring" | "open" | "unknown";

export interface HealthSummary {
  healthy: number;
  degraded: number;
  down: number;
  unknown: number;
}

export function getFallbackState(health: HealthState): FallbackState {
  if (health === "down") return "open";
  if (health === "degraded") return "monitoring";
  if (health === "unknown") return "unknown";
  return "closed";
}

export function summarizeRouteHealth(
  enabledModelIds: string[],
  observedByModel: ReadonlyMap<string, ObservedHealthState>
): { health: HealthState; summary: HealthSummary; observedRoutes: number } {
  const summary: HealthSummary = { healthy: 0, degraded: 0, down: 0, unknown: 0 };
  for (const modelId of enabledModelIds) {
    const state: HealthState = observedByModel.get(modelId) || "unknown";
    summary[state] += 1;
  }

  const health: HealthState =
    summary.down > 0 ? "down" :
    summary.degraded > 0 ? "degraded" :
    summary.unknown > 0 ? "unknown" :
    enabledModelIds.length === 0 ? "unknown" :
    "healthy";

  return {
    health,
    summary,
    observedRoutes: enabledModelIds.length - summary.unknown,
  };
}

export function unavailableHistoricalSeries(): number[] {
  return [];
}

export function latestObservationAt(
  lastSuccessAt: string | null | undefined,
  lastFailureAt: string | null | undefined
): string | null {
  const timestamps = [lastSuccessAt, lastFailureAt]
    .filter((value): value is string => !!value)
    .sort();
  return timestamps[timestamps.length - 1] || null;
}

export function unavailableAvailabilityPercentage(): null {
  return null;
}

export function observedAvailabilityPercentage(
  totalRequests: number,
  successRequests: number
): number | null {
  if (
    !Number.isFinite(totalRequests) ||
    !Number.isFinite(successRequests) ||
    totalRequests <= 0 ||
    successRequests < 0 ||
    successRequests > totalRequests
  ) {
    return null;
  }
  return Number(((successRequests / totalRequests) * 100).toFixed(4));
}

export function satisfiesMinimumObservedAvailability(
  minimumAvailability: number | null | undefined,
  totalRequests: number | null | undefined,
  successRequests: number | null | undefined
): boolean {
  if (minimumAvailability === null || minimumAvailability === undefined) return true;
  if (!Number.isFinite(minimumAvailability)) return false;
  const observed = observedAvailabilityPercentage(
    totalRequests ?? 0,
    successRequests ?? 0
  );
  return observed !== null && observed >= minimumAvailability;
}
