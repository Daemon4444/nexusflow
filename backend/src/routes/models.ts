import { Router, Request, Response } from "express";
import { models, AIModel } from "../data/models";
import { getApprovedModelsWithProvider } from "../data/providers";
import { getSupportedProtocols } from "../utils/model-protocols";
import { getAllowedChatParameters, getModelCapabilities } from "../utils/model-capabilities";

const router = Router();

// 合并静态模型和供应商模型
async function getAllModels(): Promise<AIModel[]> {
  const providerModels = await getApprovedModelsWithProvider();
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
      // Merge pricingType/pricingTiers from static data into dynamic model
      modelMap.set(model.id, {
        ...model,
        contextLength: existing.contextLength,
        promptPrice: existing.promptPrice,
        completionPrice: existing.completionPrice,
        maxOutput: existing.maxOutput,
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
  res.json({
    success: true,
    data: filtered.map((model) => ({
      ...model,
      pricingType: model.pricingType,
      pricingTiers: model.pricingTiers,
      tokenPricingTiers: model.tokenPricingTiers,
      supportedProtocols: getSupportedProtocols(model),
      supported_protocols: getSupportedProtocols(model),
      capabilities: getModelCapabilities(model),
      allowed_parameters: getAllowedChatParameters(model),
    })),
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
  res.json({
    success: true,
    data: {
      ...model,
      pricingType: model.pricingType,
      pricingTiers: model.pricingTiers,
      tokenPricingTiers: model.tokenPricingTiers,
      supportedProtocols: getSupportedProtocols(model),
      supported_protocols: getSupportedProtocols(model),
      capabilities: getModelCapabilities(model),
      allowed_parameters: getAllowedChatParameters(model),
    },
  });
});

export default router;
