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
  supports_thinking_budget: boolean;
  supports_preserve_thinking: boolean;
  supports_search: boolean;
  supports_parallel_tool_calls: boolean;
  supports_top_k: boolean;
  supports_seed: boolean;
  supports_logprobs: boolean;
  supports_repetition_penalty: boolean;
}

const ALWAYS_THINKING_MODELS = new Set([
  "qwq-plus",
  "deepseek-r1",
]);

const MIXED_THINKING_DEFAULT_ON = new Set([
  "qwen3.7-max",
  "qwen3.6-max-preview",
  "qwen3.6-plus",
  "qwen3.6-flash",
  "qwen3.5-plus",
  "qwen3.5-flash",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "glm-5.1",
  "glm-5",
  "glm-4.7",
]);

const MIXED_THINKING_DEFAULT_OFF = new Set([
  "qwen3-max",
  "qwen3-plus",
  "qwen3-flash",
  "qwen3-turbo",
  "qwen3-32b",
  "qwen3-8b",
  "deepseek-v3.2",
  "kimi-k2.6",
  "kimi-k2.5",
]);

const THINKING_BUDGET_PREFIXES = [
  "qwen3.7-",
  "qwen3.6-",
  "qwen3.5-",
  "qwen3-vl-",
  "qwen3-",
];

const PRESERVE_THINKING_MODELS = new Set([
  "qwen3.7-max",
  "qwen3.6-max-preview",
  "qwen3.6-plus",
  "kimi-k2.6",
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
  const supportsSearch =
    isQwenChat &&
    !supportsVision &&
    !model.id.includes("math") &&
    !model.id.includes("mt");

  return {
    model_type: modelType || "unknown",
    supports_tools: supportsTools,
    supports_vision: supportsVision,
    supports_video_input: supportsVideoInput,
    supports_audio_input: supportsAudioInput,
    supports_audio_output: supportsAudioOutput,
    thinking_mode: thinking.mode,
    thinking_default: thinking.defaultValue,
    supports_enable_thinking: thinking.mode === "mixed",
    supports_thinking_budget: supportsThinkingBudget,
    supports_preserve_thinking: PRESERVE_THINKING_MODELS.has(model.id),
    supports_search: supportsSearch,
    supports_parallel_tool_calls: supportsTools && (isQwenChat || model.provider === "DeepSeek" || model.provider === "智谱AI" || model.provider === "Anthropic"),
    supports_top_k: isQwenChat,
    supports_seed: isQwenChat,
    supports_logprobs: isQwenChat,
    supports_repetition_penalty: isQwenChat,
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
  if (capabilities.supports_enable_thinking || capabilities.thinking_mode === "always") {
    params.push("enable_thinking");
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
  if (capabilities.supports_parallel_tool_calls) {
    params.push("parallel_tool_calls");
  }

  return params;
}
