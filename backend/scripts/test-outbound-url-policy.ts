import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  assertProviderOutboundPolicyConfigured,
  assertRedirectBlocked,
  assertSafeOutboundUrl,
  createRestrictedLookup,
  DEFAULT_PROVIDER_OUTBOUND_HOSTS,
  isPublicUnicastAddress,
  OutboundUrlPolicyError,
  parseAndValidateOutboundUrl,
  NOTIFIER_HOSTS,
  UPSTREAM_CATALOG_HOSTS,
  safeNotifierFetch,
  safeUpstreamCatalogFetch,
  setOutboundTestTransport,
} from "../src/services/outbound-url-policy";
import {
  createProvider,
  getProviderById,
  updateProvider,
  updateProviderStatus,
} from "../src/data/providers";
import { upsertProviderChannel } from "../src/data/provider-channels";
import { closeDb, db } from "../src/db/client";
import { buildResponseInputItemsUrl } from "../src/routes/responses";

const allowed = new Set(["allowed.example"]);
const publicV4 = { address: "93.184.216.34", family: 4 };
const publicV6 = { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 };

function assertBlocked(action: () => unknown, pattern?: RegExp): void {
  assert.throws(action, (error: unknown) =>
    error instanceof OutboundUrlPolicyError
    && (!pattern || pattern.test(error.message))
  );
}

async function assertBlockedAsync(action: () => Promise<unknown>, pattern?: RegExp): Promise<void> {
  await assert.rejects(action, (error: unknown) =>
    error instanceof OutboundUrlPolicyError
    && (!pattern || pattern.test(error.message))
  );
}

function listTypeScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? listTypeScriptFiles(absolute) : entry.name.endsWith(".ts") ? [absolute] : [];
  });
}

