export interface PricingTier {
  label: string;   // e.g. "720P", "1080P", "540P Silent"
  price: number;   // USD per second/image
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
    provider: "Qwen",
    description: "Qwen3.7 series cost-effective Plus model. Builds on strong text capabilities with comprehensively upgraded vision-language abilities while preserving full agentic capability for coding, tool use, and productivity workflows. Supports multi-modal interactive hybrid agents: perceiving real-world scenes, reading screens and operating GUIs, generating code from visual references, and end-to-end mobile app navigation. Functionally equivalent to snapshot qwen3.7-plus-2026-05-26.",
    contextLength: 1000000,
    promptPrice: 0.286,
    completionPrice: 1.143,
    tokenPricingTiers: [
      { label: "0<Token≤256K", maxTokens: 262144, promptPrice: 0.286, completionPrice: 1.143 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 1.143, completionPrice: 4.571 },
    ],
    category: "Multimodal",
    tags: ["Cost-effective", "Multimodal", "Agent", "Vision", "Thinking", "1M Context"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["Text", "Image Input", "Function Calling", "Thinking", "Web Search", "Structured Output"]
  },
  {
    id: "qwen3.7-max",
    name: "Qwen3.7 Max",
    provider: "Qwen",
    description: "Qwen 3.7 generation flagship model, designed for the agent era with dramatically improved coding, office productivity, and long-horizon autonomous execution. Supports thinking mode toggling, function calling, and web search. 1M-token context.",
    contextLength: 1000000,
    promptPrice: 1.714,
    completionPrice: 5.143,
    category: "Large Language Model",
    tags: ["Flagship", "Reasoning", "Coding", "Thinking", "Agent"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["Text", "Function Calling", "Thinking", "Web Search"]
  },
  {
    id: "qwen3-max",
    name: "Qwen3 Max",
    provider: "Qwen",
    description: "Qwen 3 generation top flagship model with switchable thinking mode and outstanding performance on complex reasoning, code generation, and mathematics. 262K context window.",
    contextLength: 262144,
    promptPrice: 0.357,
    completionPrice: 1.429,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.357, completionPrice: 1.429 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.571, completionPrice: 2.286 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 1.0, completionPrice: 4.0 },
    ],
    category: "Large Language Model",
    tags: ["Flagship", "Reasoning", "Coding", "Thinking"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["Text", "Function Calling", "Thinking"]
  },
  {
    id: "qwen3.6-max-preview",
    name: "Qwen3.6 Max Preview",
    provider: "Qwen",
    description: "Qwen 3.6 generation top preview model, built for complex reasoning, code generation, and multi-step tool tasks. Suitable for scenarios that need stronger thinking ability.",
    contextLength: 262144,
    promptPrice: 1.286,
    completionPrice: 7.714,
    tokenPricingTiers: [
      { label: "0<Token≤128K", maxTokens: 131072, promptPrice: 1.286, completionPrice: 7.714 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 2.143, completionPrice: 12.857 },
    ],
    category: "Large Language Model",
    tags: ["Flagship", "Reasoning", "Preview"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["Text", "Function Calling", "Thinking"]
  },
  {
    id: "qwen3.6-plus",
    name: "Qwen3.6 Plus",
    provider: "Qwen",
    description: "Qwen 3.6 generation balanced flagship model with 1M-token context, function calling, and built-in tools. Suitable for large codebases and general production scenarios.",
    contextLength: 1000000,
    promptPrice: 0.286,
    completionPrice: 1.714,
    tokenPricingTiers: [
      { label: "0<Token≤256K", maxTokens: 262144, promptPrice: 0.286, completionPrice: 1.714 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 1.143, completionPrice: 6.857 },
    ],
    category: "Large Language Model",
    tags: ["Cost-effective", "Balanced", "1M Context"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["Text", "Function Calling", "Built-in Tools", "Thinking"]
  },
  {
    id: "qwen3.5-plus",
    name: "Qwen3.5 Plus",
    provider: "Qwen",
    description: "Qwen 3.5 generation enhanced edition, with the best balance of quality, speed, and cost. Supports a 1M-token context window for large-scale application scenarios.",
    contextLength: 1000000,
    promptPrice: 0.114,
    completionPrice: 0.686,
    tokenPricingTiers: [
      { label: "0<Token≤128K", maxTokens: 131072, promptPrice: 0.114, completionPrice: 0.686 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 0.286, completionPrice: 1.714 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 0.571, completionPrice: 3.429 },
    ],
    category: "Large Language Model",
    tags: ["Cost-effective", "Balanced", "1M Context"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["Text", "Function Calling", "Thinking"]
  },
  {
    id: "qwen3.6-flash",
    name: "Qwen3.6 Flash",
    provider: "Qwen",
    description: "Qwen 3.6 generation lightning edition for simple tasks. Fast and cheap, with 1M-token context window and context caching.",
    contextLength: 1000000,
    promptPrice: 0.171,
    completionPrice: 1.029,
    tokenPricingTiers: [
      { label: "0<Token≤256K", maxTokens: 262144, promptPrice: 0.171, completionPrice: 1.029 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 0.686, completionPrice: 4.114 },
    ],
    category: "Large Language Model",
    tags: ["Fast", "Low Cost", "1M Context"],
    isNew: true,
    maxOutput: 65536,
    supported: ["Text", "Function Calling", "Thinking"]
  },
  {
    id: "qwen3.5-flash",
    name: "Qwen3.5 Flash",
    provider: "Qwen",
    description: "Qwen 3.5 generation lightning edition for simple tasks. Fast and cheap, with 1M-token context window and context caching.",
    contextLength: 1000000,
    promptPrice: 0.029,
    completionPrice: 0.286,
    tokenPricingTiers: [
      { label: "0<Token≤128K", maxTokens: 131072, promptPrice: 0.029, completionPrice: 0.286 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 0.114, completionPrice: 1.143 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 0.171, completionPrice: 1.714 },
    ],
    category: "Large Language Model",
    tags: ["Fast", "Low Cost", "1M Context"],
    isNew: true,
    maxOutput: 65536,
    supported: ["Text", "Function Calling", "Thinking"]
  },
  {
    id: "qwen-plus",
    name: "Qwen Plus",
    provider: "Qwen",
    description: "Qwen enhanced edition, the classic balance point between quality and speed. Suitable for large-scale application scenarios.",
    contextLength: 1000000,
    promptPrice: 0.114,
    completionPrice: 0.286,
    tokenPricingTiers: [
      { label: "0<Token≤128K (non-thinking)", maxTokens: 131072, promptPrice: 0.114, completionPrice: 0.286 },
      { label: "128K<Token≤256K (non-thinking)", maxTokens: 262144, promptPrice: 0.343, completionPrice: 2.857 },
      { label: "256K<Token≤1M (non-thinking)", maxTokens: 1000000, promptPrice: 0.686, completionPrice: 6.857 },
    ],
    category: "Large Language Model",
    tags: ["Cost-effective", "Balanced", "General Purpose"],
    isFeatured: true,
    maxOutput: 32768,
    supported: ["Text", "Function Calling"]
  },
  {
    id: "qwen-turbo",
    name: "Qwen Turbo",
    provider: "Qwen",
    description: "Qwen high-speed edition. Extremely fast response and lowest cost. Suitable for latency-sensitive applications.",
    contextLength: 1000000,
    promptPrice: 0.043,
    completionPrice: 0.086,
    category: "Large Language Model",
    tags: ["Fast", "Low Cost", "General Purpose"],
    maxOutput: 16384,
    supported: ["Text", "Function Calling"]
  },
  {
    id: "qwen-long",
    name: "Qwen Long",
    provider: "Qwen",
    description: "Qwen long-text model with extreme-length context support. Suitable for document analysis and long-form understanding. Context window up to 10M tokens.",
    contextLength: 10000000,
    promptPrice: 0.071,
    completionPrice: 0.286,
    category: "Large Language Model",
    tags: ["Ultra-Long Context", "Document Analysis"],
    maxOutput: 32768,
    supported: ["Text"]
  },
  {
    id: "qwen-flash",
    name: "Qwen Flash",
    provider: "Qwen",
    description: "Qwen ultra-fast general-purpose model with 1M-token context. Extremely fast and cheap for large-scale, high-concurrency scenarios. Supports function calling and thinking mode.",
    contextLength: 1000000,
    promptPrice: 0.021,
    completionPrice: 0.214,
    category: "Large Language Model",
    tags: ["Fast", "Low Cost", "1M Context", "General Purpose", "Thinking"],
    isNew: true,
    maxOutput: 32768,
    supported: ["Text", "Function Calling", "Thinking"]
  },

  // ========== Qwen3 Open-Source Series ==========
  {
    id: "qwen3-235b-a22b",
    name: "Qwen3 235B-A22B",
    provider: "Qwen",
    description: "Qwen3 open-source flagship: 235B-parameter MoE architecture (22B activated). Supports dynamic switching between thinking and non-thinking modes.",
    contextLength: 131072,
    promptPrice: 0.286,
    completionPrice: 1.143,
    category: "Large Language Model",
    tags: ["Open Source", "MoE", "Reasoning", "Thinking"],
    isNew: true,
    maxOutput: 8192,
    supported: ["Text", "Function Calling", "Thinking"]
  },
  {
    id: "qwen3.6-35b-a3b",
    name: "Qwen3.6 35B-A3B",
    provider: "Qwen",
    description: "Qwen3.6 open-source MoE model: 35B total parameters with only 3B activated. Excellent on agentic coding, STEM, and reasoning tasks. Apache 2.0 licensed. Supports thinking mode toggling.",
    contextLength: 262144,
    promptPrice: 0.257,
    completionPrice: 1.543,
    category: "Large Language Model",
    tags: ["Open Source", "MoE", "Lightweight", "Coding", "Thinking"],
    isNew: true,
    maxOutput: 32768,
    supported: ["Text", "Function Calling", "Thinking"]
  },
  {
    id: "qwen3-32b",
    name: "Qwen3 32B",
    provider: "Qwen",
    description: "Qwen3 open-source 32B-parameter dense model with strong performance among mid-sized models.",
    contextLength: 131072,
    promptPrice: 0.286,
    completionPrice: 1.143,
    category: "Large Language Model",
    tags: ["Open Source", "Reasoning", "Coding"],
    maxOutput: 8192,
    supported: ["Text", "Function Calling"]
  },

  // ========== Reasoning Models ==========
  {
    id: "qwq-plus",
    name: "QwQ Plus",
    provider: "Qwen",
    description: "Qwen reasoning model trained on Qwen2.5. Excels at math, logical reasoning, and complex problem analysis with full chain-of-thought visible.",
    contextLength: 131072,
    promptPrice: 0.229,
    completionPrice: 0.571,
    category: "Reasoning Model",
    tags: ["Reasoning", "Math", "Logic", "Chain-of-Thought"],
    isFeatured: true,
    maxOutput: 16384,
    supported: ["Text", "Chain-of-Thought"]
  },

  // ========== Vision Models ==========
  {
    id: "qwen-vl-max",
    name: "Qwen VL Max",
    provider: "Qwen",
    description: "Qwen vision flagship model. Supports image understanding, image-text dialogue, document OCR, and other multimodal tasks.",
    contextLength: 131072,
    promptPrice: 0.229,
    completionPrice: 0.571,
    category: "Multimodal",
    tags: ["Vision", "Multimodal", "OCR", "Image-Text"],
    isFeatured: true,
    maxOutput: 8192,
    supported: ["Text", "Image Input"]
  },
  {
    id: "qwen-vl-plus",
    name: "Qwen VL Plus",
    provider: "Qwen",
    description: "Qwen vision enhanced edition: a multimodal model that balances performance and cost.",
    contextLength: 131072,
    promptPrice: 0.114,
    completionPrice: 0.286,
    category: "Multimodal",
    tags: ["Vision", "Multimodal", "Cost-effective"],
    maxOutput: 8192,
    supported: ["Text", "Image Input"]
  },
  {
    id: "qwen3-vl-plus",
    name: "Qwen3 VL Plus",
    provider: "Qwen",
    description: "Qwen 3 generation vision-language model with substantially improved image understanding and high-resolution image input. 262K context window.",
    contextLength: 262144,
    promptPrice: 0.143,
    completionPrice: 1.429,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.143, completionPrice: 1.429 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.214, completionPrice: 2.143 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 0.429, completionPrice: 4.286 },
    ],
    category: "Multimodal",
    tags: ["Vision", "Multimodal", "High Resolution"],
    isNew: true,
    maxOutput: 32768,
    supported: ["Text", "Image Input"]
  },
  {
    id: "qwen3-vl-flash",
    name: "Qwen3 VL Flash",
    provider: "Qwen",
    description: "Qwen 3 generation vision lightning edition. Fast image understanding for real-time scenarios.",
    contextLength: 262144,
    promptPrice: 0.021,
    completionPrice: 0.214,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.021, completionPrice: 0.214 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.043, completionPrice: 0.429 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 0.086, completionPrice: 0.857 },
    ],
    category: "Multimodal",
    tags: ["Vision", "Fast", "Cost-effective"],
    maxOutput: 32768,
    supported: ["Text", "Image Input"]
  },
  // ========== Omni Models ==========
  {
    id: "qwen3-omni-flash",
    name: "Qwen3 Omni Flash",
    provider: "Qwen",
    description: "Qwen 3 generation omni model. Accepts text, image, and video inputs. Suitable for complex multimodal understanding scenarios.",
    contextLength: 65536,
    promptPrice: 0.257,
    completionPrice: 0.986,
    category: "Multimodal",
    tags: ["Omni", "Multimodal", "Video Input"],
    isNew: true,
    maxOutput: 8192,
    supported: ["Text", "Image Input", "Video Input"]
  },

  // ========== Coding-Specialized ==========
  {
    id: "qwen3-coder-plus",
    name: "Qwen3 Coder Plus",
    provider: "Qwen",
    description: "Qwen 3 generation top-tier coding model. Excels at tool use and environment interaction with outstanding code generation, completion, debugging, and refactoring. 1M-token context.",
    contextLength: 1000000,
    promptPrice: 0.571,
    completionPrice: 2.286,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.571, completionPrice: 2.286 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.857, completionPrice: 3.429 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 1.429, completionPrice: 5.714 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 2.857, completionPrice: 28.571 },
    ],
    category: "Coding Model",
    tags: ["Coding", "Code Generation", "Function Calling", "1M Context"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["Text", "Code Generation", "Function Calling"]
  },
  {
    id: "qwen3-coder-flash",
    name: "Qwen3 Coder Flash",
    provider: "Qwen",
    description: "Qwen 3 generation coding lightning edition. Fast code completion and generation for IDE integration scenarios.",
    contextLength: 1000000,
    promptPrice: 0.143,
    completionPrice: 0.571,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.143, completionPrice: 0.571 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.214, completionPrice: 0.857 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 0.357, completionPrice: 1.429 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 0.714, completionPrice: 3.571 },
    ],
    category: "Coding Model",
    tags: ["Coding", "Fast", "Cost-effective"],
    isNew: true,
    maxOutput: 65536,
    supported: ["Text", "Code Generation"]
  },

  // ========== Math Model ==========
  {
    id: "qwen-math-plus",
    name: "Qwen Math Plus",
    provider: "Qwen",
    description: "Qwen math-specialized model. Excels at solving, proving, and computing across math problems with LaTeX output support.",
    contextLength: 4096,
    promptPrice: 0.571,
    completionPrice: 1.714,
    category: "Reasoning Model",
    tags: ["Math", "Reasoning", "Solving", "LaTeX"],
    isNew: true,
    maxOutput: 4096,
    supported: ["Text", "Math Solving"]
  },

  // ========== Translation Model ==========
  {
    id: "qwen-mt-plus",
    name: "Qwen MT Plus",
    provider: "Qwen",
    description: "Qwen flagship translation model. Supports translation across 92 languages with excellent quality for professional use cases.",
    contextLength: 16384,
    promptPrice: 0.257,
    completionPrice: 0.771,
    category: "Specialized",
    tags: ["Translation", "92 Languages", "Professional"],
    isNew: true,
    maxOutput: 8192,
    supported: ["Text", "Translation"]
  },
  {
    id: "tongyi-intent-detect-v3",
    name: "Tongyi Intent Detection V3",
    provider: "Qwen",
    description: "Qwen intent-understanding model. Parses user intent quickly and accurately at sub-100ms latency. Suitable for customer-service routing, dialog dispatch, and instruction parsing.",
    contextLength: 8192,
    promptPrice: 0.06,
    completionPrice: 0.149,
    category: "Specialized",
    tags: ["Intent Detection", "Fast", "Routing", "Classification"],
    isNew: true,
    maxOutput: 1024,
    supported: ["Text", "Intent Classification"]
  },

  // ========== Embedding Models ==========
  {
    id: "text-embedding-v4",
    name: "Text Embedding V4",
    provider: "Qwen",
    description: "Latest Qwen text embedding model. Supports 100+ natural and programming languages. Selectable embedding dimensions: 2048, 1536, 1024, 768, 512, 256, 128, 64. Suitable for semantic search, clustering, recommendation, and RAG.",
    contextLength: 8192,
    promptPrice: 0.071,
    completionPrice: 0,
    category: "Embedding",
    tags: ["Embedding", "Vector", "Semantic Search", "RAG"],
    isFeatured: true,
    isNew: true,
    maxOutput: 1,
    supported: ["Text-to-Vector"]
  },
  {
    id: "text-embedding-v3",
    name: "Text Embedding V3",
    provider: "Qwen",
    description: "Qwen text embedding model. Converts text into high-dimensional vector representations for semantic search, clustering, and recommendation.",
    contextLength: 8192,
    promptPrice: 0.071,
    completionPrice: 0,
    category: "Embedding",
    tags: ["Embedding", "Vector", "Semantic Search"],
    isNew: true,
    maxOutput: 1,
    supported: ["Text-to-Vector"]
  },

  // ========== Audio Models ==========
  {
    id: "qwen3-asr-flash",
    name: "Qwen3 ASR Flash",
    provider: "Qwen",
    description: "Qwen 3 generation speech recognition model. Auto-detects and transcribes 11 languages, with word-level timestamps, sentiment recognition, singing recognition, and speaker diarization. Real-time and offline modes.",
    contextLength: 0,
    promptPrice: 0.033,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "Real-time Recognition", price: 0.033 },
    ],
    category: "Audio",
    tags: ["Speech Recognition", "ASR", "Multilingual", "Real-time"],
    isNew: true,
    maxOutput: 0,
    supported: ["Speech-to-Text"]
  },
  {
    id: "qwen3-tts-flash-realtime",
    name: "Qwen3 TTS Flash Realtime",
    provider: "Qwen",
    description: "Qwen 3 generation real-time speech synthesis model. Streaming synthesis over WebSocket. Supports multiple languages and voices for voice assistants, audiobooks, and similar scenarios.",
    contextLength: 0,
    promptPrice: 0.143,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "Real-time Synthesis", price: 0.143 },
    ],
    category: "Audio",
    tags: ["Speech Synthesis", "TTS", "Real-time", "Multilingual"],
    isNew: true,
    maxOutput: 0,
    supported: ["Text-to-Speech"]
  },

  // ========== Image Generation ==========
  {
    id: "wan2.6-t2i",
    name: "Wan 2.6 Text-to-Image",
    provider: "Qwen",
    description: "Latest-generation text-to-image flagship. Supports interleaved image-text output and image editing. Handles complex instructions, renders Chinese and English text, and produces high-fidelity photorealistic images. Multiple resolutions and aspect ratios.",
    contextLength: 4000,
    promptPrice: 0.029,
    completionPrice: 0,
    pricingType: "per-image",
    pricingTiers: [
      { label: "Standard", price: 0.029 },
    ],
    category: "Image Generation",
    tags: ["Image Generation", "Text-to-Image", "Interleaved", "Photorealistic", "Text Rendering"],
    isFeatured: true,
    isNew: true,
    maxOutput: 4,
    supported: ["Text-to-Image", "Interleaved Image-Text", "Image Editing"]
  },
  // ========== Video Generation ==========
  {
    id: "wan2.6-t2v",
    name: "Wan 2.6 Text-to-Video",
    provider: "Qwen",
    description: "Latest-generation text-to-video flagship. Supports multi-shot narrative and intelligent shot composition. Generates 2-15 second 1080p videos with prompt rewriting. Generation takes about 1-5 minutes.",
    contextLength: 1500,
    promptPrice: 0.086,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.086 },
      { label: "1080P", price: 0.143 },
    ],
    category: "Video Generation",
    tags: ["Video Generation", "Text-to-Video", "Multi-shot", "1080P"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["Text-to-Video", "Multi-shot Narrative"],
    // Limits: RPS 5, concurrency 5
  },
  {
    id: "wan2.6-i2v",
    name: "Wan 2.6 Image-to-Video",
    provider: "Qwen",
    description: "Image-driven video generation: uses an input image as the first frame to produce a coherent video. Supports multi-shot narrative, automatic audio, 720P/1080P resolutions, 2-15 second duration. Outstanding visual coherence and motion consistency.",
    contextLength: 1500,
    promptPrice: 0.086,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.086 },
      { label: "1080P", price: 0.143 },
    ],
    category: "Video Generation",
    tags: ["Video Generation", "Image-to-Video", "First-frame Driven", "Multi-shot", "Audio"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["Image-to-Video", "Multi-shot Narrative", "Automatic Audio"],
    // Limits: RPS 5, concurrency 5
  },
  {
    id: "wan2.6-i2v-flash",
    name: "Wan 2.6 Image-to-Video Flash",
    provider: "Qwen",
    description: "Image-to-video fast variant. Supports videos with or without audio. Faster generation for latency-sensitive scenarios. 720P/1080P, 2-15 second duration.",
    contextLength: 1500,
    promptPrice: 0.021,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P with Audio", price: 0.043 },
      { label: "1080P with Audio", price: 0.071 },
      { label: "720P Silent", price: 0.021 },
      { label: "1080P Silent", price: 0.036 },
    ],
    category: "Video Generation",
    tags: ["Video Generation", "Image-to-Video", "Fast", "Flash"],
    isNew: true,
    maxOutput: 15,
    supported: ["Image-to-Video", "Fast Generation"],
  },
  {
    id: "wan2.6-r2v",
    name: "Wan 2.6 Reference-to-Video",
    provider: "Qwen",
    description: "Multimodal-input video generator. Accepts text/image/video as references. Can use a person or object as the protagonist to generate single-character performances or multi-character interactions. 2-10 seconds, with intelligent shot composition.",
    contextLength: 1500,
    promptPrice: 0.086,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.086 },
      { label: "1080P", price: 0.143 },
    ],
    category: "Video Generation",
    tags: ["Video Generation", "Reference-to-Video", "Role Play", "Multimodal"],
    isNew: true,
    maxOutput: 10,
    supported: ["Reference-to-Video", "Role Play", "Multi-character Interaction"],
  },
  {
    id: "wan2.6-r2v-flash",
    name: "Wan 2.6 Reference-to-Video Flash",
    provider: "Qwen",
    description: "Reference-to-video fast variant. Supports videos with or without audio. Faster generation for rapid iteration. 720P/1080P resolutions.",
    contextLength: 1500,
    promptPrice: 0.021,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P with Audio", price: 0.043 },
      { label: "1080P with Audio", price: 0.071 },
      { label: "720P Silent", price: 0.021 },
      { label: "1080P Silent", price: 0.036 },
    ],
    category: "Video Generation",
    tags: ["Video Generation", "Reference-to-Video", "Fast", "Flash"],
    isNew: true,
    maxOutput: 10,
    supported: ["Reference-to-Video", "Fast Generation"],
  },
  {
    id: "pixverse-v6",
    name: "PixVerse V6",
    provider: "PixVerse",
    description: "PixVerse latest flagship video generation model. Supports text-to-video and image-to-video with significantly improved visual quality and motion consistency. 1-15 second duration. 360p/540p/720p/1080p resolutions and multiple aspect ratios.",
    contextLength: 500,
    promptPrice: 0.021,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "360P with Audio", price: 0.030 },
      { label: "540P with Audio", price: 0.039 },
      { label: "720P with Audio", price: 0.051 },
      { label: "1080P with Audio", price: 0.097 },
      { label: "360P Silent", price: 0.021 },
      { label: "540P Silent", price: 0.030 },
      { label: "720P Silent", price: 0.039 },
      { label: "1080P Silent", price: 0.076 },
    ],
    category: "Video Generation",
    tags: ["Video Generation", "Text-to-Video", "Image-to-Video", "Flagship", "V6"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["Text-to-Video", "Image-to-Video"]
  },

  // ========== HappyHorse ==========
  {
    id: "happyhorse-1.0-t2v",
    name: "HappyHorse 1.0 Text-to-Video",
    provider: "Alibaba",
    description: "Alibaba's 2026 latest AI video generation model, ranked #1 on industry leaderboards. Generates high-quality videos from text. Supports 720P/1080P, 3-15 second duration, multiple aspect ratios. Audio output by default.",
    contextLength: 2500,
    promptPrice: 0.129,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.129 },
      { label: "1080P", price: 0.229 },
    ],
    category: "Video Generation",
    tags: ["Video Generation", "Text-to-Video", "High Quality", "Top-ranked", "Audio"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["Text-to-Video"]
  },
  {
    id: "happyhorse-1.0-i2v",
    name: "HappyHorse 1.0 Image-to-Video",
    provider: "Alibaba",
    description: "Generates a coherent video from an input image as the first frame. 720P/1080P, 3-15 second duration. Excellent visual coherence and motion consistency. Audio output by default.",
    contextLength: 2500,
    promptPrice: 0.129,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.129 },
      { label: "1080P", price: 0.229 },
    ],
    category: "Video Generation",
    tags: ["Video Generation", "Image-to-Video", "First-frame Driven", "High Quality", "Audio"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["Image-to-Video"]
  },
  {
    id: "happyhorse-1.0-r2v",
    name: "HappyHorse 1.0 Reference-to-Video",
    provider: "Alibaba",
    description: "Accepts 1-9 reference images and fuses people, objects, or scenes into a generated video. 720P/1080P, 3-15 seconds, multiple aspect ratios. Audio output by default.",
    contextLength: 2500,
    promptPrice: 0.129,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.129 },
      { label: "1080P", price: 0.229 },
    ],
    category: "Video Generation",
    tags: ["Video Generation", "Reference-to-Video", "Multi-image Input", "High Quality", "Audio"],
    isNew: true,
    maxOutput: 15,
    supported: ["Reference-to-Video"]
  },
  {
    id: "happyhorse-1.0-video-edit",
    name: "HappyHorse 1.0 Video Edit",
    provider: "Alibaba",
    description: "AI video editing on an input video. Supports 0-5 reference images to assist editing. Input video 3-60 seconds (truncated past 15s). 720P/1080P. Original audio can be preserved.",
    contextLength: 2500,
    promptPrice: 0.129,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.129 },
      { label: "1080P", price: 0.229 },
    ],
    category: "Video Generation",
    tags: ["Video Generation", "Video Editing", "AI Editing", "Audio Preserved"],
    isNew: true,
    maxOutput: 15,
    supported: ["Video Editing"]
  },

  // ========== DeepSeek ==========
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    description: "DeepSeek V4 Flash high-speed model (DashScope channel). Ideal for low-latency, high-concurrency online dialogue scenarios.",
    contextLength: 1000000,
    promptPrice: 0.143,
    completionPrice: 0.286,
    category: "Large Language Model",
    tags: ["V4", "Fast", "High Concurrency", "Cost-effective"],
    isNew: true,
    maxOutput: 16384,
    supported: ["Text", "Function Calling"]
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    description: "DeepSeek V4 Pro flagship (DashScope channel). Built for complex reasoning, code generation, and multi-step tasks.",
    contextLength: 1000000,
    promptPrice: 1.714,
    completionPrice: 3.429,
    category: "Reasoning Model",
    tags: ["V4", "Flagship", "Reasoning", "Coding"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["Text", "Function Calling", "Chain-of-Thought"]
  },
  {
    id: "deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "DeepSeek",
    description: "DeepSeek's latest general-purpose model. MoE architecture with strong bilingual (Chinese-English) capability and excellent coding ability.",
    contextLength: 131072,
    promptPrice: 0.286,
    completionPrice: 0.429,
    category: "Large Language Model",
    tags: ["MoE", "Coding", "Multilingual"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["Text", "Function Calling"]
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    description: "DeepSeek reasoning model with outstanding performance on math, programming, and logical reasoning. Shows full thinking process.",
    contextLength: 65536,
    promptPrice: 0.571,
    completionPrice: 2.286,
    category: "Reasoning Model",
    tags: ["Reasoning", "Math", "Coding", "Chain-of-Thought"],
    isFeatured: true,
    maxOutput: 8192,
    supported: ["Text", "Chain-of-Thought"]
  },
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    provider: "DeepSeek",
    description: "DeepSeek V3 general-purpose model. 671B-parameter MoE architecture with strong bilingual capability.",
    contextLength: 65536,
    promptPrice: 0.286,
    completionPrice: 1.143,
    category: "Large Language Model",
    tags: ["MoE", "Multilingual", "Coding"],
    maxOutput: 8192,
    supported: ["Text", "Function Calling"]
  },
  // ========== Claude (Anthropic Official API) ==========
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    provider: "Anthropic",
    description: "Anthropic's current strongest general-purpose model, built for complex reasoning, agentic coding, and long-context tasks. Official pricing: $5 input / $25 output per million tokens.",
    contextLength: 1000000,
    promptPrice: 5,
    completionPrice: 25,
    category: "Large Language Model",
    tags: ["Claude", "Flagship", "Agent", "Vision", "1M Context"],
    isFeatured: true,
    isNew: true,
    maxOutput: 128000,
    supported: ["Text", "Image Input", "Function Calling", "Adaptive Thinking"]
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    description: "Anthropic's workhorse model balancing speed and intelligence. Great for production-grade conversation, code, tool use, and long-context workflows. Official pricing: $3 input / $15 output per million tokens.",
    contextLength: 1000000,
    promptPrice: 3,
    completionPrice: 15,
    category: "Large Language Model",
    tags: ["Claude", "Balanced", "Coding", "Vision", "1M Context"],
    isFeatured: true,
    isNew: true,
    maxOutput: 64000,
    supported: ["Text", "Image Input", "Function Calling", "Extended Thinking"]
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    description: "Anthropic's fast, low-cost model with near-frontier intelligence. Great for low-latency dialogue, classification, extraction, and batch tasks. Official pricing: $1 input / $5 output per million tokens.",
    contextLength: 200000,
    promptPrice: 1,
    completionPrice: 5,
    category: "Large Language Model",
    tags: ["Claude", "Fast", "Low Cost", "Vision"],
    isNew: true,
    maxOutput: 64000,
    supported: ["Text", "Image Input", "Function Calling", "Extended Thinking"]
  },
  // ========== Other Third-Party Models ==========
  {
    id: "glm-4.7",
    name: "GLM 4.7",
    provider: "Zhipu AI",
    description: "Zhipu's latest GLM-4.7 large model with significantly improved overall capability and strong multilingual understanding.",
    contextLength: 131072,
    promptPrice: 0.429,
    completionPrice: 2.0,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.429, completionPrice: 2.0 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.571, completionPrice: 2.286 },
    ],
    category: "Large Language Model",
    tags: ["Multilingual", "Reasoning", "General Purpose"],
    isNew: true,
    maxOutput: 8192,
    supported: ["Text", "Function Calling"]
  },
  {
    id: "glm-5",
    name: "GLM 5",
    provider: "Zhipu AI",
    description: "Zhipu AI GLM-5 flagship large model. Comprehensive capability upgrade with outstanding performance on reasoning, coding, and long-form text.",
    contextLength: 131072,
    promptPrice: 0.571,
    completionPrice: 2.571,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.571, completionPrice: 2.571 },
      { label: "32K<Token≤198K", maxTokens: 202752, promptPrice: 0.857, completionPrice: 3.143 },
    ],
    category: "Large Language Model",
    tags: ["Flagship", "Reasoning", "Coding", "Multilingual"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["Text", "Function Calling", "Thinking"]
  },
  {
    id: "glm-5.1",
    name: "GLM 5.1",
    provider: "Zhipu AI",
    description: "Zhipu AI GLM-5.1 enhanced flagship. Further optimized over GLM-5, with stronger complex reasoning and code generation.",
    contextLength: 131072,
    promptPrice: 0.857,
    completionPrice: 3.429,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.857, completionPrice: 3.429 },
      { label: "32K<Token≤198K", maxTokens: 202752, promptPrice: 1.143, completionPrice: 4.0 },
    ],
    category: "Large Language Model",
    tags: ["Flagship", "Reasoning", "Coding", "Enhanced"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["Text", "Function Calling", "Thinking"]
  },
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    provider: "Moonshot",
    description: "Moonshot Kimi K2.5: strong long-text understanding and multi-turn dialogue, with excellent multilingual capability.",
    contextLength: 131072,
    promptPrice: 0.571,
    completionPrice: 3.0,
    category: "Large Language Model",
    tags: ["Long Context", "Multi-turn", "Multilingual"],
    maxOutput: 8192,
    supported: ["Text"]
  },
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    provider: "Moonshot",
    description: "Moonshot Kimi K2.6 latest flagship. Significantly improved long-text understanding and creative writing, with a longer context window.",
    contextLength: 262144,
    promptPrice: 0.929,
    completionPrice: 3.857,
    category: "Large Language Model",
    tags: ["Flagship", "Long Context", "Creative Writing", "Multilingual"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["Text", "Function Calling"]
  },
  {
    id: "MiniMax-M2.1",
    name: "MiniMax M2.1",
    provider: "MiniMax",
    description: "MiniMax M2.1 model with strong creative writing and multi-turn dialogue.",
    contextLength: 131072,
    promptPrice: 0.3,
    completionPrice: 1.2,
    category: "Large Language Model",
    tags: ["Creative Writing", "Dialogue", "General Purpose"],
    maxOutput: 8192,
    supported: ["Text"]
  },
  {
    id: "MiniMax-M2.5",
    name: "MiniMax M2.5",
    provider: "MiniMax",
    description: "MiniMax M2.5 enhanced edition with improved reasoning and coding, plus more stable multi-turn dialogue.",
    contextLength: 131072,
    promptPrice: 0.3,
    completionPrice: 1.2,
    category: "Large Language Model",
    tags: ["Reasoning", "Coding", "Dialogue"],
    isNew: true,
    maxOutput: 16384,
    supported: ["Text", "Function Calling"]
  },
  // ========== Qwen3 Compact Models ==========
  {
    id: "qwen3-8b",
    name: "Qwen3 8B",
    provider: "Qwen",
    description: "Qwen3 open-source 8B-parameter lightweight model. Suitable for edge deployment and low-cost inference.",
    contextLength: 131072,
    promptPrice: 0.071,
    completionPrice: 0.286,
    category: "Large Language Model",
    tags: ["Open Source", "Lightweight", "Cost-effective"],
    isNew: true,
    maxOutput: 8192,
    supported: ["Text", "Function Calling"]
  },
];
