import assert from "node:assert/strict";
import {
  assertSafeManagedReleaseRuntime,
  isExplicitDevelopmentFeatureEnabled,
  isContainerRuntime,
  isManagedRuntime,
  resolveBackendBindHost,
} from "../src/utils/runtime-safety";

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...values };
}

assert.equal(resolveBackendBindHost(env({ NODE_ENV: "production", HOST: "0.0.0.0" })), "127.0.0.1");
assert.equal(
  resolveBackendBindHost(env({ NODE_ENV: "development", NEXUSFLOW_RELEASE_RUNTIME: "true", HOST: "0.0.0.0" })),
  "127.0.0.1"
);
assert.equal(resolveBackendBindHost(env({ NODE_ENV: "development", HOST: "127.0.0.2" })), "127.0.0.2");
assert.equal(resolveBackendBindHost(env({ NODE_ENV: "development" })), "0.0.0.0");
assert.equal(
  resolveBackendBindHost(env({
    NODE_ENV: "production",
    NEXUSFLOW_CONTAINER_RUNTIME: "true",
    HOST: "127.0.0.1",
  })),
  "0.0.0.0"
);
assert.equal(isContainerRuntime(env({ NEXUSFLOW_CONTAINER_RUNTIME: "true" })), true);
assert.equal(isManagedRuntime(env({ NEXUSFLOW_CONTAINER_RUNTIME: "true" })), true);

assert.doesNotThrow(() => assertSafeManagedReleaseRuntime(env({
  NODE_ENV: "production",
  NEXUSFLOW_RELEASE_RUNTIME: "true",
  ENABLE_MOCK_PAYMENT: "false",
  ENABLE_SEED_API_KEYS: "false",
  USE_PG_MEM: "false",
})));
assert.throws(
  () => assertSafeManagedReleaseRuntime(env({
    NODE_ENV: "development",
    NEXUSFLOW_RELEASE_RUNTIME: "true",
  })),
  /requires NODE_ENV=production/
);
assert.throws(
  () => assertSafeManagedReleaseRuntime(env({
    NODE_ENV: "development",
    NEXUSFLOW_CONTAINER_RUNTIME: "true",
  })),
  /requires NODE_ENV=production/
);
for (const unsafeFlag of [
  "ENABLE_MOCK_PAYMENT",
  "ENABLE_SEED_API_KEYS",
  "USE_PG_MEM",
  "PROVIDER_OUTBOUND_TEST_SKIP_DNS",
]) {
  assert.throws(
    () => assertSafeManagedReleaseRuntime(env({
      NODE_ENV: "production",
      NEXUSFLOW_RELEASE_RUNTIME: "true",
      [unsafeFlag]: "true",
    })),
    /rejected an unsafe development flag/
  );
  assert.throws(
    () => assertSafeManagedReleaseRuntime(env({
      NODE_ENV: "production",
      NEXUSFLOW_CONTAINER_RUNTIME: "true",
      [unsafeFlag]: "true",
    })),
    /rejected an unsafe development flag/
  );
}
for (const proxyFlag of [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
]) {
  assert.throws(
    () => assertSafeManagedReleaseRuntime(env({
      NODE_ENV: "production",
      NEXUSFLOW_RELEASE_RUNTIME: "true",
      [proxyFlag]: "http://proxy.invalid:8080",
    })),
    /rejected an outbound proxy environment/
  );
}

assert.equal(isExplicitDevelopmentFeatureEnabled(
  "ENABLE_MOCK_PAYMENT",
  env({ NODE_ENV: "development", ENABLE_MOCK_PAYMENT: "true" })
), true);
assert.equal(isExplicitDevelopmentFeatureEnabled(
  "ENABLE_MOCK_PAYMENT",
  env({ NODE_ENV: "production", ENABLE_MOCK_PAYMENT: "true" })
), false);
assert.equal(isExplicitDevelopmentFeatureEnabled(
  "ENABLE_MOCK_PAYMENT",
  env({
    NODE_ENV: "development",
    NEXUSFLOW_RELEASE_RUNTIME: "true",
    ENABLE_MOCK_PAYMENT: "true",
  })
), false);
assert.equal(isExplicitDevelopmentFeatureEnabled(
  "ENABLE_MOCK_PAYMENT",
  env({ NODE_ENV: "development", NEXUSFLOW_ENV: "production", ENABLE_MOCK_PAYMENT: "true" })
), false);

console.log("runtime safety tests passed");
