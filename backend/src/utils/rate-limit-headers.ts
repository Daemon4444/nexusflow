import type { Response } from "express";

export type PublicRateLimitScope =
  | "api_key"
  | "account_model_qpm"
  | "account_model_tpm"
  | "provider_capacity"
  | "edge_fuse";

export function setRateLimitHeaders(res: Response, params: {
  scope: PublicRateLimitScope;
  limit?: number;
  remaining?: number | null;
  resetMs?: number;
  rejected?: boolean;
}): void {
  const resetMs = Math.max(0, params.resetMs ?? 60_000);
  res.setHeader("X-RateLimit-Scope", params.scope);
  if (params.limit != null) res.setHeader("X-RateLimit-Limit", String(params.limit));
  if (params.remaining != null) res.setHeader("X-RateLimit-Remaining", String(params.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil((Date.now() + resetMs) / 1000)));
  if (params.rejected) res.setHeader("Retry-After", String(Math.max(1, Math.ceil(resetMs / 1000))));
}
