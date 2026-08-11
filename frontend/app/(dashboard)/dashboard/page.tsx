"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import UserLayout from "@/components/UserLayout";
import { EmptyState, ErrorState, LoadingState } from "@/components/AppState";
import { authHeaders, useAuth } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import { formatContextLength, formatModelPrice, getRecommendedModels, ModelSummary } from "@/lib/models";
import { formatCny, formatCnyPrecise } from "@/lib/money";

interface ApiKeyInfo {
  id: string;
  name: string;
  key: string;
}

interface BillingSummary {
  balance: number;
  creditBalance: number;
  availableBalance: number;
  totalConsumption: number;
  totalCalls: number;
}

interface UsageOverview {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  activeModels: number;
  avgLatency: number;
  successRate: number | null;
}

interface DailyUsage {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
}

interface RecentUsage {
  time?: string;
  model: string;
  tokens: number;
  cost: number;
  status: string;
  latency?: number;
}

const emptyOverview: UsageOverview = {
  totalRequests: 0,
  totalTokens: 0,
  totalCost: 0,
  activeModels: 0,
  avgLatency: 0,
  successRate: null,
};

function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const requests = payload.find((item: any) => item.dataKey === "requests")?.value || 0;
  const cost = payload.find((item: any) => item.dataKey === "cost")?.value || 0;
  return (
    <div className="quiet-chart-tooltip">
      <strong>{label}</strong>
      <span>{Number(requests).toLocaleString()} 次请求</span>
      <span>{formatCnyPrecise(Number(cost))}</span>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [overview, setOverview] = useState<UsageOverview>(emptyOverview);
  const [daily, setDaily] = useState<DailyUsage[]>([]);
  const [recent, setRecent] = useState<RecentUsage[]>([]);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    loadDashboard(controller.signal);
    return () => controller.abort();
  }, [user]);

  async function loadDashboard(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const headers = authHeaders();
      const [keyRes, billingRes, overviewRes, dailyRes, recentRes, modelsRes] = await Promise.all([
        fetchAPI("/api/keys", { headers, signal }),
        fetchAPI("/api/billing/summary", { headers, signal }),
        fetchAPI("/api/usage/overview", { headers, signal }),
        fetchAPI("/api/usage/daily", { headers, signal }),
        fetchAPI("/api/usage/recent?limit=8", { headers, signal }),
        fetchAPI("/api/models", { signal }),
      ]);

      const results = [keyRes, billingRes, overviewRes, dailyRes, recentRes, modelsRes];
      if (!results.some((result) => result.success)) {
        throw new Error("控制台数据加载失败");
      }
      const failedCount = results.filter((result) => !result.success).length;
      if (failedCount > 0) setWarning(`${failedCount} 项数据暂未加载，页面已保留可用信息。`);

      setKeys(keyRes.success ? keyRes.data || [] : []);
      setSummary(billingRes.success ? billingRes.data : null);
      setOverview(overviewRes.success ? overviewRes.data : emptyOverview);
      setDaily(dailyRes.success ? dailyRes.data || [] : []);
      setRecent(recentRes.success ? recentRes.data || [] : []);
      setModels(modelsRes.success ? modelsRes.data || [] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "控制台数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  const recommendedModels = useMemo(() => getRecommendedModels(models, 5), [models]);
  const defaultModel = recommendedModels[0]?.id || models[0]?.id || "qwen-plus";
  const balance = summary?.availableBalance ?? ((user?.balance ?? 0) + (user?.creditBalance ?? 0));
  const today = daily[daily.length - 1] || { requests: 0, cost: 0, tokens: 0, date: "" };
  const code = `curl -X POST https://nexusflow.hk/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUSFLOW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${defaultModel}","messages":[{"role":"user","content":"Say hello"}]}'`;

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const steps = [
    {
      label: "创建 API Key",
      help: keys.length > 0 ? "API Key 已创建；完整密钥只在创建时显示" : "为第一次请求创建安全凭据",
      done: keys.length > 0,
      href: "/keys",
      action: keys.length > 0 ? "查看密钥" : "创建密钥",
    },
    {
      label: "充值余额",
      help: balance > 0 ? "工作区已有可用额度" : "调用付费模型前请先充值",
      done: balance > 0,
      href: "/billing",
      action: "前往充值",
    },
    {
      label: "发起首次请求",
      help: recent.length > 0 ? "API 连接已验证" : "设置 NEXUSFLOW_API_KEY 后运行下方命令",
      done: recent.length > 0,
    },
    {
      label: "查看用量",
      help: "追踪 Token、延迟、费用和错误",
      done: recent.length > 0,
      href: "/activity",
      action: "查看活动",
    },
  ];

  return (
    <UserLayout wide>
      <div className="quiet-console-page">
        <section className="quiet-page-heading">
          <div>
            <h1>控制台</h1>
            <p>统一查看工作区的模型流量、费用与服务质量。</p>
          </div>
          <div className="quiet-heading-actions">
            <Link className="quiet-button quiet-button-primary" href="/keys">＋ 创建 API Key</Link>
            <Link className="quiet-button" href={`/playground?model=${encodeURIComponent(defaultModel)}`}>打开 Playground ↗</Link>
          </div>
        </section>

        {loading ? (
          <LoadingState title="正在加载控制台" />
        ) : error ? (
          <ErrorState title="控制台加载失败" message={error} onAction={loadDashboard} />
        ) : (
          <>
            {warning && <div className="nf-inline-warning" role="status">{warning}</div>}
            <section className="quiet-kpi-band" aria-label="Workspace metrics">
              <div className="quiet-kpi">
                <span>可用余额</span>
                <strong>{formatCny(balance)}</strong>
                <small>工作区可用额度</small>
              </div>
              <div className="quiet-kpi">
                <span>今日请求</span>
                <strong>{today.requests.toLocaleString()}</strong>
                <small>累计 {overview.totalRequests.toLocaleString()} 次</small>
              </div>
              <div className="quiet-kpi">
                <span>今日费用</span>
                <strong>{formatCny(today.cost)}</strong>
                <small>累计 {formatCnyPrecise(overview.totalCost)}</small>
              </div>
              <div className="quiet-kpi">
                <span>成功率</span>
                <strong>{overview.totalRequests > 0 && overview.successRate !== null ? `${overview.successRate.toFixed(1)}%` : "—"}</strong>
                <small>{overview.totalRequests > 0 ? `平均延迟 ${overview.avgLatency.toLocaleString()}s` : "产生请求后开始统计"}</small>
              </div>
            </section>

            <section className="quiet-primary-panel">
              <div className="quiet-chart-panel">
                <div className="quiet-panel-title">
                  <div>
                    <h2>请求与费用</h2>
                    <div className="quiet-legend">
                      <span><i className="quiet-line-key" /> 请求</span>
                      <span><i className="quiet-bar-key" /> 费用（¥）</span>
                    </div>
                  </div>
                  <span className="quiet-range-label">最近 7 天</span>
                </div>

                {daily.length === 0 ? (
                  <EmptyState compact title="还没有用量趋势" message="完成第一次 API 调用后，这里会显示真实请求和费用。" />
                ) : (
                  <div className="quiet-chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={daily} margin={{ top: 14, right: 4, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="quietRequestFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0f9488" stopOpacity={0.14} />
                            <stop offset="100%" stopColor="#0f9488" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="#e6e9e7" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#777d7a", fontSize: 11 }} />
                        <YAxis yAxisId="requests" tickLine={false} axisLine={false} tick={{ fill: "#777d7a", fontSize: 11 }} />
                        <YAxis yAxisId="cost" orientation="right" tickLine={false} axisLine={false} tick={{ fill: "#777d7a", fontSize: 11 }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar yAxisId="cost" dataKey="cost" fill="#d4efec" radius={[2, 2, 0, 0]} barSize={18} isAnimationActive={false} />
                        <Area yAxisId="requests" type="monotone" dataKey="requests" stroke="#0f9488" strokeWidth={2.2} fill="url(#quietRequestFill)" dot={{ r: 2.5, fill: "#0f9488", strokeWidth: 0 }} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="quiet-chart-summary">
                  <div><span>累计请求</span><strong>{overview.totalRequests.toLocaleString()}</strong></div>
                  <div><span>累计费用</span><strong>{formatCnyPrecise(overview.totalCost)}</strong></div>
                  <div><span>平均延迟</span><strong>{overview.totalRequests > 0 ? `${overview.avgLatency.toLocaleString()}s` : "—"}</strong></div>
                  <div><span>Token 用量</span><strong>{formatTokens(overview.totalTokens)}</strong></div>
                </div>
              </div>

              <div className="quiet-start-panel">
                <h2>快速开始</h2>
                {steps.map((step, index) => (
                  <div className={`quiet-step ${step.done ? "done" : ""}`} key={step.label}>
                    <span>{step.done ? "✓" : index + 1}</span>
                    <div>
                      <strong>{step.label}</strong>
                      <small>{step.help}</small>
                    </div>
                    {step.href && <Link href={step.href}>{step.action}</Link>}
                  </div>
                ))}
                <div className="quiet-code-sample">
                  <code>{code}</code>
                  <button onClick={copyCode} aria-label="复制 cURL">{copied ? "已复制" : "复制"}</button>
                </div>
              </div>
            </section>

            <section className="quiet-data-panel">
              <div className="quiet-data-half">
                <div className="quiet-table-title">
                  <h2>最近请求</h2>
                  <Link href="/activity">查看全部</Link>
                </div>
                {recent.length === 0 ? (
                  <EmptyState compact title="还没有调用记录" message="完成一次请求后，这里会显示最新状态。" />
                ) : (
                  <div className="quiet-table-scroll">
                    <table>
                      <thead>
                        <tr><th>时间</th><th>模型</th><th>Token</th><th>延迟</th><th>费用</th><th>状态</th></tr>
                      </thead>
                      <tbody>
                        {recent.slice(0, 6).map((item, index) => (
                          <tr key={`${item.time}-${item.model}-${index}`}>
                            <td>{item.time || "-"}</td>
                            <td className="quiet-model-id">{item.model}</td>
                            <td>{item.tokens?.toLocaleString?.() || 0}</td>
                            <td>{item.latency ? `${item.latency}s` : "-"}</td>
                            <td>{formatCnyPrecise(item.cost || 0)}</td>
                            <td><span className={item.status === "成功" || item.status === "success" ? "quiet-status success" : "quiet-status error"}><i />{item.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="quiet-data-half">
                <div className="quiet-table-title">
                  <h2>推荐模型</h2>
                  <Link href="/models">查看全部</Link>
                </div>
                {recommendedModels.length === 0 ? (
                  <EmptyState compact title="模型目录暂不可用" />
                ) : (
                  <div className="quiet-table-scroll">
                    <table>
                      <thead>
                        <tr><th>模型</th><th>服务商</th><th>上下文</th><th>价格</th></tr>
                      </thead>
                      <tbody>
                        {recommendedModels.map((model) => (
                          <tr key={model.id}>
                            <td><Link href={`/models/${encodeURIComponent(model.id)}`}>{model.name}</Link></td>
                            <td>{model.provider}</td>
                            <td>{formatContextLength(model.contextLength)}</td>
                            <td>{formatModelPrice(model)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </UserLayout>
  );
}
