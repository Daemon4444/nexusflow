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
  upsertProviderChannel,
  isChannelUsable,
  type ProviderChannelConfig,
} from "../data/provider-channels";
import { ensureDashScopeChannelConfig } from "../services/upstream";
import {
  createCostVersion,
  getActiveCostVersion,
  getActiveCostVersions,
  getRouteAudits,
  getRoutePolicies,
  recordRouteAudit,
  upsertRoutePolicy,
  deleteRoutePolicy,
} from "../data/provider-operations";
import { requireAdmin } from "../middleware/admin";

const router = Router();

type HealthState = "healthy" | "degraded" | "down";

function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "********";
  return `${secret.slice(0, 4)}********${secret.slice(-4)}`;
}

async function ensureInternalProviders(): Promise<void> {
  const dashscope = await ensureProvider({
    id: "dashscope",
    name: "Alibaba Cloud DashScope",
    slug: "dashscope",
    description: "DashScope OpenAI-compatible mode channel, currently the default carrier for Qwen, DeepSeek, GLM, Kimi, MiniMax, PixVerse, and HappyHorse models.",
    website: "https://help.aliyun.com/zh/model-studio/",
    api_base_url: process.env.DASHSCOPE_BASE_URL || "https://ws-n4w0z49s9nes8pgm.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    api_key: process.env.DASHSCOPE_API_KEY || "",
    contact_name: "Platform Operations",
    contact_email: "ops@nexusflow.ai",
    status: "enabled",
  });
  const anthropic = await ensureProvider({
    id: "anthropic",
    name: "Anthropic Claude",
    slug: "anthropic",
    description: "Anthropic Messages API official channel, carrying Claude series models.",
    website: "https://docs.anthropic.com/",
    api_base_url: "https://api.anthropic.com",
    api_key: process.env.ANTHROPIC_API_KEY || "",
    contact_name: "Platform Operations",
    contact_email: "ops@nexusflow.ai",
    status: "enabled",
  });
  await ensureProvider({
    id: "pixverse",
    name: "PixVerse Dual Channel",
    slug: "pixverse",
    description: "PixVerse video model channel, can switch between DashScope and official PixVerse.",
    website: "https://pixverse.ai/",
    api_base_url: process.env.DASHSCOPE_BASE_URL ? process.env.DASHSCOPE_BASE_URL.replace(/\/compatible-mode\/v1$/, "/api/v1") : "https://ws-n4w0z49s9nes8pgm.ap-southeast-1.maas.aliyuncs.com/api/v1",
    api_key: process.env.DASHSCOPE_API_KEY || "",
    contact_name: "Platform Operations",
    contact_email: "ops@nexusflow.ai",
    status: "enabled",
  });
  await ensureProvider({
    id: "volcengine-ark",
    name: "Volcengine Ark",
    slug: "volcengine-ark",
    description: "Volcengine Ark OpenAI-compatible channel, routes can be added per model in model management.",
    website: "https://www.volcengine.com/product/ark",
    api_base_url: "https://ark.cn-beijing.volces.com/api/v3",
    api_key: process.env.ARK_API_KEY || "",
    contact_name: "Platform Operations",
    contact_email: "ops@nexusflow.ai",
    status: "enabled",
  });

  for (const model of staticModels) {
    const targetProvider = model.id.startsWith("claude-") ? anthropic : dashscope;
    if (await getCapacity(targetProvider.id, model.id)) continue;
    const isTaskModel = model.category === "Image Generation" || model.category === "Video Generation" || model.category === "Speech Model";
    await upsertCapacity(targetProvider.id, model.id, {
      rpm_limit: 1000,
      tpm_limit: isTaskModel ? 0 : 1000000,
      daily_limit: 100000,
      concurrent_limit: isTaskModel ? 10 : 0,
      priority: 10,
      weight: 100,
      is_enabled: true,
    });
  }

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
        name: "DashScope Channel",
        adapter: "dashscope",
        api_base_url: process.env.DASHSCOPE_BASE_URL ? process.env.DASHSCOPE_BASE_URL.replace(/\/compatible-mode\/v1$/, "/api/v1") : "https://ws-n4w0z49s9nes8pgm.ap-southeast-1.maas.aliyuncs.com/api/v1",
        api_key: process.env.DASHSCOPE_API_KEY || "",
      },
      official: {
        name: "PixVerse Official",
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
      apiKeyMasked: channel.api_key ? maskSecret(channel.api_key) : "Not configured",
      region: channel.region || null,
      workspaceId: channel.workspace_id || null,
      enabled: channel.enabled !== false,
      priority: channel.priority ?? 0,
      modelAllowlist: channel.model_allowlist || null,
      usable: isChannelUsable(channel, {
        // Environment variable key fallback only works for the default region (domestic keys cannot call overseas regions)
        hasFallbackKey: (!channel.region || channel.region === "cn-beijing")
          && !!(channel.adapter === "pixverse" ? process.env.PIXVERSE_API_KEY : process.env.DASHSCOPE_API_KEY),
      }),
    })),
  };
}

