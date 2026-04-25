import { Router, Request, Response } from "express";
import {
  getAllProviders, getProvidersByStatus, getProviderById, getProviderByEmail,
  createProvider, updateProviderStatus, updateProvider, deleteProvider,
  getModelsByProvider, createModel, updateModel, updateModelStatus, deleteModel,
  getProviderStats, getModelStats, getAllProviderModels, getModelsByStatus,
  getCapacityByProvider, getAllCapacity, upsertCapacity, deleteCapacity,
} from "../data/providers";
import { getAllHealthRecords } from "../services/scheduler";
import { getProviderUsageStats } from "../services/rate-limiter";
import { requireAdmin } from "../middleware/admin";

const router = Router();

function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "********";
  return `${secret.slice(0, 4)}********${secret.slice(-4)}`;
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
  const providers = getAllProviders();
  res.json({
    success: true,
    data: providers.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      website: p.website,
      apiBaseUrl: p.api_base_url,
      apiKeyMasked: maskSecret(p.api_key),
      contactName: p.contact_name,
      contactEmail: p.contact_email,
      contactPhone: p.contact_phone,
      status: p.status,
      rejectionReason: p.rejection_reason,
      createdAt: p.created_at,
      approvedAt: p.approved_at,
    })),
  });
});

// GET /api/provider/admin/providers/:id — 获取渠道详情
router.get("/admin/providers/:id", (req: Request, res: Response) => {
  const provider = getProviderById(req.params.id as string);
  if (!provider) {
    res.status(404).json({ success: false, message: "渠道不存在" });
    return;
  }

  const models = getModelsByProvider(provider.id);
  const capacity = getCapacityByProvider(provider.id);
  const health = getAllHealthRecords().filter((item) => item.providerId === provider.id);

  res.json({
    success: true,
    data: {
      provider: {
        id: provider.id,
        name: provider.name,
        slug: provider.slug,
        description: provider.description,
        website: provider.website,
        apiBaseUrl: provider.api_base_url,
        apiKeyMasked: maskSecret(provider.api_key),
        contactName: provider.contact_name,
        contactEmail: provider.contact_email,
        contactPhone: provider.contact_phone,
        status: provider.status,
        rejectionReason: provider.rejection_reason,
        createdAt: provider.created_at,
        approvedAt: provider.approved_at,
      },
      models: models.map((model) => ({
        id: model.id,
        modelId: model.model_id,
        name: model.name,
        category: model.category,
        status: model.status,
        promptPrice: model.prompt_price,
        completionPrice: model.completion_price,
      })),
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
  const models = getAllProviderModels();
  res.json({
    success: true,
    data: models.map((m) => ({
      id: m.id,
      providerId: m.provider_id,
      modelId: m.model_id,
      name: m.name,
      category: m.category,
      status: m.status,
      createdAt: m.created_at,
    })),
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
  const providerStats = getProviderStats();
  const modelStats = getModelStats();
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
  const success = deleteCapacity(req.params.providerId as string, req.params.modelId as string);
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
