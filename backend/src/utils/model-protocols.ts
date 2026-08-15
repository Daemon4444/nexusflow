import type { AIModel } from "../data/models";
import { detectModelType } from "../services/adapters";

export type SupportedProtocol =
  | "openai/chat-completions"
  | "anthropic/messages"
  | "openai/responses"
  | "openai/embeddings"
  | "openai/image-generations"
  | "openai/audio-speech"
  | "openai/audio-transcriptions"
  | "nexusflow/tasks";

// 百炼 OpenAI Responses API 官方支持列表（华北 2），仅包含本平台在售模型。
// 该端点并非所有 Qwen 模型通用；例如 qwen-long 会被上游明确拒绝。
const RESPONSES_API_MODELS = new Set([
  "qwen3.8-max",
  "qwen3.7-max",
  "qwen3-max",
  "qwen3.7-plus",
  "qwen3.6-plus",
  "qwen3.5-plus",
  "qwen3.7-flash",
  "qwen3.6-flash",
  "qwen3.5-flash",
  "qwen3.6-35b-a3b",
  "qwen-plus",
  "qwen-flash",
  "qwen3-coder-plus",
  "qwen3-coder-flash",
  "deepseek-v4-pro",
  "deepseek-v4-pro-0813",
  "deepseek-v4-flash",
]);

export function supportsResponsesApi(modelId: string): boolean {
  return RESPONSES_API_MODELS.has(modelId);
}

export function getSupportedProtocols(model: AIModel): SupportedProtocol[] {
  const modelType = detectModelType(model.category);

  if (model.id.startsWith("claude-")) {
    return ["anthropic/messages"];
  }

  if (modelType === "chat") {
    const protocols: SupportedProtocol[] = [
      "openai/chat-completions",
      "anthropic/messages",
    ];
    if (supportsResponsesApi(model.id)) {
      protocols.push("openai/responses");
    }
    return protocols;
  }

  if (modelType === "embedding") {
    return ["openai/embeddings"];
  }

  if (modelType === "image") {
    return ["openai/image-generations", "nexusflow/tasks"];
  }

  if (modelType === "video") {
    return ["nexusflow/tasks"];
  }

  if (modelType === "audio") {
    // TTS models -> audio/speech, ASR models -> audio/transcriptions
    const id = model.id.toLowerCase();
    if (id.includes("tts")) {
      return ["openai/audio-speech"];
    }
    if (id.includes("asr")) {
      return ["openai/audio-transcriptions"];
    }
    return ["openai/audio-speech", "openai/audio-transcriptions"];
  }

  return [];
}