function getRouteHealth(health: Awaited<ReturnType<typeof getAllHealthRecords>>, providerId: string, modelId: string) {
  return health.find((item) => item.providerId === providerId && item.modelId === modelId);
}

function getSaturation(currentRpm: number, rpmLimit: number, currentTpm: number, tpmLimit: number): number {
  const rpmRatio = rpmLimit > 0 ? currentRpm / rpmLimit : 0;
  const tpmRatio = tpmLimit > 0 ? currentTpm / tpmLimit : 0;
  return Number(Math.max(rpmRatio, tpmRatio).toFixed(4));
}

function getRecommendedProviderId(modelId: string): string {
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("pixverse-")) return "pixverse";
  return "dashscope";
}

function getDefaultCostFromRetail(promptPrice: number, completionPrice: number) {
  return {
    promptCost: Number((promptPrice * 0.72).toFixed(6)),
    completionCost: Number((completionPrice * 0.72).toFixed(6)),
  };
}

function getMarginPercent(revenue: number, cost: number): number {
  if (revenue <= 0) return cost > 0 ? -100 : 0;
  return Number((((revenue - cost) / revenue) * 100).toFixed(2));
}

function getSyntheticAvailability(status: HealthState, consecutiveFailures: number): number {
  if (status === "down") return 0;
  if (status === "degraded") return Math.max(90, 99 - consecutiveFailures);
  return 99.95;
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
    apiKeyMasked: provider.api_key ? maskSecret(provider.api_key) : "Not configured",
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
    ...usage,
  };
}

// ========== Channel Registration (entry still retained but more suitable for internal use) ==========//

// POST /api/provider/register — Create channel configuration
router.post("/register", (_req: Request, res: Response) => {
  res.status(403).json({
    success: false,
    message: "This deployment has disabled public channel registration, please use the admin panel to maintain internal channels",
  });
});

// GET /api/provider/status/:email — Query channel status
router.get("/status/:email", (_req: Request, res: Response) => {
  res.status(403).json({
    success: false,
    message: "This deployment has disabled public channel status queries, please use the admin panel to view internal channels",
  });
});

// ========== Admin interface / internal channel management ==========
// Note: /admin/* routes must be registered before /:providerId/* routes,
// otherwise Express will match "admin" as a providerId parameter.

router.use("/admin", requireAdmin);

// GET /api/provider/admin/providers — Get all providers
router.get("/admin/providers", async (_req: Request, res: Response) => {
  await ensureInternalProviders();
  const providers = await Promise.all((await getAllProviders()).map(getProviderCard));
  res.json({
    success: true,
    data: providers,
  });
});

