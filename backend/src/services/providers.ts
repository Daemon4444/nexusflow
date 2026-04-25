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
      // 向量和语音
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
  // 所有模型都使用 DashScope
  return providers[0];
}

/**
 * Get API key for a provider
 */
export function getProviderApiKey(provider: ProviderConfig): string {
  return process.env[provider.apiKeyEnv] || "";
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
