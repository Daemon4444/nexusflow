/**
 * Deterministic backfill of the first control-plane version from the legacy
 * sources (P3). Same input → same output (no clocks, sorted collections).
 *
 * Sources: static catalog + model_overrides, providers, provider_capacity,
 * provider_channel_configs (presence only), the ensureRoutingDefaults
 * branching (legacyRoutedProviderId / legacyDefaultCapacity), upstream model
 * aliases, protocol declarations and the P1b Bailian snapshot (quota pools).
 */
import type { AIModel } from "../data/models";
import { computeEffectiveModelsFrom, type ModelOverrideRow } from "../data/model-overrides";
import { legacyDefaultCapacity, legacyRoutedProviderId, providers as codeProviders } from "../services/providers";
import { getUpstreamModelId } from "../utils/upstream-model-aliases";
import { supportsResponsesApi } from "../utils/model-protocols";
import { detectModelType } from "../services/adapters";
import { PROVIDER_ADAPTERS, type UpstreamAdapter } from "../pipeline/adapters";
import type { BailianSnapshot } from "../services/upstream-catalog/bailian/snapshot";
import { cpModelFromAIModel, legacyProtocols } from "./mapping";
import {
  CHAT_PROTOCOLS,
  normalizeContent,
  type ControlPlaneContent,
  type CpAccount,
  type CpProtocol,
  type CpQuotaPool,
  type CpRoute,
  type CpTrafficPolicy,
} from "./schema";

export interface LegacyCapacityRow {
  provider_id: string;
  model_id: string;
  rpm_limit: number;
  tpm_limit: number;
  daily_limit: number;
  concurrent_limit: number;
  is_enabled: boolean;
  priority?: number;
  weight?: number;
}

export interface LegacyProviderRow {
  id: string;
  name?: string;
  api_base_url: string | null;
  status: string;
}

export interface LegacySources {
  staticModels: AIModel[];
  overrides: Array<Pick<ModelOverrideRow, "id" | "doc" | "action" | "enabled">>;
  capacity: LegacyCapacityRow[];
  /** null offline: account endpoints then come from the code registry. */
  providers: LegacyProviderRow[] | null;
  /** Provider IDs that have provider_channel_configs (multi-region channels). */
  channelProviderIds?: string[];
  bailianSnapshot?: BailianSnapshot | null;
}

export interface BackfillReport {
  skippedOrphanRoutes: Array<{ provider_id: string; model_id: string; reason: string }>;
  synthesizedRoutes: Array<{ provider_id: string; model_id: string }>;
  bridgedModels: Array<{ model_id: string; protocols: CpProtocol[] }>;
  pools: { docs: number; legacyDefault: number; shared: number };
  notes: string[];
}

interface AccountTemplate {
  vendor: string;
  base_url: string | null;
  native_base_url: string | null;
  anthropic_base_url: string | null;
  auth_scheme: CpAccount["auth_scheme"];
  region: string | null;
  is_relay: boolean;
  relay_operator: string | null;
  data_path: string | null;
}

const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1";