// GET /api/provider/admin/operations — Provider operations workstation
router.get("/admin/operations", async (_req: Request, res: Response) => {
  await ensureInternalProviders();
  let [providers, capacity, health, activeCosts, routePolicies, routeAudits] = await Promise.all([
    getAllProviders(),
    getAllCapacity(),
    getAllHealthRecords(),
    getActiveCostVersions(),
    getRoutePolicies(),
    getRouteAudits(12),
  ]);
  for (const item of capacity) {
    if (activeCosts.some((cost) => cost.provider_id === item.provider_id && cost.model_id === item.model_id)) continue;
    const catalog = staticModels.find((model) => model.id === item.model_id);
    const defaults = getDefaultCostFromRetail(catalog?.promptPrice ?? 0, catalog?.completionPrice ?? 0);
    await createCostVersion({
      providerId: item.provider_id,
      modelId: item.model_id,
      versionLabel: "auto-baseline",
      pricingType: catalog?.pricingType || "token",
      promptCost: defaults.promptCost,
      completionCost: defaults.completionCost,
      fixedCost: 0,
      notes: "Baseline cost auto-generated at 72% of retail price, can be overridden by creating a new version in the admin panel.",
    });
  }
  activeCosts = await getActiveCostVersions();
  const costByRoute = new Map(activeCosts.map((cost) => [`${cost.provider_id}:${cost.model_id}`, cost]));
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const capacityByModel = new Map<string, typeof capacity>();
  for (const item of capacity) {
    const rows = capacityByModel.get(item.model_id) || [];
    rows.push(item);
    capacityByModel.set(item.model_id, rows);
  }

  const providerCards = providers.map((provider) => {
    const providerCapacity = capacity.filter((item) => item.provider_id === provider.id);
    const totals = providerCapacity.reduce((acc, item) => {
      const usage = getProviderUsageStats(provider.id, item.model_id);
      acc.currentRpm += usage.rpm;
      acc.currentTpm += usage.tpm;
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
    });
    const healthRows = health.filter((item) => item.providerId === provider.id);
    const healthState: HealthState = healthRows.some((item) => item.status === "down")
      ? "down"
      : healthRows.some((item) => item.status === "degraded")
        ? "degraded"
        : "healthy";

    return {
      id: provider.id,
      name: provider.name,
      slug: provider.slug,
      status: provider.status,
      apiBaseUrl: provider.api_base_url,
      apiKeyMasked: provider.api_key ? maskSecret(provider.api_key) : "Not configured",
      modelCount: providerCapacity.length,
      enabledRoutes: totals.enabledRoutes,
      health: healthState,
      currentRpm: totals.currentRpm,
      currentTpm: totals.currentTpm,
      rpmLimit: totals.rpmLimit,
      tpmLimit: totals.tpmLimit,
      dailyLimit: totals.dailyLimit,
      concurrentLimit: totals.concurrentLimit,
      saturationRatio: getSaturation(totals.currentRpm, totals.rpmLimit, totals.currentTpm, totals.tpmLimit),
      missingApiKey: !provider.api_key,
    };
  });

  const routes = capacity.map((item) => {
    const provider = providerById.get(item.provider_id);
    const catalog = staticModels.find((model) => model.id === item.model_id);
    const usage = getProviderUsageStats(item.provider_id, item.model_id);
    const routeHealth = getRouteHealth(health, item.provider_id, item.model_id);
    const currentHealth = (routeHealth?.status || "healthy") as HealthState;
    const cost = costByRoute.get(`${item.provider_id}:${item.model_id}`);
    const priceUnit = catalog?.pricingType === "per-image"
      ? "USD/image"
      : catalog?.pricingType === "per-second"
        ? "USD/second"
        : "USD/1M tokens";
    const recommendedProviderId = getRecommendedProviderId(item.model_id);

    return {
      providerId: item.provider_id,
      providerName: provider?.name || item.provider_name || item.provider_id,
      providerStatus: provider?.status || "disabled",
      modelId: item.model_id,
      modelName: catalog?.name || item.model_name || item.model_id,
      modelProvider: catalog?.provider || "",
      category: catalog?.category || "Uncategorized",
      enabled: item.is_enabled,
      recommendedProviderId,
      recommended: item.provider_id === recommendedProviderId,
      promptPrice: catalog?.promptPrice ?? 0,
      completionPrice: catalog?.completionPrice ?? 0,
      promptCost: cost?.prompt_cost ?? 0,
      completionCost: cost?.completion_cost ?? 0,
      fixedCost: cost?.fixed_cost ?? 0,
      grossMarginPrompt: getMarginPercent(catalog?.promptPrice ?? 0, cost?.prompt_cost ?? 0),
      grossMarginCompletion: getMarginPercent(catalog?.completionPrice ?? 0, cost?.completion_cost ?? 0),
      pricingType: catalog?.pricingType || "token",
      priceUnit,
      rpmLimit: item.rpm_limit,
      tpmLimit: item.tpm_limit,
      dailyLimit: item.daily_limit,
      concurrentLimit: item.concurrent_limit,
      priority: item.priority,
      weight: item.weight,
      currentRpm: usage.rpm,
      currentTpm: usage.tpm,
      saturationRatio: getSaturation(usage.rpm, item.rpm_limit, usage.tpm, item.tpm_limit),
      health: currentHealth,
      availability: getSyntheticAvailability(currentHealth, routeHealth?.consecutiveFailures ?? 0),
      avgLatencyMs: routeHealth?.avgLatencyMs ?? 0,
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
        title: `${provider.name} not enabled`,
        detail: "Provider is in draft or disabled state, will not become a stable carrier channel.",
        action: "Enable after confirming contracts, keys, and health checks.",
      });
    }
    if (provider.missingApiKey) {
      issues.push({
        level: "critical",
        scope: "provider",
        providerId: provider.id,
        title: `${provider.name} missing API Key`,
        detail: "Registered in backend, but actual calls will fail due to missing upstream API key.",
        action: "Add the key in the channel console or set the corresponding environment variable.",
      });
    }
    if (provider.saturationRatio >= 0.8) {
      issues.push({
        level: "warning",
        scope: "provider",
        providerId: provider.id,
        title: `${provider.name} capacity near limit`,
        detail: `Current capacity utilization rate ${Math.round(provider.saturationRatio * 100)}%.`,
        action: "Increase upstream limits, reduce weight, or add a backup provider for the same model.",
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
        title: `${model.name} has no available routes`,
        detail: "Model is listed in the catalog but has no enabled upstream carrier.",
        action: "Add at least one enabled provider route for this model.",
      });
    }
    const recommendedProviderId = getRecommendedProviderId(model.id);
    if (model.id.startsWith("claude-") && rows.some((item) => item.provider_id !== recommendedProviderId && item.is_enabled)) {
      issues.push({
        level: "warning",
        scope: "model",
        modelId: model.id,
        title: `${model.name} has non-Anthropic routes`,
        detail: "Claude models require the Anthropic Messages API, OpenAI-compatible channels cannot carry this protocol.",
        action: "Keep the Anthropic route, disable or delete Claude routes on other providers.",
      });
    }
  }

  for (const route of routes) {
    if (route.health === "down" || route.health === "degraded") {
      issues.push({
        level: route.health === "down" ? "critical" : "warning",
        scope: "route",
        providerId: route.providerId,
        modelId: route.modelId,
        title: `${route.providerName} / ${route.modelName} ${route.health === "down" ? "unavailable" : "degraded"}`,
        detail: route.lastError || `Consecutive failures ${route.consecutiveFailures} times, avg latency ${route.avgLatencyMs}ms。`,
        action: "Check upstream status, key balance, rate limiting, and model name mapping.",
      });
    }
    if (route.saturationRatio >= 0.8) {
      issues.push({
        level: "warning",
        scope: "route",
        providerId: route.providerId,
        modelId: route.modelId,
        title: `${route.providerName} / ${route.modelName} route capacity high`,
        detail: `Current utilization ${Math.round(route.saturationRatio * 100)}%。`,
        action: "Reduce this route's weight or add a backup channel for the same model.",
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
        costedRoutes: routes.filter((item) => item.promptCost > 0 || item.completionCost > 0 || item.fixedCost > 0).length,
        routePolicies: routePolicies.length,
        currentRpm: providerCards.reduce((sum, item) => sum + item.currentRpm, 0),
        currentTpm: providerCards.reduce((sum, item) => sum + item.currentTpm, 0),
        rpmLimit: providerCards.reduce((sum, item) => sum + item.rpmLimit, 0),
        tpmLimit: providerCards.reduce((sum, item) => sum + item.tpmLimit, 0),
      },
      providers: providerCards,
      routes,
      costs: activeCosts,
      routePolicies,
      routeAudits,
      issues,
    },
  });
});

