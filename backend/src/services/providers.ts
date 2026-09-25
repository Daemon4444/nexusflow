/**
 * Provider Configuration
 *
 * Provider routing for first-party and aggregator channels.
 */

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  models: string[];  // Model ID prefixes or exact matches
}

export const HIMODELS_PUBLIC_MODEL_IDS: readonly string[] = Object.freeze([
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-opus-4-8",
  "claude-opus-5",
]);

export function isHiModelsPublicModel(modelId: string): boolean {
  return HIMODELS_PUBLIC_MODEL_IDS.includes(modelId);
}

export const providers: ProviderConfig[] = [
  {
    id: "himodels",
    name: "HiModels",
    baseUrl: "https://api.himodels.ai/v1",
    apiKeyEnv: "HIMODELS_API_KEY",
    models: [...HIMODELS_PUBLIC_MODEL_IDS],
  },
  {
    id: "azure-ai-foundry",
    name: "Azure AI Foundry",
    baseUrl: "https://developerhelena-1129-resource.services.ai.azure.com/openai/v1",
    apiKeyEnv: "AZURE_AI_FOUNDRY_API_KEY",
    models: ["gpt-6-astra"],
  },
  // 阿里云百炼 (DashScope) - 统一入口
  // 支持通义千问、DeepSeek、GLM、Kimi、MiniMax、HappyHorse、PixVerse 等当前已接入模型
  {
    id: "dashscope",
    name: "阿里云百炼",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    models: [
      // 通义千问系列
      "qwen", "qwq", "wan", "wanx", "tongyi",
      // 向量
      "text-embedding", "cosyvoice", "paraformer",
      // DeepSeek (百炼代理)
      "deepseek",
      // GLM 智谱AI (百炼代理)
      "glm",
      // Kimi 月之暗面 (百炼代理)
      "kimi",
      // MiniMax (百炼代理)
      "MiniMax",
      // PixVerse 视频
      "pixverse",
      // HappyHorse 快乐小马 视频
      "happyhorse",
    ],
  },
  // 火山方舟 (Volcengine Ark) - Seedance 视频生成
  {
    id: "volcengine-ark",
    name: "火山方舟",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiKeyEnv: "ARK_API_KEY",
    models: [
      // Seedance 系列视频生成
      "seedance",
    ],
  },
];

export function findProvider(modelId: string): ProviderConfig | null {
  return providers.find((provider) =>
    provider.models.some((modelPattern) => modelId === modelPattern || modelId.startsWith(modelPattern))
  ) || null;
}

export function isProviderModelCompatible(providerId: string, modelId: string): boolean {
  if (modelId.startsWith("claude-")) return providerId === "himodels" && isHiModelsPublicModel(modelId);
  if (modelId === "gpt-6-astra") return providerId === "azure-ai-foundry";
  return true;
}

export function getProviderAuthHeaders(
  providerId: string,
  apiKey: string
): Record<string, string> {
  if (providerId === "azure-ai-foundry") {
    return { "api-key": apiKey };
  }
  return { Authorization: `Bearer ${apiKey}` };
}

/**
 * Get API key for a provider
 */
export function getProviderApiKey(provider: ProviderConfig): string {
  return process.env[provider.apiKeyEnv] || "";
}

/**
 * The provider that the legacy bootstrap (`ensureRoutingDefaults`) assigns to
 * a catalog model. `jawayid-k3` is only used when that managed provider
 * exists; callers without database access pass `jawayK3Available` explicitly.
 * Kept as one function so the control-plane backfill and catalog tooling
 * reproduce exactly the legacy branching.
 */
export function legacyRoutedProviderId(
  modelId: string,
  options: { jawayK3Available: boolean } = { jawayK3Available: true }
): string | null {
  if (modelId === "kimi-k3") return options.jawayK3Available ? "jawayid-k3" : null;
  if (isHiModelsPublicModel(modelId)) return "himodels";
  if (modelId === "gpt-6-astra") return "azure-ai-foundry";
  if (modelId.startsWith("seedance-")) return "volcengine-ark";
  return "dashscope";
}

