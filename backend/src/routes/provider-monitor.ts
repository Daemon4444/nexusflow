import { Router, Request, Response } from "express";
import { requireAdmin } from "../middleware/admin";
import { getAllProviders, getAllCapacity } from "../data/providers";
import { getAllHealthRecords } from "../services/scheduler";
import { getProviderUsageStats } from "../services/rate-limiter";
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

  const providerCards = providers.map((provider) => {
    const providerCapacity = capacity.filter((item) => item.provider_id === provider.id);
    const providerHealth = health.filter((item) => item.providerId === provider.id);

    const providerTotals = providerCapacity.reduce((acc, item) => {
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
      healthSummary,
    };
  });

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
        currentRpm: totals.currentRpm,
        currentTpm: totals.currentTpm,
        rpmLimit: totals.rpmLimit,
        tpmLimit: totals.tpmLimit,
        concurrentLimit: totals.concurrentLimit,
        modelCount: totals.modelCount,
        enabledRoutes: totals.enabledRoutes,
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

  const routes = capacity.map((cap) => {
    const catalog = staticModels.find((model) => model.id === cap.model_id);
    const healthItem = health.find((item) => item.modelId === cap.model_id);
    const usage = getProviderUsageStats(providerId, cap.model_id);
    const rpmLimit = cap.rpm_limit;
    const tpmLimit = cap.tpm_limit;
    const currentHealth = (healthItem?.status || "healthy") as HealthState;
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
      consecutiveFailures: healthItem?.consecutiveFailures ?? 0,
      avgLatencyMs: healthItem?.avgLatencyMs ?? 0,
      lastError: healthItem?.lastError ?? null,
      rpmSeries: buildSeries(usage.rpm, rpmLimit, 12),
      tpmSeries: buildSeries(usage.tpm, tpmLimit, 12),
      saturation: Number(Math.max(usage.rpm / Math.max(rpmLimit, 1), usage.tpm / Math.max(tpmLimit, 1)).toFixed(4)),
    };
  });

  res.json({
    success: true,
    data: {
      provider: {
        id: provider.id,
        name: provider.name,
        status: provider.status,
      },
      routes,
    },
  });
});

export default router;