// POST /api/provider/admin/providers — Create internal channel
router.post("/admin/providers", async (req: Request, res: Response) => {
  const { name, description, website, api_base_url, api_key, contact_name, contact_email, contact_phone } = req.body || {};
  if (!name || !api_base_url) {
    res.status(400).json({ success: false, message: "Please provide channel name and API Base URL" });
    return;
  }

  const provider = await createProvider({
    name,
    description,
    website,
    api_base_url,
    api_key: api_key || "",
    contact_name: contact_name || "Platform Operations",
    contact_email: contact_email || "ops@nexusflow.ai",
    contact_phone,
  });
  await updateProviderStatus(provider.id, "enabled");
  const created = await getProviderById(provider.id);

  res.json({
    success: true,
    data: created ? await getProviderCard(created) : null,
    message: "Channel created",
  });
});

// GET /api/provider/admin/costs — Currently active provider cost versions
router.get("/admin/costs", async (_req: Request, res: Response) => {
  const costs = await getActiveCostVersions();
  res.json({ success: true, data: costs });
});

// POST /api/provider/admin/providers/:id/costs/:modelId — Create new cost version
router.post("/admin/providers/:id/costs/:modelId", async (req: Request, res: Response) => {
  const providerId = req.params.id as string;
  const modelId = req.params.modelId as string;
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "Provider not found" });
    return;
  }
  const catalog = staticModels.find((model) => model.id === modelId);
  const {
    version_label, pricing_type, prompt_cost, completion_cost, fixed_cost,
    currency, effective_from, effective_to, notes,
  } = req.body || {};
  const cost = await createCostVersion({
    providerId,
    modelId,
    versionLabel: version_label || "manual",
    pricingType: pricing_type || catalog?.pricingType || "token",
    promptCost: Number(prompt_cost || 0),
    completionCost: Number(completion_cost || 0),
    fixedCost: Number(fixed_cost || 0),
    currency: currency || "CNY",
    effectiveFrom: effective_from,
    effectiveTo: effective_to || null,
    notes: notes || "",
    createdBy: (req as any).admin?.id || null,
  });
  await recordRouteAudit({
    providerId,
    modelId,
    action: "cost_version_created",
    afterConfig: cost,
    actorId: (req as any).admin?.id || null,
    reason: notes || "Update provider cost version",
  });
  res.json({ success: true, data: cost, message: "Cost version created" });
});