async function main(): Promise<void> {
  assert.ok(DEFAULT_PROVIDER_OUTBOUND_HOSTS.includes("api.himodels.ai"));
  assert.ok(DEFAULT_PROVIDER_OUTBOUND_HOSTS.includes("api.anthropic.com"));
  assert.equal(
    parseAndValidateOutboundUrl("https://api.himodels.ai/v1", {
      allowlist: new Set(DEFAULT_PROVIDER_OUTBOUND_HOSTS),
    }).hostname,
    "api.himodels.ai"
  );
  assert.equal(isPublicUnicastAddress(publicV4.address), true);
  assert.equal(isPublicUnicastAddress(publicV6.address), true);
  for (const unsafe of [
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "100.100.100.200",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
  ]) {
    assert.equal(isPublicUnicastAddress(unsafe), false, `${unsafe} must be blocked`);
  }

  assert.equal(
    parseAndValidateOutboundUrl("https://allowed.example/v1", { allowlist: allowed }).hostname,
    "allowed.example"
  );
  assertBlocked(
    () => parseAndValidateOutboundUrl("https://allowed.example.evil.test/v1", { allowlist: allowed }),
    /not allowlisted/
  );
  assertBlocked(
    () => parseAndValidateOutboundUrl("http://allowed.example/v1", { allowlist: allowed }),
    /HTTPS/
  );
  assertBlocked(
    () => parseAndValidateOutboundUrl("https://user:pass@allowed.example/v1", { allowlist: allowed }),
    /credentials/
  );
  assertBlocked(
    () => parseAndValidateOutboundUrl("https://allowed.example:8443/v1", { allowlist: allowed }),
    /non-standard HTTPS port is not allowlisted/
  );
  assert.equal(
    parseAndValidateOutboundUrl("https://allowed.example:8443/v1", {
      allowlist: allowed,
      env: { PROVIDER_OUTBOUND_ENDPOINT_ALLOWLIST: "allowed.example:8443" },
    }).port,
    "8443"
  );
  assertBlocked(
    () => parseAndValidateOutboundUrl("https://other.example:8443/v1", {
      allowlist: new Set(["other.example"]),
      env: { PROVIDER_OUTBOUND_ENDPOINT_ALLOWLIST: "allowed.example:8443" },
    }),
    /non-standard HTTPS port is not allowlisted/
  );
  assertBlocked(
    () => parseAndValidateOutboundUrl("https://allowed.example:8444/v1", {
      allowlist: allowed,
      env: { PROVIDER_OUTBOUND_ENDPOINT_ALLOWLIST: "allowed.example:8443" },
    }),
    /non-standard HTTPS port is not allowlisted/
  );
  assertBlocked(
    () => parseAndValidateOutboundUrl("https://allowed.example/v1?next=http://127.0.0.1", { allowlist: allowed }),
    /query/
  );
  const runtimeUrl = parseAndValidateOutboundUrl(
    "https://allowed.example/v1?after=item_1&limit=20&order=desc",
    { allowlist: allowed, usage: "runtime-request" }
  );
  assert.equal(runtimeUrl.searchParams.get("after"), "item_1");
  assert.equal(runtimeUrl.searchParams.get("limit"), "20");
  assertBlocked(
    () => parseAndValidateOutboundUrl(
      "https://allowed.example/v1?after=item_1#fragment",
      { allowlist: allowed, usage: "runtime-request" }
    ),
    /fragment/
  );
  for (const encodedLoopback of [
    "https://127.0.0.1/",
    "https://2130706433/",
    "https://0x7f000001/",
    "https://[::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://100.100.100.200/",
  ]) {
    assertBlocked(
      () => parseAndValidateOutboundUrl(encodedLoopback, { allowlist: allowed }),
      /not public|allowlisted hostname|invalid/
    );
  }

  const inputItemsUrl = buildResponseInputItemsUrl(
    "https://allowed.example/v1",
    "resp/encoded",
    {
      after: "item/1",
      limit: "50",
      order: "asc",
      ignored: "https://127.0.0.1/",
    }
  );
  assert.equal(
    inputItemsUrl,
    "https://allowed.example/v1/responses/resp%2Fencoded/input_items?after=item%2F1&limit=50&order=asc"
  );
  const validatedInputItemsUrl = parseAndValidateOutboundUrl(inputItemsUrl, {
    allowlist: allowed,
    usage: "runtime-request",
  });
  assert.equal(validatedInputItemsUrl.hostname, "allowed.example");
  assert.equal(validatedInputItemsUrl.searchParams.has("ignored"), false);

  await assertSafeOutboundUrl("https://allowed.example/v1", {
    allowlist: allowed,
    resolver: async () => [publicV4, publicV6],
  });
  await assertBlockedAsync(
    () => assertSafeOutboundUrl("https://allowed.example/v1", {
      allowlist: allowed,
      resolver: async () => [publicV4, { address: "10.0.0.4", family: 4 }],
    }),
    /non-public/
  );
  // A CNAME is safe only if every final A/AAAA target is public.
  await assertBlockedAsync(
    () => assertSafeOutboundUrl("https://allowed.example/v1", {
      allowlist: allowed,
      resolver: async () => [{ address: "169.254.169.254", family: 4 }],
    }),
    /non-public/
  );

  // Rebinding is checked again inside the socket lookup, not only during URL
  // preflight. A public first answer followed by a private answer is rejected.
  let rebindingLookup = 0;
  const rebindingResolver = async () => {
    rebindingLookup += 1;
    return rebindingLookup === 1
      ? [publicV4]
      : [{ address: "127.0.0.1", family: 4 }];
  };
  await assertSafeOutboundUrl("https://allowed.example/v1", {
    allowlist: allowed,
    resolver: rebindingResolver,
  });
  const restrictedLookup = createRestrictedLookup(rebindingResolver);
  await assert.rejects(
    new Promise<void>((resolve, reject) => {
      restrictedLookup("allowed.example", {}, (error) => error ? reject(error) : resolve());
    }),
    /non-public/
  );

  // Node 20+ / Undici invokes custom socket lookup with `all: true`. The
  // callback must then receive an address array, not the legacy scalar tuple.
  const allAddressLookup = createRestrictedLookup(async () => [publicV6, publicV4]);
  const allAddresses = await new Promise<Array<{ address: string; family: number }>>(
    (resolve, reject) => {
      allAddressLookup(
        "allowed.example",
        { all: true, order: "ipv4first" },
        (error, address) => {
          if (error) {
            reject(error);
            return;
          }
          if (!Array.isArray(address)) {
            reject(new Error("all-address lookup returned a scalar result"));
            return;
          }
          resolve(address);
        }
      );
    }
  );
  assert.deepEqual(allAddresses, [publicV4, publicV6]);

  const ipv6Only = await new Promise<{ address: string; family: number }>(
    (resolve, reject) => {
      allAddressLookup(
        "allowed.example",
        { family: "IPv6" },
        (error, address, family) => {
          if (error) {
            reject(error);
            return;
          }
          if (typeof address !== "string" || family === undefined) {
            reject(new Error("single-address lookup returned an array result"));
            return;
          }
          resolve({ address, family });
        }
      );
    }
  );
  assert.deepEqual(ipv6Only, publicV6);

  await assert.rejects(
    new Promise<void>((resolve, reject) => {
      createRestrictedLookup(async () => [publicV4])(
        "allowed.example",
        { family: 6 },
        (error) => error ? reject(error) : resolve()
      );
    }),
    /no address for requested family/
  );

  assertBlocked(
    () => assertRedirectBlocked(
      302,
      "http://169.254.169.254/latest/meta-data/",
      "https://allowed.example/v1"
    ),
    /redirect is disabled/
  );
  assert.doesNotThrow(() => assertRedirectBlocked(200, null, "https://allowed.example/v1"));

  assert.throws(
    () => assertProviderOutboundPolicyConfigured({
      NODE_ENV: "production",
      NEXUSFLOW_RELEASE_RUNTIME: "true",
    }),
    /PROVIDER_OUTBOUND_HOST_ALLOWLIST/
  );
  assert.doesNotThrow(() => assertProviderOutboundPolicyConfigured({
    NODE_ENV: "production",
    NEXUSFLOW_RELEASE_RUNTIME: "true",
    PROVIDER_OUTBOUND_HOST_ALLOWLIST: "dashscope.aliyuncs.com",
  }));
  assert.throws(
    () => assertProviderOutboundPolicyConfigured({
      NODE_ENV: "production",
      PROVIDER_OUTBOUND_HOST_ALLOWLIST: "dashscope.aliyuncs.com",
      HTTPS_PROXY: "http://proxy.internal:8080",
    }),
    /forbids outbound proxy/
  );

  // Data-layer guards cover callers that bypass the HTTP routes.
  const before = Number((await db.queryOne<{ cnt: string | number }>(
    "SELECT COUNT(*) AS cnt FROM providers"
  ))?.cnt || 0);
  await assert.rejects(
    createProvider({
      name: "blocked-private-provider",
      api_base_url: "https://127.0.0.1/v1",
      api_key: "test",
      contact_name: "test",
      contact_email: "test@nexusflow.test",
    }),
    /not public|allowlisted hostname/
  );
  assert.equal(
    Number((await db.queryOne<{ cnt: string | number }>(
      "SELECT COUNT(*) AS cnt FROM providers"
    ))?.cnt || 0),
    before
  );
  const safeProvider = await createProvider({
    name: "safe-outbound-provider",
    api_base_url: "https://dashscope.aliyuncs.com/ssrf-test/v1",
    api_key: "test",
    contact_name: "test",
    contact_email: "safe-outbound@nexusflow.test",
  });
  assert.equal(await updateProviderStatus(safeProvider.id, "enabled"), true);
  await assert.rejects(
    updateProvider(safeProvider.id, { api_base_url: "https://169.254.169.254/latest" }),
    /not public|allowlisted hostname/
  );
  assert.equal(
    (await getProviderById(safeProvider.id))?.api_base_url,
    "https://dashscope.aliyuncs.com/ssrf-test/v1"
  );
  const unsafeChannel = await upsertProviderChannel(safeProvider.id, "unsafe", {
    name: "unsafe",
    adapter: "dashscope",
    api_base_url: "https://[::1]/v1",
    api_key: "test",
    enabled: true,
  });
  assert("error" in unsafeChannel);

  // Fixed-purpose allowlists (P0/P1): catalog sync and notifier may reach
  // only their own hosts, never provider or arbitrary hosts, and never HTTP.
  assert.deepEqual([...UPSTREAM_CATALOG_HOSTS].sort(), ["dashscope.aliyuncs.com", "help.aliyun.com"]);
  assert.deepEqual([...NOTIFIER_HOSTS], ["open.feishu.cn"]);
  await assertBlockedAsync(() => safeUpstreamCatalogFetch("https://api.himodels.ai/v1/models"), /not allowlisted/);
  await assertBlockedAsync(() => safeUpstreamCatalogFetch("http://help.aliyun.com/zh/model-studio/rate-limit"), /HTTPS/);
  await assertBlockedAsync(() => safeUpstreamCatalogFetch("https://169.254.169.254/latest"), /./);
  await assertBlockedAsync(() => safeNotifierFetch("https://www.feishu.cn/flow/api/trigger-webhook/x"), /not allowlisted/);
  await assertBlockedAsync(() => safeNotifierFetch("https://open.feishu.cn:8443/open-apis"), /port/);

  // The characterization-test transport can never be installed in production.
  {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      assert.throws(() => setOutboundTestTransport(async () => new Response("")), OutboundUrlPolicyError);
    } finally {
      process.env.NODE_ENV = saved;
    }
  }

  // Static regression gate: provider-origin HTTP must go through the common
  // safe wrapper; no raw global fetch call may reappear elsewhere.
  const sourceRoot = path.resolve(__dirname, "../src");
  const rawFetchFiles = listTypeScriptFiles(sourceRoot)
    .filter((file) => !file.endsWith("outbound-url-policy.ts"))
    .filter((file) => /\bfetch\s*\(/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(rawFetchFiles, []);

  console.log("outbound URL policy security checks passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
