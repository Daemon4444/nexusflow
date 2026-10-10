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
    successRate: number | null;
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
  const rest = rows.slice(5);
  const sum = (key: "requests" | "tokens" | "cost") => rest.reduce((total, row) => total + Number(row[key] || 0), 0);
  const totalRequests = rows.reduce((total, row) => total + row.requests, 0);
  const grouped = rows.length <= 6 ? rows : [...rows.slice(0, 5), { model: OTHER, requests: sum("requests"), tokens: sum("tokens"), cost: sum("cost"), percentage: 0 }];
  // Recompute after grouping: summing independently rounded API percentages
  // compounds rounding error as the number of models grows.
  return grouped.map(row => ({ ...row, percentage: totalRequests > 0 ? Math.round(row.requests / totalRequests * 1000) / 10 : 0 }));
}

export default function ActivityPage() {
  const { t } = useI18n();
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [failedSections, setFailedSections] = useState<string[]>([]);

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
      const settled = await Promise.allSettled([
        fetchAPI("/api/usage/overview", { headers, signal }),
        fetchAPI("/api/usage/daily", { headers, signal }),
        fetchAPI("/api/usage/by-model", { headers, signal }),
        fetchAPI("/api/usage/recent?limit=50", { headers, signal }),
      ]);
      if (signal?.aborted) return;
      const results = settled.map(result => result.status === "fulfilled" ? result.value : { success: false });
      const [ovRes, dayRes, modelRes, recentRes] = results;
      setFailedSections(["用量统计", "每日用量", "模型分布", "最近请求"].filter((_, index) => !results[index].success));
      // Keep independent successful sections; unavailable sections must not look like zero usage.
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
  const modelDistribution = data ? topModels(data.byModel) : [];
  const largestModelShare = Math.max(...modelDistribution.map(model => model.percentage), 1);

  return (
    <UserLayout wide>
      <PageHeader
        title={t("activityTitle")}
        description={t("activityDesc")}
        actions={(
          <div className="nfc-seg" role="tablist" aria-label="视图">
            <button role="tab" aria-selected={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")}>用量概览</button>
            <button role="tab" aria-selected={activeTab === "logs"} onClick={() => setActiveTab("logs")}>请求日志</button>
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
          {failedSections.length > 0 && <div className="nf-inline-warning" role="status">{failedSections.join("、")}暂未加载。<button className="btn-secondary" onClick={() => load()}>重试</button></div>}
          {failedSections.includes("用量统计") ? <ErrorState compact title="用量统计暂不可用" onAction={() => load()} /> : <KpiBand items={[
            { label: t("totalRequests"), value: data.overview.totalRequests.toLocaleString(), hint: `已记录请求 · ${data.overview.activeModels} 个模型` },
            { label: t("totalTokens"), value: formatTokensCompact(data.overview.totalTokens), hint: data.overview.totalCachedTokens > 0 && data.overview.totalPromptTokens > 0 ? `缓存命中 ${((data.overview.totalCachedTokens / data.overview.totalPromptTokens) * 100).toFixed(1)}%` : "无缓存命中" },
            { label: t("totalCost"), value: formatCny(data.overview.totalCost), hint: "用量记录累计，账单以账本为准" },
            { label: t("avgLatency"), value: data.overview.totalRequests > 0 ? `${data.overview.avgLatency}s` : "—", hint: "端到端平均" },
            { label: t("successRate"), value: data.overview.totalRequests > 0 && data.overview.successRate !== null ? `${data.overview.successRate}%` : "—", hint: data.overview.totalRequests === 0 ? "尚无请求" : (data.overview.successRate ?? 0) < 95 ? "低于 95%，建议查看日志" : "运行正常" },
          ]} />}

          <div className="nfc-activity-grid">
            <Panel title={t("dailyReq7d")} aside={<span>请求数 · 费用</span>}>
              {failedSections.includes("每日用量") ? <ErrorState compact title="每日用量暂不可用" onAction={() => load()} /> : data.daily.length === 0 ? (
                <EmptyState compact title="最近 7 天还没有请求" message="完成一次 API 调用后，这里会显示每日请求趋势。" />
              ) : (
                <div className="nfc-bars">
                  {data.daily.map((d) => {
                    const maxReq = Math.max(...data.daily.map((x) => x.requests), 1);
                    return (
                      <div key={d.date} className="nfc-bar" title={`${d.date} · ${d.requests} 次 · ${formatCnyPrecise(d.cost)}`}>
                        <span className="nfc-bar-value">{d.requests.toLocaleString()}</span>
                        <span className="nfc-bar-fill" style={{ height: `${d.requests > 0 ? Math.max(4, (d.requests / maxReq) * 100) : 0}%` }} />
                        <span className="nfc-bar-label">{d.date}</span>
                        <span className="nfc-bar-sub">{formatCny(d.cost)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel title={t("modelDist")} aside={<span>按请求数</span>}>
              {failedSections.includes("模型分布") ? <ErrorState compact title="模型分布暂不可用" onAction={() => load()} /> : data.byModel.length === 0 ? (
                <EmptyState compact title="暂无模型分布" message="调用模型后将按费用和请求量展示分布。" />
              ) : (
                <ul className="nfc-share">
                  {modelDistribution.map((m) => (
                    <li key={m.model}>
                      <div>{m.model === OTHER ? <span className="nfc-muted">其他模型</span> : <code className="nfc-code">{m.model}</code>}<span className="nfc-mono">{m.percentage}%</span></div>
                      <span className="nfc-share-track"><span style={{ width: `${m.percentage * (100 / largestModelShare)}%` }} /></span>
                      <small>{m.requests.toLocaleString()} 次 · {formatTokensCompact(m.tokens)} tokens · {formatCny(m.cost)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel title={t("recentRequests")} aside={<span>最近 {data.recent.length} 条</span>} flush>
            {failedSections.includes("最近请求") ? <ErrorState compact title="最近请求暂不可用" onAction={() => load()} /> : data.recent.length === 0 ? (
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
            {failedSections.includes("每日用量") ? <ErrorState compact title="每日用量暂不可用" onAction={() => load()} /> : data.daily.length === 0 ? (
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
  const [searchError, setSearchError] = useState("");
  const [searched, setSearched] = useState(false);
  const [detailRetryable, setDetailRetryable] = useState(true);
  const searchReqRef = useRef(0);

  useEffect(() => () => { searchReqRef.current++; detailReqRef.current++; }, []);

  async function handleSearch(event?: React.FormEvent) {
    event?.preventDefault();
    const reqId = ++searchReqRef.current;
    ++detailReqRef.current;
    setExpandedId(null);
    setResults([]);
    setSearchError("");
    setSearched(false);
    setLoading(true);
    try {
      const from = searchFrom ? new Date(searchFrom) : null;
      const to = searchTo ? new Date(searchTo) : null;
      if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime())) || (from && to && from > to)) {
        setSearchError("请输入有效时间，且开始时间不得晚于结束时间。");
        return;
      }
      const params = new URLSearchParams({ limit: "50" });
      if (searchLogId.trim()) params.set("log_id", searchLogId.trim());
      if (searchModel.trim()) params.set("model", searchModel.trim());
      if (from) params.set("from", from.toISOString());
      if (to) params.set("to", to.toISOString());
      const res = await fetchAPI(`/api/usage/logs/search?${params}`, { headers: authHeaders() });
      if (reqId !== searchReqRef.current) return;
      if (res.success) {
        setResults(res.data || []);
        setSearched(true);
      } else {
        setSearchError(res.message || "查询失败，请稍后重试");
      }
    } catch {
      if (reqId === searchReqRef.current) setSearchError("无法连接日志服务，请稍后重试");
    } finally {
      if (reqId === searchReqRef.current) setLoading(false);
    }
  }

  async function loadDetail(logId: string, retry = false) {
    if (expandedId === logId && !retry) { ++detailReqRef.current; setExpandedId(null); return; }
    const reqId = ++detailReqRef.current;
    setExpandedId(logId);
    setDetailLoading(true);
    setDetail(null);
    setDetailNote("");
    setDetailRetryable(true);
    try {
      const res = await fetchAPI(`/api/usage/logs/${encodeURIComponent(logId)}/detail`, { headers: authHeaders() });
      if (reqId !== detailReqRef.current) return;
      if (res.success) {
        setDetail(res.data);
        if (res.note) setDetailNote(res.note);
      } else {
        setDetailNote(res.message || "查询失败");
        setDetailRetryable(![401, 403, 404].includes(res.status));
      }
    } catch {
      if (reqId === detailReqRef.current) setDetailNote("无法连接日志服务，请稍后重试");
    } finally {
      if (reqId === detailReqRef.current) setDetailLoading(false);
    }
  }

  function formatJson(s: string | null | undefined): string {
    if (!s) return "";
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
  }

  return (
    <>
      <Panel title="搜索请求日志" aside="写入后约 1–2 分钟可查询详情；不填条件直接搜索可查看最近 50 条">
        <form className="nfc-log-form" onSubmit={handleSearch}>
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
          <button className="btn-primary" type="submit" disabled={loading}>{loading ? "搜索中…" : "搜索"}</button>
        </form>
        <p className="nfc-faint">时间筛选与日志时间使用浏览器本地时区；每日用量按北京时间统计。</p>
        {searchError && <p role="alert">{searchError}</p>}
        {searched && results.length === 0 && <EmptyState compact title="没有匹配的请求" message="可调整模型、Request ID 或时间范围后重新搜索。" />}
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
                            <div role="status"><span className="nfc-faint">{detailNote || "暂无详情数据"}</span> {detailRetryable && <button className="btn-secondary" onClick={() => loadDetail(r.log_id, true)}>重试</button>}</div>
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