// GET /api/provider/admin/route-audits — Route change audit
router.get("/admin/route-audits", async (req: Request, res: Response) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
  res.json({ success: true, data: await getRouteAudits(limit) });
});

// GET /api/provider/admin/route-policies — Customer/model route policy override
router.get("/admin/route-policies", async (_req: Request, res: Response) => {
  res.json({ success: true, data: await getRoutePolicies() });
});

// POST /api/provider/admin/route-policies — Create route policy override
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
    reason: notes || "Create customer/model route policy",
  }).catch(() => undefined);
  res.json({ success: true, data: policy, message: "Route policy created" });
});

// PUT /api/provider/admin/route-policies/:id — Update route policy override
router.put("/admin/route-policies/:id", async (req: Request, res: Response) => {
  const existing = (await getRoutePolicies()).find((item) => item.id === (req.params.id as string));
  if (!existing) {
    res.status(404).json({ success: false, message: "Route policy not found" });
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
    reason: policy.notes || "Update customer/model route policy",
  }).catch(() => undefined);
  res.json({ success: true, data: policy, message: "Route policy updated" });
});

// DELETE /api/provider/admin/route-policies/:id — Delete route policy override
router.delete("/admin/route-policies/:id", async (req: Request, res: Response) => {
  const existing = (await getRoutePolicies()).find((item) => item.id === (req.params.id as string));
  const success = await deleteRoutePolicy(req.params.id as string);
  if (!success) {
    res.status(404).json({ success: false, message: "Route policy not found" });
    return;
  }
  if (existing) {
    await recordRouteAudit({
      providerId: existing.pinned_provider_id || "dashscope",
      modelId: existing.model_id,
      action: "route_policy_deleted",
      beforeConfig: existing,
      actorId: (req as any).admin?.id || null,
      reason: "Delete customer/model route policy",
    }).catch(() => undefined);
  }
  res.json({ success: true, message: "Route policy deleted" });
});

