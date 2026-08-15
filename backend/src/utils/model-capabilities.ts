import type { AIModel } from "../data/models";
import { detectModelType } from "../services/adapters";

export type ThinkingMode = "mixed" | "always" | "none" | "unknown";

export interface ModelCapabilities {
  model_type: "chat" | "embedding" | "image" | "video" | "unknown";
  supports_tools: boolean;
  supports_vision: boolean;
  supports_video_input: boolean;
  supports_audio_input: boolean;
  supports_audio_output: boolean;
  thinking_mode: ThinkingMode;
  thinking_default: boolean | null;
  supports_enable_thinking: boolean;
  supports_thinking_object: boolean;
  supports_thinking_budget: boolean;
  supports_preserve_thinking: boolean;
  supports_search: boolean;
  supports_context_caching: boolean;
  /** 是否支持显式缓存开关（cache_control / enable_context_caching）。false 且 supports_context_caching=true 表示仅有隐式缓存计价。 */
  supports_explicit_context_caching: boolean;
  supports_parallel_tool_calls: boolean;
  supports_top_k: boolean;
  supports_seed: boolean;
  supports_logprobs: boolean;
  supports_repetition_penalty: boolean;
}

const ALWAYS_THINKING_MODELS = new Set([
  "qwq-plus",
  "deepseek-r1",
  "MiniMax-M2.1",
  "MiniMax-M2.5",
]);

const MIXED_THINKING_DEFAULT_ON = new Set([
  "qwen3.8-max",
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.7-flash",
  "qwen3.6-max-preview",
  "qwen3.6-plus",
  "qwen3.6-flash",
  "qwen3.6-35b-a3b",
  "qwen3.5-plus",
  "qwen3.5-flash",
  "qwen3-235b-a22b",
  "qwen3-32b",
  "qwen3-8b",
  "deepseek-v4-pro",
  "deepseek-v4-pro-0813",
  "deepseek-v4-flash",
  "glm-5.2",
  "glm-5.2-fast-preview",
  "glm-5.1",
  "glm-5",
  "glm-4.7",
  "kimi-k3",
]);

const MIXED_THINKING_DEFAULT_OFF = new Set([
  "qwen-plus",
  "qwen-flash",
  "qwen-turbo",
  "qwen3-max",
  "qwen3-plus",
  "qwen3-flash",
  "qwen3-turbo",
  "deepseek-v3.2",
  "kimi-k2.6",
  "kimi-k2.5",
]);

const THINKING_BUDGET_PREFIXES = [
  "qwen3.8-",
  "qwen3.7-",
  "qwen3.6-",
  "qwen3.5-",
  "qwen3-vl-",
  "qwen3-",
  "qwen-flash",
  "deepseek-v3",
  "deepseek-r1",
  "deepseek-v4",
  "glm-",
];

const PRESERVE_THINKING_MODELS = new Set([
  "qwen3.8-max",
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.6-max-preview",
  "qwen3.6-plus",
  "kimi-k2.6",
  "kimi-k3",
]);

// 百炼联网搜索官方支持列表（华北 2）。必须逐模型列出，不能按厂商前缀放大。
const SEARCH_ENABLED_MODELS = new Set([
  "qwen3.8-max",
  "qwen3.7-max",
  "qwen3.6-max-preview",
  "qwen3-max",
  "qwen3.7-plus",
  "qwen3.6-plus",
  "qwen3.5-plus",
  "qwen-plus",
  "qwen3.7-flash",
  "qwen3.6-flash",
  "qwen3.5-flash",
  "qwen-flash",
  "qwen-turbo",
  "qwq-plus",
  "qwen3.5-omni-plus",
  "qwen3.5-omni-flash",
  "deepseek-v4-pro",
  "deepseek-v4-pro-0813",
  "deepseek-v4-flash",
  "deepseek-v3.2",
  "deepseek-r1",
  "deepseek-v3",
  "MiniMax-M2.1",
  "kimi-k3",
]);

// 阿里云百炼 Context Cache 官方页（华北 2）明确列出的显式缓存模型。
// 不能按厂商前缀放大：同一厂商常同时存在显式+隐式和仅隐式模型。
const EXPLICIT_CONTEXT_CACHE_MODELS = new Set([
  "qwen3.8-max",
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.7-flash",
  "qwen3.6-max-preview",
  "qwen3.6-plus",
  "qwen3.6-flash",
  "qwen3.5-plus",
  "qwen3.5-flash",
  "qwen3-max",
  "qwen-plus",
  "qwen-flash",
  "qwen3-coder-plus",
  "qwen3-coder-flash",
  "qwen3-vl-plus",
  "qwen3-vl-flash",
  "deepseek-v3.2",
  "kimi-k2.6",
  "kimi-k2.5",
  "glm-5.1",
]);

const IMPLICIT_CONTEXT_CACHE_MODELS = new Set([
  "qwen3.8-max",
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.7-flash",
  "qwen3-max",
  "qwen-plus",
  "qwen-flash",
  "qwen-turbo",
  "qwen3-coder-plus",
  "qwen3-coder-flash",
  "qwen3-vl-plus",
  "qwen3-vl-flash",
  "qwen-vl-max",
  "qwen-vl-plus",
  "deepseek-v4-pro",
  "deepseek-v4-pro-0813",
  "deepseek-v4-flash",
  "deepseek-v3.2",
  "deepseek-r1",
  "deepseek-v3",
  "kimi-k2.6",
  "kimi-k2.5",
  "kimi-k3",
  "glm-4.7",
  "glm-5",
  "glm-5.1",
  "glm-5.2",
  "glm-5.2-fast-preview",
  "MiniMax/MiniMax-M3",
  "MiniMax-M2.5",
  "MiniMax-M2.1",
]);

