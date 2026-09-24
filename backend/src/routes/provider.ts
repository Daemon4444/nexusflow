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
import { getProviderUsageStatsAsync } from "../services/rate-limiter";
import {
  HealthState,
  latestObservationAt,
  summarizeRouteHealth,
  unavailableAvailabilityPercentage,
} from "../services/provider-monitor-semantics";
import { ensureRoutingDefaults, isProviderModelCompatible } from "../services/providers";
import { models as staticModels } from "../data/models";
import {
  getProviderChannelConfig,
  switchProviderChannel,
  upsertProviderChannelConfig,
  upsertProviderChannel,
  isChannelUsable,
  type ProviderChannelConfig,
} from "../data/provider-channels";
import { ensureDashScopeChannelConfig } from "../services/upstream";
import {
  createCostVersion,
  getRouteAudits,
  getRoutePolicies,
  recordRouteAudit,
  upsertRoutePolicy,
  deleteRoutePolicy,
} from "../data/provider-operations";
import {
  getAllActiveProviderCostTiers,
  type ProviderCostTier,
} from "../services/provider-costs";
import { requirePermission } from "../middleware/admin-access";
import { auditAdminWrite, setAdminAuditContext } from "../middleware/admin-audit";

const router = Router();

function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "********";
  return `${secret.slice(0, 4)}********${secret.slice(-4)}`;
}

