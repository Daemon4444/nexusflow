import type { AIModel } from "../data/models";
import { detectModelType } from "../services/adapters";

export type SupportedProtocol =
  | "openai/chat-completions"
  | "anthropic/messages"
  | "google/generate-content"
  | "openai/embeddings"
  | "openai/image-generations"
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
      "google/generate-content",
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

  return [];
}