function hasAny(value: string[], needles: string[]): boolean {
  return value.some((item) => needles.some((needle) => item.toLowerCase().includes(needle.toLowerCase())));
}

function isQwenChatModel(model: AIModel): boolean {
  return detectModelType(model.category) === "chat" && (model.id.startsWith("qwen") || model.provider === "通义千问");
}

function getThinkingMode(model: AIModel): { mode: ThinkingMode; defaultValue: boolean | null } {
  if (ALWAYS_THINKING_MODELS.has(model.id) || model.id.includes("-thinking")) {
    return { mode: "always", defaultValue: true };
  }
  if (MIXED_THINKING_DEFAULT_ON.has(model.id)) {
    return { mode: "mixed", defaultValue: true };
  }
  if (MIXED_THINKING_DEFAULT_OFF.has(model.id)) {
    return { mode: "mixed", defaultValue: false };
  }
  if (model.tags.includes("思考模式") || model.supported.includes("思考模式")) {
    return { mode: "mixed", defaultValue: null };
  }
  if (model.tags.includes("思考链") || model.supported.includes("思考链")) {
    return { mode: "always", defaultValue: true };
  }
  return { mode: "none", defaultValue: null };
}

export function getModelCapabilities(model: AIModel): ModelCapabilities {
  const modelType = detectModelType(model.category) as ModelCapabilities["model_type"];
  const text = [...model.supported, ...model.tags, model.description];
  const thinking = getThinkingMode(model);
  const supportsVision =
    modelType === "chat" &&
    (model.category === "多模态模型" || hasAny(text, ["图像", "视觉", "多模态", "OCR"]));
  const supportsVideoInput =
    modelType === "chat" &&
    hasAny(text, ["视频输入", "全能"]);
  const supportsAudioInput =
    modelType === "chat" &&
    hasAny(text, ["音频输入", "全能"]);
  const supportsAudioOutput =
    modelType === "chat" &&
    hasAny(text, ["音频输出", "全能"]);
  const supportsTools =
    modelType === "chat" &&
    (hasAny(text, ["函数调用", "工具调用"]) || model.provider === "DeepSeek" || model.provider === "GLM" || model.provider === "Anthropic");
  const supportsThinkingBudget =
    thinking.mode !== "none" &&
    THINKING_BUDGET_PREFIXES.some((prefix) => model.id.startsWith(prefix));
  const isQwenChat = isQwenChatModel(model);
  const isGLM = model.provider === "GLM" || model.provider === "智谱AI";
  const isDeepSeek = model.provider === "DeepSeek";
  const supportsSearch = SEARCH_ENABLED_MODELS.has(model.id);

  const supportsExplicitCaching = EXPLICIT_CONTEXT_CACHE_MODELS.has(model.id);
  const supportsContextCaching = supportsExplicitCaching || IMPLICIT_CONTEXT_CACHE_MODELS.has(model.id);

  return {
    model_type: modelType || "unknown",
    supports_tools: supportsTools,
    supports_vision: supportsVision,
    supports_video_input: supportsVideoInput,
    supports_audio_input: supportsAudioInput,
    supports_audio_output: supportsAudioOutput,
    thinking_mode: thinking.mode,
    thinking_default: thinking.defaultValue,
    supports_enable_thinking: thinking.mode === "mixed" && model.id !== "MiniMax/MiniMax-M3",
    supports_thinking_object: model.id === "MiniMax/MiniMax-M3",
    supports_thinking_budget: supportsThinkingBudget,
    supports_preserve_thinking: PRESERVE_THINKING_MODELS.has(model.id),
    supports_search: supportsSearch,
    supports_context_caching: supportsContextCaching,
    supports_explicit_context_caching: supportsExplicitCaching,
    supports_parallel_tool_calls: supportsTools && (isQwenChat || isDeepSeek || isGLM || model.provider === "Anthropic"),
    supports_top_k: isQwenChat || isGLM,
    supports_seed: isQwenChat || isGLM,
    supports_logprobs: isQwenChat,
    supports_repetition_penalty: isQwenChat || isGLM || (isDeepSeek && (model.id.includes("v3.1") || model.id.includes("v3.2"))),
  };
}

export function getAllowedChatParameters(model: AIModel): string[] {
  const capabilities = getModelCapabilities(model);
  if (capabilities.model_type !== "chat") return [];

  const params = [
    "model",
    "messages",
    "stream",
    "stream_options",
    "temperature",
    "top_p",
    "max_tokens",
    "stop",
    "presence_penalty",
    "frequency_penalty",
    "response_format",
  ];

  if (capabilities.supports_tools) {
    params.push("tools", "tool_choice");
  }
  if (capabilities.supports_enable_thinking) {
    params.push("enable_thinking");
  }
  if (capabilities.supports_thinking_object) {
    params.push("thinking");
  }
  if (capabilities.supports_thinking_budget) {
    params.push("thinking_budget");
  }
  if (capabilities.supports_preserve_thinking) {
    params.push("preserve_thinking");
  }
  if (capabilities.supports_top_k) {
    params.push("top_k");
  }
  if (capabilities.supports_seed) {
    params.push("seed");
  }
  if (capabilities.supports_logprobs) {
    params.push("logprobs", "top_logprobs");
  }
  if (capabilities.supports_repetition_penalty) {
    params.push("repetition_penalty");
  }
  if (capabilities.supports_search) {
    params.push("enable_search", "search_options");
  }
  if (capabilities.supports_explicit_context_caching) {
    params.push("enable_context_caching");
  }
  if (capabilities.supports_parallel_tool_calls) {
    params.push("parallel_tool_calls");
  }

  return params;
}
