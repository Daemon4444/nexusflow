import { Router, Request, Response } from "express";
import {
  getAllProviders, getProvidersByStatus, getProviderById, getProviderByEmail,
  createProvider, ensureProvider, updateProviderStatus, updateProvider, deleteProvider,
  getModelsByProvider, createModel, updateModel, updateModelStatus, deleteModel,
  getProviderStats, getModelStats, getAllProviderModels, getModelsByStatus,
  getCapacityByProvider, getCapacityByModel, getCapacity, getAllCapacity, upsertCapacity, deleteCapacity,
  type Provider,
} from "../data/providers";
import { getAllHealthRecords } from "../services/scheduler";
import { getProviderUsageStats } from "../services/rate-limiter";
import { models as staticModels } from "../data/models";
import {
  getProviderChannelConfig,
  switchProviderChannel,
  upsertProviderChannelConfig,
  type ProviderChannelConfig,
} from "../data/provider-channels";
import { requireAdmin } from "../middleware/admin";

const router = Router();

function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "********";
  return `${secret.slice(0, 4)}********${secret.slice(-4)}`;
}

function ensureInternalProviders(): void {
  const dashscope = ensureProvider({
    id: "dashscope",
    name: "阿里云百炼",
    slug: "dashscope",
    description: "百炼 OpenAI 兼容模式渠道，当前默认承载通义千问、DeepSeek、GLM、Kimi、MiniMax、PixVerse、HappyHorse 等模型。",
    website: "https://help.aliyun.com/zh/model-studio/",
    api_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key: process.env.DASHSCOPE_API_KEY || "",
    contact_name: "平台运营",
    contact_email: "ops@nexusflow.ai",
    status: "enabled",
  });
  ensureProvider({
    id: "pixverse",
    name: "PixVerse 双通道",
    slug: "pixverse",
    description: "PixVerse 视频模型渠道，可在百炼和拍我官方之间切换。",
    website: "https://pixverse.ai/",
    api_base_url: "https://dashscope.aliyuncs.com/api/v1",
    api_key: process.env.DASHSCOPE_API_KEY || "",
    contact_name: "平台运营",
    contact_email: "ops@nexusflow.ai",
    status: "enabled",
  });
  ensureProvider({
    id: "volcengine-ark",
    name: "火山方舟",
    slug: "volcengine-ark",
    description: "火山引擎方舟 OpenAI 兼容渠道，可在模型管理中按模型添加路由。",
    website: "https://www.volcengine.com/product/ark",
    api_base_url: "https://ark.cn-beijing.volces.com/api/v3",
    api_key: process.env.ARK_API_KEY || "",
    contact_name: "平台运营",
    contact_email: "ops@nexusflow.ai",
    status: "enabled",
  });

  for (const model of staticModels) {
    if (getCapacity(dashscope.id, model.id)) continue;
    const isTaskModel = model.category === "图像生成" || model.category === "视频生成";
    upsertCapacity(dashscope.id, model.id, {
      rpm_limit: 1000,
      tpm_limit: isTaskModel ? 0 : 1000000,
      daily_limit: 100000,
      concurrent_limit: isTaskModel ? 10 : 0,
      priority: 10,
      weight: 100,
      is_enabled: true,
    });
  }

  ensurePixVerseChannelConfig();
  if (!getCapacity("pixverse", "pixverse-v6")) {
    upsertCapacity("pixverse", "pixverse-v6", {
      rpm_limit: 60,
      tpm_limit: 0,
      daily_limit: 1000,
      concurrent_limit: 5,
      priority: 20,
      weight: 100,
      is_enabled: true,
    });
  }
}

function ensurePixVerseChannelConfig(): ProviderChannelConfig {
  const existing = getProviderChannelConfig("pixverse");
  if (existing) return existing;
  return upsertProviderChannelConfig("pixverse", {
    active_channel: "bailian",
    channels: {
      bailian: {
        name: "百炼渠道",
        adapter: "dashscope",
        api_base_url: "https://dashscope.aliyuncs.com/api/v1",
        api_key: process.env.DASHSCOPE_API_KEY || "",
      },
      official: {
        name: "拍我官方",
        adapter: "pixverse",
        api_base_url: "https://app-api.pixverseai.cn/openapi/v2",
        api_key: process.env.PIXVERSE_API_KEY || "",
      },
    },
  });
}

