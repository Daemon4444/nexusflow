"use client";

import { useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import UserLayout from "@/components/UserLayout";
import { useI18n } from "@/lib/i18n";
import { formatCny, formatCnyPrecise } from "@/lib/money";
import { EmptyState, ErrorState, LoadingState } from "@/components/AppState";

interface UsageData {
  overview: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    activeModels: number;
    avgLatency: number;
    successRate: number;
    totalCachedTokens: number;
  };
  daily: { date: string; requests: number; tokens: number; cost: number }[];
  byModel: {
    model: string;
    requests: number;
    tokens: number;
    cost: number;
    percentage: number;
  }[];
  recent: {
    time: string;
    model: string;
    tokens: number;
    cost: number;
    status: string;
    latency: number;
    discount_rate?: number;
    list_cost?: number;
    cached_tokens?: number;
    cache_creation_tokens?: number;
  }[];
}

export default function ActivityPage() {
  const { t } = useI18n();
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const headers = authHeaders();
      const [ovRes, dayRes, modelRes, recentRes] = await Promise.all([
        fetchAPI("/api/usage/overview", { headers, signal }),
        fetchAPI("/api/usage/daily", { headers, signal }),
        fetchAPI("/api/usage/by-model", { headers, signal }),
        fetchAPI("/api/usage/recent?limit=50", { headers, signal }),
      ]);
      if (ovRes.success && dayRes.success && modelRes.success && recentRes.success) {
        setData({
          overview: ovRes.data,
          daily: dayRes.data,
          byModel: modelRes.data,
          recent: recentRes.data,
        });
      } else {
        setError(ovRes.message || dayRes.message || modelRes.message || recentRes.message || "用量数据加载失败");
      }
    } catch {
      setError("无法连接用量服务，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  const barColors = ["#111", "#333", "#555", "#777", "#999", "#bbb", "#ddd"];

  function formatTokensCompact(tokens: number): string {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(2)}K`;
    return tokens.toLocaleString();
  }

  return (
    <UserLayout wide>
      <div className="usr-page-header">
        <h1>{t("activityTitle")}</h1>
        <p>{t("activityDesc")}</p>
      </div>

      {loading ? (
        <LoadingState title={t("loading")} />
      ) : error ? (
        <ErrorState title={t("failedLoad")} message={error} onAction={load} />
      ) : !data ? (
        <EmptyState title="暂无用量数据" />
      ) : (
        <>
          {/* Overview Metrics */}
          <div className="usr-metric-grid">
            {[
              { label: t("totalRequests"), value: data.overview.totalRequests.toLocaleString() },
              { label: t("totalTokens"), value: formatTokensCompact(data.overview.totalTokens) },
              { label: t("totalCost"), value: formatCny(data.overview.totalCost) },
              { label: t("activeModels"), value: data.overview.activeModels.toString() },
              { label: t("avgLatency"), value: data.overview.avgLatency + "s" },
              { label: t("successRate"), value: data.overview.successRate + "%" },
              ...(data.overview.totalCachedTokens > 0 ? [{ label: "缓存命中", value: formatTokensCompact(data.overview.totalCachedTokens) }] : []),
            ].map((m) => (
              <div key={m.label} className="usr-metric">
                <div className="usr-metric-label">{m.label}</div>
                <div className="usr-metric-value">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginBottom: 20 }}>
            {/* Daily Requests */}
            <div className="usr-section">
              <div className="usr-section-header"><h3>{t("dailyReq7d")}</h3></div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 160 }}>
                  {data.daily.map((d) => {
                    const maxReq = Math.max(...data.daily.map(x => x.requests), 1);
                    return (
                      <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                          {d.requests.toLocaleString()}
                        </div>
                        <div style={{
                          width: "100%",
                          height: `${Math.max(16, (d.requests / maxReq) * 120)}px`,
                          background: "linear-gradient(180deg, #333, #111)",
                          borderRadius: "5px 5px 2px 2px",
                          transition: "height 0.5s ease",
                        }} />
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{d.date}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Model Breakdown */}
            <div className="usr-section">
              <div className="usr-section-header"><h3>{t("modelDist")}</h3></div>
              <div className="usr-section-body">
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.byModel.map((m, i) => (
                    <div key={m.model}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{m.model}</span>
                        <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{m.percentage}%</span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${m.percentage * (100 / (data.byModel[0]?.percentage || 100))}%`,
                            background: barColors[i % barColors.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Daily Cost Table */}
          <div className="usr-section" style={{ marginBottom: 16 }}>
            <div className="usr-section-header"><h3>{t("dailyCost")}</h3></div>
            <div>
              <div className="table-row" style={{
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const,
                  color: "var(--text-tertiary)", background: "var(--bg-elevated)",
                }}>
                  <span>{t("date")}</span>
                  <span>{t("requests")}</span>
                  <span>{t("tokens")}</span>
                  <span>{t("cost")}</span>
                </div>
                {data.daily.map((d) => (
                  <div key={d.date} className="table-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                    <span style={{ color: "var(--text-primary)", fontSize: 12.5 }}>{d.date}</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{d.requests.toLocaleString()}</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{formatTokensCompact(d.tokens)}</span>
                    <span style={{ color: "#10b981", fontWeight: 500, fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{formatCnyPrecise(d.cost)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Requests - Full Width */}
          <div className="usr-section" style={{ marginTop: 16 }}>
            <div className="usr-section-header"><h3>{t("recentRequests")}</h3></div>
            <div>
              <div className="table-row" style={{
                gridTemplateColumns: "0.7fr 1.2fr 1fr 0.8fr 0.4fr",
                fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const,
                color: "var(--text-tertiary)", background: "var(--bg-elevated)",
              }}>
                <span>{t("txTime")}</span>
                <span>{t("model")}</span>
                <span>{t("tokens")}</span>
                <span>{t("cost")}</span>
                <span>{t("status")}</span>
              </div>
              {data.recent.map((r, i) => {
                const hasCacheCreation = (r.cache_creation_tokens ?? 0) > 0;
                const hasCacheHit = (r.cached_tokens ?? 0) > 0;
                return (
                  <div key={i} className="table-row" style={{ gridTemplateColumns: "0.7fr 1.2fr 1fr 0.8fr 0.4fr" }}>
                    <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                      {r.time}
                    </span>
                    <span style={{ color: "var(--text-primary)", fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      {r.model}
                      {r.discount_rate !== undefined && r.discount_rate < 1 && (
                        <span style={{ fontSize: 9.5, fontWeight: 600, padding: "1px 4px", borderRadius: 3, background: "#fef3c7", color: "#b45309" }}>
                          {Math.round(r.discount_rate * 10)}折
                        </span>
                      )}
                    </span>
                    <span style={{ color: "var(--text-secondary)", fontSize: 12.5, fontVariantNumeric: "tabular-nums", display: "flex", flexDirection: "column", gap: 2 }}>
                      <span>{r.tokens.toLocaleString()} tokens</span>
                      {hasCacheHit && (
                        <span style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ padding: "1px 5px", borderRadius: 3, background: "#dbeafe", color: "#1d4ed8", fontWeight: 600 }}>
                            缓存命中
                          </span>
                          <span style={{ color: "#1d4ed8" }}>{r.cached_tokens!.toLocaleString()} tokens (节省 {Math.round((r.cached_tokens! / r.tokens) * 100)}%)</span>
                        </span>
                      )}
                      {hasCacheCreation && (
                        <span style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ padding: "1px 5px", borderRadius: 3, background: "#ffedd5", color: "#c2410c", fontWeight: 600 }}>
                            创建缓存
                          </span>
                          <span style={{ color: "#c2410c" }}>{r.cache_creation_tokens!.toLocaleString()} tokens</span>
                        </span>
                      )}
                    </span>
                    <span style={{ color: "#10b981", fontSize: 12.5, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                      {formatCnyPrecise(r.cost)}
                    </span>
                    <span>
                      <span style={{
                        width: 7, height: 7, borderRadius: "50%", display: "inline-block",
                        background: r.status === "success" || r.status === "成功" ? "#10b981" : "#ef4444",
                      }} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </UserLayout>
  );
}
