import type { AIModel } from "../data/models";
import { getAllowedChatParameters, getModelCapabilities } from "./model-capabilities";
import { getUpstreamModelId } from "./upstream-model-aliases";

export function buildUpstreamChatRequest(model: AIModel, body: any, options: { forceStream?: boolean } = {}): any {
  const allowed = new Set(getAllowedChatParameters(model));
  const capabilities = getModelCapabilities(model);

  const wantsAudioOutput = Array.isArray(body.modalities) && body.modalities.includes("audio");
  const forceStream = !!options.forceStream || wantsAudioOutput;

  const requestBody: any = {
    model: getUpstreamModelId(body.model),
    messages: body.messages,
    stream: !!body.stream || forceStream,
  };

  if (Array.isArray(body.modalities) && body.modalities.length > 0) {
    requestBody.modalities = body.modalities;
  }
  if (body.audio && typeof body.audio === "object") {
    requestBody.audio = body.audio;
  }

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
    "thinking",
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

  if (body.enable_thinking !== undefined) {
    if (capabilities.supports_enable_thinking) {
      requestBody.enable_thinking = body.enable_thinking;
    }
  } else if (capabilities.supports_enable_thinking && capabilities.thinking_default === false && !requestBody.stream) {
    requestBody.enable_thinking = false;
  }

  if (requestBody.stream) {
    const requestedStreamOptions =
      requestBody.stream_options &&
      typeof requestBody.stream_options === "object" &&
      !Array.isArray(requestBody.stream_options)
        ? requestBody.stream_options
        : {};
    requestBody.stream_options = { ...requestedStreamOptions, include_usage: true };
  }

  return requestBody;
}
