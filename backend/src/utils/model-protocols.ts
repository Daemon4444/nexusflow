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
