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
        throw new Error(keyRes.message || billingRes.message || modelsRes.message || "Failed to load dashboard data");
      }

      setKeys(keyRes.success ? keyRes.data || [] : []);
      setSummary(billingRes.success ? billingRes.data : null);
      setRecent(recentRes.success ? recentRes.data || [] : []);
      setModels(modelsRes.success ? modelsRes.data || [] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
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
          <h1>Console</h1>
          <p>Make your first API call, then come back here for keys, balance, models and usage.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn-secondary" href="/models">Browse models</Link>
          <Link className="btn-primary" href="/keys">Create Key</Link>
        </div>
      </div>

      {loading ? (
        <LoadingState title="Loading dashboard" />
      ) : error ? (
        <ErrorState title="Failed to load dashboard" message={error} onAction={loadDashboard} />
      ) : (
        <>
          <div className="usr-metric-grid">
            <div className="usr-metric with-icon metric-teal">
              <div className="usr-metric-icon tint-teal">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              </div>
              <div className="usr-metric-body">
                <div className="usr-metric-label">Balance</div>
                <div className="usr-metric-value">{formatCny(summary?.balance ?? user?.balance ?? 0)}</div>
                <div className="usr-metric-sub">Playground and API calls share the same account balance</div>
              </div>
            </div>
            <div className="usr-metric with-icon metric-blue">
              <div className="usr-metric-icon tint-orange">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              </div>
              <div className="usr-metric-body">
                <div className="usr-metric-label">API Keys</div>
                <div className="usr-metric-value">{keys.length}</div>
                <div className="usr-metric-sub">{keys[0] ? `Latest key: ${keys[0].name}` : "No keys created yet"}</div>
              </div>
            </div>
            <div className="usr-metric with-icon metric-green">
              <div className="usr-metric-icon tint-green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <div className="usr-metric-body">
                <div className="usr-metric-label">Total calls</div>
                <div className="usr-metric-value">{(summary?.totalCalls || 0).toLocaleString()}</div>
                <div className="usr-metric-sub">Total spent {formatCnyPrecise(summary?.totalConsumption || 0)}</div>
              </div>
            </div>
            <div className="usr-metric with-icon metric-purple">
              <div className="usr-metric-icon tint-purple">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
              </div>
              <div className="usr-metric-body">
                <div className="usr-metric-label">Model catalog</div>
                <div className="usr-metric-value">{models.length}</div>
                <div className="usr-metric-sub">Text, reasoning, vision, image, video</div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: 18, alignItems: "start" }} className="dashboard-grid">
            <FirstRunPanel state={firstRun} apiKey={keys[0]?.key} modelId={defaultModel} />

            <section className="usr-section">
              <div className="usr-section-header">
                <div>
                  <h3>Recommended models</h3>
                  <p>Prioritized for common development scenarios.</p>
                </div>
                <Link href="/models" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>All models</Link>
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
                <h3>Recent requests</h3>
                <p>Once your first call succeeds, cost, tokens and status appear here.</p>
              </div>
              <Link href="/activity" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>View details</Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState compact title="No call records yet" message="Copy the example or open Playground to make a request — this list refreshes automatically." actionLabel="Open Playground" onAction={() => { window.location.href = `/playground?model=${encodeURIComponent(defaultModel)}`; }} />
            ) : (
              <div>
                <div className="table-row dashboard-recent-head">
                  <span>Time</span>
                  <span>Model</span>
                  <span>Tokens</span>
                  <span>Cost</span>
                  <span>Status</span>
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
