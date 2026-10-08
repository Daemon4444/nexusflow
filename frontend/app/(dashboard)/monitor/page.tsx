"use client";

import { useEffect, useState } from "react";
import { useAuth, authHeaders } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import UserLayout from "@/components/UserLayout";
import { LoadingState } from "@/components/AppState";
import { KpiBand, PageHeader, Panel, Tag, formatConsoleTime } from "@/components/ConsoleUI";

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
      if (signal?.aborted) return;
      console.error("Failed to load monitor data", e);
      setLoadError("数据更新失败，请稍后重试");
    }
    finally { if (!signal?.aborted) setDataLoading(false); }
  }

  const maxHR = Math.max(...hourly.map(h => h.requests), 1);
  const maxHT = Math.max(...hourly.map(h => h.avgTtft), 1);
  const ok = (status: string) => status === "success" || status === "成功";

  return (
    <UserLayout wide>
      <PageHeader
        title={t("perfTitle")}
        description={t("perfDesc")}
        actions={(
          <>
            <button onClick={() => setAutoRefresh(!autoRefresh)} className="btn-secondary nfc-live-toggle" aria-pressed={autoRefresh}>
              <span className={autoRefresh ? "nfc-live-dot is-live" : "nfc-live-dot"} />
              {autoRefresh ? "每 30 秒自动刷新" : "已暂停刷新"}
            </button>
            <button onClick={() => { setDataLoading(true); loadAll(); }} className="btn-secondary">{t("refresh")}</button>
          </>
        )}
      />

      {loadError && <div className="nfc-note nfc-note-danger" style={{ marginBottom: 12 }}>{loadError}</div>}

      {dataLoading && !overview ? (
        <LoadingState title={t("loadingMetrics")} />
      ) : (
        <>
          <KpiBand items={[
            { label: t("avgTtft"), value: `${overview?.avgTtft || 0}ms`, hint: `${overview?.minTtft || 0} – ${overview?.maxTtft || 0}ms` },
            { label: t("avgTpot"), value: `${overview?.avgTpot || 0}ms`, hint: `${overview?.minTpot || 0} – ${overview?.maxTpot || 0}ms` },
            { label: t("avgLatency"), value: `${overview?.avgLatency || 0}ms`, hint: t("endToEnd") },
            { label: t("requests24h"), value: String(overview?.totalRequests || 0), hint: `${overview?.errorCount || 0} 次失败` },
            { label: t("successRate"), value: overview?.totalRequests ? `${overview.successRate ?? 0}%` : "—", hint: `${overview?.successCount || 0} / ${overview?.totalRequests || 0}` },
          ]} />

          <div className="nfc-grid-2" style={{ marginBottom: 16 }}>
            <Panel title={t("reqPerHour")} aside={<span className="nfc-legend"><i className="is-error" />含失败</span>}>
              <HourBars
                hours={hourly}
                value={(h) => h.requests}
                max={maxHR}
                tone={(h) => (h.errors > 0 ? "error" : undefined)}
                title={(h) => `${h.hour} · ${h.requests} 次 · ${h.errors} 次失败`}
                empty={t("noDataYet")}
              />
            </Panel>
            <Panel title={t("ttftPerHour")} aside={<span className="nfc-legend"><i className="is-slow" />超过 2 秒</span>}>
              <HourBars
                hours={hourly}
                value={(h) => h.avgTtft}
                max={maxHT}
                tone={(h) => (h.avgTtft > 2000 ? "slow" : undefined)}
                title={(h) => `${h.hour} · 首字 ${h.avgTtft}ms`}
                empty={t("noDataYet")}
              />
            </Panel>
          </div>

          <Panel title={t("perfByModel")} aside={t("last24h")} flush>
            {modelPerf.length === 0 ? <div className="nfc-empty">{t("noData")}</div> : (
              <div className="nfc-table-wrap">
                <table className="nfc-table">
                  <thead>
                    <tr><th>{t("model")}</th><th className="num">{t("requests")}</th><th className="num">TTFT</th><th className="num">TPOT</th><th className="num">{t("latency")}</th><th className="num">{t("success")}</th></tr>
                  </thead>
                  <tbody>
                    {modelPerf.map((m) => (
                      <tr key={m.model}>
                        <td><code className="nfc-code">{m.model}</code></td>
                        <td className="num">{m.requests}</td>
                        <td className={`num${m.avgTtft > 2000 ? " nfc-warn" : ""}`}>{m.avgTtft}ms</td>
                        <td className={`num${m.avgTpot > 50 ? " nfc-warn" : ""}`}>{m.avgTpot}ms</td>
                        <td className="num nfc-muted">{m.avgLatency}ms</td>
                        <td className="num"><Tag tone={m.successRate >= 99 ? "positive" : m.successRate >= 95 ? "warning" : "negative"}>{m.successRate}%</Tag></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title={t("recentRequests")} aside={t("recentReqDesc")} flush>
            {recent.length === 0 ? <div className="nfc-empty">{t("noRequests")}</div> : (
              <div className="nfc-table-wrap">
                <table className="nfc-table">
                  <thead>
                    <tr><th>{t("txTime")}</th><th>{t("model")}</th><th>状态</th><th className="num">{t("tokens")}</th><th className="num">TTFT</th><th className="num">TPOT</th><th className="num">{t("latency")}</th></tr>
                  </thead>
                  <tbody>
                    {recent.map((r, i) => (
                      <tr key={i}>
                        <td className="time">{formatConsoleTime(r.time, true)}</td>
                        <td><code className="nfc-code">{r.model}</code></td>
                        <td>{ok(r.status) ? <Tag tone="positive">成功</Tag> : <Tag tone="negative">失败</Tag>}</td>
                        <td className="num">{r.tokens.toLocaleString()}</td>
                        <td className={`num${r.ttft > 2000 ? " nfc-warn" : ""}`}>{r.ttft > 0 ? `${r.ttft}ms` : "–"}</td>
                        <td className={`num${r.tpot > 50 ? " nfc-warn" : ""}`}>{r.tpot > 0 ? `${r.tpot}ms` : "–"}</td>
                        <td className="num nfc-muted">{r.latency}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <p className="nfc-footnote"><strong>TTFT</strong> 首字延迟（Time to First Token） · <strong>TPOT</strong> 每个输出 token 的平均耗时（Time Per Output Token）</p>
        </>
      )}
    </UserLayout>
  );
}

function HourBars({ hours, value, max, tone, title, empty }: {
  hours: HourlyData[];
  value: (hour: HourlyData) => number;
  max: number;
  tone: (hour: HourlyData) => "error" | "slow" | undefined;
  title: (hour: HourlyData) => string;
  empty: string;
}) {
  if (hours.length === 0) return <div className="nfc-empty" style={{ padding: 40 }}>{empty}</div>;
  return (
    <div className="nfc-hours">
      <div className="nfc-hours-bars">
        {hours.map((hour, index) => (
          <span key={index} className={tone(hour) ? `is-${tone(hour)}` : undefined} style={{ height: `${Math.max(2, (value(hour) / max) * 100)}%` }} title={title(hour)} />
        ))}
      </div>
      <div className="nfc-hours-axis"><span>{hours[0]?.hour}</span><span>{hours[hours.length - 1]?.hour}</span></div>
    </div>
  );
}
