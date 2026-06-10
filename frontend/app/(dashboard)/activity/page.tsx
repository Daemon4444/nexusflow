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
      // 部分接口失败时优雅降级：有任一数据即渲染，全部失败才报错
      if (ovRes.success || dayRes.success || modelRes.success || recentRes.success) {
        setData({
          overview: ovRes.success ? ovRes.data : { totalRequests: 0, totalTokens: 0, totalCost: 0, activeModels: 0, avgLatency: 0, successRate: 0, totalCachedTokens: 0 },
          daily: dayRes.success ? dayRes.data : [],
          byModel: modelRes.success ? modelRes.data : [],
          recent: recentRes.success ? recentRes.data : [],
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

  const [activeTab, setActiveTab] = useState<"dashboard" | "logs">("dashboard");

  return (
    <UserLayout wide>
      <div className="usr-page-header">
        <h1>{t("activityTitle")}</h1>
        <p>{t("activityDesc")}</p>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
        {([
          { key: "dashboard" as const, label: "监控大盘" },
          { key: "logs" as const, label: "日志分析" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 20px", fontSize: 13, fontFamily: "inherit",
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "var(--text-primary)" : "var(--text-tertiary)",
              background: "transparent", border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--text-primary)" : "2px solid transparent",
              cursor: "pointer", marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (<>
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
              { label: t("totalRequests"), value: data.overview.totalRequests.toLocaleString(), tint: "tint-teal", icon: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/> },
              { label: t("totalTokens"), value: formatTokensCompact(data.overview.totalTokens), tint: "tint-orange", icon: <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></> },
              { label: t("totalCost"), value: formatCny(data.overview.totalCost), tint: "tint-green", icon: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></> },
              { label: t("activeModels"), value: data.overview.activeModels.toString(), tint: "tint-purple", icon: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></> },
              { label: t("avgLatency"), value: data.overview.avgLatency + "s", tint: "tint-blue", icon: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></> },
              { label: t("successRate"), value: data.overview.successRate + "%", tint: "tint-teal", icon: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></> },
              ...(data.overview.totalCachedTokens > 0 ? [{ label: "缓存命中", value: formatTokensCompact(data.overview.totalCachedTokens), tint: "tint-blue", icon: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></> }] : []),
            ].map((m) => (
              <div key={m.label} className="usr-metric with-icon">
                <div className={`usr-metric-icon ${m.tint}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{m.icon}</svg>
                </div>
                <div className="usr-metric-body">
                  <div className="usr-metric-label">{m.label}</div>
                  <div className="usr-metric-value">{m.value}</div>
                </div>
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
      </>)}

      {activeTab === "logs" && <LogAnalysis />}
    </UserLayout>
  );
}

function LogAnalysis() {
  const [searchLogId, setSearchLogId] = useState("");
  const [searchModel, setSearchModel] = useState("");
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailNote, setDetailNote] = useState("");

  async function handleSearch() {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchLogId.trim()) params.set("log_id", searchLogId.trim());
    if (searchModel.trim()) params.set("model", searchModel.trim());
    if (searchFrom) params.set("from", new Date(searchFrom).toISOString());
    if (searchTo) params.set("to", new Date(searchTo).toISOString());
    params.set("limit", "50");
    const res = await fetchAPI(`/api/usage/logs/search?${params}`, { headers: authHeaders() });
    if (res.success) setResults(res.data || []);
    setLoading(false);
  }

  async function loadDetail(logId: string) {
    if (expandedId === logId) { setExpandedId(null); return; }
    setExpandedId(logId);
    setDetailLoading(true);
    setDetail(null);
    setDetailNote("");
    const res = await fetchAPI(`/api/usage/logs/${logId}/detail`, { headers: authHeaders() });
    if (res.success) {
      setDetail(res.data);
      if (res.note) setDetailNote(res.note);
    } else {
      setDetailNote(res.message || "查询失败");
    }
    setDetailLoading(false);
  }

  function formatJson(s: string | null | undefined): string {
    if (!s) return "";
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
  }

  return (
    <>
      <div className="usr-section" style={{ marginBottom: 16 }}>
        <div className="usr-section-header"><h3>搜索日志</h3></div>
        <div className="usr-section-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>Request ID</label>
              <input value={searchLogId} onChange={(e) => setSearchLogId(e.target.value)} placeholder="输入 Request ID" style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, fontFamily: "inherit", background: "var(--bg)" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>模型</label>
              <input value={searchModel} onChange={(e) => setSearchModel(e.target.value)} placeholder="如 qwen3.7-max" style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, fontFamily: "inherit", background: "var(--bg)" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>开始时间</label>
              <input type="datetime-local" value={searchFrom} onChange={(e) => setSearchFrom(e.target.value)} style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, fontFamily: "inherit", background: "var(--bg)" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>结束时间</label>
              <input type="datetime-local" value={searchTo} onChange={(e) => setSearchTo(e.target.value)} style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, fontFamily: "inherit", background: "var(--bg)" }} />
            </div>
            <button onClick={handleSearch} disabled={loading} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "#111827", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", height: 34 }}>
              {loading ? "搜索中..." : "搜索"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 12, padding: "8px 12px", background: "var(--bg-elevated)", borderRadius: 6, border: "1px solid var(--border)" }}>
        💡 日志写入后约 1-2 分钟才可查询详情（SLS 索引延迟）。不填条件直接搜索可查看最近 50 条记录。
      </div>

      {results.length > 0 && (
        <div className="usr-section">
          <div className="usr-section-header"><h3>查询结果（{results.length} 条）</h3></div>
          <div>
            <div className="table-row" style={{ gridTemplateColumns: "1.5fr 1fr 0.6fr 0.6fr 0.6fr 1fr", fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const, color: "var(--text-tertiary)", background: "var(--bg-elevated)" }}>
              <span>Request ID</span><span>模型</span><span>Tokens</span><span>费用</span><span>状态</span><span>时间</span>
            </div>
            {results.map((r) => (
              <div key={r.log_id}>
                <div className="table-row" style={{ gridTemplateColumns: "1.5fr 1fr 0.6fr 0.6fr 0.6fr 1fr", cursor: "pointer" }} onClick={() => r.log_id && loadDetail(r.log_id)}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#1d4ed8", overflow: "hidden", textOverflow: "ellipsis" }}>{r.log_id?.slice(0, 12)}...</span>
                  <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{r.model}</span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{r.total_tokens?.toLocaleString()}</span>
                  <span style={{ fontSize: 12, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>¥{r.cost}</span>
                  <span><span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: r.status === "success" ? "#10b981" : "#ef4444" }} /></span>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.time}</span>
                </div>
                {expandedId === r.log_id && (
                  <div style={{ padding: "16px 20px", background: "var(--bg-elevated)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                    {detailLoading ? (
                      <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>加载中...</div>
                    ) : detail ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6 }}>REQUEST</div>
                          <pre style={{ margin: 0, padding: 12, background: "#111827", color: "#e5e7eb", borderRadius: 6, fontSize: 11.5, lineHeight: 1.5, overflow: "auto", maxHeight: 300 }}>{formatJson(detail.request)}</pre>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6 }}>RESPONSE</div>
                          <pre style={{ margin: 0, padding: 12, background: "#111827", color: "#e5e7eb", borderRadius: 6, fontSize: 11.5, lineHeight: 1.5, overflow: "auto", maxHeight: 300 }}>{formatJson(detail.response)}</pre>
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>{detailNote || "暂无详情数据"}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
