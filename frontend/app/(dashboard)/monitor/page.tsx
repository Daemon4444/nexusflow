"use client";

import { useEffect, useState } from "react";
import { useAuth, authHeaders } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import UserLayout from "@/components/UserLayout";

interface PerfOverview { avgTtft: number; minTtft: number; maxTtft: number; avgTpot: number; minTpot: number; maxTpot: number; avgLatency: number; totalRequests: number; successCount: number; errorCount: number; successRate: number; }
interface HourlyData { hour: string; requests: number; avgTtft: number; avgTpot: number; avgLatency: number; errors: number; }
interface ModelPerf { model: string; requests: number; avgTtft: number; avgTpot: number; avgLatency: number; successRate: number; }
interface RecentReq { time: string; model: string; tokens: number; latency: number; ttft: number; tpot: number; status: string; cost: number; }

export default function MonitorPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [overview, setOverview] = useState<PerfOverview | null>(null);
  const [hourly, setHourly] = useState<HourlyData[]>([]);
  const [modelPerf, setModelPerf] = useState<ModelPerf[]>([]);
  const [recent, setRecent] = useState<RecentReq[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    loadAll(controller.signal);
    return () => controller.abort();
  }, [user]);

  useEffect(() => {
    if (!autoRefresh || !user) return;
    const timer = setInterval(() => {
      const controller = new AbortController();
      loadAll(controller.signal);
    }, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh, user]);

  async function loadAll(signal?: AbortSignal) {
    try {
      const headers = authHeaders();
      const [ovRes, hrRes, mdRes, rcRes] = await Promise.all([
        fetchAPI("/api/usage/monitor/overview", { headers, signal }),
        fetchAPI("/api/usage/monitor/hourly", { headers, signal }),
        fetchAPI("/api/usage/monitor/by-model", { headers, signal }),
        fetchAPI("/api/usage/monitor/recent?limit=30", { headers, signal }),
      ]);
      if (ovRes.success) setOverview(ovRes.data);
      if (hrRes.success) setHourly(hrRes.data);
      if (mdRes.success) setModelPerf(mdRes.data);
      if (rcRes.success) setRecent(rcRes.data);
      setLoadError(ovRes.success ? null : (ovRes.message || "数据更新失败"));
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.error("Failed to load monitor data", e);
      setLoadError("数据更新失败，请稍后重试");
    }
    finally { setDataLoading(false); }
  }

  const maxHR = Math.max(...hourly.map(h => h.requests), 1);
  const maxHT = Math.max(...hourly.map(h => h.avgTtft), 1);

  return (
    <UserLayout wide>
      <div className="usr-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h1>{t("perfTitle")}</h1><p>{t("perfDesc")}</p></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={autoRefresh ? "btn-primary" : "btn-secondary"} style={{ padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: autoRefresh ? "#fff" : "var(--text-tertiary)", display: "inline-block" }} />
            {autoRefresh ? t("live") : t("paused")}
          </button>
          <button onClick={() => { setDataLoading(true); loadAll(); }} className="btn-secondary" style={{ padding: "6px 14px", fontSize: 12 }}>{t("refresh")}</button>
        </div>
      </div>

      {loadError && (
        <div style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
          {loadError}
        </div>
      )}

      {dataLoading && !overview ? (
        <div style={{ textAlign: "center", padding: 80, color: "var(--text-tertiary)" }}>{t("loadingMetrics")}</div>
      ) : (
        <>
          <div className="usr-metric-grid monitor-metric-grid">
            {[
              { label: t("avgTtft"), value: `${overview?.avgTtft || 0}ms`, sub: `${overview?.minTtft || 0} – ${overview?.maxTtft || 0}ms` },
              { label: t("avgTpot"), value: `${overview?.avgTpot || 0}ms`, sub: `${overview?.minTpot || 0} – ${overview?.maxTpot || 0}ms` },
              { label: t("avgLatency"), value: `${overview?.avgLatency || 0}ms`, sub: t("endToEnd") },
              { label: t("requests24h"), value: String(overview?.totalRequests || 0), sub: `${overview?.errorCount || 0} ${t("errors").toLowerCase()}` },
              { label: t("successRate"), value: `${overview?.successRate || 100}%`, sub: `${overview?.successCount || 0} / ${overview?.totalRequests || 0}` },
              { label: t("errors"), value: String(overview?.errorCount || 0), sub: t("last24h") },
            ].map((m) => (
              <div key={m.label} className="usr-metric"><div className="usr-metric-label">{m.label}</div><div className="usr-metric-value">{m.value}</div><div className="usr-metric-sub">{m.sub}</div></div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div className="usr-section">
              <div className="usr-section-header"><h3>{t("reqPerHour")}</h3></div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110 }}>
                  {hourly.length === 0 ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 12 }}>{t("noDataYet")}</div>
                  : hourly.map((h, i) => (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <span style={{ fontSize: 8.5, color: "var(--text-tertiary)" }}>{h.requests || ""}</span>
                      <div style={{ width: "100%", height: Math.max(2, (h.requests / maxHR) * 90), background: h.errors > 0 ? "linear-gradient(180deg, #ef4444, #dc2626)" : "linear-gradient(180deg, #333, #111)", borderRadius: "3px 3px 0 0", transition: "height 0.3s" }} title={`${h.hour}: ${h.requests} req, ${h.errors} errors`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="usr-section">
              <div className="usr-section-header"><h3>{t("ttftPerHour")}</h3></div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110 }}>
                  {hourly.length === 0 ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 12 }}>{t("noDataYet")}</div>
                  : hourly.map((h, i) => (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <span style={{ fontSize: 8.5, color: "var(--text-tertiary)" }}>{h.avgTtft || ""}</span>
                      <div style={{ width: "100%", height: Math.max(2, (h.avgTtft / maxHT) * 90), background: h.avgTtft > 2000 ? "linear-gradient(180deg, #f59e0b, #d97706)" : "linear-gradient(180deg, #6366f1, #4f46e5)", borderRadius: "3px 3px 0 0", transition: "height 0.3s" }} title={`${h.hour}: TTFT ${h.avgTtft}ms`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="usr-section" style={{ marginBottom: 20 }}>
            <div className="usr-section-header"><div><h3>{t("perfByModel")}</h3><p>{t("last24h")}</p></div></div>
            {modelPerf.length === 0 ? <div style={{ textAlign: "center", padding: 48, color: "var(--text-tertiary)", fontSize: 13 }}>{t("noData")}</div> : (
              <>
                <div className="table-row table-head" style={{ gridTemplateColumns: "1fr 70px 90px 90px 90px 80px", fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const, color: "var(--text-tertiary)", background: "var(--bg-elevated)" }}>
                  <span>{t("model")}</span><span style={{ textAlign: "right" }}>{t("requests")}</span><span style={{ textAlign: "right" }}>TTFT</span><span style={{ textAlign: "right" }}>TPOT</span><span style={{ textAlign: "right" }}>{t("latency")}</span><span style={{ textAlign: "right" }}>{t("success")}</span>
                </div>
                {modelPerf.map((m) => (
                  <div key={m.model} className="table-row" style={{ gridTemplateColumns: "1fr 70px 90px 90px 90px 80px" }}>
                    <span style={{ fontWeight: 550, color: "var(--text-primary)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{m.model.length > 30 ? m.model.slice(0, 30) + "..." : m.model}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12.5 }}>{m.requests}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12.5, color: m.avgTtft > 2000 ? "#f59e0b" : "inherit" }}>{m.avgTtft}ms</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12.5, color: m.avgTpot > 50 ? "#f59e0b" : "inherit" }}>{m.avgTpot}ms</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12.5 }}>{m.avgLatency}ms</span>
                    <span style={{ textAlign: "right" }}><span className={m.successRate >= 99 ? "badge-success" : m.successRate >= 95 ? "badge-warning" : "badge-danger"} style={{ fontSize: 11 }}>{m.successRate}%</span></span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="usr-section">
            <div className="usr-section-header"><div><h3>{t("recentRequests")}</h3><p>{t("recentReqDesc")}</p></div></div>
            {recent.length === 0 ? <div style={{ textAlign: "center", padding: 48, color: "var(--text-tertiary)", fontSize: 13 }}>{t("noRequests")}</div> : (
              <>
                <div className="table-row table-head" style={{ gridTemplateColumns: "65px 1fr 60px 75px 75px 75px 50px", fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const, color: "var(--text-tertiary)", background: "var(--bg-elevated)" }}>
                  <span>{t("txTime")}</span><span>{t("model")}</span><span style={{ textAlign: "right" }}>{t("tokens")}</span><span style={{ textAlign: "right" }}>TTFT</span><span style={{ textAlign: "right" }}>TPOT</span><span style={{ textAlign: "right" }}>{t("latency")}</span><span style={{ textAlign: "center" }}>OK</span>
                </div>
                {recent.map((r, i) => (
                  <div key={i} className="table-row" style={{ gridTemplateColumns: "65px 1fr 60px 75px 75px 75px 50px" }}>
                    <span style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{r.time}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{r.model.length > 28 ? r.model.slice(0, 28) + "..." : r.model}</span>
                    <span style={{ textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{r.tokens}</span>
                    <span style={{ textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums", color: r.ttft > 2000 ? "#f59e0b" : "inherit" }}>{r.ttft > 0 ? `${r.ttft}ms` : "–"}</span>
                    <span style={{ textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums", color: r.tpot > 50 ? "#f59e0b" : "inherit" }}>{r.tpot > 0 ? `${r.tpot}ms` : "–"}</span>
                    <span style={{ textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{r.latency}ms</span>
                    <span style={{ textAlign: "center" }}><span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: r.status === "success" ? "#10b981" : "#ef4444" }} /></span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 20, fontSize: 11, color: "var(--text-tertiary)" }}>
            <span><strong>TTFT</strong> — Time to First Token</span>
            <span><strong>TPOT</strong> — Time Per Output Token</span>
          </div>
        </>
      )}
    </UserLayout>
  );
}