async function ensureInternalProviders(): Promise<void> {
  await ensureRoutingDefaults();
  await ensureProvider({
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

  await ensurePixVerseChannelConfig();
  await ensureDashScopeChannelConfig();
  if (!(await getCapacity("pixverse", "pixverse-v6"))) {
    await upsertCapacity("pixverse", "pixverse-v6", {
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

async function ensurePixVerseChannelConfig(): Promise<ProviderChannelConfig> {
  const existing = await getProviderChannelConfig("pixverse");
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
        api_base_url: "https://app-api.pixverse.ai/openapi/v2",
        api_key: process.env.PIXVERSE_API_KEY || "",
      },
    },
  });
}

async function getProviderChannelSummary(providerId: string) {
  const config = await getProviderChannelConfig(providerId);
  if (!config) return null;
  return {
    activeChannel: config.active_channel,
    channels: Object.entries(config.channels).map(([id, channel]) => ({
      id,
      name: channel.name,
      adapter: channel.adapter,
      apiBaseUrl: channel.api_base_url,
      apiKeyMasked: channel.api_key ? maskSecret(channel.api_key) : "未配置",
      region: channel.region || null,
      workspaceId: channel.workspace_id || null,
      enabled: channel.enabled !== false,
      priority: channel.priority ?? 0,
      modelAllowlist: channel.model_allowlist || null,
      usable: isChannelUsable(channel, {
        // 环境变量 key 回退仅对默认区域有效（国内 key 实测无法调海外区域）
        hasFallbackKey: (!channel.region || channel.region === "cn-beijing")
          && !!(channel.adapter === "pixverse" ? process.env.PIXVERSE_API_KEY : process.env.DASHSCOPE_API_KEY),
      }),
    })),
  };
}

function getRouteHealth(health: Awaited<ReturnType<typeof getAllHealthRecords>>, providerId: string, modelId: string) {
  return health.find((item) => item.providerId === providerId && item.modelId === modelId);
}

function getSaturation(
  currentRpm: number | null,
  rpmLimit: number,
  currentTpm: number | null,
  tpmLimit: number
): number | null {
  if (currentRpm === null || currentTpm === null) return null;
  const rpmRatio = rpmLimit > 0 ? currentRpm / rpmLimit : 0;
  const tpmRatio = tpmLimit > 0 ? currentTpm / tpmLimit : 0;
  return Number(Math.max(rpmRatio, tpmRatio).toFixed(4));
}

function getRecommendedProviderId(modelId: string): string {
  if (modelId.startsWith("claude-")) return "himodels";
  if (modelId.startsWith("pixverse-")) return "pixverse";
  return "dashscope";
}

function getMarginPercent(revenue: number, cost: number): number {
  if (revenue <= 0) return cost > 0 ? -100 : 0;
  return Number((((revenue - cost) / revenue) * 100).toFixed(2));
}

async function getProviderRouteModels(providerId: string) {
  const capacities = await getCapacityByProvider(providerId);
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

async function getProviderCard(provider: Provider) {
  const capacity = await getCapacityByProvider(provider.id);
  const routeUsage = await Promise.all(
    capacity.map((cap) => getProviderUsageStatsAsync(provider.id, cap.model_id))
  );
  const usageAvailable = routeUsage.every((item) => item.available);
  const usage = capacity.reduce((acc, cap, index) => {
    const current = routeUsage[index];
    if (current?.available) {
      acc.currentRpm += current.rpm;
      acc.currentTpm += current.tpm;
    }
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
    channelConfig: await getProviderChannelSummary(provider.id),
    currentRpm: usageAvailable ? usage.currentRpm : null,
    currentTpm: usageAvailable ? usage.currentTpm : null,
    rpmLimit: usage.rpmLimit,
    tpmLimit: usage.tpmLimit,
    concurrentLimit: usage.concurrentLimit,
    usageAvailable,
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

router.use(auditAdminWrite);
router.use((req: Request, res: Response, next) => {
  const permission = ["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())
    ? "providers.read"
    : "providers.manage";
  requirePermission(permission)(req, res, next);
});

function requireEndpointSecurityPermission(req: Request, res: Response, next: () => void) {
  requirePermission("security.manage")(req, res, next);
}

function requireEndpointSecurityWhenChanged(req: Request, res: Response, next: () => void) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (
    Object.prototype.hasOwnProperty.call(body, "api_base_url")
    || Object.prototype.hasOwnProperty.call(body, "api_key")
  ) {
    requireEndpointSecurityPermission(req, res, next);
    return;
  }
  next();
}

// GET /api/provider/admin/providers — 获取所有供应商
router.get("/admin/providers", async (_req: Request, res: Response) => {
  const providers = await Promise.all((await getAllProviders()).map(getProviderCard));
  res.json({
    success: true,
    data: providers,
  });
});

// GET /api/provider/admin/operations — 供应商运营工作台
router.get("/admin/operations", async (_req: Request, res: Response) => {
  const [providers, capacity, health, activeCostTiers, routePolicies, routeAudits] = await Promise.all([
    getAllProviders(),
    getAllCapacity(),
    getAllHealthRecords(),
    getAllActiveProviderCostTiers(),
    getRoutePolicies(),
    getRouteAudits(12),
  ]);
  const costByRoute = new Map<string, ProviderCostTier[]>();
  for (const tier of activeCostTiers) {
    const key = `${tier.providerId}:${tier.modelId}`;
    const routeTiers = costByRoute.get(key) || [];
    routeTiers.push(tier);
    costByRoute.set(key, routeTiers);
  }
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const capacityByModel = new Map<string, typeof capacity>();
  for (const item of capacity) {
    const rows = capacityByModel.get(item.model_id) || [];
    rows.push(item);
    capacityByModel.set(item.model_id, rows);
  }
  const usageByRoute = new Map(
    await Promise.all(capacity.map(async (item) => [
      `${item.provider_id}:${item.model_id}`,
      await getProviderUsageStatsAsync(item.provider_id, item.model_id),
    ] as const))
  );

  const providerCards = providers.map((provider) => {
    const providerCapacity = capacity.filter((item) => item.provider_id === provider.id);
    const totals = providerCapacity.reduce((acc, item) => {
      const usage = usageByRoute.get(`${provider.id}:${item.model_id}`);
      if (usage?.available) {
        acc.currentRpm += usage.rpm;
        acc.currentTpm += usage.tpm;
      } else {
        acc.usageAvailable = false;
      }
      acc.rpmLimit += item.rpm_limit;
      acc.tpmLimit += item.tpm_limit;
      acc.dailyLimit += item.daily_limit;
      acc.concurrentLimit += item.concurrent_limit;
      if (item.is_enabled) acc.enabledRoutes += 1;
      return acc;
    }, {
      currentRpm: 0,
      currentTpm: 0,
      rpmLimit: 0,
      tpmLimit: 0,
      dailyLimit: 0,
      concurrentLimit: 0,
      enabledRoutes: 0,
      usageAvailable: true,
    });
    const healthByModel = new Map(
      health
        .filter((item) => item.providerId === provider.id)
        .map((item) => [item.modelId, item.status])
    );
    const enabledCapacity = providerCapacity.filter((item) => item.is_enabled);
    const {
      health: healthState,
      summary: healthSummary,
      observedRoutes,
    } = summarizeRouteHealth(enabledCapacity.map((item) => item.model_id), healthByModel);

    return {
      id: provider.id,
      name: provider.name,
      slug: provider.slug,
      status: provider.status,
      apiBaseUrl: provider.api_base_url,
      apiKeyMasked: provider.api_key ? maskSecret(provider.api_key) : "未配置",
      modelCount: providerCapacity.length,
      enabledRoutes: totals.enabledRoutes,
      health: healthState,
      observedRoutes,
      unknownRoutes: healthSummary.unknown,
      healthCoverageRatio: enabledCapacity.length > 0
        ? Number((observedRoutes / enabledCapacity.length).toFixed(4))
        : 0,
      healthSummary,
      currentRpm: totals.usageAvailable ? totals.currentRpm : null,
      currentTpm: totals.usageAvailable ? totals.currentTpm : null,
      usageAvailable: totals.usageAvailable,
      rpmLimit: totals.rpmLimit,
      tpmLimit: totals.tpmLimit,
      dailyLimit: totals.dailyLimit,
      concurrentLimit: totals.concurrentLimit,
      saturationRatio: getSaturation(
        totals.usageAvailable ? totals.currentRpm : null,
        totals.rpmLimit,
        totals.usageAvailable ? totals.currentTpm : null,
        totals.tpmLimit
      ),
      missingApiKey: !provider.api_key,
    };
  });

  const routes = capacity.map((item) => {
    const provider = providerById.get(item.provider_id);
    const catalog = staticModels.find((model) => model.id === item.model_id);
    const usage = usageByRoute.get(`${item.provider_id}:${item.model_id}`);
    const routeHealth = getRouteHealth(health, item.provider_id, item.model_id);
    const currentHealth: HealthState = routeHealth?.status || "unknown";
    const costs = costByRoute.get(`${item.provider_id}:${item.model_id}`) || [];
    const promptCosts = costs.map((cost) => cost.promptCost);
    const completionCosts = costs.map((cost) => cost.completionCost);
    const promptCostMin = promptCosts.length ? Math.min(...promptCosts) : null;
    const promptCostMax = promptCosts.length ? Math.max(...promptCosts) : null;
    const completionCostMin = completionCosts.length ? Math.min(...completionCosts) : null;
    const completionCostMax = completionCosts.length ? Math.max(...completionCosts) : null;
    const conservativeCost = costs.length
      ? costs.reduce((current, cost) => (
        cost.promptCost + cost.completionCost + cost.fixedCost
          > current.promptCost + current.completionCost + current.fixedCost
          ? cost
          : current
      ))
      : null;
    const sortedCosts = [...costs].sort(
      (a, b) => a.inputTierMinTokens - b.inputTierMinTokens
    );
    const contiguousTiers = sortedCosts.length > 0
      && sortedCosts[0].inputTierMinTokens === 0
      && sortedCosts.every((cost, index) => (
        index === 0
        || sortedCosts[index - 1].inputTierMaxTokens === cost.inputTierMinTokens
      ));
    const lastTier = sortedCosts[sortedCosts.length - 1];
    const coversCatalogContext = !!lastTier && (
      lastTier.inputTierMaxTokens === null
      || !catalog?.contextLength
      || lastTier.inputTierMaxTokens >= catalog.contextLength
    );
    const fullCostCoverage = costs.length > 0
      && costs.every((cost) => cost.coverageStatus === "full")
      && contiguousTiers
      && coversCatalogContext;
    const priceUnit = catalog?.pricingType === "per-image"
      ? "元/张"
      : catalog?.pricingType === "per-second"
        ? "元/秒"
        : catalog?.pricingType === "per-10k-characters"
          ? "元/万字符"
          : "元/百万tokens";
    const recommendedProviderId = getRecommendedProviderId(item.model_id);

    return {
      providerId: item.provider_id,
      providerName: provider?.name || item.provider_name || item.provider_id,
      providerStatus: provider?.status || "disabled",
      modelId: item.model_id,
      modelName: catalog?.name || item.model_name || item.model_id,
      modelProvider: catalog?.provider || "",
      category: catalog?.category || "未分类",
      enabled: item.is_enabled,
      recommendedProviderId,
      recommended: item.provider_id === recommendedProviderId,
      promptPrice: catalog?.promptPrice ?? 0,
      completionPrice: catalog?.completionPrice ?? 0,
      promptCost: promptCostMax,
      promptCostMin,
      promptCostMax,
      completionCost: completionCostMax,
      completionCostMin,
      completionCostMax,
      fixedCost: conservativeCost?.fixedCost ?? null,
      costKnown: costs.length > 0,
      costCoverageStatus: costs.length === 0
        ? "unknown"
        : fullCostCoverage ? "full" : "partial",
      costTierCount: costs.length,
      costTierCoverageComplete: contiguousTiers && coversCatalogContext,
      costSource: conservativeCost?.source || null,
      costVersionId: conservativeCost?.id || null,
      costPriceBookId: conservativeCost?.priceBookId || null,
      grossMarginPrompt: promptCostMax !== null
        ? getMarginPercent(catalog?.promptPrice ?? 0, promptCostMax)
        : null,
      grossMarginCompletion: completionCostMax !== null
        ? getMarginPercent(catalog?.completionPrice ?? 0, completionCostMax)
        : null,
      pricingType: catalog?.pricingType || "token",
      priceUnit,
      rpmLimit: item.rpm_limit,
      tpmLimit: item.tpm_limit,
      dailyLimit: item.daily_limit,
      concurrentLimit: item.concurrent_limit,
      priority: item.priority,
      weight: item.weight,
      currentRpm: usage?.available ? usage.rpm : null,
      currentTpm: usage?.available ? usage.tpm : null,
      usageAvailable: usage?.available === true,
      saturationRatio: getSaturation(
        usage?.available ? usage.rpm : null,
        item.rpm_limit,
        usage?.available ? usage.tpm : null,
        item.tpm_limit
      ),
      health: currentHealth,
      healthObserved: !!routeHealth,
      lastObservedAt: latestObservationAt(routeHealth?.lastSuccessAt, routeHealth?.lastFailureAt),
      availability: unavailableAvailabilityPercentage(),
      availabilitySource: "unavailable",
      avgLatencyMs: routeHealth?.avgLatencyMs ?? null,
      consecutiveFailures: routeHealth?.consecutiveFailures ?? 0,
      lastError: routeHealth?.lastError ?? null,
    };
  });

  const issues: Array<{
    level: "critical" | "warning" | "info";
    scope: "provider" | "route" | "model";
    providerId?: string;
    modelId?: string;
    title: string;
    detail: string;
    action: string;
  }> = [];

  for (const provider of providerCards) {
    if (provider.status !== "enabled") {
      issues.push({
        level: "warning",
        scope: "provider",
        providerId: provider.id,
        title: `${provider.name} 未启用`,
        detail: "供应商处于草稿或停用状态，不会成为稳定承载渠道。",
        action: "确认合同、密钥和健康检查后再启用。",
      });
    }
    if (provider.missingApiKey) {
      issues.push({
        level: "critical",
        scope: "provider",
        providerId: provider.id,
        title: `${provider.name} 缺少 API Key`,
        detail: "后台已建档，但真实调用会因为上游密钥缺失失败。",
        action: "在渠道控制台补齐密钥或设置对应环境变量。",
      });
    }
    if (provider.health === "unknown") {
      issues.push({
        level: "info",
        scope: "provider",
        providerId: provider.id,
        title: `${provider.name} 健康状态未知`,
        detail: provider.enabledRoutes === 0
          ? "当前没有启用路由，无法形成上游健康观测。"
          : `仅 ${provider.observedRoutes}/${provider.enabledRoutes} 条启用路由有真实请求观测。`,
        action: "通过真实业务流量或独立探测形成观测；未观测前不要将其视为健康。",
      });
    }
    if (provider.saturationRatio !== null && provider.saturationRatio >= 0.8) {
      issues.push({
        level: "warning",
        scope: "provider",
        providerId: provider.id,
        title: `${provider.name} 容量接近上限`,
        detail: `当前容量命中率 ${Math.round(provider.saturationRatio * 100)}%。`,
        action: "提升上游限额、降低权重或增加同模型备用供应商。",
      });
    }
  }

  for (const model of staticModels) {
    const rows = capacityByModel.get(model.id) || [];
    const enabledRows = rows.filter((item) => item.is_enabled && providerById.get(item.provider_id)?.status === "enabled");
    if (enabledRows.length === 0) {
      issues.push({
        level: "critical",
        scope: "model",
        modelId: model.id,
        title: `${model.name} 没有可用路由`,
        detail: "模型已在目录中展示，但没有启用的上游承载。",
        action: "为该模型添加至少一个启用的供应商路由。",
      });
    }
    const recommendedProviderId = getRecommendedProviderId(model.id);
    if (model.id.startsWith("claude-") && rows.some((item) => item.provider_id !== recommendedProviderId && item.is_enabled)) {
      issues.push({
        level: "warning",
        scope: "model",
        modelId: model.id,
        title: `${model.name} 存在非 HiModels 路由`,
        detail: "Claude 模型当前需要通过 HiModels 的原生 Anthropic Messages 兼容端点承载。",
        action: "保留 HiModels 路由，停用或删除其它供应商上的 Claude 路由。",
      });
    }
  }

  for (const route of routes) {
    if (route.enabled && route.costCoverageStatus === "partial") {
      issues.push({
        level: "info",
        scope: "route",
        providerId: route.providerId,
        modelId: route.modelId,
        title: `${route.providerName} / ${route.modelName} 成本覆盖不完整`,
        detail: "基础输入/输出成本可核验，但至少一种缓存计费口径在上游资料中缺失。",
        action: "发生缺价缓存用量时保持成本 unknown；补充可核验合同或账单后再创建新版本。",
      });
    }
    if (route.health === "down" || route.health === "degraded") {
      issues.push({
        level: route.health === "down" ? "critical" : "warning",
        scope: "route",
        providerId: route.providerId,
        modelId: route.modelId,
        title: `${route.providerName} / ${route.modelName} ${route.health === "down" ? "不可用" : "降级"}`,
        detail: route.lastError || `连续失败 ${route.consecutiveFailures} 次，平均延迟 ${route.avgLatencyMs}ms。`,
        action: "检查上游状态、密钥余额、限流和模型名称映射。",
      });
    }
    if (route.saturationRatio !== null && route.saturationRatio >= 0.8) {
      issues.push({
        level: "warning",
        scope: "route",
        providerId: route.providerId,
        modelId: route.modelId,
        title: `${route.providerName} / ${route.modelName} 路由容量偏高`,
        detail: `当前命中率 ${Math.round(route.saturationRatio * 100)}%。`,
        action: "调低该路由权重或增加同模型备用渠道。",
      });
    }
  }

  const criticalIssues = issues.filter((item) => item.level === "critical").length;
  const warningIssues = issues.filter((item) => item.level === "warning").length;
  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      summary: {
        providers: providerCards.length,
        enabledProviders: providerCards.filter((item) => item.status === "enabled").length,
        models: staticModels.length,
        routedModels: staticModels.filter((model) => (capacityByModel.get(model.id) || []).some((item) => item.is_enabled)).length,
        routes: routes.length,
        enabledRoutes: routes.filter((item) => item.enabled).length,
        criticalIssues,
        warningIssues,
        costedRoutes: routes.filter((item) => item.costKnown).length,
        routePolicies: routePolicies.length,
        healthyProviders: providerCards.filter((item) => item.health === "healthy").length,
        degradedProviders: providerCards.filter((item) => item.health === "degraded").length,
        downProviders: providerCards.filter((item) => item.health === "down").length,
        unknownProviders: providerCards.filter((item) => item.health === "unknown").length,
        currentRpm: providerCards.every((item) => item.currentRpm !== null)
          ? providerCards.reduce((sum, item) => sum + (item.currentRpm || 0), 0)
          : null,
        currentTpm: providerCards.every((item) => item.currentTpm !== null)
          ? providerCards.reduce((sum, item) => sum + (item.currentTpm || 0), 0)
          : null,
        rpmLimit: providerCards.reduce((sum, item) => sum + item.rpmLimit, 0),
        tpmLimit: providerCards.reduce((sum, item) => sum + item.tpmLimit, 0),
      },
      providers: providerCards,
      routes,
      costs: activeCostTiers,
      routePolicies,
      routeAudits,
      issues,
      semantics: {
        healthSource: "observed_upstream_requests",
        healthUnknownWhenUnobserved: true,
        usageWindowSeconds: 60,
        usageSource: "redis_provider_capacity_v2",
        usageUnknownWhenRedisUnavailable: true,
        availabilityPercentageAvailable: false,
        minAvailabilityPolicyMode: "observed_sla_snapshot_fail_closed",
        minAvailabilityEvidence: "success_requests/total_requests",
        providerCostSource: "provider_cost_versions(source in contract|invoice|manual|import)",
        missingProviderCost: "null",
      },
      truth: {
        sources: ["providers", "provider_capacity", "provider_health", "provider_cost_versions", "customer_route_policies"],
        costCoverage: {
          knownRoutes: routes.filter((item) => item.costKnown).length,
          totalRoutes: routes.length,
        },
        unknownPolicy: "Unknown provider costs and health observations remain null/unknown.",
      },
    },
  });
});

// Explicit, audited provisioning action. Read endpoints above never create or
// mutate providers, routes, channel configuration or cost rows.
router.post("/admin/bootstrap", requireEndpointSecurityPermission, async (req: Request, res: Response) => {
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 3) {
    res.status(400).json({ success: false, message: "初始化原因至少需要 3 个字符" });
    return;
  }
  await ensureInternalProviders();
  const providers = await Promise.all((await getAllProviders()).map(getProviderCard));
  setAdminAuditContext(req, {
    action: "providers.bootstrap",
    resourceType: "provider_catalog",
    reason,
    afterData: { providerIds: providers.map((provider) => provider.id) },
  });
  res.json({ success: true, data: providers, message: "默认渠道与路由已初始化" });
});

// POST /api/provider/admin/providers — 创建内部渠道
router.post("/admin/providers", requireEndpointSecurityPermission, async (req: Request, res: Response) => {
  const { name, description, website, api_base_url, api_key, contact_name, contact_email, contact_phone } = req.body || {};
  if (!name || !api_base_url) {
    res.status(400).json({ success: false, message: "请填写渠道名称和 API Base URL" });
    return;
  }

  const provider = await createProvider({
    name,
    description,
    website,
    api_base_url,
    api_key: api_key || "",
    contact_name: contact_name || "平台运营",
    contact_email: contact_email || "ops@nexusflow.ai",
    contact_phone,
  });
  await updateProviderStatus(provider.id, "enabled");
  const created = await getProviderById(provider.id);

  res.json({
    success: true,
    data: created ? await getProviderCard(created) : null,
    message: "渠道已创建",
  });
});

// GET /api/provider/admin/costs — 当前生效的供应商成本价版本
router.get("/admin/costs", async (_req: Request, res: Response) => {
  const costs = await getAllActiveProviderCostTiers();
  res.json({ success: true, data: costs });
});

// POST /api/provider/admin/providers/:id/costs/:modelId — 创建新的成本价版本
router.post("/admin/providers/:id/costs/:modelId", async (req: Request, res: Response) => {
  const providerId = req.params.id as string;
  const modelId = req.params.modelId as string;
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }
  const catalog = staticModels.find((model) => model.id === modelId);
  const {
    version_label, pricing_type, prompt_cost, completion_cost, fixed_cost,
    currency, effective_from, effective_to, notes, source,
  } = req.body || {};
  const normalizedSource = String(source || "manual");
  if (!["contract", "invoice", "manual", "import"].includes(normalizedSource)) {
    res.status(400).json({ success: false, message: "成本来源仅支持 contract、invoice、manual 或 import" });
    return;
  }
  const normalizedCurrency = String(currency || "CNY").trim().toUpperCase();
  if (normalizedCurrency !== "CNY") {
    res.status(400).json({
      success: false,
      message: "当前仅支持 CNY 成本；接入可审计汇率账本前，其他币种不能参与路由和毛利计算",
    });
    return;
  }
  const amounts = [prompt_cost ?? 0, completion_cost ?? 0, fixed_cost ?? 0].map(Number);
  if (amounts.some((value) => !Number.isFinite(value) || value < 0)) {
    res.status(400).json({ success: false, message: "成本金额必须是非负数字" });
    return;
  }
  if (effective_from && Number.isNaN(new Date(effective_from).getTime())) {
    res.status(400).json({ success: false, message: "effective_from 无效" });
    return;
  }
  if (effective_to && (
    Number.isNaN(new Date(effective_to).getTime())
    || new Date(effective_to).getTime() <= new Date(effective_from || Date.now()).getTime()
  )) {
    res.status(400).json({ success: false, message: "effective_to 必须晚于 effective_from" });
    return;
  }
  if (String(notes || "").trim().length < 3) {
    res.status(400).json({ success: false, message: "请填写至少 3 个字符的成本依据/原因" });
    return;
  }
  const cost = await createCostVersion({
    providerId,
    modelId,
    versionLabel: version_label || "manual",
    pricingType: pricing_type || catalog?.pricingType || "token",
    promptCost: amounts[0],
    completionCost: amounts[1],
    fixedCost: amounts[2],
    currency: normalizedCurrency,
    effectiveFrom: effective_from,
    effectiveTo: effective_to || null,
    notes: notes || "",
    source: normalizedSource as "contract" | "invoice" | "manual" | "import",
    createdBy: (req as any).admin?.id || null,
  });
  await recordRouteAudit({
    providerId,
    modelId,
    action: "cost_version_created",
    afterConfig: cost,
    actorId: (req as any).admin?.id || null,
    reason: notes || "更新供应商成本价版本",
  });
  res.json({ success: true, data: cost, message: "成本价版本已创建" });
});

// GET /api/provider/admin/route-audits — 路由变更审计
router.get("/admin/route-audits", async (req: Request, res: Response) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
  res.json({ success: true, data: await getRouteAudits(limit) });
});