/** What is known about each production provider without database access. */
const ACCOUNT_TEMPLATES: Record<string, AccountTemplate> = {
  dashscope: {
    vendor: "aliyun-bailian",
    base_url: DASHSCOPE_BASE,
    native_base_url: "https://dashscope.aliyuncs.com",
    anthropic_base_url: "https://dashscope.aliyuncs.com/apps/anthropic/v1",
    auth_scheme: "bearer",
    region: "cn-beijing",
    is_relay: false,
    relay_operator: null,
    data_path: "客户数据 → NexusFlow → 阿里云百炼（华北2）",
  },
  himodels: {
    vendor: "anthropic",
    base_url: "https://api.himodels.ai/v1",
    native_base_url: "https://api.himodels.ai",
    anthropic_base_url: "https://api.himodels.ai/v1",
    auth_scheme: "x-api-key",
    region: "global",
    is_relay: true,
    relay_operator: "HiModels",
    data_path: "客户数据 → NexusFlow → HiModels（中转）→ AWS Bedrock（Anthropic Claude）",
  },
  anthropic: {
    vendor: "anthropic",
    base_url: "https://api.anthropic.com/v1",
    native_base_url: "https://api.anthropic.com",
    anthropic_base_url: "https://api.anthropic.com/v1",
    auth_scheme: "x-api-key",
    region: "global",
    is_relay: false,
    relay_operator: null,
    data_path: "客户数据 → NexusFlow → Anthropic",
  },
  "azure-ai-foundry": {
    vendor: "openai",
    base_url: "https://developerhelena-1129-resource.services.ai.azure.com/openai/v1",
    native_base_url: "https://developerhelena-1129-resource.services.ai.azure.com/openai/v1",
    anthropic_base_url: null,
    auth_scheme: "api-key",
    region: "eastus2",
    is_relay: false,
    relay_operator: null,
    data_path: "客户数据 → NexusFlow → Microsoft Azure AI Foundry（eastus2）",
  },
  "volcengine-ark": {
    vendor: "volcengine",
    base_url: "https://ark.cn-beijing.volces.com/api/v3",
    native_base_url: "https://ark.cn-beijing.volces.com/api/v3",
    anthropic_base_url: null,
    auth_scheme: "bearer",
    region: "cn-beijing",
    is_relay: false,
    relay_operator: null,
    data_path: "客户数据 → NexusFlow → 火山引擎方舟",
  },
  "volcengine-uaep1": {
    vendor: "volcengine",
    base_url: null,
    native_base_url: null,
    anthropic_base_url: null,
    auth_scheme: "bearer",
    region: "cn-beijing",
    is_relay: true,
    relay_operator: "genvia",
    data_path: "客户数据 → NexusFlow → genvia（中转）→ 火山引擎方舟（Seedance）",
  },
  "jawayid-k3": {
    vendor: "moonshot",
    base_url: null,
    native_base_url: null,
    anthropic_base_url: null,
    auth_scheme: "bearer",
    region: "global",
    is_relay: true,
    relay_operator: "jawayid",
    data_path: "客户数据 → NexusFlow → jawayid（中转）→ 月之暗面 Kimi",
  },
  pixverse: {
    vendor: "pixverse",
    base_url: "https://app-api.pixverse.ai/openapi/v2",
    native_base_url: "https://app-api.pixverse.ai/openapi/v2",
    anthropic_base_url: null,
    auth_scheme: "api-key",
    region: "global",
    is_relay: false,
    relay_operator: null,
    data_path: "客户数据 → NexusFlow → PixVerse",
  },
};

function templateFor(providerId: string, provider: LegacyProviderRow | undefined): AccountTemplate {
  const known = ACCOUNT_TEMPLATES[providerId];
  const baseUrl = provider?.api_base_url || known?.base_url || codeProviders.find((item) => item.id === providerId)?.baseUrl || null;
  if (known) {
    return {
      ...known,
      base_url: baseUrl,
      native_base_url: known.native_base_url ?? (baseUrl ? baseUrl.replace(/\/compatible-mode\/v1\/?$/, "") : null),
      anthropic_base_url: known.anthropic_base_url ?? null,
    };
  }
  // Admin-created provider without a template: conservative defaults; it is
  // flagged unverified and must be reviewed before NF_CP_MODE=enforce.
  const isDashScopeLike = !!baseUrl && baseUrl.includes("/compatible-mode/v1");
  return {
    vendor: providerId,
    base_url: baseUrl,
    native_base_url: baseUrl ? baseUrl.replace(/\/compatible-mode\/v1\/?$/, "") : null,
    anthropic_base_url: isDashScopeLike ? baseUrl!.replace(/\/compatible-mode\/v1\/?$/, "/apps/anthropic/v1") : null,
    auth_scheme: "bearer",
    region: null,
    is_relay: false,
    relay_operator: null,
    data_path: null,
  };
}

function adapterFor(providerId: string, template: AccountTemplate): UpstreamAdapter {
  if (PROVIDER_ADAPTERS[providerId]) return PROVIDER_ADAPTERS[providerId];
  if (template.base_url?.includes("pixverse.ai")) return "pixverse";
  if (template.base_url && (template.base_url.includes("volces.com") || template.base_url.includes("genvia.ai"))) return "ark-video";
  return template.base_url?.includes("/compatible-mode/v1") ? "dashscope-native" : "openai-compat";
}

/**
 * Protocols the legacy runtime serves *natively* on a route (no bridge),
 * reproducing messages.ts `usePassThrough` and the Responses allowlist.
 */
export function nativeProtocolsFor(model: AIModel, providerId: string, adapter: UpstreamAdapter, template: AccountTemplate): CpProtocol[] {
  const legacy = legacyProtocols(model);
  const type = detectModelType(model.category);
  if (type !== "chat") return legacy;
  const native: CpProtocol[] = [];
  const hasAnthropicCompat = !!template.base_url && template.base_url.includes("/compatible-mode/v1");
  const passThrough = providerId === "anthropic"
    || model.anthropicPassThrough === true
    || (hasAnthropicCompat && model.anthropicPassThrough !== false);
  if (adapter !== "anthropic" && legacy.includes("openai.chat")) native.push("openai.chat");
  if (passThrough && legacy.includes("anthropic.messages")) native.push("anthropic.messages");
  if (supportsResponsesApi(model.id) && (adapter === "dashscope-native" || adapter === "azure-openai") && legacy.includes("openai.responses")) {
    native.push("openai.responses");
  }
  return native;
}

function poolIdSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9._:\-\/]/g, "-");
}

export const DEFAULT_GLOBAL_POLICY: CpTrafficPolicy = {
  id: "policy-global",
  scope: "global",
  // Code defaults of data/ratelimits.ts (the effective production values;
  // the table default 60/100000 only applies to explicit rows).
  user_default: { qpm: 30000, tpm: 5_000_000 },
  fair_share: { max_share_per_user: 0.3 },
  overflow: {
    chat: { behavior: "failover_then_reject", retry_after_s: 5 },
    async: { behavior: "queue", max_queue_depth: 200, max_wait_s: 1800, max_queued_per_user: 10 },
  },
  circuit: {
    // Same classification and defaults as services/scheduler.ts (ca95388).
    count_http: ["5xx", "401", "403", "408", "429"],
    threshold: 10,
    cooldown_s: 60,
    half_open_probes: 1,
  },
};

export function buildBackfill(sources: LegacySources): { content: ControlPlaneContent; report: BackfillReport } {
  const report: BackfillReport = {
    skippedOrphanRoutes: [],
    synthesizedRoutes: [],
    bridgedModels: [],
    pools: { docs: 0, legacyDefault: 0, shared: 0 },
    notes: [],
  };
  const effective = computeEffectiveModelsFrom(sources.staticModels, sources.overrides as ModelOverrideRow[]);
  const modelsById = new Map(effective.map((model) => [model.id, model]));
  const providersById = new Map((sources.providers || []).map((provider) => [provider.id, provider]));

  // Capacity rows, plus the rows ensureRoutingDefaults() would seed.
  const capacity: LegacyCapacityRow[] = [...sources.capacity];
  const hasRow = new Set(capacity.map((row) => `${row.provider_id}\0${row.model_id}`));
  const providerIds = new Set([...capacity.map((row) => row.provider_id), ...providersById.keys()]);
  for (const model of effective) {
    const routed = legacyRoutedProviderId(model.id, { jawayK3Available: providerIds.has("jawayid-k3") });
    if (!routed) continue;
    if (capacity.some((row) => row.model_id === model.id)) continue;
    if (hasRow.has(`${routed}\0${model.id}`)) continue;
    capacity.push({ provider_id: routed, model_id: model.id, ...legacyDefaultCapacity(model) });
    providerIds.add(routed);
    report.synthesizedRoutes.push({ provider_id: routed, model_id: model.id });
  }

  // Accounts.
  const accounts: CpAccount[] = [];
  const templates = new Map<string, AccountTemplate>();
  for (const providerId of [...providerIds].sort()) {
    const provider = providersById.get(providerId);
    const template = templateFor(providerId, provider);
    templates.set(providerId, template);
    const rows = capacity.filter((row) => row.provider_id === providerId);
    const legacyStatus = provider
      ? provider.status === "enabled" ? "active" : "disabled"
      : rows.some((row) => row.is_enabled) ? "active" : "disabled";
    const isBailian = providerId === "dashscope";
    accounts.push({
      id: providerId,
      vendor: template.vendor,
      adapter: adapterFor(providerId, template),
      base_url: template.base_url,
      native_base_url: template.native_base_url,
      anthropic_base_url: template.anthropic_base_url,
      auth_scheme: template.auth_scheme,
      secret_ref: `legacy_provider:${providerId}`,
      region: template.region,
      is_relay: template.is_relay,
      relay_operator: template.relay_operator,
      data_path: template.data_path,
      quota: {},
      quota_source: isBailian ? (sources.bailianSnapshot ? "docs" : "legacy_default") : "unverified",
      quota_verified_at: isBailian && sources.bailianSnapshot ? sources.bailianSnapshot.fetchedAt : null,
      status: legacyStatus,
      owner: null,
      contract_ref: null,
      contact: template.is_relay ? "平台运营 ops@nexusflow.hk" : null,
      legacy_provider_id: providerId,
      legacy_channel_id: null,
    });
  }
  if ((sources.channelProviderIds || []).length) {
    report.notes.push(
      `providers with multi-region channels (${[...(sources.channelProviderIds || [])].sort().join(", ")}) map to one account each; channel/region selection stays on provider_channel_configs until accounts are split per channel`
    );
  }

  // Quota pools and routes.
  const pools = new Map<string, CpQuotaPool>();
  const routes: CpRoute[] = [];
  const snapshot = sources.bailianSnapshot || null;
  for (const row of [...capacity].sort((a, b) => `${a.provider_id}\0${a.model_id}`.localeCompare(`${b.provider_id}\0${b.model_id}`))) {
    const model = modelsById.get(row.model_id);
    if (!model) {
      report.skippedOrphanRoutes.push({ provider_id: row.provider_id, model_id: row.model_id, reason: "model is not in the catalog (P1a route_to_unknown_model)" });
      continue;
    }
    const account = accounts.find((item) => item.id === row.provider_id)!;
    const template = templates.get(row.provider_id)!;
    let quotaPoolId: string | null = null;
    if (row.provider_id === "dashscope") {
      const upstream = snapshot?.models[row.model_id]?.regions["cn-beijing"];
      if (snapshot && upstream?.poolId && snapshot.pools[upstream.poolId]) {
        const shared = snapshot.pools[upstream.poolId];
        quotaPoolId = poolIdSafe(`bailian:${upstream.poolId}`);
        if (!pools.has(quotaPoolId)) {
          pools.set(quotaPoolId, {
            id: quotaPoolId,
            account_id: "dashscope",
            name: `百炼共享池（${shared.members.join("、")}）`,
            rpm: shared.rpm || 0,
            tpm: shared.tpm || 0,
            concurrency: shared.concurrency || 0,
            daily: 0,
            source: "docs",
            verified_at: snapshot.fetchedAt,
          });
          report.pools.shared += 1;
          report.pools.docs += 1;
        }
      } else if (snapshot && upstream && !upstream.dynamic && (upstream.rpm || upstream.tpm || upstream.concurrency)) {
        quotaPoolId = poolIdSafe(`bailian:${row.model_id}`);
        pools.set(quotaPoolId, {
          id: quotaPoolId,
          account_id: "dashscope",
          name: `百炼 ${row.model_id}`,
          rpm: upstream.rpm || 0,
          tpm: upstream.tpm || 0,
          concurrency: upstream.concurrency || 0,
          daily: 0,
          source: "docs",
          verified_at: snapshot.fetchedAt,
        });
        report.pools.docs += 1;
      } else {
        quotaPoolId = poolIdSafe(`legacy:dashscope:${row.model_id}`);
        pools.set(quotaPoolId, {
          id: quotaPoolId,
          account_id: "dashscope",
          name: `沿用旧限流 ${row.model_id}`,
          rpm: row.rpm_limit,
          tpm: row.tpm_limit,
          concurrency: row.concurrent_limit,
          daily: row.daily_limit,
          source: "legacy_default",
          verified_at: null,
        });
        report.pools.legacyDefault += 1;
      }
    }
    routes.push({
      id: `${row.provider_id}:${row.model_id}`,
      model_id: row.model_id,
      account_id: row.provider_id,
      upstream_model_id: getUpstreamModelId(row.model_id, row.provider_id),
      native_protocols: nativeProtocolsFor(model, row.provider_id, account.adapter, template),
      priority: row.priority ?? legacyDefaultCapacity(model).priority,
      weight: row.weight ?? 100,
      quota_pool_id: quotaPoolId,
      // Route-level limits stay exactly the legacy provider_capacity values.
      rpm: row.rpm_limit,
      tpm: row.tpm_limit,
      concurrency: row.concurrent_limit,
      daily: row.daily_limit,
      status: row.is_enabled ? "active" : "disabled",
    });
  }
  if (!snapshot) report.notes.push("no Bailian snapshot supplied: DashScope pools keep the legacy route limits (source=legacy_default)");

  // Models: exposed chat protocols are the legacy ones that every active
  // route serves natively (D6); legacy bridged protocols are recorded so
  // NF_PROTOCOL_MODE=legacy keeps serving them.
  const models = effective.map((model) => {
    const legacy = legacyProtocols(model);
    const active = routes.filter((route) => route.model_id === model.id && route.status === "active"
      && accounts.find((account) => account.id === route.account_id)?.status === "active");
    const nativeEverywhere = (protocol: CpProtocol) =>
      active.length > 0 && active.every((route) => route.native_protocols.includes(protocol));
    const exposed = legacy.filter((protocol) => !CHAT_PROTOCOLS.has(protocol) || nativeEverywhere(protocol));
    const bridged = legacy.filter((protocol) => CHAT_PROTOCOLS.has(protocol) && !nativeEverywhere(protocol));
    if (bridged.length && active.length) report.bridgedModels.push({ model_id: model.id, protocols: bridged });
    return cpModelFromAIModel(model, { lifecycle: "active", protocols: exposed, bridged: active.length ? bridged : undefined });
  });

  const content = normalizeContent({
    schema_version: 1,
    models,
    accounts,
    pools: [...pools.values()],
    routes,
    policies: [DEFAULT_GLOBAL_POLICY],
  });
  report.skippedOrphanRoutes.sort((a, b) => `${a.provider_id}/${a.model_id}`.localeCompare(`${b.provider_id}/${b.model_id}`));
  return { content, report };
}
