export interface PricingTier {
  label: string;   // e.g. "720P", "1080P", "540P 无声"
  price: number;   // CNY
}

export interface TokenPricingTier {
  label: string;      // e.g. "0<Token≤32K"
  maxTokens: number;  // request input token upper bound for this tier
  promptPrice: number;
  completionPrice: number;
  cacheReadPrice?: number; // per 1M tokens (CNY) for cache hit; overrides model-level cacheReadPrice
  cacheReadExplicitPrice?: number; // per 1M tokens (CNY) for explicit cache hit only; overrides cacheReadPrice on the explicit path
  /** 思考模式输出价（思维链+回答整体按此价）；缺省沿用 completionPrice。 */
  thinkingCompletionPrice?: number;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextLength: number;
  promptPrice: number;   // per 1M tokens (CNY) for text; base price for media
  completionPrice: number; // per 1M tokens (CNY) for text; 0 for media
  audioInputPrice?: number;  // per 1M tokens (CNY) for audio input (omni models); falls back to promptPrice if unset
  audioOutputPrice?: number; // per 1M tokens (CNY) for audio output (omni models); text output is free when audio is produced
  cacheReadPrice?: number;   // per 1M tokens (CNY) for cache hit; when set, used instead of the default DashScope multiplier (0.1/0.2)
  /** 显式缓存命中价，仅当官方显式价与隐式价不同时配置；缺省沿用 cacheReadPrice。 */
  cacheReadExplicitPrice?: number;
  /** 思考模式输出价，仅当官方对思考模式单独定价时配置；缺省沿用 completionPrice。 */
  thinkingCompletionPrice?: number;
  anthropicPassThrough?: boolean; // /v1/messages 路由方式：缺省/true=直通上游 anthropic 兼容端点；false=上游未接入该模型，走平台内 anthropic-openai-bridge 协议转换
  pricingType?: "token" | "per-image" | "per-second" | "per-10k-characters"; // default: "token"
  pricingTiers?: PricingTier[];  // resolution-based pricing for video/image
  tokenPricingTiers?: TokenPricingTier[]; // input-token-based tier pricing for text models
  category: string;
  tags: string[];
  isNew?: boolean;
  isFeatured?: boolean;
  maxOutput: number;
  /** 未显式传 max_tokens 时用于余额预占；缺省仍按 maxOutput，避免改变既有模型行为。 */
  defaultOutputReservation?: number;
  supported: string[];
}

export function getReservedOutputTokens(model: AIModel, requestedTokens?: number): number {
  const maximum = Math.max(1, Number(model.maxOutput) || 4096);
  const fallback = Math.min(
    maximum,
    Math.max(1, Number(model.defaultOutputReservation) || maximum)
  );
  const requested = Number(requestedTokens);
  const selected = Number.isFinite(requested) && requested > 0 ? requested : fallback;
  return Math.max(1, Math.min(Math.floor(selected), maximum));
}

export function getTokenPricingTier(model: AIModel, promptTokens: number): TokenPricingTier | null {
  if (!model.tokenPricingTiers || model.tokenPricingTiers.length === 0) return null;
  const boundedPromptTokens = Math.max(1, promptTokens || 0);
  return model.tokenPricingTiers.find((tier) => boundedPromptTokens <= tier.maxTokens)
    || model.tokenPricingTiers[model.tokenPricingTiers.length - 1];
}

// DashScope 官方标准缓存折扣：隐式命中按输入价 20%，显式命中按 10%，显式缓存创建按 125%。
// 这三个倍率是官方规则而非估算值，仅当某模型官方价偏离该规则时才在条目里显式配价。
const IMPLICIT_CACHE_MULTIPLIER = 0.2;
const EXPLICIT_CACHE_MULTIPLIER = 0.1;
const CACHE_CREATION_MULTIPLIER = 1.25;

export interface ResolvedCachePricing {
  implicitHit: number;
  explicitHit: number;
  explicitCreation: number;
}

/**
 * 缓存价的唯一解析器，实扣计费与对外展示共用同一实现，二者不可能漂移。
 *
 * `cacheReadPrice` 是隐式/默认命中价；`cacheReadExplicitPrice` 只在显式命中时优先生效，
 * 缺省回落到 `cacheReadPrice`，因此未配置新字段的模型行为完全不变。
 */
export function resolveCachePricing(model: AIModel, tier?: TokenPricingTier | null): ResolvedCachePricing {
  const promptPrice = tier?.promptPrice ?? model.promptPrice;
  const configuredImplicit = tier?.cacheReadPrice ?? model.cacheReadPrice;
  const configuredExplicit = tier?.cacheReadExplicitPrice ?? model.cacheReadExplicitPrice ?? configuredImplicit;
  return {
    implicitHit: configuredImplicit ?? promptPrice * IMPLICIT_CACHE_MULTIPLIER,
    explicitHit: configuredExplicit ?? promptPrice * EXPLICIT_CACHE_MULTIPLIER,
    explicitCreation: promptPrice * CACHE_CREATION_MULTIPLIER,
  };
}

/**
 * 输出价的唯一解析器。官方对部分模型的思考模式单独定价，
 * 且思考模式下「思维链+回答」整体按该价计费；未配置则沿用非思考价。
 */
export function resolveCompletionPrice(
  model: AIModel,
  tier: TokenPricingTier | null | undefined,
  isThinking: boolean
): number {
  const normal = tier?.completionPrice ?? model.completionPrice;
  if (!isThinking) return normal;
  return tier?.thinkingCompletionPrice ?? model.thinkingCompletionPrice ?? normal;
}

/**
 * @param opts.isThinking 显式指定本次是否走思考模式。
 *   省略时按预占语义取「非思考/思考」较大值，避免余额预占不足；
 *   账单重算等需要还原真实金额的场景必须显式传入，否则会算高。
 */
export function calculateTokenCost(
  model: AIModel,
  promptTokens: number,
  completionTokens: number,
  cachedTokens: number = 0,
  cacheCreationTokens: number = 0,
  opts?: { isThinking?: boolean }
): number {
  const tier = getTokenPricingTier(model, promptTokens);
  const promptPrice = tier?.promptPrice ?? model.promptPrice;
  const completionPrice = opts?.isThinking === undefined
    ? Math.max(
        resolveCompletionPrice(model, tier, false),
        resolveCompletionPrice(model, tier, true)
      )
    : resolveCompletionPrice(model, tier, opts.isThinking);
  // 预占估算无法预知本次命中的是显式还是隐式缓存，取两者较大值以免预占不足。
  // 未配置任何缓存价时保留历史的 10% 兜底，避免改变既有模型的预占金额。
  const cacheReadPrice = Math.max(
    tier?.cacheReadPrice ?? model.cacheReadPrice ?? (promptPrice * EXPLICIT_CACHE_MULTIPLIER),
    tier?.cacheReadExplicitPrice ?? model.cacheReadExplicitPrice ?? 0
  );
  const totalPrompt = Math.max(0, promptTokens || 0);
  const effectiveCached = Math.min(Math.max(0, cachedTokens || 0), totalPrompt);
  const effectiveCreation = Math.min(Math.max(0, cacheCreationTokens || 0), totalPrompt - effectiveCached);
  const nonCachedPrompt = Math.max(0, totalPrompt - effectiveCached - effectiveCreation);
  return (nonCachedPrompt / 1_000_000) * promptPrice
    + (effectiveCached / 1_000_000) * cacheReadPrice
    + (effectiveCreation / 1_000_000) * promptPrice * CACHE_CREATION_MULTIPLIER
    + (Math.max(0, completionTokens || 0) / 1_000_000) * completionPrice;
}