// GET /api/provider/admin/route-policies — 客户/模型路由策略覆盖
router.get("/admin/route-policies", async (_req: Request, res: Response) => {
  res.json({ success: true, data: await getRoutePolicies() });
});

// POST /api/provider/admin/route-policies — 创建路由策略覆盖
router.post("/admin/route-policies", async (req: Request, res: Response) => {
  const {
    user_id, model_id = "*", strategy = "weighted", pinned_provider_id,
    allowed_providers, blocked_providers, priority_boost,
    min_availability, max_prompt_cost, max_completion_cost, is_enabled, notes,
  } = req.body || {};
  const policy = await upsertRoutePolicy({
    userId: user_id || null,
    modelId: model_id,
    strategy,
    pinnedProviderId: pinned_provider_id || null,
    allowedProviders: Array.isArray(allowed_providers) ? allowed_providers : [],
    blockedProviders: Array.isArray(blocked_providers) ? blocked_providers : [],
    priorityBoost: priority_boost && typeof priority_boost === "object" ? priority_boost : {},
    minAvailability: min_availability === undefined ? null : Number(min_availability),
    maxPromptCost: max_prompt_cost === undefined ? null : Number(max_prompt_cost),
    maxCompletionCost: max_completion_cost === undefined ? null : Number(max_completion_cost),
    isEnabled: is_enabled === undefined ? true : !!is_enabled,
    notes: notes || "",
    createdBy: (req as any).admin?.id || null,
  });
  await recordRouteAudit({
    providerId: pinned_provider_id || "dashscope",
    modelId: model_id,
    action: "route_policy_created",
    afterConfig: policy,
    actorId: (req as any).admin?.id || null,
    reason: notes || "创建客户/模型路由策略",
  }).catch(() => undefined);
  res.json({ success: true, data: policy, message: "路由策略已创建" });
});

