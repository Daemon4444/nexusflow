/**
 * Parameter policy (D2). Default is pass-through; the platform only blocks
 * parameters that change cost or resource usage in a way billing cannot yet
 * reserve and settle correctly ("billing_guarded").
 */
import type { CpModel } from "./schema";

/**
 * Category list, not per model. A model may allow one only when its billing
 * configuration can price it (guardedParamBillingSupported).
 */
export const BILLING_GUARDED_PARAMS: ReadonlyArray<{ name: string; reason: string }> = [
  { name: "n", reason: "multiple choices multiply output tokens beyond the reservation" },
  { name: "enable_search", reason: "web search is billed separately upstream" },
  { name: "search_options", reason: "web search is billed separately upstream" },
  { name: "plugins", reason: "upstream plugins can incur separate charges" },
  { name: "file_ids", reason: "the upstream reads stored files the platform does not meter" },
  { name: "batch", reason: "batch pricing is not reserved or settled by the platform" },
];

export const BILLING_GUARDED_NAMES: ReadonlySet<string> = new Set(BILLING_GUARDED_PARAMS.map((param) => param.name));

/**
 * Whether the model's billing can correctly reserve and settle a guarded
 * parameter. Nothing qualifies yet: there is no search/plugin/batch price or
 * multi-choice reservation in the pricing schema. Extend together with the
 * pricing fields that make it true.
 */
export function guardedParamBillingSupported(_model: CpModel, _param: string): boolean {
  return false;
}

/**
 * Request keys the platform itself interprets (routing, streaming, output
 * modality, thinking switch, NexusFlow-only flags). They are never
 * "dropped": the platform decides what reaches the upstream.
 */
export const PLATFORM_PARAMS: ReadonlySet<string> = new Set([
  "model",
  "messages",
  "stream",
  "include_reasoning",
  "enable_thinking",
  "modalities",
  "audio",
]);

type ParamOverrides = NonNullable<CpModel["param_overrides"]>;

/** billing_guarded parameters present in the request and not allowed for the model. */
export function guardedParamsRequested(body: Record<string, unknown>, allowGuarded: readonly string[] = []): string[] {
  return Object.keys(body || {})
    .filter((key) => body[key] !== undefined && BILLING_GUARDED_NAMES.has(key) && !allowGuarded.includes(key))
    .sort();
}

/** Names (never values) of client parameters the legacy builder did not forward. */
export function droppedParamNames(body: Record<string, unknown>, upstreamRequest: Record<string, unknown>): string[] {
  return Object.keys(body || {})
    .filter((key) => body[key] !== undefined && !PLATFORM_PARAMS.has(key) && !(key in upstreamRequest))
    .sort();
}

/** Data-driven rewrite (rename) then fixed values (objects merged one level). */
export function applyParamOverrides(request: Record<string, unknown>, overrides: ParamOverrides | undefined): Record<string, unknown> {
  if (!overrides) return request;
  const out: Record<string, unknown> = { ...request };
  for (const [from, to] of Object.entries(overrides.rewrite || {})) {
    if (out[from] === undefined) continue;
    if (out[to] === undefined) out[to] = out[from];
    delete out[from];
  }
  for (const [key, value] of Object.entries(overrides.fixed || {})) {
    const current = out[key];
    if (value && typeof value === "object" && !Array.isArray(value) && current && typeof current === "object" && !Array.isArray(current)) {
      out[key] = { ...(current as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * NF_PARAM_MODE=enforce (D2): the legacy-built request (which carries every
 * platform adjustment: upstream model id, forced streaming, include_usage,
 * thinking default) plus every client parameter it would have dropped;
 * then the model's rewrite/fixed overrides. Guarded parameters must have
 * been rejected before this is called.
 */
export function passthroughChatRequest(
  body: Record<string, unknown>,
  legacyRequest: Record<string, unknown>,
  overrides: ParamOverrides | undefined
): Record<string, unknown> {
  const request: Record<string, unknown> = { ...legacyRequest };
  for (const key of droppedParamNames(body, legacyRequest)) request[key] = body[key];
  const result = applyParamOverrides(request, overrides);
  if (result.stream === true) {
    // Always fixed: billing needs the usage chunk.
    const streamOptions = result.stream_options && typeof result.stream_options === "object" && !Array.isArray(result.stream_options)
      ? result.stream_options as Record<string, unknown>
      : {};
    result.stream_options = { ...streamOptions, include_usage: true };
  }
  return result;
}
