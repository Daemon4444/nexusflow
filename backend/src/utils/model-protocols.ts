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

// DashScope /apps/anthropic 兼容端点尚未接入的模型（实测返回 model does not exist）：
// /v1/messages 对这些模型走平台内协议转换（anthropic-openai-bridge）而非直通，
// 上游接入后可从集合移除、恢复直通
const ANTHROPIC_COMPAT_UNSUPPORTED = new Set(["kimi/kimi-k3"]);

export function isAnthropicPassThroughUnsupported(modelId: string): boolean {
  return ANTHROPIC_COMPAT_UNSUPPORTED.has(modelId);
}

export function getSupportedProtocols(model: AIModel): SupportedProtocol[] {
  const modelType = detectModelType(model.category);

  if (model.id.startsWith("claude-")) {
    return ["anthropic/messages"];
  }

  if (modelType === "chat") {
    return [
      "openai/chat-completions",
      "anthropic/messages",
      "openai/responses",
    ];
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
