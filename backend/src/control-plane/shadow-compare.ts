/**
 * Legacy-vs-control-plane comparisons used by NF_CP_MODE=shadow (per
 * request) and by the offline backfill check (whole catalog). Pure
 * functions: no I/O, no request impact.
 */
import type { AIModel } from "../data/models";
import { getUpstreamModelId } from "../utils/upstream-model-aliases";
import { canonicalJson } from "./schema";
import { isModelServable, type LoadedControlPlane } from "./runtime";

export interface ShadowDiff {
  kind: "model_exists" | "model_fields" | "pricing" | "route_provider" | "route_upstream_model" | "route_availability";
  modelId: string;
  detail: string;
  legacy?: unknown;
  controlPlane?: unknown;
}

const PRICING_FIELDS = [
  "pricingType",
  "promptPrice",
  "completionPrice",
  "cacheReadPrice",
  "cacheReadExplicitPrice",
  "thinkingCompletionPrice",
  "audioInputPrice",
  "audioOutputPrice",
  "pricingTiers",
  "tokenPricingTiers",
  "alternatePricingModes",
] as const;

function pick(model: AIModel, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) out[field] = (model as unknown as Record<string, unknown>)[field];
  return out;
}

/** resolveModel + pricing resolution for one model and caller. */
export function diffModel(
  modelId: string,
  legacy: AIModel | null | undefined,
  snapshot: LoadedControlPlane,
  userId: string | null
): ShadowDiff[] {
  const cp = snapshot.models.get(modelId);
  const cpServable = !!cp && isModelServable(cp, userId);
  const cpModel = cpServable ? snapshot.aiModels.get(modelId) || null : null;
  if (!!legacy !== !!cpModel) {
    return [{
      kind: "model_exists",
      modelId,
      detail: legacy ? `legacy serves the model, control plane does not (${cp ? cp.lifecycle : "absent"})` : "control plane serves a model legacy does not",
      legacy: !!legacy,
      controlPlane: cp ? cp.lifecycle : null,
    }];
  }
  if (!legacy || !cpModel) return [];
  const diffs: ShadowDiff[] = [];
  const legacyPricing = canonicalJson(pick(legacy, PRICING_FIELDS));
  const cpPricing = canonicalJson(pick(cpModel, PRICING_FIELDS));
  if (legacyPricing !== cpPricing) {
    const fields = PRICING_FIELDS.filter((field) =>
      canonicalJson((legacy as unknown as Record<string, unknown>)[field]) !== canonicalJson((cpModel as unknown as Record<string, unknown>)[field])
    );
    diffs.push({ kind: "pricing", modelId, detail: `pricing differs in ${fields.join(", ")}` });
  }
  const otherLegacy = { ...legacy } as Record<string, unknown>;
  const otherCp = { ...cpModel } as Record<string, unknown>;
  for (const field of PRICING_FIELDS) {
    delete otherLegacy[field];
    delete otherCp[field];
  }
  if (canonicalJson(otherLegacy) !== canonicalJson(otherCp)) {
    const keys = [...new Set([...Object.keys(otherLegacy), ...Object.keys(otherCp)])]
      .filter((key) => canonicalJson(otherLegacy[key]) !== canonicalJson(otherCp[key]))
      .sort();
    diffs.push({ kind: "model_fields", modelId, detail: `catalog fields differ: ${keys.join(", ")}` });
  }
  return diffs;
}

export interface LegacyRouteDecision {
  ok: boolean;
  providerId?: string;
  upstreamModelId?: string;
  /** Legacy failure code (provider_unavailable, provider_capacity_exhausted, ...). */
  code?: string;
}

/** Active cp candidates for a model, best first. */
export function controlPlaneCandidates(snapshot: LoadedControlPlane, modelId: string) {
  return (snapshot.routesByModel.get(modelId) || []).filter((route) => {
    const account = snapshot.accounts.get(route.account_id);
    return route.status === "active" && account?.status === "active";
  });
}

