import { Router, Request, Response } from "express";
import { models, AIModel, resolveCachePricing, resolveCompletionPrice } from "../data/models";
import { getApprovedModelsWithProvider } from "../data/providers";
import { getSupportedProtocols } from "../utils/model-protocols";
import { getAllowedChatParameters, getModelCapabilities } from "../utils/model-capabilities";
import { getModelAvailabilityMap } from "../services/scheduler";

const router = Router();

// 合并静态模型和供应商模型
async function getAllModels(): Promise<AIModel[]> {
  let providerModels: Awaited<ReturnType<typeof getApprovedModelsWithProvider>> = [];
  try {
    providerModels = await getApprovedModelsWithProvider();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Models] Provider models unavailable, falling back to static catalog: ${message}`);
  }
  const dynamicModels: AIModel[] = providerModels.map((m) => ({
    id: m.model_id,
    name: m.name,
    provider: m.providerName,
    description: m.description,
    contextLength: m.context_length,
    promptPrice: m.prompt_price,
    completionPrice: m.completion_price,
    category: m.category,
    tags: m.tags,
    isNew: m.is_new,
    isFeatured: m.is_featured,
    maxOutput: m.max_output,
    supported: m.supported,
  }));
  const modelMap = new Map<string, AIModel>();
  for (const model of models) modelMap.set(model.id, model);
  for (const model of dynamicModels) {
    const existing = modelMap.get(model.id);
    if (existing) {
      // 静态目录是计费口径的事实来源，动态行只能覆盖展示性字段。
      // 价格与路由语义字段必须整体回填，漏一个就会让展示与实扣不一致。
      modelMap.set(model.id, {
        ...model,
        contextLength: existing.contextLength,
        promptPrice: existing.promptPrice,
        completionPrice: existing.completionPrice,
        maxOutput: existing.maxOutput,
        cacheReadPrice: existing.cacheReadPrice,
        cacheReadExplicitPrice: existing.cacheReadExplicitPrice,
        thinkingCompletionPrice: existing.thinkingCompletionPrice,
        audioInputPrice: existing.audioInputPrice,
        audioOutputPrice: existing.audioOutputPrice,
        anthropicPassThrough: existing.anthropicPassThrough,
        defaultOutputReservation: existing.defaultOutputReservation,
        pricingType: model.pricingType || existing.pricingType,
        pricingTiers: model.pricingTiers || existing.pricingTiers,
        tokenPricingTiers: model.tokenPricingTiers || existing.tokenPricingTiers,
      });
    } else {
      modelMap.set(model.id, model);
    }
  }
  return Array.from(modelMap.values());
}

/** 披露价按账本精度(6 位小数)取整，避免浮点尾差直接进 API 与页面。 */
function money6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * 对外披露的思考模式输出价。仅当官方对思考模式单独定价时返回，
 * 取值来自 resolveCompletionPrice，与实扣路径同源。
 */
function buildThinkingPricing(model: AIModel) {
  const allTiers = (model.tokenPricingTiers || []).map((tier) => ({
    label: tier.label,
    completionPrice: money6(resolveCompletionPrice(model, tier, false)),
    thinkingCompletionPrice: money6(resolveCompletionPrice(model, tier, true)),
  }));
  const differing = allTiers.filter((entry) => entry.thinkingCompletionPrice !== entry.completionPrice);
  // 分层模型的思考价配在档位上，标题沿用页面既有的「首阶」口径，避免模型级显示成同价。
  const headline = allTiers[0] ?? {
    completionPrice: money6(resolveCompletionPrice(model, null, false)),
    thinkingCompletionPrice: money6(resolveCompletionPrice(model, null, true)),
  };
  if (headline.thinkingCompletionPrice === headline.completionPrice && differing.length === 0) return null;
  return {
    completionPrice: headline.completionPrice,
    thinkingCompletionPrice: headline.thinkingCompletionPrice,
    tiers: differing.length ? differing : undefined,
  };
}

/**
 * 对外披露的缓存价。取值来自 data/models 的 resolveCachePricing，
 * 与实扣路径同源，因此展示价不可能与实收价漂移。
 */
function buildCachePricing(model: AIModel, supportsCaching: boolean) {
  if (!supportsCaching) return null;
  const base = resolveCachePricing(model);
  return {
    implicitHit: money6(base.implicitHit),
    explicitHit: money6(base.explicitHit),
    explicitCreation: money6(base.explicitCreation),
    tiers: model.tokenPricingTiers?.map((tier) => {
      const resolved = resolveCachePricing(model, tier);
      return {
        label: tier.label,
        implicitHit: money6(resolved.implicitHit),
        explicitHit: money6(resolved.explicitHit),
        explicitCreation: money6(resolved.explicitCreation),
      };
    }),
  };
}

// 获取所有模型列表
router.get("/", async (req: Request, res: Response) => {
  const { category, provider, search, sort } = req.query;

  let filtered = await getAllModels();

  if (category && category !== "全部") {
    filtered = filtered.filter((m) => m.category === category);
  }
  if (provider) {
    filtered = filtered.filter((m) => m.provider === provider);
  }
  if (search) {
    const q = (search as string).toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  // 排序
  if (sort === "price-asc") {
    filtered.sort((a, b) => a.promptPrice - b.promptPrice);
  } else if (sort === "price-desc") {
    filtered.sort((a, b) => b.promptPrice - a.promptPrice);
  } else if (sort === "context") {
    filtered.sort((a, b) => b.contextLength - a.contextLength);
  } else if (sort === "name") {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  const allModels = await getAllModels();
  const availability = await getModelAvailabilityMap(allModels.map((model) => model.id));
  res.json({
    success: true,
    data: filtered.map((model) => {
      const capabilities = getModelCapabilities(model);
      return {
        ...model,
        pricingType: model.pricingType,
        pricingTiers: model.pricingTiers,
        tokenPricingTiers: model.tokenPricingTiers,
        cachePricing: buildCachePricing(model, capabilities.supports_context_caching),
        thinkingPricing: buildThinkingPricing(model),
        supportedProtocols: getSupportedProtocols(model),
        supported_protocols: getSupportedProtocols(model),
        capabilities,
        allowed_parameters: getAllowedChatParameters(model),
        availability: availability.get(model.id)?.status || "temporarily_unavailable",
        availabilityReason: availability.has(model.id)
          ? availability.get(model.id)!.reason
          : "no_active_route",
      };
    }),
    total: filtered.length,
    categories: [...new Set(allModels.map((m) => m.category))],
    providers: [...new Set(allModels.map((m) => m.provider))],
  });
});

// 获取单个模型详情
router.get("/:id", async (req: Request, res: Response) => {
  const allModels = await getAllModels();
  const model = allModels.find((m) => m.id === req.params.id);
  if (!model) {
    res.status(404).json({ success: false, message: "模型不存在" });
    return;
  }
  const availability = (await getModelAvailabilityMap([model.id])).get(model.id);
  const capabilities = getModelCapabilities(model);
  res.json({
    success: true,
    data: {
      ...model,
      pricingType: model.pricingType,
      pricingTiers: model.pricingTiers,
      tokenPricingTiers: model.tokenPricingTiers,
      cachePricing: buildCachePricing(model, capabilities.supports_context_caching),
      thinkingPricing: buildThinkingPricing(model),
      supportedProtocols: getSupportedProtocols(model),
      supported_protocols: getSupportedProtocols(model),
      capabilities,
      allowed_parameters: getAllowedChatParameters(model),
      availability: availability?.status || "temporarily_unavailable",
      availabilityReason: availability ? availability.reason : "no_active_route",
    },
  });
});

export default router;
