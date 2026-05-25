import type { AIModel } from "../data/models";
import { getAllowedChatParameters, getModelCapabilities } from "./model-capabilities";

export function buildUpstreamChatRequest(model: AIModel, body: any, options: { forceStream?: boolean } = {}): any {
  const allowed = new Set(getAllowedChatParameters(model));
  const requestBody: any = {
    model: body.model,
    messages: body.messages,
    stream: !!body.stream || !!options.forceStream,
  };

  for (const key of [
    "temperature",
    "max_tokens",
    "top_p",
    "stop",
    "frequency_penalty",
    "presence_penalty",
    "tools",
    "tool_choice",
    "response_format",
    "stream_options",
    "thinking_budget",
    "preserve_thinking",
    "top_k",
    "seed",
    "logprobs",
    "top_logprobs",
    "repetition_penalty",
    "enable_search",
    "search_options",
    "enable_context_caching",
    "parallel_tool_calls",
  ]) {
    if (allowed.has(key) && body[key] !== undefined) {
      requestBody[key] = body[key];
    }
  }

  const capabilities = getModelCapabilities(model);
  if (body.enable_thinking !== undefined) {
    if (capabilities.supports_enable_thinking) {
      requestBody.enable_thinking = body.enable_thinking;
    } else if (capabilities.thinking_mode === "always") {
      requestBody.enable_thinking = true;
    }
  } else if (capabilities.supports_enable_thinking && capabilities.thinking_default === false && !requestBody.stream) {
    requestBody.enable_thinking = false;
  }

  if (requestBody.stream && requestBody.stream_options === undefined) {
    requestBody.stream_options = { include_usage: true };
  }

  return requestBody;
}
