import { Router, Request, Response } from "express";
import { requireAdmin } from "../middleware/admin";
import { getAllProviders, getAllProviderModels, getAllCapacity } from "../data/providers";
import { getAllHealthRecords } from "../services/scheduler";
import { getProviderUsageStats } from "../services/rate-limiter";
import { providers as staticProviders } from "../services/providers";
import { models as staticModels } from "../data/models";

const router = Router();

type HealthState = "healthy" | "degraded" | "down";

function buildSeries(current: number, limit: number, points: number): number[] {
  const safeLimit = Math.max(limit, 1);
  const baseRatio = Math.min(1, current / safeLimit);
  return Array.from({ length: points }, (_, index) => {
    const drift = ((index % 4) - 1.5) * 0.06;
    const wave = Math.sin((index + 1) * 0.9) * 0.05;
    const value = Math.max(0, Math.min(1, baseRatio + drift + wave));
    return Number((value * safeLimit).toFixed(2));
  });
}

function getFallbackState(health: HealthState): "closed" | "monitoring" | "open" {
  if (health === "down") return "open";
  if (health === "degraded") return "monitoring";
  return "closed";
}

router.use(requireAdmin);

router.get("/overview", (_req: Request, res: Response) => {
  const providers = getAllProviders();
  const models = getAllProviderModels();
  const capacity = getAllCapacity();
  const health = getAllHealthRecords();

  const providerCards = providers.map((provider) => {
    const providerModels = models.filter((model) => model.provider_id === provider.id);
    const providerCapacity = capacity.filter((item) => item.provider_id === provider.id);
    const providerHealth = health.filter((item) => item.providerId === provider.id);

    const totals = providerCapacity.reduce((acc, item) => {
      const usage = getProviderUsageStats(provider.id, item.model_id);
      acc.rpm += usage.rpm;
      acc.tpm += usage.tpm;
      acc.rpmLimit += item.rpm_limit;
      acc.tpmLimit += item.tpm_limit;
      acc.concurrentLimit += item.concurrent_limit;
      if (item.is_enabled) acc.enabledRoutes += 1;
      return acc;
    }, {
      rpm: 0,
      tpm: 0,
      rpmLimit: 0,
      tpmLimit: 0,
      concurrentLimit: 0,
      enabledRoutes: 0,
    });

    const healthSummary = providerHealth.reduce((acc, item) => {
      acc[item.status] += 1;
      return acc;
    }, { healthy: 0, degraded: 0, down: 0 } as Record<HealthState, number>);

    const worstHealth: HealthState =
      healthSummary.down > 0 ? "down" :
      healthSummary.degraded > 0 ? "degraded" :
      "healthy";

    const rpmRatio = totals.rpmLimit > 0 ? totals.rpm / totals.rpmLimit : 0;
    const tpmRatio = totals.tpmLimit > 0 ? totals.tpm / totals.tpmLimit : 0;
    const saturation = Math.max(rpmRatio, tpmRatio);

    return {
      providerId: provider.id,
      providerName: provider.name,
      status: provider.status,
      health: worstHealth,
      modelCount: providerModels.length,
      enabledRoutes: totals.enabledRoutes,
      currentRpm: totals.rpm,
      rpmLimit: totals.rpmLimit,
      currentTpm: totals.tpm,
      tpmLimit: totals.tpmLimit,
      concurrentLimit: totals.concurrentLimit,
      saturationRatio: Number(saturation.toFixed(4)),
      fallbackState: getFallbackState(worstHealth),
      capacityHitRate: Number(Math.min(100, saturation * 100).toFixed(1)),
      healthSummary,
    };
  });

  const knownProviderIds = new Set(providerCards.map((item) => item.providerId));
  for (const provider of staticProviders) {
    if (knownProviderIds.has(provider.id)) continue;

    const providerModelIds = staticModels
      .map((model) => model.id)
      .filter((modelId) => provider.models.some((prefix) => modelId.startsWith(prefix)));

    let currentRpm = 0;
    let currentTpm = 0;
    for (const modelId of providerModelIds) {
      const usage = getProviderUsageStats(provider.id, modelId);
      currentRpm += usage.rpm;
      currentTpm += usage.tpm;
    }

    providerCards.push({
      providerId: provider.id,
      providerName: provider.name,
      status: "enabled",
      health: "healthy",
      modelCount: providerModelIds.length,
      enabledRoutes: providerModelIds.length,
      currentRpm,
      rpmLimit: providerModelIds.length * 60,
      currentTpm,
      tpmLimit: providerModelIds.length * 100000,
      concurrentLimit: providerModelIds.length * 10,
      saturationRatio: 0,
      fallbackState: "closed",
      capacityHitRate: 0,
      healthSummary: { healthy: 0, degraded: 0, down: 0 },
    });
  }

  const alerts = providerCards.flatMap((card) => {
    const rows: Array<{ level: "critical" | "warning" | "info"; title: string; detail: string; providerId: string }> = [];
    if (card.health === "down") {
      rows.push({
        level: "critical",
        title: `${card.providerName} 已熔断`,
        detail: "至少一个模型路由处于 down，流量需要切走。",
        providerId: card.providerId,
      });
    } else if (card.health === "degraded") {
      rows.push({
        level: "warning",
        title: `${card.providerName} 处于降级`,
        detail: "连续失败累积，建议关注错误率和延迟。",
        providerId: card.providerId,
      });
    }
    if (card.capacityHitRate >= 80) {
      rows.push({
        level: "warning",
        title: `${card.providerName} 容量接近打满`,
        detail: `当前容量命中率 ${card.capacityHitRate}% ，建议扩容或调权重。`,
        providerId: card.providerId,
      });
    }
    return rows;
  });

  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      providers: providerCards,
      alerts,
      totals: {
        providers: providerCards.length,
        healthyProviders: providerCards.filter((item) => item.health === "healthy").length,
        degradedProviders: providerCards.filter((item) => item.health === "degraded").length,
        downProviders: providerCards.filter((item) => item.health === "down").length,
      },
    },
  });
});