function getProviderChannelSummary(providerId: string) {
  const config = getProviderChannelConfig(providerId);
  if (!config) return null;
  return {
    activeChannel: config.active_channel,
    channels: Object.entries(config.channels).map(([id, channel]) => ({
      id,
      name: channel.name,
      adapter: channel.adapter,
      apiBaseUrl: channel.api_base_url,
      apiKeyMasked: channel.api_key ? maskSecret(channel.api_key) : "未配置",
    })),
  };
}

function getProviderRouteModels(providerId: string) {
  const capacities = getCapacityByProvider(providerId);
  return capacities
    .map((capacity) => {
      const catalog = staticModels.find((model) => model.id === capacity.model_id);
      if (!catalog) return null;
      return {
        id: `${providerId}:${catalog.id}`,
        modelId: catalog.id,
        name: catalog.name,
        category: catalog.category,
        status: capacity.is_enabled ? "enabled" : "disabled",
        promptPrice: catalog.promptPrice,
        completionPrice: catalog.completionPrice,
      };
    })
    .filter(Boolean);
}

function getProviderCard(provider: Provider) {
  const capacity = getCapacityByProvider(provider.id);
  const usage = capacity.reduce((acc, cap) => {
    const current = getProviderUsageStats(provider.id, cap.model_id);
    acc.currentRpm += current.rpm;
    acc.currentTpm += current.tpm;
    acc.rpmLimit += cap.rpm_limit;
    acc.tpmLimit += cap.tpm_limit;
    acc.concurrentLimit += cap.concurrent_limit;
    return acc;
  }, { currentRpm: 0, currentTpm: 0, rpmLimit: 0, tpmLimit: 0, concurrentLimit: 0 });

  return {
    id: provider.id,
    name: provider.name,
    slug: provider.slug,
    description: provider.description,
    website: provider.website,
    apiBaseUrl: provider.api_base_url,
    apiKeyMasked: provider.api_key ? maskSecret(provider.api_key) : "未配置",
    contactName: provider.contact_name,
    contactEmail: provider.contact_email,
    contactPhone: provider.contact_phone,
    status: provider.status,
    rejectionReason: provider.rejection_reason,
    createdAt: provider.created_at,
    approvedAt: provider.approved_at,
    modelCount: capacity.length,
    enabledRoutes: capacity.filter((item) => item.is_enabled).length,
    channelConfig: getProviderChannelSummary(provider.id),
    ...usage,
  };
}

// ========== 渠道录入（当前仍保留该入口，但更适合内部使用） ==========

// POST /api/provider/register — 创建渠道配置
router.post("/register", (_req: Request, res: Response) => {
  res.status(403).json({
    success: false,
    message: "当前部署已关闭公开渠道注册，请使用管理员后台维护内部渠道",
  });
});

// GET /api/provider/status/:email — 查询渠道状态
router.get("/status/:email", (_req: Request, res: Response) => {
  res.status(403).json({
    success: false,
    message: "当前部署已关闭公开渠道状态查询，请使用管理员后台查看内部渠道",
  });
});

// ========== 管理员接口 / 内部渠道管理 ==========
// 注意：/admin/* 路由必须在 /:providerId/* 路由之前注册，
// 否则 Express 会把 "admin" 当作 providerId 参数匹配。

router.use("/admin", requireAdmin);

// GET /api/provider/admin/providers — 获取所有供应商
router.get("/admin/providers", (_req: Request, res: Response) => {
  ensureInternalProviders();
  const providers = getAllProviders().map(getProviderCard);
  res.json({
    success: true,
    data: providers,
  });
});

// POST /api/provider/admin/providers — 创建内部渠道
router.post("/admin/providers", (req: Request, res: Response) => {
  const { name, description, website, api_base_url, api_key, contact_name, contact_email, contact_phone } = req.body || {};
  if (!name || !api_base_url) {
    res.status(400).json({ success: false, message: "请填写渠道名称和 API Base URL" });
    return;
  }

  const provider = createProvider({
    name,
    description,
    website,
    api_base_url,
    api_key: api_key || "",
    contact_name: contact_name || "平台运营",
    contact_email: contact_email || "ops@nexusflow.ai",
    contact_phone,
  });
  updateProviderStatus(provider.id, "enabled");

  res.json({
    success: true,
    data: getProviderCard(getProviderById(provider.id)!),
    message: "渠道已创建",
  });
});

