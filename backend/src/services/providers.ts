/**
 * Provider Configuration
 *
 * All models are accessed through Alibaba Cloud DashScope.
 * DashScope provides unified OpenAI-compatible API for multiple providers.
 */

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  models: string[];  // Model ID prefixes or exact matches
}

export const providers: ProviderConfig[] = [
  // 阿里云百炼 (DashScope) - 统一入口
  // 支持通义千问、DeepSeek、GLM、Kimi、MiniMax、HappyHorse、PixVerse 等当前已接入模型
  {
    id: "dashscope",
    name: "阿里云百炼",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    models: [
      // 通义千问系列
      "qwen", "qwq", "wan", "wanx",
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
];

/**
 * Find the provider for a given model ID
 * All models go through DashScope
 */
export function findProvider(modelId: string): ProviderConfig | null {
  void modelId;
  return providers[0];
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
  const dashscope = await ensureProvider({
    id: "dashscope",
    name: "阿里云百炼",
    slug: "dashscope",
    description: "百炼 OpenAI 兼容模式渠道。",
    website: "https://help.aliyun.com/zh/model-studio/",
    api_base_url: providers[0].baseUrl,
    api_key: process.env.DASHSCOPE_API_KEY || "",
    contact_name: "平台运营",
    contact_email: "ops@nexusflow.ai",
    status: "enabled",
  });
  await ensureProvider({
    id: "volcengine-ark",
    name: "火山方舟",
    slug: "volcengine-ark",
    description: "火山引擎方舟 OpenAI 兼容渠道，可在后台按模型添加路由。",
    website: "https://www.volcengine.com/product/ark",
    api_base_url: "https://ark.cn-beijing.volces.com/api/v3",
    api_key: process.env.ARK_API_KEY || "",
    contact_name: "平台运营",
    contact_email: "ops@nexusflow.ai",
    status: "enabled",
  });
  for (const model of models) {
    if (await getCapacity(dashscope.id, model.id)) continue;
    const isTaskModel = model.category === "图像生成" || model.category === "视频生成";
    await upsertCapacity(dashscope.id, model.id, {
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
