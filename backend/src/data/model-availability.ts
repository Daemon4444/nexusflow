import { db } from "../db/client";

/**
 * Real serving availability of catalog models, derived from the same facts as
 * the control-plane consistency rule `sellable_model_without_route`: a route
 * counts only when the provider_capacity row is enabled and its provider is
 * enabled. Admin screens use this instead of showing "unknown".
 */
export type ModelAvailability = "available" | "no_active_route" | "no_route";

export interface ModelRouteSummary {
  availability: ModelAvailability;
  enabledRoutes: number;
  totalRoutes: number;
  routes: Array<{ providerId: string; routeEnabled: boolean; providerEnabled: boolean }>;
}

export interface CapacityRouteRow {
  provider_id: string;
  model_id: string;
  is_enabled: boolean | null;
}

export interface ProviderStatusRow {
  id: string;
  status: string | null;
}

export function summarizeModelRoutes(
  capacity: CapacityRouteRow[],
  providers: ProviderStatusRow[]
): Map<string, ModelRouteSummary> {
  const enabledProviders = new Set(providers.filter((row) => row.status === "enabled").map((row) => row.id));
  const byModel = new Map<string, ModelRouteSummary>();
  for (const row of capacity) {
    const summary = byModel.get(row.model_id) ?? { availability: "no_route" as ModelAvailability, enabledRoutes: 0, totalRoutes: 0, routes: [] };
    const routeEnabled = row.is_enabled === true;
    const providerEnabled = enabledProviders.has(row.provider_id);
    summary.totalRoutes += 1;
    if (routeEnabled && providerEnabled) summary.enabledRoutes += 1;
    summary.routes.push({ providerId: row.provider_id, routeEnabled, providerEnabled });
    byModel.set(row.model_id, summary);
  }
  for (const summary of byModel.values()) {
    summary.availability = summary.enabledRoutes > 0 ? "available" : "no_active_route";
  }
  return byModel;
}

export function routeSummaryFor(summaries: Map<string, ModelRouteSummary>, modelId: string): ModelRouteSummary {
  return summaries.get(modelId) ?? { availability: "no_route", enabledRoutes: 0, totalRoutes: 0, routes: [] };
}

export async function loadModelRouteSummaries(): Promise<Map<string, ModelRouteSummary>> {
  const [capacity, providers] = await Promise.all([
    db.queryMany<CapacityRouteRow>("SELECT provider_id, model_id, is_enabled FROM provider_capacity"),
    db.queryMany<ProviderStatusRow>("SELECT id, status FROM providers"),
  ]);
  return summarizeModelRoutes(capacity, providers);
}
