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

export const providers: ProviderConfig[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    models: ["claude-"],
  },
  // Aliyun Bailian (DashScope) - unified entrypoint
  // Supports Qwen, DeepSeek, GLM, Kimi, MiniMax, HappyHorse, PixVerse and other currently integrated models
  {
    id: "dashscope",
    name: "Aliyun Bailian",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    models: [
      // Qwen series
      "qwen", "qwq", "wan", "wanx", "tongyi",
      // Embeddings / audio
      "text-embedding", "cosyvoice", "paraformer",
      // DeepSeek (Bailian proxy)
      "deepseek",
      // GLM Zhipu AI (Bailian proxy)
      "glm",
      // Kimi Moonshot (Bailian proxy)
      "kimi",
      // MiniMax (Bailian proxy)
      "MiniMax",
      // PixVerse video
      "pixverse",
      // HappyHorse video
      "happyhorse",
    ],
  },
];

export function findProvider(modelId: string): ProviderConfig | null {
  return providers.find((provider) =>
    provider.models.some((modelPattern) => modelId === modelPattern || modelId.startsWith(modelPattern))
  ) || null;
}

/**
 * Get API key for a provider
 */
export function getProviderApiKey(provider: ProviderConfig): string {
  return process.env[provider.apiKeyEnv] || "";
}

export async function ensureRoutingDefaults(): Promise<void> {
  const { ensureProvider, getCapacity, upsertCapacity } = require("../data/providers") as typeof import("../data/providers");
  const { models } = require("../data/models") as typeof import("../data/models");
  const dashscopeConfig = providers.find((provider) => provider.id === "dashscope")!;
  const dashscope = await ensureProvider({
    id: "dashscope",
    name: "Aliyun Bailian",
    slug: "dashscope",
    description: "Bailian OpenAI-compatible channel.",
    website: "https://help.aliyun.com/zh/model-studio/",
    api_base_url: dashscopeConfig.baseUrl,
    api_key: process.env.DASHSCOPE_API_KEY || "",
    contact_name: "Platform Ops",
    contact_email: "ops@nexusflow.ai",
    status: "enabled",
  });
  const anthropic = await ensureProvider({
    id: "anthropic",
    name: "Anthropic",
    slug: "anthropic",
    description: "Official Anthropic Claude Messages API channel.",
    website: "https://docs.anthropic.com/",
    api_base_url: "https://api.anthropic.com/v1",
    api_key: process.env.ANTHROPIC_API_KEY || "",
    contact_name: "Platform Ops",
    contact_email: "ops@nexusflow.ai",
    status: "enabled",
  });
  await ensureProvider({
    id: "volcengine-ark",
    name: "Volcengine Ark",
    slug: "volcengine-ark",
    description: "Volcengine Ark OpenAI-compatible channel; routes can be added per-model in admin.",
    website: "https://www.volcengine.com/product/ark",
    api_base_url: "https://ark.cn-beijing.volces.com/api/v3",
    api_key: process.env.ARK_API_KEY || "",
    contact_name: "Platform Ops",
    contact_email: "ops@nexusflow.ai",
    status: "enabled",
  });
  for (const model of models) {
    const routedProvider = model.id.startsWith("claude-") ? anthropic : dashscope;
    if (await getCapacity(routedProvider.id, model.id)) continue;
    const isTaskModel = model.category === "Image Generation" || model.category === "Video Generation" || model.category === "Audio";
    await upsertCapacity(routedProvider.id, model.id, {
      rpm_limit: 1000,
      tpm_limit: isTaskModel ? 0 : 1000000,
      daily_limit: 100000,
      concurrent_limit: isTaskModel ? 10 : 0,
      priority: 10,
      weight: 100,
      is_enabled: true,
    });
  }
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