const staticModels: AIModel[] = [
  // ========== 通义千问 Qwen 旗舰系列 ==========
  {
    id: "qwen3.8-max",
    name: "Qwen3.8 Max",
    provider: "通义千问",
    description: "通义千问3.8代旗舰模型，2.4万亿参数MoE，编程与办公能力全面跃升，可自主编程十数天交付完整项目。胜任法律、金融、设计等数百种专业任务，一次对话端到端交付生产级成果。原生视觉理解贯穿规划、执行与验证全流程，支持超长文档与长视频的深度语义解析。长程任务中自主规划与闭环迭代，持续进化。百万级上下文。",
    contextLength: 1000000,
    promptPrice: 12,
    completionPrice: 36,
    cacheReadPrice: 1.5,
    cacheReadExplicitPrice: 1,
    category: "大语言模型",
    tags: ["旗舰", "推理", "编程", "视觉理解", "思考模式", "智能体", "百万上下文"],
    isFeatured: true,
    isNew: true,
    maxOutput: 131072,
    supported: ["文本", "图像输入", "函数调用", "思考模式", "联网搜索", "结构化输出", "前缀续写", "批量推理", "上下文缓存"]
  },
  {
    id: "qwen3.7-plus",
    name: "Qwen3.7 Plus",
    provider: "通义千问",
    description: "Qwen3.7系列高性价比Plus模型，在强大文本能力基础上全面升级视觉-语言能力，保持编码、工具使用和生产力工作流的完整智能体能力。支持多模态交互混合智能体：感知真实世界场景、读取屏幕并操作GUI、基于视觉参考生成代码、端到端导航移动应用。功能等同于快照 qwen3.7-plus-2026-05-26。",
    contextLength: 1000000,
    promptPrice: 2,
    completionPrice: 8,
    tokenPricingTiers: [
      { label: "0<Token≤256K", maxTokens: 262144, promptPrice: 2, completionPrice: 8, cacheReadPrice: 0.4, cacheReadExplicitPrice: 0.2 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 6, completionPrice: 24, cacheReadPrice: 1.2, cacheReadExplicitPrice: 0.6 },
    ],
    category: "多模态模型",
    tags: ["高性价比", "多模态", "智能体", "视觉理解", "思考模式", "百万上下文"],
    isFeatured: true,
    isNew: true,
    maxOutput: 131072,
    supported: ["文本", "图像输入", "函数调用", "思考模式", "联网搜索", "结构化输出"]
  },
  {
    id: "qwen3.7-max",
    name: "Qwen3.7 Max",
    provider: "通义千问",
    description: "通义千问3.7代旗舰模型，面向智能体时代，编程、办公、长周期自主执行能力全面提升。支持思考模式切换、函数调用和联网搜索。百万级上下文。",
    contextLength: 1000000,
    promptPrice: 12,
    completionPrice: 36,
    cacheReadPrice: 2.4,
    cacheReadExplicitPrice: 1.2,
    category: "大语言模型",
    tags: ["旗舰", "推理", "编程", "思考模式", "智能体"],
    isFeatured: true,
    isNew: true,
    maxOutput: 131072,
    supported: ["文本", "函数调用", "思考模式", "联网搜索"]
  },
  {
    id: "qwen3-max",
    name: "Qwen3 Max",
    provider: "通义千问",
    description: "通义千问3代最强旗舰模型，支持思考模式切换，在复杂推理、代码生成、数学等方面表现卓越。262K上下文窗口。",
    contextLength: 262144,
    promptPrice: 2.5,
    completionPrice: 10,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 2.5, completionPrice: 10 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 4, completionPrice: 16 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 7, completionPrice: 28 },
    ],
    category: "大语言模型",
    tags: ["旗舰", "推理", "编程", "思考模式"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "qwen3.6-max-preview",
    name: "Qwen3.6 Max Preview",
    provider: "通义千问",
    description: "通义千问3.6代最强预览模型，面向复杂推理、代码生成和多步骤工具任务，适合需要更强思考能力的场景。",
    contextLength: 262144,
    promptPrice: 9,
    completionPrice: 54,
    tokenPricingTiers: [
      { label: "0<Token≤128K", maxTokens: 131072, promptPrice: 9, completionPrice: 54 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 15, completionPrice: 90 },
    ],
    category: "大语言模型",
    tags: ["旗舰", "推理", "预览版"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "qwen3.6-plus",
    name: "Qwen3.6 Plus",
    provider: "通义千问",
    description: "通义千问3.6代均衡旗舰模型，支持百万级上下文、函数调用和内置工具，适合大型代码库与通用生产场景。",
    contextLength: 1000000,
    promptPrice: 2,
    completionPrice: 12,
    tokenPricingTiers: [
      { label: "0<Token≤256K", maxTokens: 262144, promptPrice: 2, completionPrice: 12 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 8, completionPrice: 48 },
    ],
    category: "大语言模型",
    tags: ["高性价比", "均衡", "百万上下文"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "函数调用", "内置工具", "思考模式"]
  },
  {
    id: "qwen3.5-plus",
    name: "Qwen3.5 Plus",
    provider: "通义千问",
    description: "通义千问3.5代增强版，效果、速度、成本最佳平衡。支持百万级上下文窗口，适合大规模应用场景。",
    contextLength: 1000000,
    promptPrice: 0.8,
    completionPrice: 4.8,
    tokenPricingTiers: [
      { label: "0<Token≤128K", maxTokens: 131072, promptPrice: 0.8, completionPrice: 4.8 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 2, completionPrice: 12 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 4, completionPrice: 24 },
    ],
    category: "大语言模型",
    tags: ["高性价比", "均衡", "百万上下文"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "qwen3.7-flash",
    name: "Qwen3.7 Flash",
    provider: "通义千问",
    description: "Qwen3.7原生视觉语言系列Flash模型，相较3.6-Flash全面提升多模态理解与Agent执行能力。万物识别能力更强，真实世界感知与空间智能进一步提升，Search Agent、CI Agent等多模态Agent场景能力显著升级，多模态Coding能力优化。百万级上下文，支持上下文缓存。",
    contextLength: 1000000,
    promptPrice: 0.2,
    completionPrice: 0.8,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.2, completionPrice: 0.8, cacheReadPrice: 0.04, cacheReadExplicitPrice: 0.02 },
      { label: "32K<Token≤256K", maxTokens: 262144, promptPrice: 0.6, completionPrice: 2.4, cacheReadPrice: 0.12, cacheReadExplicitPrice: 0.06 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 1.2, completionPrice: 4.8, cacheReadPrice: 0.24, cacheReadExplicitPrice: 0.12 },
    ],
    category: "多模态模型",
    tags: ["极速", "低成本", "多模态", "视觉理解", "思考模式", "百万上下文"],
    isNew: true,
    maxOutput: 131072,
    supported: ["文本", "图像输入", "函数调用", "思考模式", "联网搜索", "结构化输出", "前缀续写", "批量推理", "上下文缓存"]
  },
  {
    id: "qwen3.6-flash",
    name: "Qwen3.6 Flash",
    provider: "通义千问",
    description: "通义千问3.6代闪电版，适合简单任务，速度快、成本低。支持百万级上下文窗口和上下文缓存。",
    contextLength: 1000000,
    promptPrice: 1.2,
    completionPrice: 7.2,
    tokenPricingTiers: [
      { label: "0<Token≤256K", maxTokens: 262144, promptPrice: 1.2, completionPrice: 7.2 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 4.8, completionPrice: 28.8 },
    ],
    category: "大语言模型",
    tags: ["极速", "低成本", "百万上下文"],
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "qwen3.5-flash",
    name: "Qwen3.5 Flash",
    provider: "通义千问",
    description: "通义千问3.5代闪电版，适合简单任务，速度快、成本低。支持百万级上下文窗口和上下文缓存。",
    contextLength: 1000000,
    promptPrice: 0.2,
    completionPrice: 2,
    tokenPricingTiers: [
      { label: "0<Token≤128K", maxTokens: 131072, promptPrice: 0.2, completionPrice: 2 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 0.8, completionPrice: 8 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 1.2, completionPrice: 12 },
    ],
    category: "大语言模型",
    tags: ["极速", "低成本", "百万上下文"],
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "qwen-plus",
    name: "Qwen Plus",
    provider: "通义千问",
    description: "通义千问增强版，效果和速度的经典平衡点，适合大规模应用场景。",
    contextLength: 1000000,
    promptPrice: 0.8,
    completionPrice: 2,
    tokenPricingTiers: [
      { label: "0<Token≤128K", maxTokens: 131072, promptPrice: 0.8, completionPrice: 2, thinkingCompletionPrice: 8, cacheReadPrice: 0.16, cacheReadExplicitPrice: 0.08 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 2.4, completionPrice: 20, thinkingCompletionPrice: 24, cacheReadPrice: 0.48, cacheReadExplicitPrice: 0.24 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 4.8, completionPrice: 48, thinkingCompletionPrice: 64, cacheReadPrice: 0.96, cacheReadExplicitPrice: 0.48 },
    ],
    category: "大语言模型",
    tags: ["高性价比", "均衡", "通用"],
    isFeatured: true,
    maxOutput: 32768,
    supported: ["文本", "函数调用"]
  },
  {
    id: "qwen-turbo",
    name: "Qwen Turbo",
    provider: "通义千问",
    description: "通义千问高速版，响应极快，成本最低，适合对延迟敏感的应用场景。",
    contextLength: 1000000,
    promptPrice: 0.3,
    completionPrice: 0.6,
    cacheReadPrice: 0.06,
    category: "大语言模型",
    tags: ["快速", "低成本", "通用"],
    maxOutput: 16384,
    supported: ["文本", "函数调用"]
  },
  {
    id: "qwen-long",
    name: "Qwen Long",
    provider: "通义千问",
    description: "通义千问长文本模型，支持超长上下文，适合文档分析和长文本理解。上下文窗口高达1000万token。",
    contextLength: 10000000,
    promptPrice: 0.5,
    completionPrice: 2,
    category: "大语言模型",
    tags: ["超长上下文", "文档分析"],
    maxOutput: 32768,
    supported: ["文本"]
  },
  {
    id: "qwen-flash",
    name: "Qwen Flash",
    provider: "通义千问",
    description: "通义千问极速通用模型，百万级上下文窗口，响应速度极快，成本极低，适合大规模高并发应用场景。支持函数调用和思考模式。",
    contextLength: 1000000,
    promptPrice: 0.15,
    completionPrice: 1.5,
    cacheReadPrice: 0.03,
    cacheReadExplicitPrice: 0.015,
    category: "大语言模型",
    tags: ["极速", "低成本", "百万上下文", "通用", "思考模式"],
    isNew: true,
    maxOutput: 32768,
    supported: ["文本", "函数调用", "思考模式"]
  },

  // ========== Qwen3 开源系列 ==========
  {
    id: "qwen3-235b-a22b",
    name: "Qwen3 235B-A22B",
    provider: "通义千问",
    description: "Qwen3开源旗舰，2350亿参数MoE架构（激活220亿），支持思考与非思考模式动态切换。",
    contextLength: 131072,
    promptPrice: 2,
    completionPrice: 8,
    thinkingCompletionPrice: 20,
    category: "大语言模型",
    tags: ["开源", "MoE", "推理", "思考模式"],
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "qwen3.6-35b-a3b",
    name: "Qwen3.6 35B-A3B",
    provider: "通义千问",
    description: "Qwen3.6开源MoE模型，350亿总参数仅激活30亿，在智能体编程、STEM和推理任务上表现优异，Apache 2.0开源。支持思考模式切换。",
    contextLength: 262144,
    promptPrice: 1.8,
    completionPrice: 10.8,
    category: "大语言模型",
    tags: ["开源", "MoE", "轻量", "编程", "思考模式"],
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "qwen3-32b",
    name: "Qwen3 32B",
    provider: "通义千问",
    description: "Qwen3开源320亿参数密集模型，在中等规模模型中表现优异。",
    contextLength: 131072,
    promptPrice: 2,
    completionPrice: 8,
    thinkingCompletionPrice: 20,
    category: "大语言模型",
    tags: ["开源", "推理", "编程"],
    maxOutput: 8192,
    supported: ["文本", "函数调用"]
  },

  // ========== 推理模型 ==========
  {
    id: "qwq-plus",
    name: "QwQ Plus",
    provider: "通义千问",
    description: "通义千问推理模型，基于Qwen2.5训练，擅长数学、逻辑推理和复杂问题分析，展示完整思考链路。",
    contextLength: 131072,
    promptPrice: 1.6,
    completionPrice: 4,
    category: "推理模型",
    tags: ["推理", "数学", "逻辑", "思考链"],
    isFeatured: true,
    maxOutput: 8192,
    supported: ["文本", "思考链"]
  },

  // ========== 视觉模型 ==========
  {
    id: "qwen-vl-max",
    name: "Qwen VL Max",
    provider: "通义千问",
    description: "通义千问视觉旗舰模型，支持图像理解、图文对话、文档OCR等多模态任务。",
    contextLength: 131072,
    promptPrice: 1.6,
    completionPrice: 4,
    cacheReadPrice: 0.32,
    category: "多模态模型",
    tags: ["视觉", "多模态", "OCR", "图文理解"],
    isFeatured: true,
    maxOutput: 8192,
    supported: ["文本", "图像输入"]
  },
  {
    id: "qwen-vl-plus",
    name: "Qwen VL Plus",
    provider: "通义千问",
    description: "通义千问视觉增强版，平衡性能与成本的多模态模型。",
    contextLength: 131072,
    promptPrice: 0.8,
    completionPrice: 2,
    cacheReadPrice: 0.16,
    category: "多模态模型",
    tags: ["视觉", "多模态", "高性价比"],
    maxOutput: 8192,
    supported: ["文本", "图像输入"]
  },
  {
    id: "qwen3-vl-plus",
    name: "Qwen3 VL Plus",
    provider: "通义千问",
    description: "Qwen3代视觉语言模型，图像理解能力大幅提升，支持高分辨率图像输入。262K上下文窗口。",
    contextLength: 262144,
    promptPrice: 1,
    completionPrice: 10,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 1, completionPrice: 10 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 1.5, completionPrice: 15 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 3, completionPrice: 30 },
    ],
    category: "多模态模型",
    tags: ["视觉", "多模态", "高分辨率"],
    isNew: true,
    maxOutput: 32768,
    supported: ["文本", "图像输入"]
  },
  {
    id: "qwen3-vl-flash",
    name: "Qwen3 VL Flash",
    provider: "通义千问",
    description: "Qwen3代视觉闪电版，快速图像理解，适合实时场景。",
    contextLength: 262144,
    promptPrice: 0.15,
    completionPrice: 1.5,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 0.15, completionPrice: 1.5 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 0.3, completionPrice: 3 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 0.6, completionPrice: 6 },
    ],
    category: "多模态模型",
    tags: ["视觉", "极速", "高性价比"],
    maxOutput: 32768,
    supported: ["文本", "图像输入"]
  },
  // ========== 全能模型 ==========
  {
    id: "qwen3.5-omni-plus",
    name: "Qwen3.5 Omni Plus",
    provider: "通义千问",
    description: "通义千问3.5代旗舰全模态模型，支持文本、图片、音频、视频任意组合输入，可输出文本与语音。3小时音频/1小时视频输入，113种输入语言，55种音色，支持联网搜索和声音复刻。",
    contextLength: 262144,
    promptPrice: 7,
    completionPrice: 40,
    audioInputPrice: 53,
    audioOutputPrice: 213,
    category: "多模态模型",
    tags: ["旗舰", "全能", "多模态", "音频输入", "音频输出", "视频输入", "联网搜索"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "图像输入", "音频输入", "音频输出", "视频输入", "联网搜索"]
  },
  {
    id: "qwen3.5-omni-flash",
    name: "Qwen3.5 Omni Flash",
    provider: "通义千问",
    description: "通义千问3.5代轻量全模态模型，支持文本、图片、音频、视频任意组合输入与文本+语音输出。3小时音频/1小时视频输入，113种输入语言，55种音色，支持联网搜索。高性价比之选。",
    contextLength: 262144,
    promptPrice: 2.2,
    completionPrice: 13.3,
    audioInputPrice: 18,
    audioOutputPrice: 72,
    category: "多模态模型",
    tags: ["高性价比", "全能", "多模态", "音频输入", "音频输出", "视频输入", "联网搜索"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "图像输入", "音频输入", "音频输出", "视频输入", "联网搜索"]
  },
  {
    id: "qwen3-omni-flash",
    name: "Qwen3 Omni Flash",
    provider: "通义千问",
    description: "通义千问3代全能模型，支持文本、图片、音频、视频输入与文本+语音输出。支持思考模式（思考模式下仅文本输出）。适合短视频分析与成本敏感场景。",
    contextLength: 65536,
    promptPrice: 1.8,
    completionPrice: 6.9,
    audioInputPrice: 15.8,
    audioOutputPrice: 62.6,
    category: "多模态模型",
    tags: ["全能", "多模态", "音频输入", "音频输出", "视频输入", "思考模式"],
    isNew: false,
    maxOutput: 16384,
    supported: ["文本", "图像输入", "音频输入", "音频输出", "视频输入", "思考模式"]
  },

  // ========== 编程专用 ==========
  {
    id: "qwen3-coder-plus",
    name: "Qwen3 Coder Plus",
    provider: "通义千问",
    description: "通义千问3代卓越代码模型，擅长工具调用和环境交互，代码生成、补全、Debug和重构能力出色。百万级上下文。",
    contextLength: 1000000,
    promptPrice: 4,
    completionPrice: 16,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 4, completionPrice: 16 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 6, completionPrice: 24 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 10, completionPrice: 40 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 20, completionPrice: 200 },
    ],
    category: "编程模型",
    tags: ["编程", "代码生成", "工具调用", "百万上下文"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "代码生成", "函数调用"]
  },
  {
    id: "qwen3-coder-flash",
    name: "Qwen3 Coder Flash",
    provider: "通义千问",
    description: "通义千问3代编程闪电版，快速代码补全和生成，适合IDE集成场景。",
    contextLength: 1000000,
    promptPrice: 1,
    completionPrice: 4,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 1, completionPrice: 4 },
      { label: "32K<Token≤128K", maxTokens: 131072, promptPrice: 1.5, completionPrice: 6 },
      { label: "128K<Token≤256K", maxTokens: 262144, promptPrice: 2.5, completionPrice: 10 },
      { label: "256K<Token≤1M", maxTokens: 1000000, promptPrice: 5, completionPrice: 25 },
    ],
    category: "编程模型",
    tags: ["编程", "极速", "高性价比"],
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "代码生成"]
  },

  // ========== 数学模型 ==========
  {
    id: "qwen-math-plus",
    name: "Qwen Math Plus",
    provider: "通义千问",
    description: "通义千问数学专用模型，擅长各类数学问题求解、证明和计算，支持LaTeX格式输出。",
    contextLength: 4096,
    promptPrice: 4,
    completionPrice: 12,
    category: "推理模型",
    tags: ["数学", "推理", "求解", "LaTeX"],
    isNew: true,
    maxOutput: 3072,
    supported: ["文本", "数学求解"]
  },

  // ========== 翻译模型 ==========
  {
    id: "qwen-mt-plus",
    name: "Qwen MT Plus",
    provider: "通义千问",
    description: "通义千问旗舰级翻译大模型，支持92个语种互译，翻译质量优异，适合专业翻译场景。",
    contextLength: 16384,
    promptPrice: 1.8,
    completionPrice: 5.4,
    category: "专业模型",
    tags: ["翻译", "92语种", "专业"],
    isNew: true,
    maxOutput: 8192,
    supported: ["文本", "翻译"]
  },
  {
    id: "tongyi-intent-detect-v3",
    name: "通义意图识别 V3",
    provider: "通义千问",
    description: "通义千问意图理解模型，可在百毫秒级时间内快速、准确地解析用户意图，适用于客服路由、智能对话分流和指令解析等场景。",
    contextLength: 8192,
    promptPrice: 0.4,
    completionPrice: 1,
    category: "专业模型",
    tags: ["意图识别", "快速", "客服路由", "分类"],
    isNew: true,
    maxOutput: 1024,
    supported: ["文本", "意图分类"]
  },

  // ========== 向量模型 ==========
  {
    id: "text-embedding-v4",
    name: "Text Embedding V4",
    provider: "通义千问",
    description: "通义千问最新文本向量模型，支持 100+ 语种和多种编程语言，向量维度可选 2048、1536、1024、768、512、256、128、64，适用于语义检索、聚类、推荐和 RAG。",
    contextLength: 8192,
    promptPrice: 0.5,
    completionPrice: 0,
    category: "向量模型",
    tags: ["向量", "嵌入", "语义搜索", "RAG"],
    isFeatured: true,
    isNew: true,
    maxOutput: 1,
    supported: ["文本到向量"]
  },
  {
    id: "text-embedding-v3",
    name: "Text Embedding V3",
    provider: "通义千问",
    description: "通义千问最新文本向量模型，将文本转换为高维向量表示，适用于语义搜索、聚类、推荐等场景。",
    contextLength: 8192,
    promptPrice: 0.5,
    completionPrice: 0,
    category: "向量模型",
    tags: ["向量", "嵌入", "语义搜索"],
    isNew: true,
    maxOutput: 1,
    supported: ["文本到向量"]
  },

  // ========== 语音模型 ==========
  {
    id: "qwen3-asr-flash",
    name: "Qwen3 ASR Flash",
    provider: "通义千问",
    description: "Qwen3代语音识别模型，支持11种语言自动检测及转录，支持字级时间戳、情感识别、歌唱识别和说话人分离。实时与非实时双模式。",
    contextLength: 0,
    promptPrice: 0.00022,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "华北2（北京）", price: 0.00022 },
    ],
    category: "语音模型",
    tags: ["语音识别", "ASR", "多语言", "实时"],
    isNew: true,
    maxOutput: 0,
    supported: ["语音转文本"]
  },
  {
    id: "qwen3-tts-flash-realtime",
    name: "Qwen3 TTS Flash Realtime",
    provider: "通义千问",
    description: "Qwen3代语音合成模型。OpenAI 兼容的 HTTP 接口使用 qwen3-tts-flash 非实时模型，按输入字符计费；华北2（北京）目录价为每万字符 0.8 元。",
    contextLength: 0,
    promptPrice: 0.8,
    completionPrice: 0,
    pricingType: "per-10k-characters",
    pricingTiers: [
      { label: "华北2（北京）", price: 0.8 },
    ],
    category: "语音模型",
    tags: ["语音合成", "TTS", "实时", "多语言"],
    isNew: true,
    maxOutput: 0,
    supported: ["文本转语音"]
  },

  // ========== 图像生成 ==========
  {
    id: "wan2.6-t2i",
    name: "万相 2.6 文生图",
    provider: "通义千问",
    description: "最新一代文生图旗舰模型，支持图文混排输出和图像编辑。可处理复杂指令、渲染中英文本，生成高清写实图片。支持多种分辨率和宽高比。",
    contextLength: 4000,
    promptPrice: 0.20,
    completionPrice: 0,
    pricingType: "per-image",
    pricingTiers: [
      { label: "标准", price: 0.20 },
    ],
    category: "图像生成",
    tags: ["图像生成", "文生图", "图文混排", "高清写实", "文字渲染"],
    isFeatured: true,
    isNew: true,
    maxOutput: 4,
    supported: ["文本到图像", "图文混排", "图像编辑"]
  },
  // ========== 视频生成 ==========
  {
    id: "wan2.6-t2v",
    name: "万相 2.6 文生视频",
    provider: "通义千问",
    description: "最新一代文生视频旗舰模型，支持多镜头叙事和智能分镜。可生成2-15秒1080P高清视频，支持prompt改写。生成耗时约1-5分钟。",
    contextLength: 1500,
    promptPrice: 0.6,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.6 },
      { label: "1080P", price: 1 },
    ],
    category: "视频生成",
    tags: ["视频生成", "文生视频", "多镜头", "1080P"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["文生视频", "多镜头叙事"],
    // 限制: RPS 5, 并发 5
  },
  {
    id: "wan2.6-i2v",
    name: "万相 2.6 图生视频",
    provider: "通义千问",
    description: "图像驱动视频生成模型，以输入图像作为首帧生成连贯视频。支持多镜头叙事、自动配音、720P/1080P分辨率，时长2-15秒。画面连贯性和运动一致性出色。",
    contextLength: 1500,
    promptPrice: 0.6,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.6 },
      { label: "1080P", price: 1 },
    ],
    category: "视频生成",
    tags: ["视频生成", "图生视频", "首帧驱动", "多镜头", "配音"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["图生视频", "多镜头叙事", "自动配音"],
    // 限制: RPS 5, 并发 5
  },
  {
    id: "wan2.6-i2v-flash",
    name: "万相 2.6 图生视频 Flash",
    provider: "通义千问",
    description: "图生视频快速版，支持有声/无声视频生成。生成速度更快，适合对延迟敏感的场景。支持720P/1080P，时长2-15秒。",
    contextLength: 1500,
    promptPrice: 0.15,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P 有声", price: 0.3 },
      { label: "1080P 有声", price: 0.5 },
      { label: "720P 无声", price: 0.15 },
      { label: "1080P 无声", price: 0.25 },
    ],
    category: "视频生成",
    tags: ["视频生成", "图生视频", "快速", "Flash"],
    isNew: true,
    maxOutput: 15,
    supported: ["图生视频", "快速生成"],
  },
  {
    id: "wan2.6-r2v",
    name: "万相 2.6 参考生视频",
    provider: "通义千问",
    description: "多模态输入视频生成模型，支持文本/图像/视频作为参考。可将人物或物体作为主角，生成单角色表演或多角色互动视频。时长2-10秒，支持智能分镜。",
    contextLength: 1500,
    promptPrice: 0.6,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.6 },
      { label: "1080P", price: 1 },
    ],
    category: "视频生成",
    tags: ["视频生成", "参考生视频", "角色扮演", "多模态"],
    isNew: true,
    maxOutput: 10,
    supported: ["参考生视频", "角色扮演", "多角色互动"],
  },
  {
    id: "wan2.6-r2v-flash",
    name: "万相 2.6 参考生视频 Flash",
    provider: "通义千问",
    description: "参考生视频快速版，支持有声/无声输出。生成速度更快，适合快速迭代场景。支持720P/1080P分辨率。",
    contextLength: 1500,
    promptPrice: 0.15,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P 有声", price: 0.3 },
      { label: "1080P 有声", price: 0.5 },
      { label: "720P 无声", price: 0.15 },
      { label: "1080P 无声", price: 0.25 },
    ],
    category: "视频生成",
    tags: ["视频生成", "参考生视频", "快速", "Flash"],
    isNew: true,
    maxOutput: 10,
    supported: ["参考生视频", "快速生成"],
  },
  {
    id: "pixverse-v6",
    name: "PixVerse V6",
    provider: "拍我AI (PixVerse)",
    description: "PixVerse最新旗舰视频生成模型，支持文生视频、图生视频，画面质量和运动一致性大幅提升。支持1-15秒时长，360p/540p/720p/1080p多种分辨率，多种宽高比。",
    contextLength: 500,
    promptPrice: 0.15,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "360P 有声", price: 0.21 },
      { label: "540P 有声", price: 0.27 },
      { label: "720P 有声", price: 0.36 },
      { label: "1080P 有声", price: 0.68 },
      { label: "360P 无声", price: 0.15 },
      { label: "540P 无声", price: 0.21 },
      { label: "720P 无声", price: 0.27 },
      { label: "1080P 无声", price: 0.53 },
    ],
    category: "视频生成",
    tags: ["视频生成", "文生视频", "图生视频", "旗舰", "V6"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["文生视频", "图生视频"]
  },

  // ========== Seedance 视频生成 (火山方舟 Volcengine Ark) ==========
  {
    id: "seedance-2.0",
    name: "豆包 Seedance 2.0 旗舰版",
    provider: "火山方舟 (Volcengine)",
    description: "火山引擎最新一代旗舰视频生成模型，业界顶尖水平。支持多模态参考生视频（0-9 图+0-3 视频+0-3 音频）、4K HDR 10bit 输出、有声视频自动生成、首尾帧图生视频、文生视频。时长 4-15 秒，4K/1080P/720P/480P 多分辨率，21:9/16:9/4:3/1:1/3:4/9:16 多比例。Seedance 系列最厉害的模型。",
    contextLength: 4000,
    // 火山按 token 计费换算：单价 46(480/720p)/51(1080p)/26(4k) 元/百万token，
    // tokens=宽×高×24fps×时长/1024（16:9）。有声/无声同价。下为每秒成本价（零毛利）。
    promptPrice: 0.99,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "480P", price: 0.44 },
      { label: "720P", price: 0.99 },
      { label: "1080P", price: 2.48 },
      { label: "4K HDR", price: 5.05 },
    ],
    category: "视频生成",
    tags: ["视频生成", "旗舰", "4K HDR", "多模态参考", "有声视频", "Seedance", "首尾帧"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["文生视频", "图生视频(首帧/首尾帧)", "多模态参考生视频", "有声视频", "4K HDR 10bit"],
  },
  {
    id: "seedance-2.0-fast",
    name: "豆包 Seedance 2.0 Fast",
    provider: "火山方舟 (Volcengine)",
    description: "Seedance 2.0 系列的快速版本，与 2.0 同代画质但生成速度更快、性价比更高。支持 720P/480P，时长 4-15 秒，适合对延迟敏感的批量场景。多模态参考生视频、有声视频全能力继承。",
    contextLength: 4000,
    // 火山 token 单价 37 元/百万token（无输入视频），换算每秒成本价
    promptPrice: 0.80,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "480P", price: 0.36 },
      { label: "720P", price: 0.80 },
    ],
    category: "视频生成",
    tags: ["视频生成", "快速", "性价比", "有声视频", "Seedance"],
    isNew: true,
    maxOutput: 15,
    supported: ["文生视频", "图生视频(首帧)", "多模态参考生视频", "有声视频"],
  },
  {
    id: "seedance-2.0-mini",
    name: "豆包 Seedance 2.0 Mini",
    provider: "火山方舟 (Volcengine)",
    description: "Seedance 2.0 系列的轻量版本，体积更小、速度最快、价格最低。支持 720P/480P（不支持 1080P/4K），时长 4-15 秒。继承 2.0 系列多模态参考生视频与有声视频能力，适合大规模批量调用与成本敏感场景。",
    contextLength: 4000,
    // 火山 token 单价 23 元/百万token（无输入视频），换算每秒成本价
    promptPrice: 0.50,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "480P", price: 0.22 },
      { label: "720P", price: 0.50 },
    ],
    category: "视频生成",
    tags: ["视频生成", "轻量", "最低价", "有声视频", "Seedance"],
    isNew: true,
    maxOutput: 15,
    supported: ["文生视频", "图生视频(首帧)", "多模态参考生视频", "有声视频"],
  },
  {
    id: "seedance-1.5-pro",
    name: "豆包 Seedance 1.5 Pro",
    provider: "火山方舟 (Volcengine)",
    description: "Seedance 1.5 Pro 版本，支持样片模式（draft）快速验证创意、adaptive 智能宽高比、有声视频自动生成，4-12 秒时长。性价比之选，适合创意探索和批量生成。",
    contextLength: 3000,
    // 火山 token 单价 有声16/无声8 元/百万token，换算每秒成本价
    promptPrice: 0.35,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P 无声", price: 0.17 },
      { label: "720P 有声", price: 0.35 },
      { label: "1080P 无声", price: 0.39 },
      { label: "1080P 有声", price: 0.78 },
    ],
    category: "视频生成",
    tags: ["视频生成", "样片模式", "adaptive", "有声视频", "Seedance"],
    isNew: true,
    maxOutput: 12,
    supported: ["文生视频", "图生视频(首帧/首尾帧)", "样片模式", "有声视频"],
  },
  {
    id: "seedance-1.0-pro",
    name: "豆包 Seedance 1.0 Pro",
    provider: "火山方舟 (Volcengine)",
    description: "Seedance 1.0 Pro 标准版本，1080P 默认输出。支持文生视频、图生视频（首帧/首尾帧），时长 2-12 秒。画面质量稳定，适合标准生产场景与批量生成。",
    contextLength: 2000,
    // 火山 token 单价 15 元/百万token（无声），换算每秒成本价
    promptPrice: 0.32,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "480P", price: 0.14 },
      { label: "720P", price: 0.32 },
      { label: "1080P", price: 0.73 },
    ],
    category: "视频生成",
    tags: ["视频生成", "标准", "1080P", "首尾帧", "Seedance"],
    isNew: true,
    maxOutput: 12,
    supported: ["文生视频", "图生视频(首帧/首尾帧)"],
  },
  {
    id: "seedance-1.0-pro-fast",
    name: "豆包 Seedance 1.0 Pro Fast",
    provider: "火山方舟 (Volcengine)",
    description: "Seedance 1.0 Pro Fast 版本，1080P 默认输出，生成速度极快。支持文生视频和图生视频（首帧），时长 2-12 秒，适合快速迭代和原型验证场景。",
    contextLength: 2000,
    // 火山 token 单价 4.2 元/百万token，换算每秒成本价
    promptPrice: 0.09,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "480P", price: 0.04 },
      { label: "720P", price: 0.09 },
      { label: "1080P", price: 0.20 },
    ],
    category: "视频生成",
    tags: ["视频生成", "快速", "1080P", "Seedance"],
    isNew: true,
    maxOutput: 12,
    supported: ["文生视频", "图生视频(首帧)"],
  },

  // ========== HappyHorse 快乐小马 ==========
  {
    id: "happyhorse-1.0-t2v",
    name: "HappyHorse 1.0 文生视频",
    provider: "阿里巴巴 (Alibaba)",
    description: "阿里巴巴2026年最新AI视频生成模型，榜单排名第一。文本生成高质量视频，支持720P/1080P，3-15秒时长，多种宽高比。默认带音频直出。",
    contextLength: 2500,
    promptPrice: 0.9,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.9 },
      { label: "1080P", price: 1.6 },
    ],
    category: "视频生成",
    tags: ["视频生成", "文生视频", "高质量", "榜单第一", "音频"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["文生视频"]
  },
  {
    id: "happyhorse-1.0-i2v",
    name: "HappyHorse 1.0 图生视频",
    provider: "阿里巴巴 (Alibaba)",
    description: "以输入图片作为首帧生成连贯视频，支持720P/1080P，3-15秒时长。画面连贯性和运动一致性出色。默认带音频直出。",
    contextLength: 2500,
    promptPrice: 0.9,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.9 },
      { label: "1080P", price: 1.6 },
    ],
    category: "视频生成",
    tags: ["视频生成", "图生视频", "首帧驱动", "高质量", "音频"],
    isFeatured: true,
    isNew: true,
    maxOutput: 15,
    supported: ["图生视频"]
  },
  {
    id: "happyhorse-1.0-r2v",
    name: "HappyHorse 1.0 参考生视频",
    provider: "阿里巴巴 (Alibaba)",
    description: "支持1-9张参考图片输入，可将图中人物/物体/场景融合生成视频。支持720P/1080P，3-15秒，多种宽高比。默认带音频直出。",
    contextLength: 2500,
    promptPrice: 0.9,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.9 },
      { label: "1080P", price: 1.6 },
    ],
    category: "视频生成",
    tags: ["视频生成", "参考生视频", "多图输入", "高质量", "音频"],
    isNew: true,
    maxOutput: 15,
    supported: ["参考生视频"]
  },
  {
    id: "happyhorse-1.0-video-edit",
    name: "HappyHorse 1.0 视频编辑",
    provider: "阿里巴巴 (Alibaba)",
    description: "基于输入视频进行AI编辑，支持0-5张参考图片辅助编辑。输入视频3-60秒（超15秒截断），支持720P/1080P，可保留原始音频。",
    contextLength: 2500,
    promptPrice: 0.9,
    completionPrice: 0,
    pricingType: "per-second",
    pricingTiers: [
      { label: "720P", price: 0.9 },
      { label: "1080P", price: 1.6 },
    ],
    category: "视频生成",
    tags: ["视频生成", "视频编辑", "AI编辑", "音频保留"],
    isNew: true,
    maxOutput: 15,
    supported: ["视频编辑"]
  },

  // ========== DeepSeek 系列 ==========
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    description: "高效轻量化 MoE 模型，总参 284B、激活 13B，原生支持百万超长上下文。推理速度快、延迟低、调用成本低，综合能力均衡，适合日常对话、内容创作、基础 RAG 与批量文案处理等高并发场景。",
    contextLength: 1000000,
    promptPrice: 1,
    completionPrice: 2,
    cacheReadPrice: 0.2,
    category: "大语言模型",
    tags: ["V4", "极速", "高并发", "混合思考", "性价比"],
    isFeatured: true,
    isNew: true,
    maxOutput: 393216,
    defaultOutputReservation: 16384,
    supported: ["文本", "函数调用", "思考模式", "联网搜索", "上下文缓存"]
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    description: "百炼接入的 DeepSeek V4 Pro 旗舰模型，面向复杂推理、代码生成和多步骤任务。",
    contextLength: 1000000,
    promptPrice: 12,
    completionPrice: 24,
    cacheReadPrice: 1,
    category: "推理模型",
    tags: ["V4", "旗舰", "推理", "编程"],
    isFeatured: true,
    isNew: true,
    maxOutput: 393216,
    supported: ["文本", "函数调用", "思考链"]
  },
  {
    id: "deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "DeepSeek",
    description: "深度求索最新通用大模型，MoE架构，中英双语能力突出，编程能力强大。",
    contextLength: 131072,
    promptPrice: 2,
    completionPrice: 3,
    cacheReadPrice: 0.4,
    cacheReadExplicitPrice: 0.2,
    category: "大语言模型",
    tags: ["MoE", "编程", "中文优化"],
    isFeatured: true,
    isNew: true,
    maxOutput: 65536,
    supported: ["文本", "函数调用"]
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    description: "深度求索推理模型，在数学、编程和逻辑推理方面有卓越表现，展示完整思考过程。",
    contextLength: 131072,
    promptPrice: 4,
    completionPrice: 16,
    cacheReadPrice: 0.8,
    category: "推理模型",
    tags: ["推理", "数学", "编程", "思考链"],
    isFeatured: true,
    maxOutput: 16384,
    supported: ["文本", "思考链"]
  },
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    provider: "DeepSeek",
    description: "深度求索V3通用大模型，671B参数MoE架构，中英双语能力优异。",
    contextLength: 131072,
    promptPrice: 2,
    completionPrice: 8,
    cacheReadPrice: 0.4,
    category: "大语言模型",
    tags: ["MoE", "中文优化", "编程"],
    maxOutput: 8192,
    supported: ["文本", "函数调用"]
  },
  // ========== Claude 官方 API ==========
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    provider: "Anthropic",
    description: "Anthropic 当前最强通用模型，面向复杂推理、Agentic Coding 和长上下文任务。官方价格为 $5 输入 / $25 输出每百万 Token；这里按 1 USD≈¥6.8 折算。",
    contextLength: 1000000,
    promptPrice: 34,
    completionPrice: 170,
    category: "大语言模型",
    tags: ["Claude", "旗舰", "Agent", "视觉", "百万上下文"],
    isFeatured: true,
    isNew: true,
    maxOutput: 128000,
    supported: ["文本", "图像输入", "函数调用", "自适应思考"]
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    description: "Anthropic 速度与智能均衡的主力模型，适合生产级对话、代码、工具调用和长上下文工作流。官方价格为 $3 输入 / $15 输出每百万 Token；这里按 1 USD≈¥6.8 折算。",
    contextLength: 1000000,
    promptPrice: 20.4,
    completionPrice: 102,
    category: "大语言模型",
    tags: ["Claude", "均衡", "编程", "视觉", "百万上下文"],
    isFeatured: true,
    isNew: true,
    maxOutput: 64000,
    supported: ["文本", "图像输入", "函数调用", "扩展思考"]
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    description: "Anthropic 高速低成本模型，具备接近前沿的智能，适合低延迟对话、分类、抽取和批量任务。官方价格为 $1 输入 / $5 输出每百万 Token；这里按 1 USD≈¥6.8 折算。",
    contextLength: 200000,
    promptPrice: 6.8,
    completionPrice: 34,
    category: "大语言模型",
    tags: ["Claude", "极速", "低成本", "视觉"],
    isNew: true,
    maxOutput: 64000,
    supported: ["文本", "图像输入", "函数调用", "扩展思考"]
  },
  // ========== 其他第三方模型 ==========
  {
    id: "glm-4.7",
    name: "GLM 4.7",
    provider: "智谱AI",
    description: "智谱最新大模型GLM-4.7，综合能力提升显著，中文理解力强。",
    contextLength: 169984,
    promptPrice: 3,
    completionPrice: 14,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 3, completionPrice: 14, cacheReadPrice: 0.6 },
      { label: "32K<Token≤166K", maxTokens: 169984, promptPrice: 4, completionPrice: 16, cacheReadPrice: 0.8 },
    ],
    category: "大语言模型",
    tags: ["中文优化", "推理", "通用"],
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用"]
  },
  {
    id: "glm-5",
    name: "GLM 5",
    provider: "智谱AI",
    description: "智谱AI GLM-5 旗舰大模型，综合能力全面提升，在推理、编程和长文本方面表现出色。",
    contextLength: 202752,
    promptPrice: 4,
    completionPrice: 18,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 4, completionPrice: 18 },
      { label: "32K<Token≤198K", maxTokens: 202752, promptPrice: 6, completionPrice: 22 },
    ],
    category: "大语言模型",
    tags: ["旗舰", "推理", "编程", "中文优化"],
    isFeatured: true,
    isNew: true,
    maxOutput: 16384,
    supported: ["文本", "函数调用", "思考模式"]
  },
  {
    id: "glm-5.1",
    name: "GLM 5.1",
    provider: "智谱AI",
    description: "智谱AI GLM-5.1 增强版旗舰模型，在 GLM-5 基础上进一步优化，复杂推理和代码生成能力更强。",
    contextLength: 202745,
    promptPrice: 6,
    completionPrice: 24,
    tokenPricingTiers: [
      { label: "0<Token≤32K", maxTokens: 32768, promptPrice: 6, completionPrice: 24, cacheReadPrice: 1.2, cacheReadExplicitPrice: 0.6 },
      { label: "32K<Token≤198K", maxTokens: 202752, promptPrice: 8, completionPrice: 28, cacheReadPrice: 1.6, cacheReadExplicitPrice: 0.8 },
    ],
    category: "大语言模型",
    tags: ["旗舰", "推理", "编程", "增强"],
    isFeatured: true,
    isNew: true,
    maxOutput: 131072,
    supported: ["文本", "函数调用", "思考模式", "上下文缓存"]
  },
  {
    id: "glm-5.2",
    name: "GLM 5.2",
    provider: "智谱AI",
    description: "智谱AI GLM-5.2 面向长程任务（Long Horizon Task）的新一代开源旗舰模型，支持 1M 无损超长上下文。具备卓越的编程与工程能力，可自主完成任务拆解、架构设计、前后端开发、联调测试到多端部署的完整链路，适用于复杂工程、长程交互、代码生成与企业应用场景。",
    contextLength: 1048576,
    promptPrice: 8,
    completionPrice: 28,
    cacheReadPrice: 2,
    tokenPricingTiers: [
      { label: "0<Token≤1M", maxTokens: 1048576, promptPrice: 8, completionPrice: 28, cacheReadPrice: 2 },
    ],
    category: "大语言模型",
    tags: ["旗舰", "长上下文", "百万上下文", "编程", "思考模式", "开源"],
    isFeatured: true,
    isNew: true,
    maxOutput: 131072,
    supported: ["文本", "函数调用", "思考模式", "联网搜索", "结构化输出", "前缀续写", "批量推理", "上下文缓存"]
  },
  {
    id: "glm-5.2-fast-preview",
    name: "GLM 5.2 Fast Preview",
    provider: "智谱AI",
    description: "智谱AI GLM-5.2 的高速版本，支持 1M 超长上下文，模型能力对齐 GLM-5.2 标准版，具备逻辑推理、长文本理解与代码生成能力。通过推理加速优化，输出 TPS 可达标准版的 1.5~2 倍，适用于实时对话、Agent 多轮调用、流式代码生成等对输出速度敏感的场景。",
    contextLength: 1048576,
    promptPrice: 16,
    completionPrice: 56,
    cacheReadPrice: 4,
    tokenPricingTiers: [
      { label: "0<Token≤1M", maxTokens: 1048576, promptPrice: 16, completionPrice: 56, cacheReadPrice: 4 },
    ],
    category: "大语言模型",
    tags: ["高速", "长上下文", "百万上下文", "编程", "思考模式"],
    isNew: true,
    maxOutput: 131072,
    supported: ["文本", "函数调用", "思考模式", "联网搜索", "结构化输出", "前缀续写", "批量推理", "上下文缓存"]
  },
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    provider: "月之暗面",
    description: "月之暗面Kimi K2.5模型，擅长长文本理解和多轮对话，中文能力出色。",
    contextLength: 262144,
    promptPrice: 4,
    completionPrice: 21,
    cacheReadPrice: 0.8,
    cacheReadExplicitPrice: 0.4,
    category: "大语言模型",
    tags: ["长文本", "多轮对话", "中文优化"],
    maxOutput: 98304,
    supported: ["文本"]
  },
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    provider: "月之暗面",
    description: "月之暗面 Kimi K2.6 最新旗舰模型，长文本理解和创意写作能力大幅提升，支持更长上下文窗口。",
    contextLength: 262144,
    promptPrice: 6.5,
    completionPrice: 27,
    cacheReadPrice: 1.3,
    cacheReadExplicitPrice: 0.65,
    category: "大语言模型",
    tags: ["旗舰", "长文本", "创意写作", "中文优化"],
    isFeatured: true,
    isNew: true,
    maxOutput: 98304,
    supported: ["文本", "函数调用"]
  },
  {
    id: "kimi/kimi-k3",
    name: "Kimi K3",
    provider: "月之暗面",
    description: "Kimi 迄今能力最强的旗舰模型，拥有 2.8 万亿参数，基于 KDA 混合线性注意力机制（Kimi Delta Attention）和注意力残差（Attention Residuals）技术构建，原生支持视觉理解，并拥有 100 万 token 上下文窗口。全球首个开源的 3 万亿级别模型，面向长程编程、知识工作和推理等前沿智能场景而设计。",
    contextLength: 1048576,
    promptPrice: 20,
    completionPrice: 100,
    cacheReadPrice: 2,
    anthropicPassThrough: false,
    category: "大语言模型",
    tags: ["旗舰", "推理", "长程编程", "视觉理解", "思考模式", "百万上下文", "开源"],
    isFeatured: true,
    isNew: true,
    maxOutput: 1048576,
    supported: ["文本", "图像输入", "函数调用", "思考模式", "联网搜索", "结构化输出", "前缀续写", "批量推理", "上下文缓存"]
  },
  {
    id: "MiniMax/MiniMax-M3",
    name: "MiniMax M3",
    provider: "MiniMax",
    description: "MiniMax M3 凭借业界领先的 Coding 与 Agentic 能力、100万超长上下文窗口以及原生多模态特性，可出色胜任企业级长文档理解、高质量内容生成、代码编写、Bug修复及原生应用构建等任务。强大的 Agentic 能力端到端贯通工作流，原生多模态带来流畅自然的图文混合交互体验。",
    contextLength: 1000000,
    promptPrice: 4.2,
    completionPrice: 16.8,
    cacheReadPrice: 0.84,
    // 上游 apps/anthropic 实测不支持该模型（InvalidParameter），走平台内协议转换桥
    anthropicPassThrough: false,
    category: "多模态模型",
    tags: ["旗舰", "编程", "智能体", "视觉理解", "思考模式", "百万上下文"],
    isFeatured: true,
    isNew: true,
    maxOutput: 524288,
    supported: ["文本", "图像输入", "函数调用", "思考模式", "联网搜索", "结构化输出", "前缀续写", "批量推理", "上下文缓存"]
  },
  {
    id: "MiniMax-M2.1",
    name: "MiniMax M2.1",
    provider: "MiniMax",
    description: "MiniMax M2.1模型，在创意写作和多轮对话方面表现突出。",
    contextLength: 204800,
    promptPrice: 2.1,
    completionPrice: 8.4,
    cacheReadPrice: 0.42,
    category: "大语言模型",
    tags: ["创意写作", "对话", "通用"],
    maxOutput: 32768,
    supported: ["文本"]
  },
  {
    id: "MiniMax-M2.5",
    name: "MiniMax M2.5",
    provider: "MiniMax",
    description: "MiniMax M2.5 增强版，推理和编程能力提升，多轮对话更加稳定。",
    contextLength: 196608,
    promptPrice: 2.1,
    completionPrice: 8.4,
    cacheReadPrice: 0.42,
    category: "大语言模型",
    tags: ["推理", "编程", "对话"],
    isNew: true,
    maxOutput: 32768,
    supported: ["文本", "函数调用"]
  },
  // ========== Qwen3 小模型 ==========
  {
    id: "qwen3-8b",
    name: "Qwen3 8B",
    provider: "通义千问",
    description: "Qwen3 开源 80 亿参数轻量模型，适合边缘部署和低成本推理场景。",
    contextLength: 131072,
    promptPrice: 0.5,
    completionPrice: 2,
    thinkingCompletionPrice: 5,
    category: "大语言模型",
    tags: ["开源", "轻量", "高性价比"],
    isNew: true,
    maxOutput: 8192,
    supported: ["文本", "函数调用"]
  },
];

/**
 * Live model catalog consumed across the app (billing + display).
 *
 * Initialized as an exact clone of the static seed above, so before any DB
 * refresh — and if the DB is empty or unreachable — behavior is identical to
 * the hard-coded catalog. `refreshModels()` in data/model-overrides.ts mutates
 * THIS array in place (never reassigns the reference) so every importer sees
 * updates without changing their `import { models }` binding.
 */
export const models: AIModel[] = staticModels.map((m) => ({ ...m }));

/** The immutable hard-coded seed catalog (never affected by DB overrides). */
export function getStaticModels(): AIModel[] {
  return staticModels;
}