// PUT /api/provider/admin/route-policies/:id — 更新路由策略覆盖
router.put("/admin/route-policies/:id", async (req: Request, res: Response) => {
  const existing = (await getRoutePolicies()).find((item) => item.id === (req.params.id as string));
  if (!existing) {
    res.status(404).json({ success: false, message: "路由策略不存在" });
    return;
  }
  const policy = await upsertRoutePolicy({
    id: req.params.id as string,
    userId: req.body.user_id !== undefined ? req.body.user_id || null : existing.user_id,
    modelId: req.body.model_id || existing.model_id,
    strategy: req.body.strategy || existing.strategy,
    pinnedProviderId: req.body.pinned_provider_id !== undefined ? req.body.pinned_provider_id || null : existing.pinned_provider_id,
    allowedProviders: Array.isArray(req.body.allowed_providers) ? req.body.allowed_providers : existing.allowed_providers,
    blockedProviders: Array.isArray(req.body.blocked_providers) ? req.body.blocked_providers : existing.blocked_providers,
    priorityBoost: req.body.priority_boost && typeof req.body.priority_boost === "object" ? req.body.priority_boost : existing.priority_boost,
    minAvailability: req.body.min_availability !== undefined ? Number(req.body.min_availability) : existing.min_availability,
    maxPromptCost: req.body.max_prompt_cost !== undefined ? Number(req.body.max_prompt_cost) : existing.max_prompt_cost,
    maxCompletionCost: req.body.max_completion_cost !== undefined ? Number(req.body.max_completion_cost) : existing.max_completion_cost,
    isEnabled: req.body.is_enabled !== undefined ? !!req.body.is_enabled : existing.is_enabled,
    notes: req.body.notes !== undefined ? req.body.notes : existing.notes,
    createdBy: (req as any).admin?.id || null,
  });
  await recordRouteAudit({
    providerId: policy.pinned_provider_id || "dashscope",
    modelId: policy.model_id,
    action: "route_policy_updated",
    beforeConfig: existing,
    afterConfig: policy,
    actorId: (req as any).admin?.id || null,
    reason: policy.notes || "更新客户/模型路由策略",
  }).catch(() => undefined);
  res.json({ success: true, data: policy, message: "路由策略已更新" });
});

