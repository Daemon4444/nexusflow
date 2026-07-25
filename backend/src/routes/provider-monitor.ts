import { Router, Request, Response } from "express";
import { requireAdmin } from "../middleware/admin";
import { getAllProviders, getAllCapacity } from "../data/providers";
import { getAllHealthRecords } from "../services/scheduler";
import { getProviderUsageStatsAsync } from "../services/rate-limiter";
import {
  getFallbackState,
  HealthState,
  latestObservationAt,
  summarizeRouteHealth,
  unavailableHistoricalSeries,
} from "../services/provider-monitor-semantics";
import { models as staticModels } from "../data/models";

const router = Router();

router.use(requireAdmin);

router.get("/overview", async (_req: Request, res: Response) => {
  const [providers, capacity, health] = await Promise.all([
    getAllProviders(),
    getAllCapacity(),
    getAllHealthRecords(),
  ]);
  const totals = {
    currentRpm: 0,
    currentTpm: 0,
    rpmLimit: 0,
    tpmLimit: 0,
    concurrentLimit: 0,
    modelCount: 0,
    enabledRoutes: 0,
  };

  const providerCards = await Promise.all(providers.map(async (provider) => {
    const providerCapacity = capacity.filter((item) => item.provider_id === provider.id);
    const providerHealth = health.filter((item) => item.providerId === provider.id);
    const usageByModel = new Map(
      await Promise.all(providerCapacity.map(async (item) => [
        item.model_id,
        await getProviderUsageStatsAsync(provider.id, item.model_id),
      ] as const))
    );

    const providerTotals = providerCapacity.reduce((acc, item) => {
      const usage = usageByModel.get(item.model_id) || { rpm: 0, tpm: 0 };
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

    const healthByModel = new Map(providerHealth.map((item) => [item.modelId, item.status]));
    const enabledCapacity = providerCapacity.filter((item) => item.is_enabled);
    const {
      health: worstHealth,
      summary: healthSummary,
      observedRoutes,
    } = summarizeRouteHealth(enabledCapacity.map((item) => item.model_id), healthByModel);

    const rpmRatio = providerTotals.rpmLimit > 0 ? providerTotals.rpm / providerTotals.rpmLimit : 0;
    const tpmRatio = providerTotals.tpmLimit > 0 ? providerTotals.tpm / providerTotals.tpmLimit : 0;
    const saturation = Math.max(rpmRatio, tpmRatio);

    return {
      providerId: provider.id,
      providerName: provider.name,
      status: provider.status,
      health: worstHealth,
      modelCount: providerCapacity.length,
      enabledRoutes: providerTotals.enabledRoutes,
      currentRpm: providerTotals.rpm,
      rpmLimit: providerTotals.rpmLimit,
      currentTpm: providerTotals.tpm,
      tpmLimit: providerTotals.tpmLimit,
      concurrentLimit: providerTotals.concurrentLimit,
      saturationRatio: Number(saturation.toFixed(4)),
      fallbackState: getFallbackState(worstHealth),
      capacityHitRate: Number(Math.min(100, saturation * 100).toFixed(1)),
      observedRoutes,
      unknownRoutes: healthSummary.unknown,
      healthCoverageRatio: enabledCapacity.length > 0
        ? Number((observedRoutes / enabledCapacity.length).toFixed(4))
        : 0,
      healthSummary,
    };
  }));

  for (const card of providerCards) {
    totals.currentRpm += card.currentRpm;
    totals.currentTpm += card.currentTpm;
    totals.rpmLimit += card.rpmLimit;
    totals.tpmLimit += card.tpmLimit;
    totals.concurrentLimit += card.concurrentLimit;
    totals.modelCount += card.modelCount;
    totals.enabledRoutes += card.enabledRoutes;
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
    } else if (card.health === "unknown") {
      rows.push({
        level: "info",
        title: `${card.providerName} 健康状态未知`,
        detail: card.enabledRoutes === 0
          ? "当前没有启用路由，无法形成上游健康观测。"
          : `仅 ${card.observedRoutes}/${card.enabledRoutes} 条启用路由有真实请求观测；未观测路由不会标记为健康。`,
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
        unknownProviders: providerCards.filter((item) => item.health === "unknown").length,
        currentRpm: totals.currentRpm,
        currentTpm: totals.currentTpm,
        rpmLimit: totals.rpmLimit,
        tpmLimit: totals.tpmLimit,
        concurrentLimit: totals.concurrentLimit,
        modelCount: totals.modelCount,
        enabledRoutes: totals.enabledRoutes,
      },
      semantics: {
        healthSource: "observed_upstream_requests",
        healthUnknownWhenUnobserved: true,
        usageWindowSeconds: 60,
        historicalSeriesAvailable: false,
      },
    },
  });
});

router.get("/provider/:providerId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const [providers, allCapacity, allHealth] = await Promise.all([
    getAllProviders(),
    getAllCapacity(),
    getAllHealthRecords(),
  ]);
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) {
    res.status(404).json({ success: false, message: "渠道不存在" });
    return;
  }

  const capacity = allCapacity.filter((item) => item.provider_id === providerId);
  const health = allHealth.filter((item) => item.providerId === providerId);

  const routes = await Promise.all(capacity.map(async (cap) => {
    const catalog = staticModels.find((model) => model.id === cap.model_id);
    const healthItem = health.find((item) => item.modelId === cap.model_id);
    const usage = await getProviderUsageStatsAsync(providerId, cap.model_id);
    const rpmLimit = cap.rpm_limit;
    const tpmLimit = cap.tpm_limit;
    const currentHealth: HealthState = healthItem?.status || "unknown";
    const lastObservedAt = latestObservationAt(healthItem?.lastSuccessAt, healthItem?.lastFailureAt);
    return {
      modelId: cap.model_id,
      name: catalog?.name || cap.model_id,
      status: cap.is_enabled ? "enabled" : "disabled",
      routeEnabled: cap.is_enabled,
      currentRpm: usage.rpm,
      rpmLimit,
      currentTpm: usage.tpm,
      tpmLimit,
      concurrentLimit: cap.concurrent_limit,
      priority: cap.priority,
      weight: cap.weight,
      health: currentHealth,
      fallbackState: getFallbackState(currentHealth),
      healthObserved: !!healthItem,
      lastObservedAt,
      consecutiveFailures: healthItem?.consecutiveFailures ?? 0,
      avgLatencyMs: healthItem?.avgLatencyMs ?? null,
      lastError: healthItem?.lastError ?? null,
      rpmSeries: unavailableHistoricalSeries(),
      tpmSeries: unavailableHistoricalSeries(),
      seriesSource: "unavailable",
      saturation: Number(Math.max(usage.rpm / Math.max(rpmLimit, 1), usage.tpm / Math.max(tpmLimit, 1)).toFixed(4)),
    };
  }));

  res.json({
    success: true,
    data: {
      provider: {
        id: provider.id,
        name: provider.name,
        status: provider.status,
      },
      routes,
      semantics: {
        healthSource: "observed_upstream_requests",
        healthUnknownWhenUnobserved: true,
        usageWindowSeconds: 60,
        historicalSeriesAvailable: false,
      },
    },
  });
});

export default router;
