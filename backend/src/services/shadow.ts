/**
 * Shadow evaluation helpers shared by NF_CP_MODE / NF_TRAFFIC_MODE /
 * NF_PARAM_MODE in `shadow` mode.
 *
 * A shadow computation runs after (or beside) the legacy decision. Any error
 * inside it is swallowed and logged; it can never change the request outcome.
 * Differences are written to SLS as `status:"shadow_diff"` and counted in
 * Redis under `nf:shadow:<area>:<yyyymmdd>` (UTC) with a 14-day TTL.
 */
import { logToSLS } from "./sls";
import { getRedis } from "./redis";

export type ShadowArea =
  | "cp_resolve_model"
  | "cp_select_route"
  | "cp_pricing"
  | "traffic"
  | "params"
  | "protocol";

const COUNTER_TTL_SECONDS = 14 * 24 * 60 * 60;

export function shadowCounterKey(area: ShadowArea, now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `nf:shadow:${area}:${day}`;
}

type CounterClient = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

let counterClientOverride: CounterClient | null | undefined;

/** Test hook: inject a Redis-like client, or null to disable counting. */
export function setShadowCounterClient(client: CounterClient | null | undefined): void {
  counterClientOverride = client;
}

function counterClient(): CounterClient | null {
  if (counterClientOverride !== undefined) return counterClientOverride;
  try {
    return getRedis() as unknown as CounterClient;
  } catch {
    return null;
  }
}

/**
 * Records one shadow difference. Values must be non-sensitive identifiers
 * (model IDs, route IDs, parameter *names*, prices) — never request content.
 */
export function recordShadowDiff(
  area: ShadowArea,
  details: Record<string, unknown>
): void {
  try {
    logToSLS({ status: "shadow_diff", shadowArea: area, ...details });
  } catch {
    // Logging must never affect the request.
  }
  const client = counterClient();
  if (!client) return;
  const key = shadowCounterKey(area);
  void client
    .incr(key)
    .then((value) => (value === 1 ? client.expire(key, COUNTER_TTL_SECONDS) : 0))
    .catch(() => undefined);
}

/**
 * Runs a shadow comparison. `compute` returns the list of differences (empty
 * when the new logic agrees). Returns nothing and never throws or rejects.
 */
export async function runShadow(
  area: ShadowArea,
  compute: () => Promise<Array<Record<string, unknown>>> | Array<Record<string, unknown>>
): Promise<void> {
  try {
    const diffs = await compute();
    for (const diff of diffs) recordShadowDiff(area, diff);
  } catch (error) {
    try {
      logToSLS({
        status: "shadow_error",
        shadowArea: area,
        errorReason: error instanceof Error ? error.message.slice(0, 300) : "shadow_failed",
      });
    } catch {
      // ignore
    }
  }
}
