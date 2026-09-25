/**
 * Conversions between the legacy catalog (data/models.ts AIModel) and the
 * control-plane model entity. `aiModelFromCp(cpModelFromAIModel(m))` must be
 * deep-equal to `m`; the shadow comparison relies on it.
 */
import type { AIModel } from "../data/models";
import { getModelCapabilities } from "../utils/model-capabilities";
import { getSupportedProtocols, type SupportedProtocol } from "../utils/model-protocols";
import type { CpCapabilities, CpModel, CpProtocol } from "./schema";

export const LEGACY_TO_CP_PROTOCOL: Record<SupportedProtocol, CpProtocol> = {
  "openai/chat-completions": "openai.chat",
  "anthropic/messages": "anthropic.messages",
  "openai/responses": "openai.responses",
  "openai/embeddings": "openai.embeddings",
  "openai/image-generations": "openai.images",
  "openai/audio-speech": "openai.audio.speech",
  "openai/audio-transcriptions": "openai.audio.transcriptions",
  "nexusflow/tasks": "nexusflow.tasks",
};

export const CP_TO_LEGACY_PROTOCOL: Record<CpProtocol, SupportedProtocol> = Object.fromEntries(
  Object.entries(LEGACY_TO_CP_PROTOCOL).map(([legacy, cp]) => [cp, legacy])
) as Record<CpProtocol, SupportedProtocol>;

export function legacyProtocols(model: AIModel): CpProtocol[] {
  return getSupportedProtocols(model).map((protocol) => LEGACY_TO_CP_PROTOCOL[protocol]);
}

/** Structured capabilities derived from the current keyword-based inference. */
export function capabilitiesFromLegacy(model: AIModel): CpCapabilities {
  const c = getModelCapabilities(model);
  const isChat = c.model_type === "chat";
  return {
    input: {
      text: isChat || c.model_type === "embedding",
      image: c.supports_vision,
      video: c.supports_video_input,
      audio: c.supports_audio_input,
      file: false,
    },
    output: { text: isChat, audio: c.supports_audio_output },
    tools: { supported: c.supports_tools, parallel: c.supports_parallel_tool_calls },
    thinking: {
      mode: c.thinking_mode,
      default_on: c.thinking_default,
      budget: c.supports_thinking_budget,
      preserve: c.supports_preserve_thinking,
      control: c.supports_enable_thinking ? "enable_thinking" : c.supports_thinking_object ? "thinking_object" : null,
    },
    search: c.supports_search,
    caching: { implicit: c.supports_context_caching, explicit: c.supports_explicit_context_caching },
    structured_output: isChat && model.supported.includes("结构化输出"),
    sampling: {
      top_k: c.supports_top_k,
      seed: c.supports_seed,
      logprobs: c.supports_logprobs,
      repetition_penalty: c.supports_repetition_penalty,
    },
  };
}

function assignDefined<T extends object>(target: T, source: Partial<T>): T {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) (target as Record<string, unknown>)[key] = value;
  }
  return target;
}

export function cpModelFromAIModel(
  model: AIModel,
  options: { lifecycle?: CpModel["lifecycle"]; protocols?: CpProtocol[]; bridged?: CpProtocol[] } = {}
): CpModel {
  const pricing = assignDefined({ promptPrice: model.promptPrice, completionPrice: model.completionPrice } as CpModel["pricing"], {
    pricingType: model.pricingType,
    cacheReadPrice: model.cacheReadPrice,
    cacheReadExplicitPrice: model.cacheReadExplicitPrice,
    thinkingCompletionPrice: model.thinkingCompletionPrice,
    audioInputPrice: model.audioInputPrice,
    audioOutputPrice: model.audioOutputPrice,
    pricingTiers: model.pricingTiers ? model.pricingTiers.map((tier) => ({ ...tier })) : undefined,
    tokenPricingTiers: model.tokenPricingTiers ? model.tokenPricingTiers.map((tier) => ({ ...tier })) : undefined,
    alternatePricingModes: model.alternatePricingModes ? model.alternatePricingModes.map((mode) => ({ ...mode })) : undefined,
  });
  const display = assignDefined({
    name: model.name,
    provider_label: model.provider,
    description: model.description,
    category: model.category,
    tags: [...model.tags],
    supported: [...model.supported],
  } as CpModel["display"], {
    featured: model.isFeatured,
    is_new: model.isNew,
  });
  const limits = assignDefined({ context_length: model.contextLength, max_output: model.maxOutput } as CpModel["limits"], {
    default_output_reservation: model.defaultOutputReservation,
  });
  const cp: CpModel = {
    id: model.id,
    lifecycle: options.lifecycle || "active",
    display,
    limits,
    pricing,
    protocols: options.protocols || legacyProtocols(model),
    capabilities: capabilitiesFromLegacy(model),
    preview_user_ids: [],
  };
  if (options.bridged?.length) cp.legacy_bridged_protocols = options.bridged;
  if (model.anthropicPassThrough !== undefined) {
    cp.legacy_flags = { anthropic_pass_through: model.anthropicPassThrough };
  }
  if (model.id === "gpt-6-astra") {
    cp.param_overrides = { rewrite: { max_tokens: "max_completion_tokens" } };
  }
  return cp;
}

/** Rebuilds the legacy AIModel shape used by billing and the catalog APIs. */
export function aiModelFromCp(cp: CpModel): AIModel {
  const model = {
    id: cp.id,
    name: cp.display.name,
    provider: cp.display.provider_label,
    description: cp.display.description,
    contextLength: cp.limits.context_length,
    promptPrice: cp.pricing.promptPrice,
    completionPrice: cp.pricing.completionPrice,
    category: cp.display.category,
    tags: [...cp.display.tags],
    maxOutput: cp.limits.max_output,
    supported: [...cp.display.supported],
  } as AIModel;
  return assignDefined(model, {
    audioInputPrice: cp.pricing.audioInputPrice,
    audioOutputPrice: cp.pricing.audioOutputPrice,
    cacheReadPrice: cp.pricing.cacheReadPrice,
    cacheReadExplicitPrice: cp.pricing.cacheReadExplicitPrice,
    thinkingCompletionPrice: cp.pricing.thinkingCompletionPrice,
    anthropicPassThrough: cp.legacy_flags?.anthropic_pass_through,
    pricingType: cp.pricing.pricingType,
    pricingTiers: cp.pricing.pricingTiers?.map((tier) => ({ ...tier })),
    tokenPricingTiers: cp.pricing.tokenPricingTiers?.map((tier) => ({ ...tier })),
    alternatePricingModes: cp.pricing.alternatePricingModes?.map((mode) => ({ ...mode })),
    isNew: cp.display.is_new,
    isFeatured: cp.display.featured,
    defaultOutputReservation: cp.limits.default_output_reservation,
  });
}
