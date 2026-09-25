/**
 * Upstream protocol adapters.
 *
 * The adapter is an explicit property of an upstream account (P3:
 * `cp_upstream_accounts.adapter`). Until the control plane owns it, it is
 * derived from existing provider data in exactly one place: this module.
 * Routes must never infer a protocol from URL substrings.
 */

export const UPSTREAM_ADAPTERS = [
  "openai-compat",
  "anthropic",
  "dashscope-native",
  "ark-video",
  "azure-openai",
  "pixverse",
] as const;

export type UpstreamAdapter = (typeof UPSTREAM_ADAPTERS)[number];

/**
 * Every provider ID that exists in production (2026-09-25 provider_capacity
 * export) and in the code-defined provider registry, with its adapter.
 * `volcengine-uaep1` is the Seedance relay (token.genvia.ai) that speaks the
 * Volcengine Ark video protocol.
 */
export const PROVIDER_ADAPTERS: Readonly<Record<string, UpstreamAdapter>> = Object.freeze({
  dashscope: "dashscope-native",
  "volcengine-ark": "ark-video",
  "volcengine-uaep1": "ark-video",
  himodels: "anthropic",
  anthropic: "anthropic",
  "azure-ai-foundry": "azure-openai",
  pixverse: "pixverse",
  "jawayid-k3": "openai-compat",
});

/** Explicit `provider_channel_configs` channel adapters. */
export const CHANNEL_ADAPTERS: Readonly<Record<string, UpstreamAdapter>> = Object.freeze({
  dashscope: "dashscope-native",
  pixverse: "pixverse",
});

/**
 * Legacy rule kept only for providers created at runtime that are not in
 * PROVIDER_ADAPTERS and have no channel adapter. It reproduces the historic
 * `apiBaseUrl.includes(...)` checks exactly. Listed in
 * docs/control-plane-contract-checklist.md for removal once every account
 * carries an explicit adapter.
 */
export function legacyAdapterFromBaseUrl(baseUrl: string): UpstreamAdapter {
  const value = String(baseUrl || "");
  if (value.includes("pixverse.ai")) return "pixverse";
  if (value.includes("volces.com") || value.includes("genvia.ai")) return "ark-video";
  return "dashscope-native";
}

export interface AdapterSource {
  providerId: string;
  /** Adapter of the selected provider_channel_configs channel, if any. */
  channelAdapter?: string | null;
  /** Base URL actually used (only consulted by the legacy fallback). */
  baseUrl?: string | null;
}

export interface AdapterResolution {
  adapter: UpstreamAdapter;
  source: "channel" | "provider" | "legacy_url";
  /** Set when provider data and the legacy URL rule disagree. */
  mismatch?: { legacy: UpstreamAdapter };
}

/**
 * Resolves the adapter for async/media task protocols. Data first (channel,
 * then provider ID), legacy URL rule last. A disagreement between data and
 * the legacy rule is reported so operators can fix the data before the
 * fallback is removed; the data wins.
 */
export function resolveUpstreamAdapter(source: AdapterSource): AdapterResolution {
  const legacy = source.baseUrl ? legacyAdapterFromBaseUrl(source.baseUrl) : null;
  const fromChannel = source.channelAdapter ? CHANNEL_ADAPTERS[source.channelAdapter] : undefined;
  const fromProvider = PROVIDER_ADAPTERS[source.providerId];
  const chosen = fromChannel
    ? { adapter: fromChannel, source: "channel" as const }
    : fromProvider
      ? { adapter: fromProvider, source: "provider" as const }
      : { adapter: legacy || "dashscope-native", source: "legacy_url" as const };
  // Only the task-protocol families were ever URL-derived; compare those.
  const taskFamily = (adapter: UpstreamAdapter) =>
    adapter === "pixverse" || adapter === "ark-video" ? adapter : "dashscope-native";
  if (legacy && chosen.source !== "legacy_url" && taskFamily(chosen.adapter) !== legacy) {
    return { ...chosen, mismatch: { legacy } };
  }
  return chosen;
}

/** Which async task protocol an adapter speaks. */
export function taskProtocolFor(adapter: UpstreamAdapter): "pixverse" | "volcengine" | "dashscope" {
  if (adapter === "pixverse") return "pixverse";
  if (adapter === "ark-video") return "volcengine";
  return "dashscope";
}
