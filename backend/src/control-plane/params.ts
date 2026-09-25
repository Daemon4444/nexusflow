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