// GET /api/provider/admin/providers/:id — 获取渠道详情
router.get("/admin/providers/:id", (req: Request, res: Response) => {
  ensureInternalProviders();
  const provider = getProviderById(req.params.id as string);
  if (!provider) {
    res.status(404).json({ success: false, message: "渠道不存在" });
    return;
  }

  const models = getProviderRouteModels(provider.id);
  const capacity = getCapacityByProvider(provider.id);
  const health = getAllHealthRecords().filter((item) => item.providerId === provider.id);

  res.json({
    success: true,
    data: {
      provider: getProviderCard(provider),
      models,
      capacity: capacity.map((item) => ({
        modelId: item.model_id,
        rpmLimit: item.rpm_limit,
        tpmLimit: item.tpm_limit,
        dailyLimit: item.daily_limit,
        concurrentLimit: item.concurrent_limit,
        priority: item.priority,
        weight: item.weight,
        isEnabled: item.is_enabled,
      })),
      health: health.map((item) => ({
        modelId: item.modelId,
        status: item.status,
        consecutiveFailures: item.consecutiveFailures,
        avgLatencyMs: item.avgLatencyMs,
        lastSuccessAt: item.lastSuccessAt,
        lastFailureAt: item.lastFailureAt,
        lastError: item.lastError,
      })),
    },
  });
});

// PUT /api/provider/admin/providers/:id — 更新渠道配置
router.put("/admin/providers/:id", (req: Request, res: Response) => {
  const providerId = req.params.id as string;
  const provider = getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "渠道不存在" });
    return;
  }

  const {
    name, description, website, logo_url,
    api_base_url, api_key, contact_name, contact_email, contact_phone,
  } = req.body || {};

  const success = updateProvider(providerId, {
    name,
    description,
    website,
    logo_url,
    api_base_url,
    api_key,
    contact_name,
    contact_email,
    contact_phone,
  });

  if (!success) {
    res.status(500).json({ success: false, message: "更新渠道失败" });
    return;
  }

  const updated = getProviderById(providerId)!;
  res.json({
    success: true,
    data: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      website: updated.website,
      apiBaseUrl: updated.api_base_url,
      apiKeyMasked: maskSecret(updated.api_key),
      contactName: contact_name ?? updated.contact_name,
      contactEmail: contact_email ?? updated.contact_email,
      contactPhone: contact_phone ?? updated.contact_phone,
      status: updated.status,
    },
    message: "渠道配置已更新",
  });
});

// GET /api/provider/admin/providers/draft — 获取待配置渠道
router.get("/admin/providers/draft", (_req: Request, res: Response) => {
  const providers = getProvidersByStatus("draft");
  res.json({
    success: true,
    data: providers.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      website: p.website,
      apiBaseUrl: p.api_base_url,
      contactName: p.contact_name,
      contactEmail: p.contact_email,
      contactPhone: p.contact_phone,
      createdAt: p.created_at,
    })),
  });
});

// POST /api/provider/admin/providers/:id/enable — 启用渠道
router.post("/admin/providers/:id/enable", (req: Request, res: Response) => {
  const success = updateProviderStatus(req.params.id as string, "enabled");
  if (!success) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }
  res.json({ success: true, message: "渠道已启用" });
});

// POST /api/provider/admin/providers/:id/disable — 停用渠道
router.post("/admin/providers/:id/disable", (req: Request, res: Response) => {
  const { reason } = req.body;
  const success = updateProviderStatus(req.params.id as string, "disabled", reason);
  if (!success) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }
  res.json({ success: true, message: "渠道已停用" });
});

// GET /api/provider/admin/models — 获取所有模型
router.get("/admin/models", (_req: Request, res: Response) => {
  ensureInternalProviders();
  const providers = getAllProviders();
  const models = staticModels.map((model) => {
    const routes = getCapacityByModel(model.id).map((capacity) => {
      const provider = providers.find((item) => item.id === capacity.provider_id);
      const usage = getProviderUsageStats(capacity.provider_id, model.id);
      return {
        providerId: capacity.provider_id,
        providerName: provider?.name || capacity.provider_id,
        providerStatus: provider?.status || "disabled",
        isEnabled: capacity.is_enabled,
        rpmLimit: capacity.rpm_limit,
        tpmLimit: capacity.tpm_limit,
        dailyLimit: capacity.daily_limit,
        concurrentLimit: capacity.concurrent_limit,
        priority: capacity.priority,
        weight: capacity.weight,
        currentRpm: usage.rpm,
        currentTpm: usage.tpm,
      };
    });
    return {
      id: model.id,
      providerId: routes[0]?.providerId || "",
      providerName: routes[0]?.providerName || "",
      modelId: model.id,
      name: model.name,
      description: model.description,
      category: model.category,
      status: routes.some((route) => route.isEnabled) ? "enabled" : "disabled",
      createdAt: "",
      routes,
    };
  });
  res.json({
    success: true,
    data: models,
  });
});

