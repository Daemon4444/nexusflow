/**
 * Control-plane rollout switches.
 *
 * Every flag defaults to the legacy behaviour. Deploying code that contains a
 * new path changes nothing until an operator explicitly sets the flag. Values
 * are read from the environment on every call so tests and PM2 reloads see the
 * current value; invalid values fall back to the legacy default (and are
 * reported once) instead of enabling anything.
 *
 *   NF_CP_MODE=legacy|shadow|enforce         where configuration is read (P3)
 *   NF_TRAFFIC_MODE=legacy|shadow|enforce    quota pools, overflow, queue (P4)
 *   NF_PARAM_MODE=legacy|shadow|enforce      parameter passthrough (P5)
 *   NF_PROTOCOL_MODE=legacy|enforce          native protocols only, D6 (P5)
 *   NF_CP_REQUIRE_SECOND_APPROVER=false      change-request approval (P6)
 *
 * `shadow` means: the legacy decision is still executed; the new logic is
 * evaluated alongside it and differences are logged (`status:"shadow_diff"`)
 * and counted in Redis. A shadow evaluation failure must never affect the
 * request — use `runShadow`.
 */

export type RolloutMode = "legacy" | "shadow" | "enforce";
export type ProtocolMode = "legacy" | "enforce";

const reportedInvalid = new Set<string>();

function readMode<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: T,
  env: NodeJS.ProcessEnv
): T {
  const raw = (env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  if (!reportedInvalid.has(`${name}=${raw}`)) {
    reportedInvalid.add(`${name}=${raw}`);
    console.error(`[feature-flags] invalid ${name}=${raw}; using ${fallback}`);
  }
  return fallback;
}

const ROLLOUT_MODES = ["legacy", "shadow", "enforce"] as const;

export function controlPlaneMode(env: NodeJS.ProcessEnv = process.env): RolloutMode {
  return readMode("NF_CP_MODE", ROLLOUT_MODES, "legacy", env);
}

export function trafficMode(env: NodeJS.ProcessEnv = process.env): RolloutMode {
  return readMode("NF_TRAFFIC_MODE", ROLLOUT_MODES, "legacy", env);
}

export function paramMode(env: NodeJS.ProcessEnv = process.env): RolloutMode {
  return readMode("NF_PARAM_MODE", ROLLOUT_MODES, "legacy", env);
}

export function protocolMode(env: NodeJS.ProcessEnv = process.env): ProtocolMode {
  return readMode("NF_PROTOCOL_MODE", ["legacy", "enforce"] as const, "legacy", env);
}

export function requireSecondApprover(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NF_CP_REQUIRE_SECOND_APPROVER || "").trim().toLowerCase() === "true";
}

export function featureFlagSnapshot(env: NodeJS.ProcessEnv = process.env) {
  return {
    NF_CP_MODE: controlPlaneMode(env),
    NF_TRAFFIC_MODE: trafficMode(env),
    NF_PARAM_MODE: paramMode(env),
    NF_PROTOCOL_MODE: protocolMode(env),
    NF_CP_REQUIRE_SECOND_APPROVER: requireSecondApprover(env),
  };
}
