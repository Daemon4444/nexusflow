import { Router, Request, Response } from "express";
import { models, AIModel } from "../data/models";
import { getApprovedModelsWithProvider } from "../data/providers";
import { getSupportedProtocols } from "../utils/model-protocols";

const router = Router();

// 合并静态模型和供应商模型
function getAllModels(): AIModel[] {
  const providerModels = getApprovedModelsWithProvider();
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
  return [...models, ...dynamicModels];
}

// 获取所有模型列表
router.get("/", (req: Request, res: Response) => {
  const { category, provider, search, sort } = req.query;

  let filtered = getAllModels();

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

  const allModels = getAllModels();
  res.json({
    success: true,
    data: filtered.map((model) => ({
      ...model,
      supportedProtocols: getSupportedProtocols(model),
      supported_protocols: getSupportedProtocols(model),
    })),
    total: filtered.length,
    categories: [...new Set(allModels.map((m) => m.category))],
    providers: [...new Set(allModels.map((m) => m.provider))],
  });
});

// 获取单个模型详情
router.get("/:id", (req: Request, res: Response) => {
  const allModels = getAllModels();
  const model = allModels.find((m) => m.id === req.params.id);
  if (!model) {
    res.status(404).json({ success: false, message: "模型不存在" });
    return;
  }
  res.json({
    success: true,
    data: {
      ...model,
      supportedProtocols: getSupportedProtocols(model),
      supported_protocols: getSupportedProtocols(model),
    },
  });
});

export default router;
