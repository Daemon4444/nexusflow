"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import UserLayout from "@/components/UserLayout";
import FirstRunPanel from "@/components/FirstRunPanel";
import { EmptyState, ErrorState, LoadingState } from "@/components/AppState";
import { authHeaders, useAuth } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import { getFirstRunState } from "@/lib/firstRun";
import { formatContextLength, formatModelPrice, getRecommendedModels, ModelSummary } from "@/lib/models";
import { formatCny, formatCnyPrecise } from "@/lib/money";

interface ApiKeyInfo {
  id: string;
  name: string;
  key: string;
  usageCount?: number;
  lastUsed?: string | null;
}

interface BillingSummary {
  balance: number;
  totalConsumption: number;
  totalCalls: number;
}

interface RecentUsage {
  time?: string;
  model: string;
  tokens: number;
  cost: number;
  status: string;
  latency?: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [recent, setRecent] = useState<RecentUsage[]>([]);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      const [keyRes, billingRes, recentRes, modelsRes] = await Promise.all([
        fetchAPI("/api/keys", { headers, signal }),
        fetchAPI("/api/billing/summary", { headers, signal }),
        fetchAPI("/api/usage/recent", { headers, signal }),
        fetchAPI("/api/models", { signal }),
      ]);

      if (!keyRes.success && !billingRes.success && !modelsRes.success) {
        throw new Error(keyRes.message || billingRes.message || modelsRes.message || "控制台数据加载失败");
      }

      setKeys(keyRes.success ? keyRes.data || [] : []);
      setSummary(billingRes.success ? billingRes.data : null);
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
  const firstRun = getFirstRunState({
    apiKeyCount: keys.length,
    balance: summary?.balance ?? user?.balance ?? 0,
    recentUsageCount: recent.length,
  });

  return (
    <UserLayout wide>
      <div className="usr-page-header" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <h1>控制台</h1>
          <p>完成首次 API 调用，之后在这里查看 Key、余额、模型和用量。</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn-secondary" href="/models">浏览模型</Link>
          <Link className="btn-primary" href="/keys">创建 Key</Link>
        </div>
      </div>

      {loading ? (
        <LoadingState title="正在加载控制台" />
      ) : error ? (
        <ErrorState title="控制台加载失败" message={error} onAction={loadDashboard} />
      ) : (
        <>
          <div className="usr-metric-grid">
            <div className="usr-metric with-icon metric-teal">
              <div className="usr-metric-icon tint-teal">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              </div>
              <div className="usr-metric-body">
                <div className="usr-metric-label">余额</div>
                <div className="usr-metric-value">{formatCny(summary?.balance ?? user?.balance ?? 0)}</div>
                <div className="usr-metric-sub">Playground 和 API 调用共用账户余额</div>
              </div>
            </div>
            <div className="usr-metric with-icon metric-blue">
              <div className="usr-metric-icon tint-orange">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              </div>
              <div className="usr-metric-body">
                <div className="usr-metric-label">API Keys</div>
                <div className="usr-metric-value">{keys.length}</div>
                <div className="usr-metric-sub">{keys[0] ? `最近 Key: ${keys[0].name}` : "还没有创建 Key"}</div>
              </div>
            </div>
            <div className="usr-metric with-icon metric-green">
              <div className="usr-metric-icon tint-green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <div className="usr-metric-body">
                <div className="usr-metric-label">总调用</div>
                <div className="usr-metric-value">{(summary?.totalCalls || 0).toLocaleString()}</div>
                <div className="usr-metric-sub">累计消耗 {formatCnyPrecise(summary?.totalConsumption || 0)}</div>
              </div>
            </div>
            <div className="usr-metric with-icon metric-purple">
              <div className="usr-metric-icon tint-purple">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
              </div>
              <div className="usr-metric-body">
                <div className="usr-metric-label">模型目录</div>
                <div className="usr-metric-value">{models.length}</div>
                <div className="usr-metric-sub">文本、推理、视觉、图像、视频</div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: 18, alignItems: "start" }} className="dashboard-grid">
            <FirstRunPanel state={firstRun} apiKey={keys[0]?.key} modelId={defaultModel} />

            <section className="usr-section">
              <div className="usr-section-header">
                <div>
                  <h3>推荐模型</h3>
                  <p>按常用开发场景优先展示。</p>
                </div>
                <Link href="/models" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>全部模型</Link>
              </div>
              <div className="usr-section-body" style={{ display: "grid", gap: 10 }}>
                {recommendedModels.map((model) => (
                  <Link key={model.id} href={`/models/${encodeURIComponent(model.id)}`} className="dashboard-model">
                    <div>
                      <strong>{model.name}</strong>
                      <span>{model.provider} · {model.category}</span>
                    </div>
                    <div>
                      <code>{formatContextLength(model.contextLength)}</code>
                      <small>{formatModelPrice(model)}</small>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <section className="usr-section">
            <div className="usr-section-header">
              <div>
                <h3>最近请求</h3>
                <p>第一次调用成功后，这里会显示成本、Token 和状态。</p>
              </div>
              <Link href="/activity" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>查看详情</Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState compact title="还没有调用记录" message="复制示例或进入 Playground 完成一次请求后，这里会自动刷新。" actionLabel="去 Playground" onAction={() => { window.location.href = `/playground?model=${encodeURIComponent(defaultModel)}`; }} />
            ) : (
              <div>
                <div className="table-row dashboard-recent-head">
                  <span>时间</span>
                  <span>模型</span>
                  <span>Tokens</span>
                  <span>费用</span>
                  <span>状态</span>
                </div>
                {recent.slice(0, 8).map((item, index) => (
                  <div key={`${item.model}-${index}`} className="table-row dashboard-recent-row">
                    <span>{item.time || "-"}</span>
                    <span>{item.model}</span>
                    <span>{item.tokens?.toLocaleString?.() || 0}</span>
                    <span>{formatCnyPrecise(item.cost || 0)}</span>
                    <span className={item.status === "success" || item.status === "成功" ? "badge badge-success" : "badge badge-danger"}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </UserLayout>
  );
}
