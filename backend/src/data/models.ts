export interface PricingTier {
  label: string;   // e.g. "720P", "1080P", "540P silent"
  price: number;   // USD
}

export interface TokenPricingTier {
  label: string;      // e.g. "0<Token≤32K"
  maxTokens: number;  // request input token upper bound for this tier
  promptPrice: number;
  completionPrice: number;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextLength: number;
  promptPrice: number;   // per 1M tokens (USD) for text; base price for media
  completionPrice: number; // per 1M tokens (USD) for text; 0 for media
  audioInputPrice?: number;  // per 1M tokens (USD) for audio input (omni models); falls back to promptPrice if unset
  audioOutputPrice?: number; // per 1M tokens (USD) for audio output (omni models); text output is free when audio is produced
  pricingType?: "token" | "per-image" | "per-second"; // default: "token"
  pricingTiers?: PricingTier[];  // resolution-based pricing for video/image
  tokenPricingTiers?: TokenPricingTier[]; // input-token-based tier pricing for text models
  category: string;
  tags: string[];
  isNew?: boolean;
  isFeatured?: boolean;
  maxOutput: number;
  supported: string[];
}

export function getTokenPricingTier(model: AIModel, promptTokens: number): TokenPricingTier | null {
  if (!model.tokenPricingTiers || model.tokenPricingTiers.length === 0) return null;
  const boundedPromptTokens = Math.max(1, promptTokens || 0);
  return model.tokenPricingTiers.find((tier) => boundedPromptTokens <= tier.maxTokens)
    || model.tokenPricingTiers[model.tokenPricingTiers.length - 1];
}

export function calculateTokenCost(model: AIModel, promptTokens: number, completionTokens: number, cachedTokens: number = 0, cacheCreationTokens: number = 0): number {
  const tier = getTokenPricingTier(model, promptTokens);
  const promptPrice = tier?.promptPrice ?? model.promptPrice;
  const completionPrice = tier?.completionPrice ?? model.completionPrice;
  const totalPrompt = Math.max(0, promptTokens || 0);
  const effectiveCached = Math.min(Math.max(0, cachedTokens || 0), totalPrompt);
  const effectiveCreation = Math.min(Math.max(0, cacheCreationTokens || 0), totalPrompt - effectiveCached);
  const nonCachedPrompt = Math.max(0, totalPrompt - effectiveCached - effectiveCreation);
  return (nonCachedPrompt / 1_000_000) * promptPrice
    + (effectiveCached / 1_000_000) * promptPrice * 0.1
    + (effectiveCreation / 1_000_000) * promptPrice * 1.25
    + (Math.max(0, completionTokens || 0) / 1_000_000) * completionPrice;
}

