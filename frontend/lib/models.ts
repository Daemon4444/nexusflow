export interface ModelSummary {
  id: string;
  name: string;
  provider: string;
  category: string;
  description?: string;
  contextLength?: number;
  maxOutput?: number;
  promptPrice?: number;
  completionPrice?: number;
  pricingType?: "token" | "per-image" | "per-second";
  supportedProtocols?: string[];
  supported_protocols?: string[];
  tags?: string[];
  isFeatured?: boolean;
  isNew?: boolean;
}

export function getModelProtocols(model: ModelSummary) {
  return model.supportedProtocols || model.supported_protocols || [];
}

export function formatContextLength(contextLength?: number) {
  if (!contextLength) return "Async";
  if (contextLength >= 1_000_000) {
    const value = contextLength / 1_000_000;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}M`;
  }
  if (contextLength >= 1024) return `${Math.round(contextLength / 1024)}K`;
  return contextLength.toLocaleString();
}

export function formatModelPrice(model: ModelSummary) {
  if (model.pricingType === "per-second") {
    return `from ¥${formatCompactPrice(model.promptPrice || 0)}/s`;
  }
  if (model.pricingType === "per-image") {
    return `¥${formatCompactPrice(model.promptPrice || 0)}/image`;
  }
  const input = formatCompactPrice(model.promptPrice || 0);
  const output = formatCompactPrice(model.completionPrice || 0);
  return `In ¥${input} · Out ¥${output}/M`;
}

export function getRecommendedModels(models: ModelSummary[], limit = 6) {
  const preferredIds = [
    // Kimi K3 最新旗舰（首页主推）
    "kimi/kimi-k3",
    "claude-sonnet-4-6",
    "qwen3.7-max",
    "qwen3.7-plus",
    "deepseek-v4-pro",
    "glm-5.2",
    "qwen3.6-plus",
    "claude-haiku-4-5",
    "qwen3-max",
    "deepseek-r1",
    "qwen3-coder-plus",
    "qwen-vl-plus",
    // Seedance 旗舰视频生成
    "seedance-2.0",
  ];
  const byId = new Map(models.map((model) => [model.id, model]));
  const preferred = preferredIds
    .map((id) => byId.get(id))
    .filter((model): model is ModelSummary => Boolean(model));
  const featured = models.filter((model) => model.isFeatured && !preferred.some((item) => item.id === model.id));
  const general = models.filter((model) => !preferred.some((item) => item.id === model.id) && !featured.some((item) => item.id === model.id));
  return [...preferred, ...featured, ...general].slice(0, limit);
}

export function pickDefaultPlaygroundModel(models: ModelSummary[], requestedModel?: string) {
  const preferredIds = [
    requestedModel,
    "qwen3.7-max",
    "deepseek-v4-pro",
    "qwen3.6-max-preview",
    "qwen3.6-plus",
    "qwen3-max",
    "qwen-plus",
  ].filter(Boolean);
  const chatModels = models.filter((model) => ["大语言模型", "推理模型", "编程模型", "多模态模型"].includes(model.category));
  const preferred = preferredIds.find((id) => chatModels.some((model) => model.id === id));
  return preferred || chatModels[0]?.id || models[0]?.id || "";
}

function formatCompactPrice(value: number) {
  if (value === 0) return "0";
  if (value < 0.01) return value.toFixed(4);
  if (value < 1) return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
