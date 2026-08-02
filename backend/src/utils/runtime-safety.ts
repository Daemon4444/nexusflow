export type RuntimeEnvironment = NodeJS.ProcessEnv;

const FORBIDDEN_MANAGED_RELEASE_FLAGS = [
  "ENABLE_MOCK_PAYMENT",
  "ENABLE_SEED_API_KEYS",
  "USE_PG_MEM",
  "PROVIDER_OUTBOUND_TEST_SKIP_DNS",
] as const;

const FORBIDDEN_MANAGED_PROXY_FLAGS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
] as const;

export function isManagedReleaseRuntime(env: RuntimeEnvironment = process.env): boolean {
  return env.NEXUSFLOW_RELEASE_RUNTIME === "true";
}

export function isContainerRuntime(env: RuntimeEnvironment = process.env): boolean {
  return env.NEXUSFLOW_CONTAINER_RUNTIME === "true";
}

export function isManagedRuntime(env: RuntimeEnvironment = process.env): boolean {
  return isManagedReleaseRuntime(env) || isContainerRuntime(env);
}

export function isProductionRuntime(env: RuntimeEnvironment = process.env): boolean {
  return env.NODE_ENV === "production"
    || env.NEXUSFLOW_ENV === "production"
    || isManagedRuntime(env);
}

export function assertSafeManagedReleaseRuntime(env: RuntimeEnvironment = process.env): void {
  if (!isManagedRuntime(env)) return;
  if (env.NODE_ENV !== "production") {
    throw new Error("Managed runtime requires NODE_ENV=production");
  }
  if (FORBIDDEN_MANAGED_RELEASE_FLAGS.some((key) => env[key] === "true")) {
    throw new Error("Managed runtime rejected an unsafe development flag");
  }
  if (FORBIDDEN_MANAGED_PROXY_FLAGS.some((key) => !!env[key]?.trim())) {
    throw new Error("Managed runtime rejected an outbound proxy environment");
  }
}

/**
 * Production backends are reverse-proxy-only. An environment variable cannot
 * accidentally reopen the API server on a public interface.
 */
export function resolveBackendBindHost(env: RuntimeEnvironment = process.env): string {
  if (isContainerRuntime(env)) return "0.0.0.0";
  return isProductionRuntime(env) ? "127.0.0.1" : (env.HOST || "0.0.0.0");
}

export function isExplicitDevelopmentFeatureEnabled(
  flag: string,
  env: RuntimeEnvironment = process.env
): boolean {
  return env[flag] === "true" && !isProductionRuntime(env);
}