export const models: AIModel[] = [
  // ========== Qwen Flagship Series ==========
  {
    id: "qwen3.7-plus",
    name: "Qwen3.7 Plus",
    provider: "Qwen (Alibaba)",
    description: "Qwen3.7 series cost-effective Plus model, with fully upgraded visual-language capabilities on top of strong text abilities, retaining complete agent capabilities for coding, tool use, and productivity workflows. Supports multimodal interactive hybrid agents: perceiving real-world scenes, reading screens and operating GUIs, generating code based on visual references, and end-to-end navigation of mobile apps. Equivalent to snapshot qwen3.7-plus-2026-05-26.",
    contextLength: 1000000,
    promptPrice: 0.29,
    completionPrice: 1.14,
    tokenPricingTiers: [
      { label: "0<Token≤256K", maxTokens: 262144, promptPrice: 0.29, completionPrice: 1.14 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 1.14, completionPrice: 4.57 },
    ],
    category: "Multimodal Model",
    tags: ["cost-effective", "multimodal", "agent", "vision", "thinking mode", "1M context"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["text", "image input", "function calling", "thinking mode", "web search", "structured output"]
  },
  {
    id: "qwen3.7-max",
    name: "Qwen3.7 Max",
    provider: "Qwen (Alibaba)",
    description: "Qwen3.7 flagship model, built for the agent era with comprehensive improvements in coding, office productivity, and long-cycle autonomous execution. Supports thinking mode toggle, function calling, and web search. 1M token context window.",
    contextLength: 1000000,
    promptPrice: 1.71,
    completionPrice: 5.14,
    category: "Language Model",
    tags: ["flagship", "reasoning", "coding", "thinking mode", "agent"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["text", "function calling", "thinking mode", "web search"]
  },
  {
    id: "qwen3-max",
    name: "Qwen3 Max",
    provider: "Qwen (Alibaba)",
    description: "Qwen3 most powerful flagship model, supports thinking mode toggle, excels in complex reasoning, code generation, and mathematics. 262K context window.",
    contextLength: 262144,
    promptPrice: 0.36,
    completionPrice: 1.43,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.36, completionPrice: 1.43 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.57, completionPrice: 2.29 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 1.00, completionPrice: 4.00 },
    ],
    category: "Language Model",
    tags: ["flagship", "reasoning", "coding", "thinking mode"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["text", "function calling", "thinking mode"]
  },
  {
    id: "qwen3.6-max-preview",
    name: "Qwen3.6 Max Preview",
    provider: "Qwen (Alibaba)",
    description: "Qwen3.6 most powerful preview model, designed for complex reasoning, code generation, and multi-step tool tasks, ideal for scenarios requiring stronger thinking capabilities.",
    contextLength: 262144,
    promptPrice: 1.29,
    completionPrice: 7.71,
    tokenPricingTiers: [
      { label: "0<Token≤128K", maxTokens: 131072, promptPrice: 1.29, completionPrice: 7.71 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 2.14, completionPrice: 12.86 },
    ],
    category: "Language Model",
    tags: ["flagship", "reasoning", "preview"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["text", "function calling", "thinking mode"]
  },
  {
    id: "qwen3.6-plus",
    name: "Qwen3.6 Plus",
    provider: "Qwen (Alibaba)",
    description: "Qwen3.6 balanced flagship model, supports 1M context window, function calling, and built-in tools, ideal for large codebases and general production scenarios.",
    contextLength: 1000000,
    promptPrice: 0.29,
    completionPrice: 1.71,
    tokenPricingTiers: [
      { label: "0<Token≤256K", maxTokens: 262144, promptPrice: 0.29, completionPrice: 1.71 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 1.14, completionPrice: 6.86 },
    ],
    category: "Language Model",
    tags: ["cost-effective", "balanced", "1M context"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["text", "function calling", "built-in tools", "thinking mode"]
  },
  {
    id: "qwen3.5-plus",
    name: "Qwen3.5 Plus",
    provider: "Qwen (Alibaba)",
    description: "Qwen3.5 enhanced model, best balance of quality, speed, and cost. Supports 1M context window, ideal for large-scale application scenarios.",
    contextLength: 1000000,
    promptPrice: 0.11,
    completionPrice: 0.69,
    tokenPricingTiers: [
      { label: "0<Token≤128K", maxTokens: 131072, promptPrice: 0.11, completionPrice: 0.69 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 0.29, completionPrice: 1.71 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 0.57, completionPrice: 3.43 },
    ],
    category: "Language Model",
    tags: ["cost-effective", "balanced", "1M context"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["text", "function calling", "thinking mode"]
  },
  {
    id: "qwen3.6-flash",
    name: "Qwen3.6 Flash",
    provider: "Qwen (Alibaba)",
    description: "Qwen3.6 flash model, ideal for simple tasks with fast speed and low cost. Supports 1M context window and context caching.",
    contextLength: 1000000,
    promptPrice: 0.17,
    completionPrice: 1.03,
    tokenPricingTiers: [
      { label: "0<Token≤256K", maxTokens: 262144, promptPrice: 0.17, completionPrice: 1.03 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 0.69, completionPrice: 4.11 },
    ],
    category: "Language Model",
    tags: ["ultra-fast", "low cost", "1M context"],
    isNew: true,
    maxOutput: 65536,
    supported: ["text", "function calling", "thinking mode"]
  },
  {
    id: "qwen3.5-flash",
    name: "Qwen3.5 Flash",
    provider: "Qwen (Alibaba)",
    description: "Qwen3.5 flash model, ideal for simple tasks with fast speed and low cost. Supports 1M context window and context caching.",
    contextLength: 1000000,
    promptPrice: 0.03,
    completionPrice: 0.29,
    tokenPricingTiers: [
      { label: "0<Token≤128K", maxTokens: 131072, promptPrice: 0.03, completionPrice: 0.29 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 0.11, completionPrice: 1.14 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 0.17, completionPrice: 1.71 },
    ],
    category: "Language Model",
    tags: ["ultra-fast", "low cost", "1M context"],
    isNew: true,
    maxOutput: 65536,
    supported: ["text", "function calling", "thinking mode"]
  },
  {
    id: "qwen-plus",
    name: "Qwen Plus",
    provider: "Qwen (Alibaba)",
    description: "Qwen enhanced model, classic balance of quality and speed, ideal for large-scale application scenarios.",
    contextLength: 1000000,
    promptPrice: 0.11,
    completionPrice: 0.29,
    tokenPricingTiers: [
      { label: "0<Token≤128K (non-thinking)", maxTokens: 131072, promptPrice: 0.11, completionPrice: 0.29 },
      { label: "128K<Token≤256K (non-thinking)", maxTokens: 262144, promptPrice: 0.34, completionPrice: 2.86 },
      { label: "256K<Token≤1M (non-thinking)", maxTokens: 1000000, promptPrice: 0.69, completionPrice: 6.86 },
    ],
    category: "Language Model",
    tags: ["cost-effective", "balanced", "general"],
    isFeatured: true,
    maxOutput: 32768,
    supported: ["text", "function calling"]
  },
  {
    id: "qwen-turbo",
    name: "Qwen Turbo",
    provider: "Qwen (Alibaba)",
    description: "Qwen high-speed model, extremely fast response and lowest cost, ideal for latency-sensitive application scenarios.",
    contextLength: 1000000,
    promptPrice: 0.04,
    completionPrice: 0.09,
    category: "Language Model",
    tags: ["fast", "low cost", "general"],
    maxOutput: 16384,
    supported: ["text", "function calling"]
  },
  {
    id: "qwen-long",
    name: "Qwen Long",
    provider: "Qwen (Alibaba)",
    description: "Qwen long-context model, supports ultra-long context windows up to 10M tokens, ideal for document analysis and long-text understanding.",
    contextLength: 10000000,
    promptPrice: 0.07,
    completionPrice: 0.28,
    category: "Language Model",
    tags: ["ultra-long context", "document analysis"],
    maxOutput: 32768,
    supported: ["text"]
  },
  {
    id: "qwen-flash",
    name: "Qwen Flash",
    provider: "Qwen (Alibaba)",
    description: "Qwen ultra-fast general model, 1M context window, extremely fast response and ultra-low cost, ideal for large-scale high-concurrency scenarios. Supports function calling and thinking mode.",
    contextLength: 1000000,
    promptPrice: 0.02,
    completionPrice: 0.21,
    category: "Language Model",
    tags: ["ultra-fast", "low cost", "1M context", "general", "thinking mode"],
    isNew: true,
    maxOutput: 32768,
    supported: ["text", "function calling", "thinking mode"]
  },

  // ========== Qwen3 Open-Source Series ==========
  {
    id: "qwen3-235b-a22b",
    name: "Qwen3 235B-A22B",
    provider: "Qwen (Alibaba)",
    description: "Qwen3 open-source flagship, 235B parameter MoE architecture (22B active), supports dynamic switching between thinking and non-thinking modes.",
    contextLength: 131072,
    promptPrice: 0.29,
    completionPrice: 1.14,
    category: "Language Model",
    tags: ["open-source", "MoE", "reasoning", "thinking mode"],
    isNew: true,
    maxOutput: 8192,
    supported: ["text", "function calling", "thinking mode"]
  },
  {
    id: "qwen3.6-35b-a3b",
    name: "Qwen3.6 35B-A3B",
    provider: "Qwen (Alibaba)",
    description: "Qwen3.6 open-source MoE model, 35B total parameters with only 3B active, excels at agent coding, STEM, and reasoning tasks. Apache 2.0 licensed. Supports thinking mode toggle.",
    contextLength: 262144,
    promptPrice: 0.26,
    completionPrice: 1.54,
    category: "Language Model",
    tags: ["open-source", "MoE", "lightweight", "coding", "thinking mode"],
    isNew: true,
    maxOutput: 32768,
    supported: ["text", "function calling", "thinking mode"]
  },
  {
    id: "qwen3-32b",
    name: "Qwen3 32B",
    provider: "Qwen (Alibaba)",
    description: "Qwen3 open-source 32B parameter dense model, excels among medium-scale models.",
    contextLength: 131072,
    promptPrice: 0.29,
    completionPrice: 1.14,
    category: "Language Model",
    tags: ["open-source", "reasoning", "coding"],
    maxOutput: 8192,
    supported: ["text", "function calling"]
  },

  // ========== Reasoning Models ==========
  {
    id: "qwq-plus",
    name: "QwQ Plus",
    provider: "Qwen (Alibaba)",
    description: "Qwen reasoning model, trained on Qwen2.5, excels at mathematics, logical reasoning, and complex problem analysis, displaying complete chain-of-thought.",
    contextLength: 131072,
    promptPrice: 0.23,
    completionPrice: 0.57,
    category: "Reasoning Model",
    tags: ["reasoning", "mathematics", "logic", "chain-of-thought"],
    isFeatured: true,
    maxOutput: 8192,
    supported: ["text", "chain-of-thought"]
  },

  // ========== Vision Models ==========
  {
    id: "qwen-vl-max",
    name: "Qwen VL Max",
    provider: "Qwen (Alibaba)",
    description: "Qwen vision flagship model, supports image understanding, visual-text dialogue, document OCR, and other multimodal tasks.",
    contextLength: 131072,
    promptPrice: 0.23,
    completionPrice: 0.57,
    category: "Multimodal Model",
    tags: ["vision", "multimodal", "OCR", "visual understanding"],
    isFeatured: true,
    maxOutput: 8192,
    supported: ["text", "image input"]
  },
  {
    id: "qwen-vl-plus",
    name: "Qwen VL Plus",
    provider: "Qwen (Alibaba)",
    description: "Qwen vision enhanced model, balanced performance and cost multimodal model.",
    contextLength: 131072,
    promptPrice: 0.11,
    completionPrice: 0.29,
    category: "Multimodal Model",
    tags: ["vision", "multimodal", "cost-effective"],
    maxOutput: 8192,
    supported: ["text", "image input"]
  },
  {
    id: "qwen3-vl-plus",
    name: "Qwen3 VL Plus",
    provider: "Qwen (Alibaba)",
    description: "Qwen3 vision-language model, significantly improved image understanding, supports high-resolution image input. 262K context window.",
    contextLength: 262144,
    promptPrice: 0.14,
    completionPrice: 1.43,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.14, completionPrice: 1.43 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.21, completionPrice: 2.14 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 0.43, completionPrice: 4.29 },
    ],
    category: "Multimodal Model",
    tags: ["vision", "multimodal", "high-resolution"],
    isNew: true,
    maxOutput: 32768,
    supported: ["text", "image input"]
  },
  {
    id: "qwen3-vl-flash",
    name: "Qwen3 VL Flash",
    provider: "Qwen (Alibaba)",
    description: "Qwen3 vision flash model, fast image understanding, ideal for real-time scenarios.",
    contextLength: 262144,
    promptPrice: 0.02,
    completionPrice: 0.21,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.02, completionPrice: 0.21 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.04, completionPrice: 0.43 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 0.09, completionPrice: 0.86 },
    ],
    category: "Multimodal Model",
    tags: ["vision", "ultra-fast", "cost-effective"],
    maxOutput: 32768,
    supported: ["text", "image input"]
  },

  // ========== Omni Models ==========
  {
    id: "qwen3.5-omni-plus",
    name: "Qwen3.5 Omni Plus",
    provider: "Qwen (Alibaba)",
    description: "Qwen3.5 flagship omni model, supports any combination of text, image, audio, and video input with text and voice output. Up to 3 hours audio / 1 hour video input, 113 input languages, 55 voice tones, supports web search and voice cloning.",
    contextLength: 262144,
    promptPrice: 0.97,
    completionPrice: 5.52,
    audioInputPrice: 7.31,
    audioOutputPrice: 29.38,
    category: "Multimodal Model",
    tags: ["flagship", "omni", "multimodal", "audio input", "audio output", "video input", "web search"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["text", "image input", "audio input", "audio output", "video input", "web search"]
  },
  {
    id: "qwen3.5-omni-flash",
    name: "Qwen3.5 Omni Flash",
    provider: "Qwen (Alibaba)",
    description: "Qwen3.5 lightweight omni model, supports any combination of text, image, audio, and video input with text and voice output. Up to 3 hours audio / 1 hour video input, 113 input languages, 55 voice tones, supports web search. Best cost-efficiency choice.",
    contextLength: 262144,
    promptPrice: 0.30,
    completionPrice: 1.83,
    audioInputPrice: 2.48,
    audioOutputPrice: 9.93,
    category: "Multimodal Model",
    tags: ["cost-effective", "omni", "multimodal", "audio input", "audio output", "video input", "web search"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["text", "image input", "audio input", "audio output", "video input", "web search"]
  },
  {
    id: "qwen3-omni-flash",
    name: "Qwen3 Omni Flash",
    provider: "Qwen (Alibaba)",
    description: "Qwen3 omni model, accepts text, image, audio, and video inputs with text and voice output. Supports thinking mode (text-only output in thinking mode). Ideal for short video analysis and cost-sensitive scenarios.",
    contextLength: 65536,
    promptPrice: 0.26,
    completionPrice: 0.99,
    category: "Multimodal Model",
    tags: ["omni", "multimodal", "audio input", "audio output", "video input", "thinking mode"],
    isNew: false,
    maxOutput: 16384,
    supported: ["text", "image input", "audio input", "audio output", "video input", "thinking mode"]
  },

  // ========== Code Models ==========
  {
    id: "qwen3-coder-plus",
    name: "Qwen3 Coder Plus",
    provider: "Qwen (Alibaba)",
    description: "Qwen3 exceptional code model, excels at tool calling and environment interaction, with outstanding code generation, completion, debugging, and refactoring capabilities. 1M context window.",
    contextLength: 1000000,
    promptPrice: 0.57,
    completionPrice: 2.29,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.57, completionPrice: 2.29 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.86, completionPrice: 3.43 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 1.43, completionPrice: 5.71 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 2.86, completionPrice: 28.57 },
    ],
    category: "Code Model",
    tags: ["coding", "code generation", "tool calling", "1M context"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["text", "code generation", "function calling"]
  },
  {
    id: "qwen3-coder-flash",
    name: "Qwen3 Coder Flash",
    provider: "Qwen (Alibaba)",
    description: "Qwen3 code flash model, fast code completion and generation, ideal for IDE integration scenarios.",
    contextLength: 1000000,
    promptPrice: 0.14,
    completionPrice: 0.57,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.14, completionPrice: 0.57 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.21, completionPrice: 0.86 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 0.36, completionPrice: 1.43 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 0.71, completionPrice: 3.57 },
    ],
    category: "Code Model",
    tags: ["coding", "ultra-fast", "cost-effective"],
    isNew: true,
    maxOutput: 65536,
    supported: ["text", "code generation"]
  },

  // ========== Math Models ==========
  {
    id: "qwen-math-plus",
    name: "Qwen Math Plus",
    provider: "Qwen (Alibaba)",
    description: "Qwen math-specialized model, excels at mathematical problem solving, proofs, and computation, supports LaTeX format output.",
    contextLength: 4096,
    promptPrice: 0.55,
    completionPrice: 1.66,
    category: "Reasoning Model",
    tags: ["mathematics", "reasoning", "problem solving", "LaTeX"],
    isNew: true,
    maxOutput: 4096,
    supported: ["text", "math solving"]
  },

  // ========== Specialty Models ==========
  {
    id: "qwen-mt-plus",
    name: "Qwen MT Plus",
    provider: "Qwen (Alibaba)",
    description: "Qwen flagship translation model, supports 92 language pairs, outstanding translation quality, ideal for professional translation scenarios.",
    contextLength: 16384,
    promptPrice: 0.25,
    completionPrice: 0.74,
    category: "Specialty Model",
    tags: ["translation", "92 languages", "professional"],
    isNew: true,
    maxOutput: 8192,
    supported: ["text", "translation"]
  },
  {
    id: "tongyi-intent-detect-v3",
    name: "Tongyi Intent Detect V3",
    provider: "Qwen (Alibaba)",
    description: "Qwen intent understanding model, rapidly and accurately parses user intent within milliseconds, suitable for customer service routing, intelligent dialogue distribution, and instruction parsing scenarios.",
    contextLength: 8192,
    promptPrice: 0.06,
    completionPrice: 0.14,
    category: "Specialty Model",
    tags: ["intent detection", "fast", "customer service routing", "classification"],
    isNew: true,
    maxOutput: 1024,
    supported: ["text", "intent classification"]
  },

  // ========== Embedding Models ==========
  {
    id: "text-embedding-v4",
    name: "Text Embedding V4",
    provider: "Qwen (Alibaba)",
    description: "Qwen latest text embedding model, supports 100+ languages and multiple programming languages, vector dimensions selectable from 2048, 1536, 1024, 768, 512, 256, 128, 64, suitable for semantic retrieval, clustering, recommendation, and RAG.",
    contextLength: 8192,
    promptPrice: 0.07,
    completionPrice: 0,
    category: "Embedding Model",
    tags: ["embedding", "vector", "semantic search", "RAG"],
    isFeatured: true,
    isNew: true,
    maxOutput: 1,
    supported: ["text to vector"]
  },
  {
    id: "text-embedding-v3",
    name: "Text Embedding V3",
    provider: "Qwen (Alibaba)",
    description: "Qwen text embedding model, converts text into high-dimensional vector representations, suitable for semantic search, clustering, and recommendation scenarios.",
    contextLength: 8192,
    promptPrice: 0.07,
    completionPrice: 0,
    category: "Embedding Model",
    tags: ["embedding", "vector", "semantic search"],
    isNew: true,
    maxOutput: 1,
    supported: ["text to vector"]
  },

  // ========== Audio Models ==========
  {
    id: "qwen3-asr-flash",
    name: "Qwen3 ASR Flash",
    provider: "Qwen (Alibaba)",
    description: "Qwen3 speech recognition model, supports automatic detection and transcription in 11 languages, word-level timestamps, emotion recognition, singing recognition, and speaker diarization. Supports both real-time and non-real-time modes.",
    contextLength: 0,
    promptPrice: 0.03,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "Real-time Recognition", price: 0.03 },
    ],
    category: "Audio Model",
    tags: ["speech recognition", "ASR", "multilingual", "real-time"],
    isNew: true,
    maxOutput: 0,
    supported: ["speech to text"]
  },
  {
    id: "qwen3-tts-flash-realtime",
    name: "Qwen3 TTS Flash Realtime",
    provider: "Qwen (Alibaba)",
    description: "Qwen3 real-time text-to-speech model, streaming synthesis via WebSocket, supports multiple languages and voice tones including Chinese and English, suitable for voice assistants and audiobooks.",
    contextLength: 0,
    promptPrice: 0.14,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "Real-time Synthesis", price: 0.14 },
    ],
    category: "Audio Model",
    tags: ["text-to-speech", "TTS", "real-time", "multilingual"],
    isNew: true,
    maxOutput: 0,
    supported: ["text to speech"]
  },

  // ========== Image Generation ==========
  {
    id: "wan2.6-t2i",
    name: "Wan 2.6 Text-to-Image",
    provider: "Qwen (Alibaba)",
    description: "Latest generation text-to-image flagship model, supports mixed text-image output and image editing. Can process complex instructions, render Chinese and English text, and generate high-definition realistic images. Supports multiple resolutions and aspect ratios.",
    contextLength: 4000,
    promptPrice: 0.03,
    completionPrice: 0,
    pricingType: "per-image",
    pricingTiers: [
      { label: "Standard", price: 0.03 },
    ],
    category: "Image Generation",
    tags: ["image generation", "text-to-image", "mixed text-image", "HD realistic", "text rendering"],
    isFeatured: true,
    isNew: true,
    maxOutput: 4,
    supported: ["text to image", "mixed text-image", "image editing"]
  },

  // ========== Video Generation ==========
  {
    id: "wan2.6-t2v",
    name: "Wan 2.6 Text-to-Video",
    provider: "Qwen (Alibaba)",
    description: "Latest generation text-to-video flagship model, supports multi-shot narrative and intelligent storyboard. Can generate 2-15 second 1080P HD video, supports prompt rewriting. Generation time approximately 1-5 minutes.",
    contextLength: 1500,
    promptPrice: 0.09,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.09 },
      { label: "1080P", price: 0.14 },
    ],
    category: "Video Generation",
    tags: ["video generation", "text-to-video", "multi-shot", "1080P"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["text-to-video", "multi-shot narrative"],
  },
  {
    id: "wan2.6-i2v",
    name: "Wan 2.6 Image-to-Video",
    provider: "Qwen (Alibaba)",
    description: "Image-driven video generation model, uses the input image as the first frame to generate coherent video. Supports multi-shot narrative, automatic dubbing, 720P/1080P resolution, 2-15 seconds duration. Excellent frame coherence and motion consistency.",
    contextLength: 1500,
    promptPrice: 0.09,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.09 },
      { label: "1080P", price: 0.14 },
    ],
    category: "Video Generation",
    tags: ["video generation", "image-to-video", "first-frame driven", "multi-shot", "dubbing"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["image-to-video", "multi-shot narrative", "automatic dubbing"],
  },
  {
    id: "wan2.6-i2v-flash",
    name: "Wan 2.6 Image-to-Video Flash",
    provider: "Qwen (Alibaba)",
    description: "Fast image-to-video model, supports audio and silent video generation. Faster generation speed, ideal for latency-sensitive scenarios. Supports 720P/1080P, 2-15 seconds duration.",
    contextLength: 1500,
    promptPrice: 0.02,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P with Audio", price: 0.04 },
      { label: "1080P with Audio", price: 0.07 },
      { label: "720P Silent", price: 0.02 },
      { label: "1080P Silent", price: 0.03 },
    ],
    category: "Video Generation",
    tags: ["video generation", "image-to-video", "fast", "Flash"],
    isNew: true,
    maxOutput: 15,
    supported: ["image-to-video", "fast generation"],
  },
  {
    id: "wan2.6-r2v",
    name: "Wan 2.6 Reference-to-Video",
    provider: "Qwen (Alibaba)",
    description: "Multimodal input video generation model, supports text/image/video as references. Can use characters or objects as protagonists to generate single-character or multi-character interaction videos. 2-10 seconds duration, supports intelligent storyboarding.",
    contextLength: 1500,
    promptPrice: 0.08,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.08 },
      { label: "1080P", price: 0.14 },
    ],
    category: "Video Generation",
    tags: ["video generation", "reference-to-video", "role play", "multimodal"],
    isNew: true,
    maxOutput: 10,
    supported: ["reference-to-video", "role play", "multi-character interaction"],
  },
  {
    id: "wan2.6-r2v-flash",
    name: "Wan 2.6 Reference-to-Video Flash",
    provider: "Qwen (Alibaba)",
    description: "Fast reference-to-video model, supports audio and silent output. Faster generation speed, ideal for rapid iteration scenarios. Supports 720P/1080P resolution.",
    contextLength: 1500,
    promptPrice: 0.02,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P with Audio", price: 0.04 },
      { label: "1080P with Audio", price: 0.07 },
      { label: "720P Silent", price: 0.02 },
      { label: "1080P Silent", price: 0.03 },
    ],
    category: "Video Generation",
    tags: ["video generation", "reference-to-video", "fast", "Flash"],
    isNew: true,
    maxOutput: 10,
    supported: ["reference-to-video", "fast generation"],
  },
  {
    id: "pixverse-v6",
    name: "PixVerse V6",
    provider: "PixVerse",
    description: "PixVerse latest flagship video generation model, supports text-to-video and image-to-video, with significantly improved visual quality and motion consistency. Supports 1-15 seconds duration, 360p/540p/720p/1080p multiple resolutions, various aspect ratios.",
    contextLength: 500,
    promptPrice: 0.02,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "360P with Audio", price: 0.03 },
      { label: "540P with Audio", price: 0.04 },
      { label: "720P with Audio", price: 0.05 },
      { label: "1080P with Audio", price: 0.10 },
      { label: "360P Silent", price: 0.02 },
      { label: "540P Silent", price: 0.03 },
      { label: "720P Silent", price: 0.04 },
      { label: "1080P Silent", price: 0.08 },
    ],
    category: "Video Generation",
    tags: ["video generation", "text-to-video", "image-to-video", "flagship", "V6"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["text-to-video", "image-to-video"]
  },

  // ========== HappyHorse ==========
  {
    id: "happyhorse-1.0-t2v",
    name: "HappyHorse 1.0 Text-to-Video",
    provider: "Alibaba",
    description: "Alibaba's 2026 latest AI video generation model, ranked #1 on benchmarks. Generates high-quality video from text, supports 720P/1080P, 3-15 seconds duration, various aspect ratios. Default audio included.",
    contextLength: 2500,
    promptPrice: 0.13,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.13 },
      { label: "1080P", price: 0.23 },
    ],
    category: "Video Generation",
    tags: ["video generation", "text-to-video", "high quality", "benchmark #1", "audio"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["text-to-video"]
  },
  {
    id: "happyhorse-1.0-i2v",
    name: "HappyHorse 1.0 Image-to-Video",
    provider: "Alibaba",
    description: "Generates coherent video using the input image as the first frame, supports 720P/1080P, 3-15 seconds duration. Excellent frame coherence and motion consistency. Default audio included.",
    contextLength: 2500,
    promptPrice: 0.13,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.13 },
      { label: "1080P", price: 0.23 },
    ],
    category: "Video Generation",
    tags: ["video generation", "image-to-video", "first-frame driven", "high quality", "audio"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["image-to-video"]
  },
  {
    id: "happyhorse-1.0-r2v",
    name: "HappyHorse 1.0 Reference-to-Video",
    provider: "Alibaba",
    description: "Supports 1-9 reference images input, can fuse characters/objects/scenes from images to generate video. Supports 720P/1080P, 3-15 seconds, various aspect ratios. Default audio included.",
    contextLength: 2500,
    promptPrice: 0.13,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.13 },
      { label: "1080P", price: 0.23 },
    ],
    category: "Video Generation",
    tags: ["video generation", "reference-to-video", "multi-image input", "high quality", "audio"],
    isNew: true,
    maxOutput: 15,
    supported: ["reference-to-video"]
  },
  {
    id: "happyhorse-1.0-video-edit",
    name: "HappyHorse 1.0 Video Edit",
    provider: "Alibaba",
    description: "AI video editing based on input video, supports 0-5 reference images for assisted editing. Input video 3-60 seconds (truncated beyond 15s), supports 720P/1080P, can preserve original audio.",
    contextLength: 2500,
    promptPrice: 0.13,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.13 },
      { label: "1080P", price: 0.23 },
    ],
    category: "Video Generation",
    tags: ["video generation", "video editing", "AI editing", "audio preservation"],
    isNew: true,
    maxOutput: 15,
    supported: ["video editing"]
  },

  // ========== DeepSeek Series ==========
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    description: "DeepSeek V4 Flash high-speed model via DashScope, ideal for low-latency and high-concurrency online dialogue scenarios.",
    contextLength: 1000000,
    promptPrice: 0.14,
    completionPrice: 0.29,
    category: "Language Model",
    tags: ["V4", "ultra-fast", "high concurrency", "cost-effective"],
    isNew: true,
    maxOutput: 16384,
    supported: ["text", "function calling"]
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    description: "DeepSeek V4 Pro flagship model via DashScope, designed for complex reasoning, code generation, and multi-step tasks.",
    contextLength: 1000000,
    promptPrice: 1.71,
    completionPrice: 3.43,
    category: "Reasoning Model",
    tags: ["V4", "flagship", "reasoning", "coding"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["text", "function calling", "chain-of-thought"]
  },
  {
    id: "deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "DeepSeek",
    description: "DeepSeek latest general-purpose LLM, MoE architecture, strong bilingual Chinese-English capabilities, powerful coding abilities.",
    contextLength: 131072,
    promptPrice: 0.29,
    completionPrice: 0.43,
    category: "Language Model",
    tags: ["MoE", "coding", "multilingual"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["text", "function calling"]
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    description: "DeepSeek reasoning model with outstanding performance in mathematics, coding, and logical reasoning, displaying complete chain-of-thought.",
    contextLength: 131072,
    promptPrice: 0.55,
    completionPrice: 2.21,
    category: "Reasoning Model",
    tags: ["reasoning", "mathematics", "coding", "chain-of-thought"],
    isFeatured: true,
    maxOutput: 16384,
    supported: ["text", "chain-of-thought"]
  },
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    provider: "DeepSeek",
    description: "DeepSeek V3 general-purpose LLM, 671B parameter MoE architecture, excellent bilingual Chinese-English capabilities.",
    contextLength: 131072,
    promptPrice: 0.28,
    completionPrice: 1.10,
    category: "Language Model",
    tags: ["MoE", "multilingual", "coding"],
    maxOutput: 8192,
    supported: ["text", "function calling"]
  },

  // ========== Claude Official API ==========
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    provider: "Anthropic",
    description: "Anthropic's most capable general-purpose model, designed for complex reasoning, agentic coding, and long-context tasks. Official pricing: $5 input / $25 output per 1M tokens.",
    contextLength: 1000000,
    promptPrice: 5.00,
    completionPrice: 25.00,
    category: "Language Model",
    tags: ["Claude", "flagship", "agent", "vision", "1M context"],
    isFeatured: true,
    isNew: true,
    maxOutput: 128000,
    supported: ["text", "image input", "function calling", "extended thinking"]
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    description: "Anthropic's balanced speed and intelligence model, ideal for production-grade dialogue, code, tool use, and long-context workflows. Official pricing: $3 input / $15 output per 1M tokens.",
    contextLength: 1000000,
    promptPrice: 3.00,
    completionPrice: 15.00,
    category: "Language Model",
    tags: ["Claude", "balanced", "coding", "vision", "1M context"],
    isFeatured: true,
    isNew: true,
    maxOutput: 64000,
    supported: ["text", "image input", "function calling", "extended thinking"]
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    description: "Anthropic's fast and low-cost model with near-frontier intelligence, ideal for low-latency dialogue, classification, extraction, and batch tasks. Official pricing: $1 input / $5 output per 1M tokens.",
    contextLength: 200000,
    promptPrice: 1.00,
    completionPrice: 5.00,
    category: "Language Model",
    tags: ["Claude", "ultra-fast", "low cost", "vision"],
    isNew: true,
    maxOutput: 64000,
    supported: ["text", "image input", "function calling", "extended thinking"]
  },

  // ========== Other Third-Party Models ==========
  {
    id: "glm-4.7",
    name: "GLM 4.7",
    provider: "Zhipu AI",
    description: "Zhipu AI latest GLM-4.7 model with significantly improved overall capabilities and strong Chinese language understanding.",
    contextLength: 169984,
    promptPrice: 0.41,
    completionPrice: 1.93,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.41, completionPrice: 1.93 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.55, completionPrice: 2.21 },
    ],
    category: "Language Model",
    tags: ["Chinese optimized", "reasoning", "general"],
    isNew: true,
    maxOutput: 16384,
    supported: ["text", "function calling"]
  },
  {
    id: "glm-5",
    name: "GLM 5",
    provider: "Zhipu AI",
    description: "Zhipu AI GLM-5 flagship model with comprehensive capability improvements, outstanding performance in reasoning, coding, and long-text tasks.",
    contextLength: 202752,
    promptPrice: 0.55,
    completionPrice: 2.48,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.55, completionPrice: 2.48 },
      { label: "32K<Token≤198K", maxTokens: 202752, promptPrice: 0.83, completionPrice: 3.03 },
    ],
    category: "Language Model",
    tags: ["flagship", "reasoning", "coding", "Chinese optimized"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["text", "function calling", "thinking mode"]
  },
  {
    id: "glm-5.1",
    name: "GLM 5.1",
    provider: "Zhipu AI",
    description: "Zhipu AI GLM-5.1 enhanced flagship model, further optimized over GLM-5, stronger complex reasoning and code generation capabilities.",
    contextLength: 202745,
    promptPrice: 0.83,
    completionPrice: 3.31,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.83, completionPrice: 3.31 },
      { label: "32K<Token≤198K", maxTokens: 202752, promptPrice: 1.10, completionPrice: 3.86 },
    ],
    category: "Language Model",
    tags: ["flagship", "reasoning", "coding", "enhanced"],
    isFeatured: true,
    isNew: true,
    maxOutput: 131072,
    supported: ["text", "function calling", "thinking mode"]
  },
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    provider: "Moonshot AI",
    description: "Moonshot AI Kimi K2.5 model, excels at long-text understanding and multi-turn dialogue with outstanding Chinese language capabilities.",
    contextLength: 262144,
    promptPrice: 0.55,
    completionPrice: 2.90,
    category: "Language Model",
    tags: ["long context", "multi-turn dialogue", "Chinese optimized"],
    maxOutput: 98304,
    supported: ["text"]
  },
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    provider: "Moonshot AI",
    description: "Moonshot AI Kimi K2.6 latest flagship model with significantly improved long-text understanding and creative writing, supports longer context windows.",
    contextLength: 262144,
    promptPrice: 0.90,
    completionPrice: 3.72,
    category: "Language Model",
    tags: ["flagship", "long context", "creative writing", "Chinese optimized"],
    isFeatured: true,
    isNew: true,
    maxOutput: 98304,
    supported: ["text", "function calling"]
  },
  {
    id: "MiniMax-M2.1",
    name: "MiniMax M2.1",
    provider: "MiniMax",
    description: "MiniMax M2.1 model, outstanding performance in creative writing and multi-turn dialogue.",
    contextLength: 204800,
    promptPrice: 0.29,
    completionPrice: 1.16,
    category: "Language Model",
    tags: ["creative writing", "dialogue", "general"],
    maxOutput: 32768,
    supported: ["text"]
  },
  {
    id: "MiniMax-M2.5",
    name: "MiniMax M2.5",
    provider: "MiniMax",
    description: "MiniMax M2.5 enhanced model with improved reasoning and coding capabilities, more stable multi-turn dialogue.",
    contextLength: 196608,
    promptPrice: 0.29,
    completionPrice: 1.16,
    category: "Language Model",
    tags: ["reasoning", "coding", "dialogue"],
    isNew: true,
    maxOutput: 32768,
    supported: ["text", "function calling"]
  },

  // ========== Qwen3 Small Models ==========
  {
    id: "qwen3-8b",
    name: "Qwen3 8B",
    provider: "Qwen (Alibaba)",
    description: "Qwen3 open-source 8B parameter lightweight model, ideal for edge deployment and low-cost inference scenarios.",
    contextLength: 131072,
    promptPrice: 0.07,
    completionPrice: 0.29,
    category: "Language Model",
    tags: ["open-source", "lightweight", "cost-effective"],
    isNew: true,
    maxOutput: 8192,
    supported: ["text", "function calling"]
  },
];