/** selectRoute: would the control plane route this request the same way? */
export function diffRoute(modelId: string, legacy: LegacyRouteDecision, snapshot: LoadedControlPlane): ShadowDiff[] {
  const candidates = controlPlaneCandidates(snapshot, modelId);
  const providers = candidates.map((route) => snapshot.accounts.get(route.account_id)?.legacy_provider_id || route.account_id);
  if (!legacy.ok) {
    // Capacity/credential/health outcomes are traffic concerns (P4); only a
    // missing route on one side is a configuration difference.
    if (legacy.code === "provider_unavailable" || legacy.code === "provider_not_found") {
      if (candidates.length > 0) {
        return [{ kind: "route_availability", modelId, detail: `legacy has no route (${legacy.code}), control plane has ${providers.join(", ")}` }];
      }
    }
    return [];
  }
  if (!legacy.providerId) return [];
  const index = providers.indexOf(legacy.providerId);
  if (index < 0) {
    return [{
      kind: "route_provider",
      modelId,
      detail: `legacy chose ${legacy.providerId}, control plane candidates are ${providers.join(", ") || "none"}`,
      legacy: legacy.providerId,
      controlPlane: providers,
    }];
  }
  const expectedUpstream = candidates[index].upstream_model_id;
  const legacyUpstream = legacy.upstreamModelId ?? getUpstreamModelId(modelId, legacy.providerId);
  if (expectedUpstream !== legacyUpstream) {
    return [{
      kind: "route_upstream_model",
      modelId,
      detail: `upstream model ${legacyUpstream} (legacy) vs ${expectedUpstream} (control plane)`,
    }];
  }
  return [];
}

export interface CatalogComparison {
  modelDiffs: ShadowDiff[];
  routeDiffs: ShadowDiff[];
}

/**
 * Whole-catalog comparison (offline shadow): the legacy effective catalog
 * and enabled capacity rows against a backfilled snapshot. Route
 * differences listed in `explained` (orphans the backfill skipped on
 * purpose) are not reported.
 */
export function compareCatalog(
  legacyModels: AIModel[],
  legacyRoutes: Array<{ provider_id: string; model_id: string; is_enabled: boolean }>,
  snapshot: LoadedControlPlane,
  explained: Array<{ provider_id: string; model_id: string }> = []
): CatalogComparison {
  const modelDiffs: ShadowDiff[] = [];
  const legacyById = new Map(legacyModels.map((model) => [model.id, model]));
  const ids = [...new Set([...legacyById.keys(), ...snapshot.models.keys()])].sort();
  for (const id of ids) modelDiffs.push(...diffModel(id, legacyById.get(id), snapshot, null));

  const explainedKeys = new Set(explained.map((row) => `${row.provider_id}\0${row.model_id}`));
  const legacyKeys = new Set(
    legacyRoutes
      .filter((row) => row.is_enabled && legacyById.has(row.model_id))
      .map((row) => `${row.provider_id}\0${row.model_id}`)
  );
  const cpKeys = new Set<string>();
  for (const [modelId] of snapshot.routesByModel) {
    for (const route of controlPlaneCandidates(snapshot, modelId)) {
      const provider = snapshot.accounts.get(route.account_id)?.legacy_provider_id || route.account_id;
      cpKeys.add(`${provider}\0${modelId}`);
    }
  }
  const routeDiffs: ShadowDiff[] = [];
  for (const key of [...legacyKeys].sort()) {
    if (cpKeys.has(key) || explainedKeys.has(key)) continue;
    const [provider, modelId] = key.split("\0");
    routeDiffs.push({ kind: "route_availability", modelId, detail: `legacy route ${provider} has no active control-plane route` });
  }
  for (const key of [...cpKeys].sort()) {
    if (legacyKeys.has(key)) continue;
    const [provider, modelId] = key.split("\0");
    routeDiffs.push({ kind: "route_availability", modelId, detail: `control-plane route ${provider} has no enabled legacy route` });
  }
  return { modelDiffs, routeDiffs };
}