// GET /api/provider/admin/models/draft — 获取草稿模型
router.get("/admin/models/draft", (_req: Request, res: Response) => {
  const models = getModelsByStatus("draft");
  res.json({
    success: true,
    data: models.map((m) => ({
      id: m.id,
      providerId: m.provider_id,
      modelId: m.model_id,
      name: m.name,
      description: m.description,
      category: m.category,
      contextLength: m.context_length,
      promptPrice: m.prompt_price,
      completionPrice: m.completion_price,
      createdAt: m.created_at,
    })),
  });
});

// POST /api/provider/admin/models/:id/enable — 启用模型
router.post("/admin/models/:id/enable", (req: Request, res: Response) => {
  const success = updateModelStatus(req.params.id as string, "enabled");
  if (!success) {
    res.status(404).json({ success: false, message: "模型不存在" });
    return;
  }
  res.json({ success: true, message: "模型已启用" });
});

// POST /api/provider/admin/models/:id/disable — 停用模型
router.post("/admin/models/:id/disable", (req: Request, res: Response) => {
  const success = updateModelStatus(req.params.id as string, "disabled");
  if (!success) {
    res.status(404).json({ success: false, message: "模型不存在" });
    return;
  }
  res.json({ success: true, message: "模型已停用" });
});

// GET /api/provider/admin/stats — 统计数据
router.get("/admin/stats", (_req: Request, res: Response) => {
  ensureInternalProviders();
  const providerStats = getProviderStats();
  const enabledModels = staticModels.filter((model) => getCapacityByModel(model.id).some((route) => route.is_enabled)).length;
  const modelStats = { draft: 0, enabled: enabledModels, disabled: staticModels.length - enabledModels };
  res.json({
    success: true,
    data: {
      providers: providerStats,
      models: modelStats,
    },
  });
});

// ========== 容量配置管理 ==========

// GET /api/provider/admin/capacity — 获取所有容量配置
router.get("/admin/capacity", (_req: Request, res: Response) => {
  const capacity = getAllCapacity();
  res.json({
    success: true,
    data: capacity.map((c) => ({
      id: c.id,
      providerId: c.provider_id,
      providerName: c.provider_name,
      modelId: c.model_id,
      modelName: c.model_name,
      rpmLimit: c.rpm_limit,
      tpmLimit: c.tpm_limit,
      dailyLimit: c.daily_limit,
      concurrentLimit: c.concurrent_limit,
      priority: c.priority,
      weight: c.weight,
      isEnabled: c.is_enabled,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),
  });
});

// GET /api/provider/:providerId/capacity — 获取供应商的容量配置
router.get("/:providerId/capacity", (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  ensureInternalProviders();
  const provider = getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }

  const capacity = getCapacityByProvider(providerId);
  res.json({
    success: true,
    data: capacity.map((c) => ({
      id: c.id,
      modelId: c.model_id,
      rpmLimit: c.rpm_limit,
      tpmLimit: c.tpm_limit,
      dailyLimit: c.daily_limit,
      concurrentLimit: c.concurrent_limit,
      priority: c.priority,
      weight: c.weight,
      isEnabled: c.is_enabled,
    })),
  });
});

// PUT /api/provider/:providerId/capacity/:modelId — 设置/更新容量配置
router.put("/:providerId/capacity/:modelId", (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const modelId = req.params.modelId as string;

  ensureInternalProviders();
  const provider = getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }

  const { rpm_limit, tpm_limit, daily_limit, concurrent_limit, priority, weight, is_enabled } = req.body;

  const capacity = upsertCapacity(providerId, modelId, {
    rpm_limit,
    tpm_limit,
    daily_limit,
    concurrent_limit,
    priority,
    weight,
    is_enabled,
  });

  res.json({
    success: true,
    data: {
      id: capacity.id,
      modelId: capacity.model_id,
      rpmLimit: capacity.rpm_limit,
      tpmLimit: capacity.tpm_limit,
      dailyLimit: capacity.daily_limit,
      concurrentLimit: capacity.concurrent_limit,
      priority: capacity.priority,
      weight: capacity.weight,
      isEnabled: capacity.is_enabled,
    },
    message: "容量配置已更新",
  });
});

// DELETE /api/provider/:providerId/capacity/:modelId — 删除容量配置
router.delete("/:providerId/capacity/:modelId", (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  ensureInternalProviders();
  const provider = getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }
  const success = deleteCapacity(providerId, req.params.modelId as string);
  if (!success) {
    res.status(404).json({ success: false, message: "配置不存在" });
    return;
  }
  res.json({ success: true, message: "配置已删除" });
});

// ========== 健康监控 ==========