// GET /api/provider/admin/providers/:id — Get channel details
router.get("/admin/providers/:id", async (req: Request, res: Response) => {
  await ensureInternalProviders();
  const provider = await getProviderById(req.params.id as string);
  if (!provider) {
    res.status(404).json({ success: false, message: "Channel not found" });
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

// PUT /api/provider/admin/providers/:id — Update channel configuration
router.put("/admin/providers/:id", async (req: Request, res: Response) => {
  const providerId = req.params.id as string;
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "Channel not found" });
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
    res.status(500).json({ success: false, message: "Failed to update channel" });
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
    message: "Channel configuration updated",
  });
});

// GET /api/provider/admin/providers/draft — Get draft channels
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

// POST /api/provider/admin/providers/:id/enable — Enable channel
router.post("/admin/providers/:id/enable", async (req: Request, res: Response) => {
  const success = await updateProviderStatus(req.params.id as string, "enabled");
  if (!success) {
    res.status(404).json({ success: false, message: "Provider not found" });
    return;
  }
  res.json({ success: true, message: "Channel enabled" });
});

// POST /api/provider/admin/providers/:id/disable — Disable channel
router.post("/admin/providers/:id/disable", async (req: Request, res: Response) => {
  const { reason } = req.body;
  const success = await updateProviderStatus(req.params.id as string, "disabled", reason);
  if (!success) {
    res.status(404).json({ success: false, message: "Provider not found" });
    return;
  }
  res.json({ success: true, message: "Channel disabled" });
});

// GET /api/provider/admin/models — Get all models
router.get("/admin/models", async (_req: Request, res: Response) => {
  await ensureInternalProviders();
  const providers = await getAllProviders();
  const models = await Promise.all(staticModels.map(async (model) => {
    const capacities = await getCapacityByModel(model.id);
    const routes = capacities.map((capacity) => {
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
  }));
  res.json({
    success: true,
    data: models,
  });
});

// GET /api/provider/admin/models/draft — Get draft models
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

// POST /api/provider/admin/models/:id/enable — Enable model
router.post("/admin/models/:id/enable", async (req: Request, res: Response) => {
  const success = await updateModelStatus(req.params.id as string, "enabled");
  if (!success) {
    res.status(404).json({ success: false, message: "Model not found" });
    return;
  }
  res.json({ success: true, message: "Model enabled" });
});

// POST /api/provider/admin/models/:id/disable — Disable model
router.post("/admin/models/:id/disable", async (req: Request, res: Response) => {
  const success = await updateModelStatus(req.params.id as string, "disabled");
  if (!success) {
    res.status(404).json({ success: false, message: "Model not found" });
    return;
  }
  res.json({ success: true, message: "Model disabled" });
});

// GET /api/provider/admin/stats — Statistics data
router.get("/admin/stats", async (_req: Request, res: Response) => {
  await ensureInternalProviders();
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

// ========== Capacity configuration management ==========

// GET /api/provider/admin/capacity — Get all capacity configurations
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

// GET /api/provider/:providerId/capacity — Get provider capacity configuration
router.get("/:providerId/capacity", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  await ensureInternalProviders();
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "Provider not found" });
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

// PUT /api/provider/:providerId/capacity/:modelId — Set/update capacity configuration
router.put("/:providerId/capacity/:modelId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const modelId = req.params.modelId as string;

  await ensureInternalProviders();
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "Provider not found" });
    return;
  }

  const { rpm_limit, tpm_limit, daily_limit, concurrent_limit, priority, weight, is_enabled } = req.body;

  const beforeCapacity = await getCapacity(providerId, modelId);
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
    reason: req.body.reason || "Admin update capacity and route policy",
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
    message: "Capacity configuration updated",
  });
});

