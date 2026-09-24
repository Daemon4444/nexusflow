import assert from "node:assert/strict";
import { RedisMemoryServer } from "redis-memory-server";

process.env.USE_PG_MEM = "true";
process.env.PROVIDER_SECRET_KEY =
  process.env.PROVIDER_SECRET_KEY || "test-only-provider-secret-key-000000000000000000000000";
process.env.DASHSCOPE_API_KEY = "legacy-static-key";
process.env.HIMODELS_API_KEY = "legacy-static-himodels-key";
process.env.PROVIDER_OUTBOUND_HOST_ALLOWLIST = [
  "managed-primary.example.invalid",
  "managed-pinned.example.invalid",
  "provider-fallback.example.invalid",
  "channel-only.example.invalid",
  "api.anthropic.com",
  "api.himodels.ai",
  "dashscope.aliyuncs.com",
].join(",");

async function main(): Promise<void> {
  const redisServer = new RedisMemoryServer({
    binary: { version: "7.2.7" },
  });
  let closeDb: undefined | (() => Promise<void>);
  try {
    process.env.REDIS_HOST = await redisServer.getHost();
    process.env.REDIS_PORT = String(await redisServer.getPort());
    process.env.REDIS_PASSWORD = "";

  ({ closeDb } = await import("../src/db/client"));
  const {
    ensureProvider,
    upsertCapacity,
  } = await import("../src/data/providers");
  const { upsertRoutePolicy } = await import("../src/data/provider-operations");
  const { upsertProviderChannelConfig } = await import("../src/data/provider-channels");
  const { resolveUpstream } = await import("../src/services/upstream");
  const { isProviderModelCompatible } = await import("../src/services/providers");
  const { getRedis } = await import("../src/services/redis");

  await ensureProvider({
    id: "managed-primary",
    name: "Managed Primary",
    slug: "managed-primary",
    api_base_url: "https://managed-primary.example.invalid/v1",
    api_key: "managed-primary-secret",
    contact_name: "Test",
    contact_email: "routing-primary@example.invalid",
    status: "enabled",
  });
  await ensureProvider({
    id: "managed-pinned",
    name: "Managed Pinned",
    slug: "managed-pinned",
    api_base_url: "https://managed-pinned.example.invalid/v1",
    api_key: "managed-pinned-secret",
    contact_name: "Test",
    contact_email: "routing-pinned@example.invalid",
    status: "enabled",
  });

  await upsertCapacity("managed-primary", "qwen3.5-flash", {
    rpm_limit: 100,
    tpm_limit: 100_000,
    daily_limit: 1_000,
    concurrent_limit: 0,
    priority: 100,
    weight: 100,
    is_enabled: true,
  });

  const managed = await resolveUpstream("qwen3.5-flash", { userId: "local-user-1" });
  assert.equal(managed.ok, true, JSON.stringify(managed));
  if (managed.ok) {
    assert.equal(managed.upstream.providerId, "managed-primary");
    assert.equal(managed.upstream.baseUrl, "https://managed-primary.example.invalid/v1");
    assert.equal(managed.upstream.managed, true);
  }

  // A managed route is authoritative. Disabling it must not silently fall
  // through to DASHSCOPE_API_KEY and bypass the admin control plane.
  await upsertCapacity("managed-primary", "qwen3.5-flash", { is_enabled: false });
  const disabled = await resolveUpstream("qwen3.5-flash", { userId: "local-user-1" });
  assert.equal(disabled.ok, false);
  if (!disabled.ok) {
    assert.equal(disabled.status, 503);
    assert.equal(disabled.code, "provider_unavailable");
  }

  await upsertCapacity("managed-primary", "qwen3.5-flash", { is_enabled: true });
  await upsertCapacity("managed-pinned", "qwen3.5-flash", {
    rpm_limit: 100,
    tpm_limit: 100_000,
    daily_limit: 1_000,
    concurrent_limit: 0,
    priority: 1,
    weight: 1,
    is_enabled: true,
  });
  await upsertRoutePolicy({
    userId: "local-user-1",
    modelId: "qwen3.5-flash",
    strategy: "pinned",
    pinnedProviderId: "managed-pinned",
    notes: "managed routing integration test",
  });

  const pinned = await resolveUpstream("qwen3.5-flash", { userId: "local-user-1" });
  assert.equal(pinned.ok, true);
  if (pinned.ok) {
    assert.equal(pinned.upstream.providerId, "managed-pinned");
    assert.equal(pinned.upstream.managed, true);
  }

  await ensureProvider({
    id: "managed-channel-only",
    name: "Managed Channel Only",
    slug: "managed-channel-only",
    api_base_url: "https://provider-fallback.example.invalid/v1",
    api_key: "",
    contact_name: "Test",
    contact_email: "routing-channel@example.invalid",
    status: "enabled",
  });
  await upsertCapacity("managed-channel-only", "channel-only-model", {
    rpm_limit: 100,
    tpm_limit: 100_000,
    daily_limit: 1_000,
    concurrent_limit: 0,
    priority: 100,
    weight: 100,
    is_enabled: true,
  });
  await upsertProviderChannelConfig("managed-channel-only", {
    active_channel: "owned-key",
    channels: {
      "owned-key": {
        name: "Channel-owned credential",
        adapter: "dashscope",
        api_base_url: "https://channel-only.example.invalid/v1",
        api_key: "channel-only-secret",
        region: "global",
        enabled: true,
      },
    },
  });
  const channelOnly = await resolveUpstream("channel-only-model");
  assert.equal(channelOnly.ok, true);
  if (channelOnly.ok) {
    assert.equal(channelOnly.upstream.providerId, "managed-channel-only");
    assert.equal(channelOnly.upstream.channelId, "owned-key");
    assert.equal(channelOnly.upstream.apiKey, "channel-only-secret");
  }

  const redis = getRedis();
  const channelOnlyTpmEventsKey =
    "provider-capacity:v2:tpm-events:provider:managed-channel-only:channel-only-model";

  // A single inconsistent Redis read must recover inside the bounded retry
  // budget without bypassing the cross-node capacity truth source.
  await redis.set(channelOnlyTpmEventsKey, "wrong-type");
  const repairTimer = setTimeout(() => {
    void redis.del(channelOnlyTpmEventsKey);
  }, 10);
  const recoveredCapacityState = await resolveUpstream("channel-only-model");
  clearTimeout(repairTimer);
  assert.equal(recoveredCapacityState.ok, true, JSON.stringify(recoveredCapacityState));

  // Persistent invalid state remains fail-closed and now exposes the precise
  // machine-readable reason instead of collapsing into provider_unavailable.
  await redis.set(channelOnlyTpmEventsKey, "wrong-type");
  const unavailableCapacityState = await resolveUpstream("channel-only-model");
  assert.equal(unavailableCapacityState.ok, false);
  if (!unavailableCapacityState.ok) {
    assert.equal(unavailableCapacityState.status, 503);
    assert.equal(unavailableCapacityState.code, "provider_capacity_store_unavailable");
  }
  await redis.del(channelOnlyTpmEventsKey);

  // Claude uses the encrypted managed-provider row at runtime. No real secret or
  // official Anthropic fallback is involved in this test.
  await ensureProvider({
    id: "himodels",
    name: "HiModels",
    slug: "himodels",
    api_base_url: "https://api.himodels.ai/v1",
    api_key: "test-only-himodels-secret",
    contact_name: "Test",
    contact_email: "routing-himodels@example.invalid",
    status: "enabled",
  });
  await upsertCapacity("himodels", "claude-haiku-4-5", {
    rpm_limit: 100,
    tpm_limit: 100_000,
    daily_limit: 1_000,
    concurrent_limit: 0,
    priority: 100,
    weight: 100,
    is_enabled: true,
  });
  const claude = await resolveUpstream("claude-haiku-4-5");
  assert.equal(claude.ok, true, JSON.stringify(claude));
  if (claude.ok) {
    assert.equal(claude.upstream.providerId, "himodels");
    assert.equal(claude.upstream.baseUrl, "https://api.himodels.ai/v1");
    assert.equal(claude.upstream.apiKey, "test-only-himodels-secret");
    assert.equal(claude.upstream.managed, true);
  }

  await ensureProvider({
    id: "anthropic",
    name: "Legacy Anthropic",
    slug: "anthropic",
    api_base_url: "https://api.anthropic.com/v1",
    api_key: "test-only-legacy-anthropic-secret",
    contact_name: "Test",
    contact_email: "routing-anthropic@example.invalid",
    status: "enabled",
  });
  assert.equal(isProviderModelCompatible("anthropic", "claude-haiku-4-5"), false);
  assert.equal(isProviderModelCompatible("himodels", "claude-haiku-4-5"), true);
  assert.equal(isProviderModelCompatible("himodels", "claude-opus-4-7"), false);
  assert.equal(isProviderModelCompatible("himodels", "claude-fable-5"), false);
  await upsertCapacity("anthropic", "claude-haiku-4-5", {
    rpm_limit: 100,
    tpm_limit: 100_000,
    daily_limit: 1_000,
    concurrent_limit: 0,
    priority: 1_000,
    weight: 1_000,
    is_enabled: true,
  });
  const noLegacyFallback = await resolveUpstream("claude-haiku-4-5");
  assert.equal(noLegacyFallback.ok, true, JSON.stringify(noLegacyFallback));
  if (noLegacyFallback.ok) assert.equal(noLegacyFallback.upstream.providerId, "himodels");

  await upsertCapacity("himodels", "claude-haiku-4-5", { is_enabled: false });
  const disabledHiModels = await resolveUpstream("claude-haiku-4-5");
  assert.equal(disabledHiModels.ok, false);
  if (!disabledHiModels.ok) assert.equal(disabledHiModels.code, "provider_unavailable");
  const noStaticHiModelsFallback = await resolveUpstream("claude-sonnet-5");
  assert.equal(noStaticHiModelsFallback.ok, false);
  if (!noStaticHiModelsFallback.ok) assert.equal(noStaticHiModelsFallback.code, "provider_unavailable");

  // Models without any managed row retain the legacy fallback during rollout.
  const legacy = await resolveUpstream("qwen-plus");
  assert.equal(legacy.ok, true);
  if (legacy.ok) assert.equal(legacy.upstream.managed, false);

  console.log("managed routing integration checks passed");
  } finally {
    const { closeRedis } = await import("../src/services/redis");
    await closeRedis().catch(() => undefined);
    if (closeDb) await closeDb().catch(() => undefined);
    await redisServer.stop();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