// GET /api/provider/admin/health — 获取所有供应商健康状态
router.get("/admin/health", (_req: Request, res: Response) => {
  const health = getAllHealthRecords();
  res.json({
    success: true,
    data: health.map((h) => ({
      providerId: h.providerId,
      modelId: h.modelId,
      status: h.status,
      consecutiveFailures: h.consecutiveFailures,
      lastSuccessAt: h.lastSuccessAt,
      lastFailureAt: h.lastFailureAt,
      lastError: h.lastError,
      avgLatencyMs: h.avgLatencyMs,
    })),
  });
});

// GET /api/provider/admin/usage/:providerId/:modelId — 获取实时使用量
router.get("/admin/usage/:providerId/:modelId", (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const modelId = req.params.modelId as string;
  const stats = getProviderUsageStats(providerId, modelId);
  res.json({
    success: true,
    data: {
      providerId,
      modelId,
      currentRpm: stats.rpm,
      currentTpm: stats.tpm,
    },
  });
});

// ========== 渠道管理模型（/:providerId 路由放在 /admin 之后） ==========

router.use("/:providerId", requireAdmin);

// POST /api/provider/:providerId/switch-channel — 切换供应商活跃子渠道
router.post("/:providerId/switch-channel", (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  ensureInternalProviders();
  const provider = getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }

  const { channel } = req.body || {};
  if (!channel || typeof channel !== "string") {
    res.status(400).json({ success: false, message: "请提供要切换的渠道" });
    return;
  }

  const updated = switchProviderChannel(providerId, channel);
  if (!updated) {
    res.status(400).json({ success: false, message: "渠道不存在或未配置" });
    return;
  }

  const selected = updated.channels[channel];
  res.json({
    success: true,
    data: {
      channel,
      channelName: selected.name,
      adapter: selected.adapter,
    },
    message: `已切换到${selected.name}`,
  });
});

// GET /api/provider/:providerId/models — 获取供应商的模型列表
router.get("/:providerId/models", (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const provider = getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }

  const models = getModelsByProvider(providerId);
  res.json({
    success: true,
    data: models.map((m) => ({
      id: m.id,
      modelId: m.model_id,
      name: m.name,
      description: m.description,
      category: m.category,
      contextLength: m.context_length,
      maxOutput: m.max_output,
      promptPrice: m.prompt_price,
      completionPrice: m.completion_price,
      tags: m.tags,
      supported: m.supported,
      status: m.status,
      createdAt: m.created_at,
    })),
  });
});

// POST /api/provider/:providerId/models — 添加模型
router.post("/:providerId/models", (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const provider = getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }
  if (provider.status === "disabled") {
    res.status(403).json({ success: false, message: "渠道已停用，无法继续维护模型" });
    return;
  }

  const {
    model_id, name, description, category,
    context_length, max_output, prompt_price, completion_price,
    tags, supported,
  } = req.body;

  if (!model_id || !name) {
    res.status(400).json({ success: false, message: "请填写模型ID和名称" });
    return;
  }

  const model = createModel(providerId, {
    model_id, name, description, category,
    context_length, max_output, prompt_price, completion_price,
    tags, supported,
  });

  if (!model) {
    res.status(400).json({ success: false, message: "模型ID已存在" });
    return;
  }

  res.json({
    success: true,
    data: {
      id: model.id,
      modelId: model.model_id,
      name: model.name,
      status: model.status,
    },
    message: "模型已创建",
  });
});

// PUT /api/provider/:providerId/models/:modelId — 更新模型
router.put("/:providerId/models/:modelId", (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const provider = getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }
  const model = getModelsByProvider(providerId).find((item) => item.id === (req.params.modelId as string));
  if (!model) {
    res.status(404).json({ success: false, message: "模型不存在或不属于该供应商" });
    return;
  }

  const success = updateModel(req.params.modelId as string, req.body);
  if (!success) {
    res.status(404).json({ success: false, message: "模型不存在" });
    return;
  }

  res.json({ success: true, message: "模型已更新" });
});

// DELETE /api/provider/:providerId/models/:modelId — 删除模型
router.delete("/:providerId/models/:modelId", (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const model = getModelsByProvider(providerId).find((item) => item.id === (req.params.modelId as string));
  if (!model) {
    res.status(404).json({ success: false, message: "模型不存在或不属于该供应商" });
    return;
  }
  const success = deleteModel(req.params.modelId as string);
  if (!success) {
    res.status(404).json({ success: false, message: "模型不存在" });
    return;
  }
  res.json({ success: true, message: "模型已删除" });
});

export default router;