// DELETE /api/provider/:providerId/capacity/:modelId — Delete capacity configuration
router.delete("/:providerId/capacity/:modelId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  await ensureInternalProviders();
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "Provider not found" });
    return;
  }
  const modelId = req.params.modelId as string;
  const beforeCapacity = await getCapacity(providerId, modelId);
  const success = await deleteCapacity(providerId, modelId);
  if (!success) {
    res.status(404).json({ success: false, message: "Configuration not found" });
    return;
  }
  await recordRouteAudit({
    providerId,
    modelId,
    action: "capacity_deleted",
    beforeConfig: beforeCapacity || null,
    actorId: (req as any).admin?.id || null,
    reason: "Admin delete capacity and route policy",
  });
  res.json({ success: true, message: "Configuration deleted" });
});

// ========== Health monitoring ==========

// GET /api/provider/admin/health — Get all providers health status
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

// GET /api/provider/admin/usage/:providerId/:modelId — Get real-time usage
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

// ========== Channel management models (/:providerId route placed after /admin) ==========

router.use("/:providerId", requireAdmin);

// POST /api/provider/:providerId/switch-channel — Switch provider active sub-channel
router.post("/:providerId/switch-channel", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  await ensureInternalProviders();
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "Provider not found" });
    return;
  }

  const { channel } = req.body || {};
  if (!channel || typeof channel !== "string") {
    res.status(400).json({ success: false, message: "Please provide the channel to switch to" });
    return;
  }

  const updated = await switchProviderChannel(providerId, channel);
  if (!updated) {
    res.status(400).json({ success: false, message: "Channel not found or not configured" });
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
    message: `Switched to ${selected.name}`,
  });
});

// PUT /api/provider/:providerId/channels/:channelId — Add or update sub-channel (region) configuration
router.put("/:providerId/channels/:channelId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const channelId = req.params.channelId as string;
  await ensureInternalProviders();
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "Provider not found" });
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
    message: `Channel ${channelId} updated`,
  });
});

// GET /api/provider/:providerId/models — Get provider model list
router.get("/:providerId/models", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "Provider not found" });
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

// POST /api/provider/:providerId/models — Add model
router.post("/:providerId/models", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "Provider not found" });
    return;
  }
  if (provider.status === "disabled") {
    res.status(403).json({ success: false, message: "Channel is disabled, cannot continue to maintain models" });
    return;
  }

  const {
    model_id, name, description, category,
    context_length, max_output, prompt_price, completion_price,
    tags, supported,
  } = req.body;

  if (!model_id || !name) {
    res.status(400).json({ success: false, message: "Please provide model ID and name" });
    return;
  }

  const model = await createModel(providerId, {
    model_id, name, description, category,
    context_length, max_output, prompt_price, completion_price,
    tags, supported,
  });

  if (!model) {
    res.status(400).json({ success: false, message: "Model ID already exists" });
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
    message: "Model created",
  });
});

// PUT /api/provider/:providerId/models/:modelId — Update model
router.put("/:providerId/models/:modelId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const provider = await getProviderById(providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "Provider not found" });
    return;
  }
  const model = (await getModelsByProvider(providerId)).find((item) => item.id === (req.params.modelId as string));
  if (!model) {
    res.status(404).json({ success: false, message: "Model not found or does not belong to this provider" });
    return;
  }

  const success = await updateModel(req.params.modelId as string, req.body);
  if (!success) {
    res.status(404).json({ success: false, message: "Model not found" });
    return;
  }

  res.json({ success: true, message: "Model updated" });
});

// DELETE /api/provider/:providerId/models/:modelId — Delete model
router.delete("/:providerId/models/:modelId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const model = (await getModelsByProvider(providerId)).find((item) => item.id === (req.params.modelId as string));
  if (!model) {
    res.status(404).json({ success: false, message: "Model not found or does not belong to this provider" });
    return;
  }
  const success = await deleteModel(req.params.modelId as string);
  if (!success) {
    res.status(404).json({ success: false, message: "Model not found" });
    return;
  }
  res.json({ success: true, message: "Model deleted" });
});

export default router;
