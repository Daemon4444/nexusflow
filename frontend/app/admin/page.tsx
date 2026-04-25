"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { fetchAPI } from "@/lib/api";
import { authHeaders } from "@/lib/auth";

interface User {
  id: string;
  phone: string;
  email: string;
  nickname: string;
  balance: number;
  createdAt: string;
}

interface Provider {
  id: string;
  name: string;
  slug: string;
  description: string;
  website: string;
  apiBaseUrl: string;
  apiKeyMasked: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  approvedAt: string | null;
}

interface Model {
  id: string;
  providerId: string;
  modelId: string;
  name: string;
  description: string;
  category: string;
  status: string;
  createdAt: string;
}

interface Stats {
  providers: { draft: number; enabled: number; disabled: number };
  models: { draft: number; enabled: number; disabled: number };
}

interface Ticket {
  id: string;
  user_id: string;
  type: string;
  subject: string;
  description: string;
  model: string | null;
  requested_qpm: number | null;
  requested_tpm: number | null;
  status: string;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
}

interface CapacityRecord {
  modelId: string;
  rpmLimit: number;
  tpmLimit: number;
  dailyLimit: number;
  concurrentLimit: number;
  priority: number;
  weight: number;
  isEnabled: boolean;
}

interface HealthRecord {
  modelId: string;
  status: "healthy" | "degraded" | "down";
  consecutiveFailures: number;
  avgLatencyMs: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
}

interface ProviderDetail {
  provider: Provider;
  models: Array<{
    id: string;
    modelId: string;
    name: string;
    category: string;
    status: string;
    promptPrice: number;
    completionPrice: number;
  }>;
  capacity: CapacityRecord[];
  health: HealthRecord[];
}

interface MonitorOverview {
  generatedAt: string;
  providers: Array<{
    providerId: string;
    providerName: string;
    status: string;
    health: "healthy" | "degraded" | "down";
    modelCount: number;
    enabledRoutes: number;
    currentRpm: number;
    rpmLimit: number;
    currentTpm: number;
    tpmLimit: number;
    concurrentLimit: number;
    saturationRatio: number;
    fallbackState: "closed" | "monitoring" | "open";
    capacityHitRate: number;
    healthSummary: { healthy: number; degraded: number; down: number };
  }>;
  alerts: Array<{
    level: "critical" | "warning" | "info";
    title: string;
    detail: string;
    providerId: string;
  }>;
  totals: {
    providers: number;
    healthyProviders: number;
    degradedProviders: number;
    downProviders: number;
  };
}

interface ProviderRouteMetrics {
  modelId: string;
  name: string;
  status: string;
  routeEnabled: boolean;
  currentRpm: number;
  rpmLimit: number;
  currentTpm: number;
  tpmLimit: number;
  concurrentLimit: number;
  priority: number;
  weight: number;
  health: "healthy" | "degraded" | "down";
  fallbackState: "closed" | "monitoring" | "open";
  consecutiveFailures: number;
  avgLatencyMs: number;
  lastError: string | null;
  rpmSeries: number[];
  tpmSeries: number[];
  saturation: number;
}

type TabKey = "overview" | "users" | "providers" | "models" | "tickets";

const statusColors: Record<string, string> = {
  draft: "#d97706",
  enabled: "#10b981",
  disabled: "#ef4444",
  healthy: "#10b981",
  degraded: "#f59e0b",
  down: "#ef4444",
};

const statusLabels: Record<string, string> = {
  draft: "待配置",
  enabled: "已启用",
  disabled: "已停用",
};

const healthLabels: Record<string, string> = {
  healthy: "健康",
  degraded: "降级",
  down: "不可用",
};

const fallbackLabels: Record<string, string> = {
  closed: "正常",
  monitoring: "监控中",
  open: "已熔断",
};

const cardStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [providerDetail, setProviderDetail] = useState<ProviderDetail | null>(null);
  const [monitorOverview, setMonitorOverview] = useState<MonitorOverview | null>(null);
  const [providerRouteMetrics, setProviderRouteMetrics] = useState<ProviderRouteMetrics[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [providerForm, setProviderForm] = useState({
    name: "",
    description: "",
    website: "",
    apiBaseUrl: "",
    apiKey: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedProviderId && providers.length > 0) {
      setSelectedProviderId(providers[0].id);
    }
  }, [providers, selectedProviderId]);

  useEffect(() => {
    if (selectedProviderId) {
      loadProviderDetail(selectedProviderId);
    }
  }, [selectedProviderId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const headers = authHeaders();
      const [providersRes, modelsRes, statsRes, usersRes, ticketsRes] = await Promise.all([
        fetchAPI("/api/provider/admin/providers", { headers }),
        fetchAPI("/api/provider/admin/models", { headers }),
        fetchAPI("/api/provider/admin/stats", { headers }),
        fetchAPI("/api/admin/users", { headers }).catch(() => ({ success: false, data: [] })),
        fetchAPI("/api/tickets/admin/all", { headers }).catch(() => ({ success: false, data: [] })),
      ]);

      if (providersRes.success) setProviders(providersRes.data || []);
      if (modelsRes.success) setModels(modelsRes.data || []);
      if (statsRes.success) setStats(statsRes.data || null);
      if (usersRes.success) setUsers(usersRes.data || []);
      if (ticketsRes.success) setTickets(ticketsRes.data || []);
      const monitorRes = await fetchAPI("/api/provider-monitor/overview", { headers }).catch(() => ({ success: false }));
      if (monitorRes.success) setMonitorOverview(monitorRes.data || null);

      if (!providersRes.success || !modelsRes.success || !statsRes.success) {
        setError("管理员权限不足或后台接口未开放");
      }
    } catch (loadErr) {
      console.error("加载后台数据失败", loadErr);
      setError("加载后台数据失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadProviderDetail(providerId: string) {
    setDetailLoading(true);
    setNotice("");
    try {
      const res = await fetchAPI(`/api/provider/admin/providers/${providerId}`, { headers: authHeaders() });
      if (!res.success) {
        setProviderDetail(null);
        return;
      }
      const detail = res.data as ProviderDetail;
      setProviderDetail(detail);
      const monitorRes = await fetchAPI(`/api/provider-monitor/provider/${providerId}`, { headers: authHeaders() }).catch(() => ({ success: false }));
      if (monitorRes.success) {
        setProviderRouteMetrics(monitorRes.data?.routes || []);
      } else {
        setProviderRouteMetrics([]);
      }
      setProviderForm({
        name: detail.provider.name || "",
        description: detail.provider.description || "",
        website: detail.provider.website || "",
        apiBaseUrl: detail.provider.apiBaseUrl || "",
        apiKey: "",
        contactName: detail.provider.contactName || "",
        contactEmail: detail.provider.contactEmail || "",
        contactPhone: detail.provider.contactPhone || "",
      });
    } catch (detailErr) {
      console.error("加载渠道详情失败", detailErr);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleApproveProvider(id: string) {
    const res = await fetchAPI(`/api/provider/admin/providers/${id}/enable`, { method: "POST", headers: authHeaders() });
    if (res.success) {
      setNotice("渠道已启用");
      loadData();
      if (selectedProviderId === id) loadProviderDetail(id);
    }
  }

  async function handleRejectProvider(id: string) {
    const reason = prompt("请输入停用备注（可选）：");
    const res = await fetchAPI(`/api/provider/admin/providers/${id}/disable`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason }),
    });
    if (res.success) {
      setNotice("渠道已停用");
      loadData();
      if (selectedProviderId === id) loadProviderDetail(id);
    }
  }

  async function handleApproveModel(id: string) {
    const res = await fetchAPI(`/api/provider/admin/models/${id}/enable`, { method: "POST", headers: authHeaders() });
    if (res.success) loadData();
  }

  async function handleRejectModel(id: string) {
    const res = await fetchAPI(`/api/provider/admin/models/${id}/disable`, { method: "POST", headers: authHeaders() });
    if (res.success) loadData();
  }

  async function handleReplyTicket(id: string) {
    const reply = prompt("请输入管理员回复：");
    if (!reply) return;
    const status = prompt("请输入状态：open / in_progress / resolved / rejected", "in_progress");
    if (!status) return;
    const res = await fetchAPI(`/api/tickets/${id}/reply`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reply, status }),
    });
    if (res.success) loadData();
  }

  async function handleSaveProvider() {
    if (!selectedProviderId) return;
    setSavingProvider(true);
    setNotice("");
    try {
      const res = await fetchAPI(`/api/provider/admin/providers/${selectedProviderId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          name: providerForm.name,
          description: providerForm.description,
          website: providerForm.website,
          api_base_url: providerForm.apiBaseUrl,
          api_key: providerForm.apiKey || undefined,
          contact_name: providerForm.contactName,
          contact_email: providerForm.contactEmail,
          contact_phone: providerForm.contactPhone,
        }),
      });
      if (res.success) {
        setNotice("渠道配置已保存");
        setProviderForm((current) => ({ ...current, apiKey: "" }));
        await loadData();
        await loadProviderDetail(selectedProviderId);
      }
    } finally {
      setSavingProvider(false);
    }
  }

  async function handleSaveCapacity(modelId: string, current?: CapacityRecord) {
    if (!selectedProviderId) return;

    const rpm = prompt("RPM 限制", String(current?.rpmLimit ?? 60));
    if (rpm === null) return;
    const tpm = prompt("TPM 限制", String(current?.tpmLimit ?? 100000));
    if (tpm === null) return;
    const daily = prompt("每日请求上限", String(current?.dailyLimit ?? 10000));
    if (daily === null) return;
    const concurrent = prompt("并发上限", String(current?.concurrentLimit ?? 10));
    if (concurrent === null) return;
    const priority = prompt("优先级", String(current?.priority ?? 0));
    if (priority === null) return;
    const weight = prompt("权重", String(current?.weight ?? 100));
    if (weight === null) return;
    const enabled = prompt("是否启用：true / false", String(current?.isEnabled ?? true));
    if (enabled === null) return;

    const res = await fetchAPI(`/api/provider/${selectedProviderId}/capacity/${modelId}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        rpm_limit: Number(rpm),
        tpm_limit: Number(tpm),
        daily_limit: Number(daily),
        concurrent_limit: Number(concurrent),
        priority: Number(priority),
        weight: Number(weight),
        is_enabled: enabled === "true",
      }),
    });
    if (res.success) {
      setNotice(`模型 ${modelId} 的容量策略已更新`);
      loadProviderDetail(selectedProviderId);
    }
  }

  const filteredProviders = filter === "all" ? providers : providers.filter((provider) => provider.status === filter);
  const filteredModels = filter === "all" ? models : models.filter((model) => model.status === filter);
  const filteredTickets = filter === "all" ? tickets : tickets.filter((ticket) => ticket.status === filter);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "总览" },
    { key: "users", label: "用户管理" },
    { key: "providers", label: "渠道控制台" },
    { key: "models", label: "模型管理" },
    { key: "tickets", label: "工单中心" },
  ];

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) || null,
    [providers, selectedProviderId]
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)", background: "#f3f4f6" }}>
      <aside style={{ width: 236, background: "#0f172a", color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "24px 20px 18px" }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.3px" }}>nexusflow</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Operations Console</div>
        </div>
        <nav style={{ flex: 1, padding: "0 10px" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setFilter("all");
                setNotice("");
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "11px 14px",
                fontSize: 13,
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? "#fff" : "#94a3b8",
                background: activeTab === tab.key ? "#1e293b" : "transparent",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
                marginBottom: 4,
                fontFamily: "inherit",
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(148, 163, 184, 0.15)" }}>
          <Link href="/" style={{ fontSize: 12, color: "#94a3b8", textDecoration: "none" }}>
            &larr; 返回主站
          </Link>
        </div>
      </aside>

      <main style={{ flex: 1, padding: "28px 32px 36px", overflow: "auto" }}>
        {loading ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: 80, color: "#6b7280" }}>加载中...</div>
        ) : error ? (
          <div style={{ background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", padding: 16, borderRadius: 12 }}>{error}</div>
        ) : (
          <>
            {notice ? (
              <div style={{ marginBottom: 16, background: "#ecfdf5", border: "1px solid #86efac", color: "#166534", padding: 14, borderRadius: 12 }}>{notice}</div>
            ) : null}

            {activeTab === "overview" ? (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 20 }}>管理总览</h1>
                {stats ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
                    {[
                      { label: "待配置渠道", value: stats.providers.draft, color: "#d97706" },
                      { label: "已启用渠道", value: stats.providers.enabled, color: "#10b981" },
                      { label: "已停用渠道", value: stats.providers.disabled, color: "#ef4444" },
                      { label: "草稿模型", value: stats.models.draft, color: "#d97706" },
                      { label: "已启用模型", value: stats.models.enabled, color: "#10b981" },
                      { label: "已停用模型", value: stats.models.disabled, color: "#ef4444" },
                    ].map((item) => (
                      <div key={item.label} style={{ ...cardStyle, padding: 20 }}>
                        <div style={{ fontSize: 30, fontWeight: 700, color: item.color }}>{item.value}</div>
                        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {monitorOverview ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
                      {[
                        { label: "健康渠道", value: monitorOverview.totals.healthyProviders, color: "#10b981" },
                        { label: "降级渠道", value: monitorOverview.totals.degradedProviders, color: "#f59e0b" },
                        { label: "熔断渠道", value: monitorOverview.totals.downProviders, color: "#ef4444" },
                        { label: "监控时间", value: new Date(monitorOverview.generatedAt).toLocaleTimeString("zh-CN"), color: "#2563eb" },
                      ].map((item) => (
                        <div key={item.label} style={{ ...cardStyle, padding: 20 }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: item.color }}>{item.value}</div>
                          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16, marginBottom: 20 }}>
                      <div style={{ ...cardStyle, padding: 20 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 14 }}>渠道运行状态</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {monitorOverview.providers.map((provider) => (
                            <div key={provider.providerId} style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr 0.7fr 0.7fr", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{provider.providerName}</div>
                                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                                  路由 {provider.enabledRoutes}/{provider.modelCount} · 熔断 {fallbackLabels[provider.fallbackState]}
                                </div>
                              </div>
                              <div style={{ fontSize: 12, color: "#4b5563" }}>
                                RPM {provider.currentRpm}/{provider.rpmLimit || 0}
                                <br />
                                TPM {provider.currentTpm}/{provider.tpmLimit || 0}
                              </div>
                              <div style={{ fontSize: 13, color: statusColors[provider.health], fontWeight: 600 }}>{healthLabels[provider.health]}</div>
                              <div style={{ fontSize: 13, color: "#111827", fontWeight: 600 }}>{provider.capacityHitRate}%</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ ...cardStyle, padding: 20 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 14 }}>告警面板</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {monitorOverview.alerts.length === 0 ? (
                            <div style={{ color: "#6b7280", fontSize: 13 }}>当前没有激活告警。</div>
                          ) : monitorOverview.alerts.map((alert, index) => (
                            <div key={`${alert.providerId}-${index}`} style={{
                              borderRadius: 10,
                              padding: 12,
                              background: alert.level === "critical" ? "#fef2f2" : "#fff7ed",
                              border: `1px solid ${alert.level === "critical" ? "#fecaca" : "#fed7aa"}`,
                            }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: alert.level === "critical" ? "#b91c1c" : "#c2410c" }}>{alert.title}</div>
                              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>{alert.detail}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 12 }}>注册用户</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>{users.length}</div>
                  </div>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 12 }}>待处理工单</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>
                      {tickets.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress").length}
                    </div>
                  </div>
                </div>
              </>
            ) : activeTab === "users" ? (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 20 }}>用户管理</h1>
                <div style={{ ...cardStyle, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e5e7eb" }}>账号</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e5e7eb" }}>昵称</th>
                        <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid #e5e7eb" }}>余额</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e5e7eb" }}>注册时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>暂无用户数据</td>
                        </tr>
                      ) : users.map((user, index) => (
                        <tr key={user.id} style={{ background: index % 2 === 0 ? "#fff" : "#fcfcfd" }}>
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid #f3f4f6" }}>{user.email || user.phone}</td>
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid #f3f4f6" }}>{user.nickname}</td>
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid #f3f4f6", textAlign: "right", color: "#10b981", fontWeight: 600 }}>
                            ¥{Number(user.balance || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid #f3f4f6", color: "#6b7280" }}>
                            {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : activeTab === "providers" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>渠道控制台</h1>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>统一维护上游渠道配置、容量策略和健康状态</div>
                  </div>
                  <button onClick={() => loadData()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                    刷新
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 0.95fr) minmax(420px, 1.35fr)", gap: 18, alignItems: "start" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ ...cardStyle, padding: 18 }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                        {["all", "draft", "enabled", "disabled"].map((item) => (
                          <button
                            key={item}
                            onClick={() => setFilter(item)}
                            style={{
                              padding: "6px 12px",
                              background: filter === item ? "#111827" : "#fff",
                              color: filter === item ? "#fff" : "#4b5563",
                              border: "1px solid #d1d5db",
                              borderRadius: 9999,
                              fontSize: 12,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {item === "all" ? "全部" : statusLabels[item]}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {filteredProviders.length === 0 ? (
                          <div style={{ padding: 32, textAlign: "center", color: "#6b7280" }}>暂无渠道数据</div>
                        ) : filteredProviders.map((provider) => (
                          <button
                            key={provider.id}
                            onClick={() => setSelectedProviderId(provider.id)}
                            style={{
                              padding: 16,
                              borderRadius: 12,
                              border: selectedProviderId === provider.id ? "1px solid #2563eb" : "1px solid #e5e7eb",
                              background: selectedProviderId === provider.id ? "#eff6ff" : "#fff",
                              textAlign: "left",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                              <div>
                                <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{provider.name}</div>
                                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{provider.apiBaseUrl}</div>
                              </div>
                              <span style={{ padding: "3px 10px", borderRadius: 9999, fontSize: 12, background: `${statusColors[provider.status]}15`, color: statusColors[provider.status] }}>
                                {statusLabels[provider.status]}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 10 }}>
                              {provider.contactName} · {provider.contactEmail}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {detailLoading ? (
                      <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "#6b7280" }}>正在加载渠道详情...</div>
                    ) : providerDetail && selectedProvider ? (
                      <>
                        <div style={{ ...cardStyle, padding: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>{selectedProvider.name}</h2>
                                <span style={{ padding: "3px 10px", borderRadius: 9999, fontSize: 12, background: `${statusColors[selectedProvider.status]}15`, color: statusColors[selectedProvider.status] }}>
                                  {statusLabels[selectedProvider.status]}
                                </span>
                              </div>
                              <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
                                slug: <code>{selectedProvider.slug}</code> · 密钥: {selectedProvider.apiKeyMasked}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              {selectedProvider.status !== "enabled" ? (
                                <button onClick={() => handleApproveProvider(selectedProvider.id)} style={{ padding: "8px 14px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                                  启用渠道
                                </button>
                              ) : null}
                              {selectedProvider.status !== "disabled" ? (
                                <button onClick={() => handleRejectProvider(selectedProvider.id)} style={{ padding: "8px 14px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                                  停用渠道
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                            {[
                              { label: "渠道名称", key: "name", type: "text" },
                              { label: "网站", key: "website", type: "text" },
                              { label: "API Base URL", key: "apiBaseUrl", type: "text" },
                              { label: "联系人", key: "contactName", type: "text" },
                              { label: "联系邮箱", key: "contactEmail", type: "text" },
                              { label: "联系电话", key: "contactPhone", type: "text" },
                            ].map((field) => (
                              <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#6b7280" }}>
                                {field.label}
                                <input
                                  value={providerForm[field.key as keyof typeof providerForm]}
                                  onChange={(event) => setProviderForm((current) => ({ ...current, [field.key]: event.target.value }))}
                                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, color: "#111827" }}
                                />
                              </label>
                            ))}
                          </div>

                          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#6b7280", marginTop: 12 }}>
                            渠道描述
                            <textarea
                              value={providerForm.description}
                              onChange={(event) => setProviderForm((current) => ({ ...current, description: event.target.value }))}
                              rows={3}
                              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, color: "#111827", resize: "vertical" }}
                            />
                          </label>

                          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#6b7280", marginTop: 12 }}>
                            更新 API Key
                            <input
                              type="password"
                              placeholder="留空则保持当前密钥"
                              value={providerForm.apiKey}
                              onChange={(event) => setProviderForm((current) => ({ ...current, apiKey: event.target.value }))}
                              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, color: "#111827" }}
                            />
                          </label>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>
                              创建于 {new Date(selectedProvider.createdAt).toLocaleString("zh-CN")}
                            </div>
                            <button onClick={handleSaveProvider} disabled={savingProvider} style={{ padding: "10px 18px", background: "#111827", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", opacity: savingProvider ? 0.7 : 1 }}>
                              {savingProvider ? "保存中..." : "保存渠道配置"}
                            </button>
                          </div>
                        </div>

                        <div style={{ ...cardStyle, padding: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: 0 }}>容量与路由策略</h3>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>面向大并发：优先级、权重、RPM/TPM、并发上限统一收口</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {providerDetail.models.length === 0 ? (
                              <div style={{ color: "#6b7280", fontSize: 13 }}>当前渠道还没有模型。</div>
                            ) : providerDetail.models.map((model) => {
                              const capacity = providerDetail.capacity.find((item) => item.modelId === model.modelId);
                              const health = providerDetail.health.find((item) => item.modelId === model.modelId);
                              return (
                                <div key={model.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                                    <div>
                                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                        <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{model.name}</span>
                                        <code style={{ fontSize: 12, padding: "3px 8px", background: "#eff6ff", color: "#1d4ed8", borderRadius: 6 }}>{model.modelId}</code>
                                        <span style={{ padding: "3px 8px", borderRadius: 9999, fontSize: 12, background: `${statusColors[health?.status || "healthy"]}15`, color: statusColors[health?.status || "healthy"] }}>
                                          {healthLabels[health?.status || "healthy"]}
                                        </span>
                                      </div>
                                      <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#6b7280" }}>
                                        <span>分类: {model.category}</span>
                                        <span>权重: {capacity?.weight ?? 100}</span>
                                        <span>优先级: {capacity?.priority ?? 0}</span>
                                        <span>RPM: {capacity?.rpmLimit ?? 60}</span>
                                        <span>TPM: {capacity?.tpmLimit ?? 100000}</span>
                                        <span>并发: {capacity?.concurrentLimit ?? 10}</span>
                                      </div>
                                      {health ? (
                                        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                                          延迟 {health.avgLatencyMs} ms · 连续失败 {health.consecutiveFailures} 次
                                          {health.lastError ? ` · 最近错误：${health.lastError}` : ""}
                                        </div>
                                      ) : null}
                                    </div>
                                    <button onClick={() => handleSaveCapacity(model.modelId, capacity)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                                      编辑容量
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div style={{ ...cardStyle, padding: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: 0 }}>运行监控</h3>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>容量命中率、熔断状态、延迟趋势</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {providerRouteMetrics.length === 0 ? (
                              <div style={{ color: "#6b7280", fontSize: 13 }}>暂无路由监控数据。</div>
                            ) : providerRouteMetrics.map((route) => (
                              <div key={route.modelId} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                                  <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{route.name}</span>
                                      <code style={{ fontSize: 12, padding: "2px 8px", background: "#eff6ff", color: "#1d4ed8", borderRadius: 6 }}>{route.modelId}</code>
                                      <span style={{ padding: "2px 8px", borderRadius: 9999, fontSize: 12, background: `${statusColors[route.health]}15`, color: statusColors[route.health] }}>
                                        {healthLabels[route.health]}
                                      </span>
                                      <span style={{ padding: "2px 8px", borderRadius: 9999, fontSize: 12, background: "#f3f4f6", color: "#374151" }}>
                                        {fallbackLabels[route.fallbackState]}
                                      </span>
                                    </div>
                                    <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#6b7280" }}>
                                      <span>RPM {route.currentRpm}/{route.rpmLimit}</span>
                                      <span>TPM {route.currentTpm}/{route.tpmLimit}</span>
                                      <span>延迟 {route.avgLatencyMs} ms</span>
                                      <span>失败 {route.consecutiveFailures} 次</span>
                                      <span>权重 {route.weight}</span>
                                    </div>
                                  </div>
                                  <div style={{ minWidth: 92, textAlign: "right" }}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: route.saturation >= 0.8 ? "#dc2626" : route.saturation >= 0.5 ? "#d97706" : "#10b981" }}>
                                      {Math.round(route.saturation * 100)}%
                                    </div>
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>容量命中率</div>
                                  </div>
                                </div>
                                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 4 }}>
                                  {route.rpmSeries.map((point, index) => (
                                    <div key={`rpm-${route.modelId}-${index}`} style={{
                                      height: Math.max(8, Math.round((point / Math.max(route.rpmLimit, 1)) * 48)),
                                      borderRadius: 4,
                                      background: "#93c5fd",
                                      alignSelf: "end",
                                    }} />
                                  ))}
                                </div>
                                {route.lastError ? (
                                  <div style={{ marginTop: 10, fontSize: 12, color: "#b91c1c" }}>最近错误：{route.lastError}</div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "#6b7280" }}>请选择一个渠道查看详情</div>
                    )}
                  </div>
                </div>
              </>
            ) : activeTab === "models" ? (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 20 }}>模型管理</h1>
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  {["all", "draft", "enabled", "disabled"].map((item) => (
                    <button
                      key={item}
                      onClick={() => setFilter(item)}
                      style={{
                        padding: "6px 14px",
                        background: filter === item ? "#111827" : "#fff",
                        border: "1px solid #d1d5db",
                        borderRadius: 9999,
                        color: filter === item ? "#fff" : "#4b5563",
                        fontSize: 13,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {item === "all" ? "全部" : statusLabels[item]}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {filteredModels.length === 0 ? (
                    <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>暂无模型数据</div>
                  ) : filteredModels.map((model) => (
                    <div key={model.id} style={{ ...cardStyle, padding: "16px 20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <div>
                          <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{model.name}</span>
                          <code style={{ marginLeft: 10, fontSize: 12, color: "#1d4ed8", background: "#eff6ff", padding: "2px 8px", borderRadius: 6 }}>{model.modelId}</code>
                          <span style={{ marginLeft: 10, padding: "2px 10px", borderRadius: 9999, fontSize: 12, background: `${statusColors[model.status]}15`, color: statusColors[model.status] }}>
                            {statusLabels[model.status]}
                          </span>
                        </div>
                        {model.status === "draft" ? (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => handleApproveModel(model.id)} style={{ padding: "6px 16px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>启用</button>
                            <button onClick={() => handleRejectModel(model.id)} style={{ padding: "6px 16px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>停用</button>
                          </div>
                        ) : null}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, color: "#4b5563" }}>{model.description || "暂无描述"}</div>
                      <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 12, color: "#6b7280" }}>
                        <span>分类: {model.category}</span>
                        <span>提交时间: {new Date(model.createdAt).toLocaleDateString("zh-CN")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 20 }}>工单中心</h1>
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  {["all", "open", "in_progress", "resolved", "rejected"].map((item) => (
                    <button
                      key={item}
                      onClick={() => setFilter(item)}
                      style={{
                        padding: "6px 14px",
                        background: filter === item ? "#111827" : "#fff",
                        border: "1px solid #d1d5db",
                        borderRadius: 9999,
                        color: filter === item ? "#fff" : "#4b5563",
                        fontSize: 13,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {item === "all" ? "全部" : item}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {filteredTickets.length === 0 ? (
                    <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>暂无工单</div>
                  ) : filteredTickets.map((ticket) => (
                    <div key={ticket.id} style={{ ...cardStyle, padding: "16px 20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{ticket.subject}</div>
                          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>用户: {ticket.user_id} · 类型: {ticket.type} · 状态: {ticket.status}</div>
                        </div>
                        <button onClick={() => handleReplyTicket(ticket.id)} style={{ padding: "6px 16px", background: "#111827", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>处理</button>
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.7, color: "#4b5563", marginBottom: 8 }}>{ticket.description}</div>
                      {(ticket.model || ticket.requested_qpm || ticket.requested_tpm) ? (
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                          {ticket.model ? <span>模型: {ticket.model}</span> : null}
                          {ticket.requested_qpm ? <span>QPM: {ticket.requested_qpm}</span> : null}
                          {ticket.requested_tpm ? <span>TPM: {ticket.requested_tpm}</span> : null}
                        </div>
                      ) : null}
                      {ticket.admin_reply ? (
                        <div style={{ padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 13, color: "#334155" }}>
                          管理员回复：{ticket.admin_reply}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
