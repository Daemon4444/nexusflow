"use client";

import { Fragment, useEffect, useState, useRef } from "react";
import { fetchAPI } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import UserLayout from "@/components/UserLayout";
import { useI18n } from "@/lib/i18n";
import { formatCny, formatCnyPrecise } from "@/lib/money";
import { EmptyState, ErrorState, LoadingState } from "@/components/AppState";
import { KpiBand, PageHeader, Panel, Tag, formatConsoleTime } from "@/components/ConsoleUI";

interface UsageData {
  overview: {
    totalRequests: number;
    totalTokens: number;
    totalPromptTokens: number;
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

const OTHER = "__other__";

/** Top five models, with the long tail folded into one row so the panel stays short. */
function topModels(rows: UsageData["byModel"]) {
  if (rows.length <= 6) return rows;
  const rest = rows.slice(5);
  const sum = (key: "requests" | "tokens" | "cost" | "percentage") => rest.reduce((total, row) => total + Number(row[key] || 0), 0);
  return [...rows.slice(0, 5), { model: OTHER, requests: sum("requests"), tokens: sum("tokens"), cost: sum("cost"), percentage: Math.round(sum("percentage") * 10) / 10 }];
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
          overview: ovRes.success ? ovRes.data : { totalRequests: 0, totalTokens: 0, totalPromptTokens: 0, totalCost: 0, activeModels: 0, avgLatency: 0, successRate: 0, totalCachedTokens: 0 },
          daily: dayRes.success ? dayRes.data : [],
          byModel: modelRes.success ? modelRes.data : [],
          recent: recentRes.success ? recentRes.data : [],
        });
      } else {
        setError(ovRes.message || dayRes.message || modelRes.message || recentRes.message || "用量数据加载失败");
      }
    } catch {
      if (signal?.aborted) return;
      setError("无法连接用量服务，请稍后重试");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  function formatTokensCompact(tokens: number): string {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
    return tokens.toLocaleString();
  }

  const [activeTab, setActiveTab] = useState<"dashboard" | "logs">("dashboard");
  const isSuccess = (status: string) => status === "success" || status === "成功";

  return (
    <UserLayout wide>
      <PageHeader
        title={t("activityTitle")}
        description={t("activityDesc")}
        actions={(
          <div className="nfc-seg" role="tablist" aria-label="视图">
            <button role="tab" aria-pressed={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")}>用量概览</button>
            <button role="tab" aria-pressed={activeTab === "logs"} onClick={() => setActiveTab("logs")}>请求日志</button>
          </div>
        )}
      />

      {activeTab === "dashboard" && (<>
      {loading ? (
        <LoadingState title={t("loading")} />
      ) : error ? (
        <ErrorState title={t("failedLoad")} message={error} onAction={() => load()} />
      ) : !data ? (
        <EmptyState title="暂无用量数据" />
      ) : (
        <>
          <KpiBand items={[
            { label: t("totalRequests"), value: data.overview.totalRequests.toLocaleString(), hint: `${data.overview.activeModels} 个模型` },
            { label: t("totalTokens"), value: formatTokensCompact(data.overview.totalTokens), hint: data.overview.totalCachedTokens > 0 && data.overview.totalPromptTokens > 0 ? `缓存命中 ${((data.overview.totalCachedTokens / data.overview.totalPromptTokens) * 100).toFixed(1)}%` : "无缓存命中" },
            { label: t("totalCost"), value: formatCny(data.overview.totalCost), hint: "累计" },
            { label: t("avgLatency"), value: `${data.overview.avgLatency}s`, hint: "端到端平均" },
            { label: t("successRate"), value: `${data.overview.successRate}%`, hint: data.overview.successRate < 95 ? "低于 95%，建议查看日志" : "运行正常" },
          ]} />

          <div className="nfc-activity-grid">
            <Panel title={t("dailyReq7d")} aside={<span>请求数 · 费用</span>}>
              {data.daily.length === 0 ? (
                <EmptyState compact title="最近 7 天还没有请求" message="完成一次 API 调用后，这里会显示每日请求趋势。" />
              ) : (
                <div className="nfc-bars">
                  {data.daily.map((d) => {
                    const maxReq = Math.max(...data.daily.map((x) => x.requests), 1);
                    return (
                      <div key={d.date} className="nfc-bar" title={`${d.date} · ${d.requests} 次 · ${formatCnyPrecise(d.cost)}`}>
                        <span className="nfc-bar-value">{d.requests.toLocaleString()}</span>
                        <span className="nfc-bar-fill" style={{ height: `${Math.max(4, (d.requests / maxReq) * 100)}%` }} />
                        <span className="nfc-bar-label">{d.date}</span>
                        <span className="nfc-bar-sub">{formatCny(d.cost)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel title={t("modelDist")} aside={<span>按请求数</span>}>
              {data.byModel.length === 0 ? (
                <EmptyState compact title="暂无模型分布" message="调用模型后将按费用和请求量展示分布。" />
              ) : (
                <ul className="nfc-share">
                  {topModels(data.byModel).map((m) => (
                    <li key={m.model}>
                      <div>{m.model === OTHER ? <span className="nfc-muted">其他模型</span> : <code className="nfc-code">{m.model}</code>}<span className="nfc-mono">{m.percentage}%</span></div>
                      <span className="nfc-share-track"><span style={{ width: `${m.percentage * (100 / (data.byModel[0]?.percentage || 100))}%` }} /></span>
                      <small>{m.requests.toLocaleString()} 次 · {formatTokensCompact(m.tokens)} tokens · {formatCny(m.cost)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel title={t("recentRequests")} aside={<span>最近 {data.recent.length} 条</span>} flush>
            {data.recent.length === 0 ? (
              <EmptyState compact title="暂无最近请求" message="首次调用成功后会显示状态、Token 和费用。" />
            ) : (
              <div className="nfc-table-wrap">
                <table className="nfc-table">
                  <thead>
                    <tr>
                      <th>{t("txTime")}</th>
                      <th>{t("model")}</th>
                      <th>状态</th>
                      <th className="num">{t("tokens")}</th>
                      <th>缓存</th>
                      <th className="num">延迟</th>
                      <th className="num">{t("cost")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r, i) => (
                      <tr key={i}>
                        <td className="time">{formatConsoleTime(r.time, true)}</td>
                        <td>
                          <code className="nfc-code">{r.model}</code>
                          {r.discount_rate !== undefined && r.discount_rate < 1 && <> <Tag tone="warning">{Math.round(r.discount_rate * 100) / 10} 折</Tag></>}
                        </td>
                        <td>{isSuccess(r.status) ? <Tag tone="positive">成功</Tag> : <Tag tone="negative">失败</Tag>}</td>
                        <td className="num">{r.tokens.toLocaleString()}</td>
                        <td className="nfc-muted" style={{ fontSize: 12 }}>
                          {(r.cached_tokens ?? 0) > 0 ? `命中 ${r.cached_tokens!.toLocaleString()}（${Math.round((r.cached_tokens! / Math.max(r.tokens, 1)) * 100)}%）` : (r.cache_creation_tokens ?? 0) > 0 ? `写入 ${r.cache_creation_tokens!.toLocaleString()}` : "—"}
                        </td>
                        <td className="num nfc-muted">{r.latency}s</td>
                        <td className="num">{formatCnyPrecise(r.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title={t("dailyCost")} flush>
            {data.daily.length === 0 ? (
              <EmptyState compact title="暂无每日费用" message="账单产生后可在这里按天核对。" />
            ) : (
              <table className="nfc-table">
                <thead>
                  <tr><th>{t("date")}</th><th className="num">{t("requests")}</th><th className="num">{t("tokens")}</th><th className="num">{t("cost")}</th></tr>
                </thead>
                <tbody>
                  {[...data.daily].reverse().map((d) => (
                    <tr key={d.date}>
                      <td className="time">{d.date}</td>
                      <td className="num">{d.requests.toLocaleString()}</td>
                      <td className="num nfc-muted">{formatTokensCompact(d.tokens)}</td>
                      <td className="num">{formatCnyPrecise(d.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
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
  const detailReqRef = useRef(0);

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
    const reqId = ++detailReqRef.current;
    setExpandedId(logId);
    setDetailLoading(true);
    setDetail(null);
    setDetailNote("");
    const res = await fetchAPI(`/api/usage/logs/${logId}/detail`, { headers: authHeaders() });
    if (reqId !== detailReqRef.current) return; // 已被更新的点击取代，丢弃过期结果
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
      <Panel title="搜索请求日志" aside="写入后约 1–2 分钟可查询详情；不填条件直接搜索可查看最近 50 条">
        <div className="nfc-log-form">
          <label className="nfc-field">Request ID
            <input className="input" value={searchLogId} onChange={(e) => setSearchLogId(e.target.value)} placeholder="响应里的 id" />
          </label>
          <label className="nfc-field">模型
            <input className="input" value={searchModel} onChange={(e) => setSearchModel(e.target.value)} placeholder="如 qwen3.8-max" />
          </label>
          <label className="nfc-field">开始时间
            <input className="input" type="datetime-local" value={searchFrom} onChange={(e) => setSearchFrom(e.target.value)} />
          </label>
          <label className="nfc-field">结束时间
            <input className="input" type="datetime-local" value={searchTo} onChange={(e) => setSearchTo(e.target.value)} />
          </label>
          <button className="btn-primary" onClick={handleSearch} disabled={loading}>{loading ? "搜索中…" : "搜索"}</button>
        </div>
      </Panel>

      {results.length > 0 && (
        <Panel title="查询结果" aside={<span>{results.length} 条 · 点击行查看请求与响应</span>} flush>
          <div className="nfc-table-wrap">
            <table className="nfc-table">
              <thead>
                <tr><th>Request ID</th><th>模型</th><th>状态</th><th className="num">Tokens</th><th className="num">费用</th><th>时间</th></tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <Fragment key={r.log_id}>
                    <tr
                      className="nfc-row-button"
                      role="button"
                      tabIndex={0}
                      aria-expanded={expandedId === r.log_id}
                      onClick={() => r.log_id && loadDetail(r.log_id)}
                      onKeyDown={(event) => {
                        if ((event.key === "Enter" || event.key === " ") && r.log_id) {
                          event.preventDefault();
                          loadDetail(r.log_id);
                        }
                      }}
                    >
                      <td><span className="nfc-mono" style={{ color: "var(--nf-accent)", fontSize: 12 }}>{r.log_id?.slice(0, 13)}…</span></td>
                      <td><code className="nfc-code">{r.model}</code></td>
                      <td>{r.status === "success" ? <Tag tone="positive">成功</Tag> : <Tag tone="negative">失败</Tag>}</td>
                      <td className="num">{r.total_tokens?.toLocaleString()}</td>
                      <td className="num">{formatCnyPrecise(Number(r.cost))}</td>
                      <td className="time">{formatConsoleTime(r.time, true)}</td>
                    </tr>
                    {expandedId === r.log_id && (
                      <tr className="nfc-log-detail">
                        <td colSpan={6}>
                          {detailLoading ? (
                            <span className="nfc-faint">加载中…</span>
                          ) : detail ? (
                            <div className="nfc-log-panes">
                              <div><span>REQUEST</span><pre>{formatJson(detail.request)}</pre></div>
                              <div><span>RESPONSE</span><pre>{formatJson(detail.response)}</pre></div>
                            </div>
                          ) : (
                            <span className="nfc-faint">{detailNote || "暂无详情数据"}</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