router.get("/provider/:providerId", (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const provider = getAllProviders().find((item) => item.id === providerId);
  const staticProvider = staticProviders.find((item) => item.id === providerId);
  if (!provider && !staticProvider) {
    res.status(404).json({ success: false, message: "渠道不存在" });
    return;
  }

  const models = getAllProviderModels().filter((item) => item.provider_id === providerId);
  const capacity = getAllCapacity().filter((item) => item.provider_id === providerId);
  const health = getAllHealthRecords().filter((item) => item.providerId === providerId);

  const dbRoutes = models.map((model) => {
    const cap = capacity.find((item) => item.model_id === model.model_id);
    const healthItem = health.find((item) => item.modelId === model.model_id);
    const usage = getProviderUsageStats(providerId, model.model_id);
    const rpmLimit = cap?.rpm_limit ?? 60;
    const tpmLimit = cap?.tpm_limit ?? 100000;
    const currentHealth = (healthItem?.status || "healthy") as HealthState;
    return {
      modelId: model.model_id,
      name: model.name,
      status: model.status,
      routeEnabled: cap?.is_enabled ?? true,
      currentRpm: usage.rpm,
      rpmLimit,
      currentTpm: usage.tpm,
      tpmLimit,
      concurrentLimit: cap?.concurrent_limit ?? 10,
      priority: cap?.priority ?? 0,
      weight: cap?.weight ?? 100,
      health: currentHealth,
      fallbackState: getFallbackState(currentHealth),
      consecutiveFailures: healthItem?.consecutiveFailures ?? 0,
      avgLatencyMs: healthItem?.avgLatencyMs ?? 0,
      lastError: healthItem?.lastError ?? null,
      rpmSeries: buildSeries(usage.rpm, rpmLimit, 12),
      tpmSeries: buildSeries(usage.tpm, tpmLimit, 12),
      saturation: Number(Math.max(usage.rpm / Math.max(rpmLimit, 1), usage.tpm / Math.max(tpmLimit, 1)).toFixed(4)),
    };
  });

  const staticRoutes = staticProvider
    ? staticModels
        .filter((model) => staticProvider.models.some((prefix) => model.id.startsWith(prefix)))
        .map((model) => {
          const usage = getProviderUsageStats(providerId, model.id);
          return {
            modelId: model.id,
            name: model.name,
            status: "enabled",
            routeEnabled: true,
            currentRpm: usage.rpm,
            rpmLimit: 60,
            currentTpm: usage.tpm,
            tpmLimit: 100000,
            concurrentLimit: 10,
            priority: 0,
            weight: 100,
            health: "healthy" as HealthState,
            fallbackState: "closed" as const,
            consecutiveFailures: 0,
            avgLatencyMs: 0,
            lastError: null,
            rpmSeries: buildSeries(usage.rpm, 60, 12),
            tpmSeries: buildSeries(usage.tpm, 100000, 12),
            saturation: Number(Math.max(usage.rpm / 60, usage.tpm / 100000).toFixed(4)),
          };
        })
        .filter((route) => route.currentRpm > 0 || route.currentTpm > 0)
    : [];

  const routes = dbRoutes.length > 0 ? dbRoutes : staticRoutes;

  res.json({
    success: true,
    data: {
      provider: {
        id: provider?.id || staticProvider!.id,
        name: provider?.name || staticProvider!.name,
        status: provider?.status || "enabled",
      },
      routes,
    },
  });
});

export default router;
