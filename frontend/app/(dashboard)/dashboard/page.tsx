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
  totalConsumption: number;
  totalCalls: number;
}

interface UsageOverview {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  activeModels: number;
  avgLatency: number;
  successRate: number;
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
  successRate: 100,
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
      <span>{Number(requests).toLocaleString()} requests</span>
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

      if (![keyRes, billingRes, overviewRes, dailyRes, recentRes, modelsRes].some((result) => result.success)) {
        throw new Error("控制台数据加载失败");
      }

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
  const balance = summary?.balance ?? user?.balance ?? 0;
  const today = daily[daily.length - 1] || { requests: 0, cost: 0, tokens: 0, date: "" };
  const code = `curl -X POST https://nexusflow.hk/v1/chat/completions \\
  -H "Authorization: Bearer ${keys[0]?.key || "YOUR_API_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${defaultModel}","messages":[{"role":"user","content":"Say hello"}]}'`;

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const steps = [
    {
      label: "Create API key",
      help: keys.length > 0 ? "Your key is ready to use" : "Create a key for your first request",
      done: keys.length > 0,
      href: "/keys",
      action: keys.length > 0 ? "View keys" : "Create key",
    },
    {
      label: "Add credit",
      help: balance > 0 ? "Your workspace has available credit" : "Top up before making paid requests",
      done: balance > 0,
      href: "/billing",
      action: "Add credit",
    },
    {
      label: "Make your first request",
      help: recent.length > 0 ? "Your API connection is working" : "Send a request to NexusFlow API",
      done: recent.length > 0,
    },
    {
      label: "Inspect usage",
      help: "Monitor tokens, latency, cost, and errors",
      done: recent.length > 0,
      href: "/activity",
      action: "View activity",
    },
  ];

  return (
    <UserLayout wide>
      <div className="quiet-console-page">
        <section className="quiet-page-heading">
          <div>
            <h1>Console</h1>
            <p>Monitor model traffic, cost, and reliability across your workspace.</p>
          </div>
          <div className="quiet-heading-actions">
            <Link className="quiet-button quiet-button-primary" href="/keys">＋ Create API key</Link>
            <Link className="quiet-button" href={`/playground?model=${encodeURIComponent(defaultModel)}`}>Open Playground ↗</Link>
          </div>
        </section>

        {loading ? (
          <LoadingState title="正在加载控制台" />
        ) : error ? (
          <ErrorState title="控制台加载失败" message={error} onAction={loadDashboard} />
        ) : (
          <>
            <section className="quiet-kpi-band" aria-label="Workspace metrics">
              <div className="quiet-kpi">
                <span>Balance</span>
                <strong>{formatCny(balance)}</strong>
                <small>Available workspace credit</small>
              </div>
              <div className="quiet-kpi">
                <span>Requests today</span>
                <strong>{today.requests.toLocaleString()}</strong>
                <small>{overview.totalRequests.toLocaleString()} all time</small>
              </div>
              <div className="quiet-kpi">
                <span>Spend today</span>
                <strong>{formatCny(today.cost)}</strong>
                <small>{formatCnyPrecise(overview.totalCost)} all time</small>
              </div>
              <div className="quiet-kpi">
                <span>Success</span>
                <strong>{overview.successRate.toFixed(1)}%</strong>
                <small>{overview.avgLatency.toLocaleString()}s average latency</small>
              </div>
            </section>

            <section className="quiet-primary-panel">
              <div className="quiet-chart-panel">
                <div className="quiet-panel-title">
                  <div>
                    <h2>Requests & cost</h2>
                    <div className="quiet-legend">
                      <span><i className="quiet-line-key" /> Requests</span>
                      <span><i className="quiet-bar-key" /> Cost (¥)</span>
                    </div>
                  </div>
                  <span className="quiet-range-label">Last 7 days</span>
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
                  <div><span>Total requests</span><strong>{overview.totalRequests.toLocaleString()}</strong></div>
                  <div><span>Total spend</span><strong>{formatCnyPrecise(overview.totalCost)}</strong></div>
                  <div><span>Avg latency</span><strong>{overview.avgLatency.toLocaleString()}s</strong></div>
                  <div><span>Tokens used</span><strong>{formatTokens(overview.totalTokens)}</strong></div>
                </div>
              </div>

              <div className="quiet-start-panel">
                <h2>Start here</h2>
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
                  <button onClick={copyCode} aria-label="Copy cURL">{copied ? "✓" : "Copy"}</button>
                </div>
              </div>
            </section>

            <section className="quiet-data-panel">
              <div className="quiet-data-half">
                <div className="quiet-table-title">
                  <h2>Recent requests</h2>
                  <Link href="/activity">View all activity</Link>
                </div>
                {recent.length === 0 ? (
                  <EmptyState compact title="还没有调用记录" message="完成一次请求后，这里会显示最新状态。" />
                ) : (
                  <div className="quiet-table-scroll">
                    <table>
                      <thead>
                        <tr><th>Time</th><th>Model</th><th>Tokens</th><th>Latency</th><th>Cost</th><th>Status</th></tr>
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
                  <h2>Recommended models</h2>
                  <Link href="/models">View all models</Link>
                </div>
                {recommendedModels.length === 0 ? (
                  <EmptyState compact title="模型目录暂不可用" />
                ) : (
                  <div className="quiet-table-scroll">
                    <table>
                      <thead>
                        <tr><th>Model</th><th>Provider</th><th>Context</th><th>Price</th></tr>
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
