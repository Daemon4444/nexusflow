/**
 * Effective traffic policy (P4). Policies are layered: global, then
 * model_type:<chat|async>, then model:<id>; each later layer overrides the
 * fields it sets. user:<id> policies only carry user_default/fair_share.
 * Without a loaded control-plane version the built-in defaults apply; they
 * equal the current production behaviour (data/ratelimits.ts code defaults,
 * scheduler circuit env defaults).
 */
import type { CpTrafficPolicy } from "../control-plane/schema";
import type { LoadedControlPlane } from "../control-plane/runtime";

export interface EffectivePolicy {
  userDefault: { qpm: number; tpm: number };
  fairShare: number | null;
  chat: { retryAfterS: number };
  async: { maxQueueDepth: number; maxWaitS: number; maxQueuedPerUser: number };
  circuit: { threshold: number; cooldownS: number; countHttp: string[]; halfOpenProbes: number };
}

export type ModelKind = "chat" | "async";

export const BUILTIN_POLICY: EffectivePolicy = {
  userDefault: { qpm: 30000, tpm: 5_000_000 },
  fairShare: null,
  chat: { retryAfterS: 5 },
  async: { maxQueueDepth: 200, maxWaitS: 1800, maxQueuedPerUser: 10 },
  circuit: { threshold: 10, cooldownS: 60, countHttp: ["5xx", "401", "403", "408", "429"], halfOpenProbes: 1 },
};

function apply(target: EffectivePolicy, policy: CpTrafficPolicy | undefined): void {
  if (!policy) return;
  if (policy.user_default) target.userDefault = { ...policy.user_default };
  if (policy.fair_share) target.fairShare = policy.fair_share.max_share_per_user;
  if (policy.overflow?.chat) target.chat = { retryAfterS: policy.overflow.chat.retry_after_s };
  if (policy.overflow?.async) {
    target.async = {
      maxQueueDepth: policy.overflow.async.max_queue_depth,
      maxWaitS: policy.overflow.async.max_wait_s,
      maxQueuedPerUser: policy.overflow.async.max_queued_per_user,
    };
  }
  if (policy.circuit) {
    target.circuit = {
      threshold: policy.circuit.threshold,
      cooldownS: policy.circuit.cooldown_s,
      countHttp: [...policy.circuit.count_http],
      halfOpenProbes: policy.circuit.half_open_probes,
    };
  }
}

export function effectivePolicy(
  snapshot: LoadedControlPlane | null,
  options: { modelId?: string; kind?: ModelKind; userId?: string | null } = {}
): EffectivePolicy {
  const result: EffectivePolicy = JSON.parse(JSON.stringify(BUILTIN_POLICY));
  if (!snapshot) return result;
  apply(result, snapshot.policies.get("global"));
  if (options.kind) apply(result, snapshot.policies.get(`model_type:${options.kind}`));
  if (options.modelId) apply(result, snapshot.policies.get(`model:${options.modelId}`));
  if (options.userId) {
    const user = snapshot.policies.get(`user:${options.userId}`);
    if (user?.user_default) result.userDefault = { ...user.user_default };
    if (user?.fair_share) result.fairShare = user.fair_share.max_share_per_user;
  }
  return result;
}

/** Whether an HTTP status counts toward the circuit under a policy. */
export function circuitCounts(policy: EffectivePolicy, httpStatus: number): boolean {
  if (!httpStatus) return true; // network errors / timeouts
  if (httpStatus >= 500) return policy.circuit.countHttp.includes("5xx") || policy.circuit.countHttp.includes(String(httpStatus));
  return policy.circuit.countHttp.includes(String(httpStatus));
}