// DELETE /api/provider/admin/route-policies/:id — 删除路由策略覆盖
router.delete("/admin/route-policies/:id", async (req: Request, res: Response) => {
  const existing = (await getRoutePolicies()).find((item) => item.id === (req.params.id as string));
  const success = await deleteRoutePolicy(req.params.id as string);
  if (!success) {
    res.status(404).json({ success: false, message: "路由策略不存在" });
    return;
  }
  if (existing) {
    await recordRouteAudit({
      providerId: existing.pinned_provider_id || "dashscope",
      modelId: existing.model_id,
      action: "route_policy_deleted",
      beforeConfig: existing,
      actorId: (req as any).admin?.id || null,
      reason: "删除客户/模型路由策略",
    }).catch(() => undefined);
  }
  res.json({ success: true, message: "路由策略已删除" });
});

// GET /api/provider/admin/providers/:id — 获取渠道详情
router.get("/admin/providers/:id", async (req: Request, res: Response) => {
  const provider = await getProviderById(req.params.id as string);
  if (!provider) {
    res.status(404).json({ success: false, message: "渠道不存在" });
    return;
  }

  const [models, capacity, allHealth, providerCard] = await Promise.all([
    getProviderRouteModels(provider.id),
    getCapacityByProvider(provider.id),
    getAllHealthRecords(),
    getProviderCard(provider),
  ]);
  const health = allHealth.filter((item) => item.providerId === provider.id);

  res.json({
    success: true,
    data: {
      provider: providerCard,
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
router.put(
  "/admin/providers/:id",
  requireEndpointSecurityWhenChanged,
  async (req: Request, res: Response) => {
  const providerId = req.params.id as string;
  if (providerId === "himodels") {
    res.status(409).json({ success: false, message: "HiModels 只能通过 root 控制命令更新", code: "managed_provider_control_required" });
    return;
  }
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "渠道不存在" });
    return;
  }

  const {
    name, description, website, logo_url,
    api_base_url, api_key, contact_name, contact_email, contact_phone,
  } = req.body || {};

  const success = await updateProvider(providerId, {
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

  const updated = (await getProviderById(providerId))!;
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
  }
);

// GET /api/provider/admin/providers/draft — 获取待配置渠道
router.get("/admin/providers/draft", async (_req: Request, res: Response) => {
  const providers = await getProvidersByStatus("draft");
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
router.post(
  "/admin/providers/:id/enable",
  requireEndpointSecurityPermission,
  async (req: Request, res: Response) => {
  if (req.params.id === "himodels") {
    res.status(409).json({ success: false, message: "HiModels 只能通过 root 控制命令启用", code: "managed_provider_control_required" });
    return;
  }
  const success = await updateProviderStatus(req.params.id as string, "enabled");
  if (!success) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }
  res.json({ success: true, message: "渠道已启用" });
  }
);

// POST /api/provider/admin/providers/:id/disable — 停用渠道
router.post("/admin/providers/:id/disable", async (req: Request, res: Response) => {
  const { reason } = req.body;
  const success = await updateProviderStatus(req.params.id as string, "disabled", reason);
  if (!success) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }
  res.json({ success: true, message: "渠道已停用" });
});

// GET /api/provider/admin/models — 获取所有模型
router.get("/admin/models", async (_req: Request, res: Response) => {
  const providers = await getAllProviders();
  const models = await Promise.all(staticModels.map(async (model) => {
    const capacities = await getCapacityByModel(model.id);
    const routes = await Promise.all(capacities.map(async (capacity) => {
      const provider = providers.find((item) => item.id === capacity.provider_id);
      const usage = await getProviderUsageStatsAsync(capacity.provider_id, model.id);
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
    }));
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
  }));
  res.json({
    success: true,
    data: models,
  });
});

// GET /api/provider/admin/models/draft — 获取草稿模型
router.get("/admin/models/draft", async (_req: Request, res: Response) => {
  const models = await getModelsByStatus("draft");
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
router.post("/admin/models/:id/enable", async (req: Request, res: Response) => {
  const success = await updateModelStatus(req.params.id as string, "enabled");
  if (!success) {
    res.status(404).json({ success: false, message: "模型不存在" });
    return;
  }
  res.json({ success: true, message: "模型已启用" });
});

// POST /api/provider/admin/models/:id/disable — 停用模型
router.post("/admin/models/:id/disable", async (req: Request, res: Response) => {
  const success = await updateModelStatus(req.params.id as string, "disabled");
  if (!success) {
    res.status(404).json({ success: false, message: "模型不存在" });
    return;
  }
  res.json({ success: true, message: "模型已停用" });
});

// GET /api/provider/admin/stats — 统计数据
router.get("/admin/stats", async (_req: Request, res: Response) => {
  const providerStats = await getProviderStats();
  const capacityByModel = await Promise.all(staticModels.map((model) => getCapacityByModel(model.id)));
  const enabledModels = capacityByModel.filter((routes) => routes.some((route) => route.is_enabled)).length;
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
router.get("/admin/capacity", async (_req: Request, res: Response) => {
  const capacity = await getAllCapacity();
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
// 全部内部路由已由上方 providers.read/providers.manage 中间件统一保护。
router.get("/:providerId/capacity", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }

  const capacity = await getCapacityByProvider(providerId);
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
router.put("/:providerId/capacity/:modelId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const modelId = req.params.modelId as string;
  if (providerId === "himodels") {
    res.status(409).json({ success: false, message: "HiModels 容量只能通过 root 控制命令更新", code: "managed_provider_control_required" });
    return;
  }

  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }

  const { rpm_limit, tpm_limit, daily_limit, concurrent_limit, priority, weight, is_enabled } = req.body;

  const beforeCapacity = await getCapacity(providerId, modelId);
  const willBeEnabled = is_enabled ?? beforeCapacity?.is_enabled ?? true;
  if (willBeEnabled && !isProviderModelCompatible(providerId, modelId)) {
    res.status(400).json({
      success: false,
      message: `供应商 '${providerId}' 不能承载模型 '${modelId}'`,
      code: "provider_model_incompatible",
    });
    return;
  }
  const capacity = await upsertCapacity(providerId, modelId, {
    rpm_limit,
    tpm_limit,
    daily_limit,
    concurrent_limit,
    priority,
    weight,
    is_enabled,
  });
  await recordRouteAudit({
    providerId,
    modelId,
    action: beforeCapacity ? "capacity_updated" : "capacity_created",
    beforeConfig: beforeCapacity || null,
    afterConfig: capacity,
    actorId: (req as any).admin?.id || null,
    reason: req.body.reason || "后台更新容量与路由策略",
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
router.delete("/:providerId/capacity/:modelId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  if (providerId === "himodels") {
    res.status(409).json({ success: false, message: "HiModels 容量只能通过 root 控制命令更新", code: "managed_provider_control_required" });
    return;
  }
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }
  const modelId = req.params.modelId as string;
  const beforeCapacity = await getCapacity(providerId, modelId);
  const success = await deleteCapacity(providerId, modelId);
  if (!success) {
    res.status(404).json({ success: false, message: "配置不存在" });
    return;
  }
  await recordRouteAudit({
    providerId,
    modelId,
    action: "capacity_deleted",
    beforeConfig: beforeCapacity || null,
    actorId: (req as any).admin?.id || null,
    reason: "后台删除容量与路由策略",
  });
  res.json({ success: true, message: "配置已删除" });
});

// ========== 健康监控 ==========

// GET /api/provider/admin/health — 获取所有供应商健康状态
router.get("/admin/health", async (_req: Request, res: Response) => {
  const health = await getAllHealthRecords();
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
router.get("/admin/usage/:providerId/:modelId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const modelId = req.params.modelId as string;
  const stats = await getProviderUsageStatsAsync(providerId, modelId);
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

// POST /api/provider/:providerId/switch-channel — 切换供应商活跃子渠道
router.post("/:providerId/switch-channel", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }

  const { channel } = req.body || {};
  if (!channel || typeof channel !== "string") {
    res.status(400).json({ success: false, message: "请提供要切换的渠道" });
    return;
  }

  const updated = await switchProviderChannel(providerId, channel);
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

// PUT /api/provider/:providerId/channels/:channelId — 新增或更新子渠道（区域）配置
router.put(
  "/:providerId/channels/:channelId",
  requireEndpointSecurityPermission,
  async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const channelId = req.params.channelId as string;
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }

  const body = req.body || {};
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (body.adapter === "dashscope" || body.adapter === "pixverse") patch.adapter = body.adapter;
  if (typeof body.apiBaseUrl === "string") patch.api_base_url = body.apiBaseUrl;
  if (typeof body.apiKey === "string") patch.api_key = body.apiKey;
  if (typeof body.region === "string") patch.region = body.region;
  if (typeof body.workspaceId === "string") patch.workspace_id = body.workspaceId;
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.priority === "number") patch.priority = body.priority;
  if (Array.isArray(body.modelAllowlist)) {
    patch.model_allowlist = body.modelAllowlist.filter((item: unknown) => typeof item === "string");
  }

  const result = await upsertProviderChannel(providerId, channelId, patch);
  if ("error" in result) {
    res.status(400).json({ success: false, message: result.error });
    return;
  }

  res.json({
    success: true,
    data: await getProviderChannelSummary(providerId),
    message: `渠道 ${channelId} 已更新`,
  });
  }
);

// GET /api/provider/:providerId/models — 获取供应商的模型列表
router.get("/:providerId/models", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }

  const models = await getModelsByProvider(providerId);
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
router.post("/:providerId/models", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const provider = await getProviderById(providerId);
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

  const model = await createModel(providerId, {
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
router.put("/:providerId/models/:modelId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "供应商不存在" });
    return;
  }
  const model = (await getModelsByProvider(providerId)).find((item) => item.id === (req.params.modelId as string));
  if (!model) {
    res.status(404).json({ success: false, message: "模型不存在或不属于该供应商" });
    return;
  }

  const success = await updateModel(req.params.modelId as string, req.body);
  if (!success) {
    res.status(404).json({ success: false, message: "模型不存在" });
    return;
  }

  res.json({ success: true, message: "模型已更新" });
});

// DELETE /api/provider/:providerId/models/:modelId — 删除模型
router.delete("/:providerId/models/:modelId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const model = (await getModelsByProvider(providerId)).find((item) => item.id === (req.params.modelId as string));
  if (!model) {
    res.status(404).json({ success: false, message: "模型不存在或不属于该供应商" });
    return;
  }
  const success = await deleteModel(req.params.modelId as string);
  if (!success) {
    res.status(404).json({ success: false, message: "模型不存在" });
    return;
  }
  res.json({ success: true, message: "模型已删除" });
});

export default router;