export async function ensureRoutingDefaults(): Promise<void> {
  const { ensureProvider, getCapacity, getProviderById, upsertCapacity } = require("../data/providers") as typeof import("../data/providers");
  const { models } = require("../data/models") as typeof import("../data/models");
  const dashscopeConfig = providers.find((provider) => provider.id === "dashscope")!;
  const himodelsConfig = providers.find((provider) => provider.id === "himodels")!;
  const azureConfig = providers.find((provider) => provider.id === "azure-ai-foundry")!;
  const volcengineArkConfig = providers.find((provider) => provider.id === "volcengine-ark")!;
  const dashscope = await ensureProvider({
    id: dashscopeConfig.id,
    name: dashscopeConfig.name,
    slug: dashscopeConfig.id,
    description: "百炼 OpenAI 兼容模式渠道。",
    website: "https://help.aliyun.com/zh/model-studio/",
    api_base_url: dashscopeConfig.baseUrl,
    api_key: getProviderApiKey(dashscopeConfig),
    contact_name: "平台运营",
    contact_email: "ops@nexusflow.hk",
    status: "enabled",
  });
  const himodels = await ensureProvider({
    id: himodelsConfig.id,
    name: himodelsConfig.name,
    slug: himodelsConfig.id,
    description: "HiModels 原生 Anthropic Messages 兼容渠道，承载 Claude 系列模型。",
    website: "https://himodels.ai/",
    api_base_url: himodelsConfig.baseUrl,
    api_key: "",
    contact_name: "平台运营",
    contact_email: "ops@nexusflow.hk",
    status: "disabled",
  });
  const azure = await ensureProvider({
    id: azureConfig.id,
    name: azureConfig.name,
    slug: azureConfig.id,
    description: "Azure OpenAI v1 渠道，承载 GPT-6 Astra。",
    website: "https://azure.microsoft.com/products/ai-foundry/",
    api_base_url: azureConfig.baseUrl,
    api_key: "",
    contact_name: "平台运营",
    contact_email: "ops@nexusflow.hk",
    status: "disabled",
  });
  const volcengineArk = await ensureProvider({
    id: volcengineArkConfig.id,
    name: volcengineArkConfig.name,
    slug: volcengineArkConfig.id,
    description: "火山引擎方舟 OpenAI 兼容渠道，可在后台按模型添加路由。",
    website: "https://www.volcengine.com/product/ark",
    api_base_url: volcengineArkConfig.baseUrl,
    api_key: getProviderApiKey(volcengineArkConfig),
    contact_name: "平台运营",
    contact_email: "ops@nexusflow.hk",
    status: "enabled",
  });
  // K3 使用独立受管 Provider。密钥只存在数据库密文中；若生产尚未预置该
  // Provider，则保持无路由并失败关闭，绝不能重新种回 DashScope。
  const jawayK3 = await getProviderById("jawayid-k3");
  const providersById: Record<string, { id: string } | null> = {
    "jawayid-k3": jawayK3,
    himodels,
    "azure-ai-foundry": azure,
    "volcengine-ark": volcengineArk,
    dashscope,
  };
  for (const model of models) {
    const routedProviderId = legacyRoutedProviderId(model.id, { jawayK3Available: !!jawayK3 });
    const routedProvider = routedProviderId ? providersById[routedProviderId] : null;
    if (!routedProvider) continue;
    if (await getCapacity(routedProvider.id, model.id)) continue;
    await upsertCapacity(routedProvider.id, model.id, legacyDefaultCapacity(model));
  }
}

/** The capacity row ensureRoutingDefaults() seeds for a catalog model. */
export function legacyDefaultCapacity(model: { id: string; category: string }) {
  const isTaskModel = model.category === "图像生成" || model.category === "视频生成" || model.category === "语音模型";
  const isAstra = model.id === "gpt-6-astra";
  return {
    rpm_limit: 1000,
    tpm_limit: isAstra ? 1_000_000 : isTaskModel ? 0 : 1000000,
    daily_limit: isAstra ? 0 : 100000,
    concurrent_limit: isAstra ? 0 : isTaskModel ? 10 : 0,
    priority: isAstra ? 100 : 10,
    weight: 100,
    is_enabled: !isHiModelsPublicModel(model.id) && !isAstra,
  };
}

export function getResolvedProviderApiKey(provider: ProviderConfig): string {
  const dynamicKey = (provider as ProviderConfig & { apiKey?: string }).apiKey;
  return dynamicKey || getProviderApiKey(provider);
}

/**
 * Check if provider is configured (has API key)
 */
export function isProviderConfigured(provider: ProviderConfig): boolean {
  return !!process.env[provider.apiKeyEnv];
}

/**
 * Get all configured providers
 */
export function getConfiguredProviders(): ProviderConfig[] {
  return providers.filter(isProviderConfigured);
}
