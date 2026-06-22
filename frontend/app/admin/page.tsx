"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { fetchAPI } from "@/lib/api";
import { authHeaders, useAuth } from "@/lib/auth";
import AdminDashboard from "./AdminDashboard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/proxy";

interface User {
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string;
  balance: number;
  createdAt: string;
  updatedAt?: string;
  defaultQpm?: number;
  defaultTpm?: number;
  customLimitCount?: number;
  pendingRequestCount?: number;
  customLimits?: Array<{
    id: string;
    user_id: string;
    model: string;
    qpm: number;
    tpm: number;
    source: string;
    created_at: string;
    updated_at: string;
  }>;
  requests?: Array<{
    id: string;
    user_id: string;
    model: string;
    requested_qpm: number;
    requested_tpm: number;
    reason: string;
    status: string;
    admin_reply: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
  }>;
  latestRequest?: {
    id: string;
    model: string;
    status: string;
    requested_qpm: number;
    requested_tpm: number;
    created_at: string;
  } | null;
  usage?: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    avgLatency: number;
    successRate: number;
  };
}

type UserApiRecord = User & {
  created_at?: string;
  updated_at?: string;
};

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
  modelCount?: number;
  enabledRoutes?: number;
  currentRpm?: number;
  currentTpm?: number;
  rpmLimit?: number;
  tpmLimit?: number;
  concurrentLimit?: number;
  channelConfig?: {
    activeChannel: string;
    channels: Array<{
      id: string;
      name: string;
      adapter: "dashscope" | "pixverse";
      apiBaseUrl: string;
      apiKeyMasked: string;
    }>;
  } | null;
}

interface Model {
  id: string;
  providerId: string;
  providerName?: string;
  modelId: string;
  name: string;
  description: string;
  category: string;
  status: string;
  createdAt: string;
  routes?: Array<{
    providerId: string;
    providerName: string;
    providerStatus: string;
    isEnabled: boolean;
    rpmLimit: number;
    tpmLimit: number;
    dailyLimit: number;
    concurrentLimit: number;
    priority: number;
    weight: number;
    currentRpm: number;
    currentTpm: number;
  }>;
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

interface RateLimitRequest {
  id: string;
  user_id: string;
  model: string;
  requested_qpm: number;
  requested_tpm: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  admin_reply: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserModelDiscount {
  id: string;
  user_id: string;
  model_id: string;
  discount_rate: number;
  is_enabled: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface AdminUserDetail {
  usage: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    avgLatency: number;
    successRate: number;
  };
  byModel: Array<{
    model: string;
    requests: number;
    tokens: number;
    cost: number;
    percentage: number;
  }>;
  recent: Array<{
    time: string;
    model: string;
    tokens: number;
    cost: number;
    status: string;
    latency: number;
  }>;
  transactions: {
    rows: Array<{
      id: string;
      type: string;
      amount: number;
      balance_after: number;
      description: string;
      ref_id: string | null;
      created_at: string;
    }>;
    total: number;
  };
  discounts: UserModelDiscount[];
  requests: RateLimitRequest[];
  defaultQpm: number;
  defaultTpm: number;
  customLimits: Array<{
    id: string;
    user_id: string;
    model: string;
    qpm: number;
    tpm: number;
    source: string;
    created_at: string;
    updated_at: string;
  }>;
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
    currentRpm: number;
    currentTpm: number;
    rpmLimit: number;
    tpmLimit: number;
    concurrentLimit: number;
    modelCount: number;
    enabledRoutes: number;
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

interface OperationsDashboard {
  generatedAt: string;
  summary: {
    providers: number;
    enabledProviders: number;
    models: number;
    routedModels: number;
    routes: number;
    enabledRoutes: number;
    criticalIssues: number;
    warningIssues: number;
    costedRoutes: number;
    routePolicies: number;
    currentRpm: number;
    currentTpm: number;
    rpmLimit: number;
    tpmLimit: number;
  };
  providers: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    apiBaseUrl: string;
    apiKeyMasked: string;
    modelCount: number;
    enabledRoutes: number;
    health: "healthy" | "degraded" | "down";
    currentRpm: number;
    currentTpm: number;
    rpmLimit: number;
    tpmLimit: number;
    dailyLimit: number;
    concurrentLimit: number;
    saturationRatio: number;
    missingApiKey: boolean;
  }>;
  routes: Array<{
    providerId: string;
    providerName: string;
    providerStatus: string;
    modelId: string;
    modelName: string;
    modelProvider: string;
    category: string;
    enabled: boolean;
    recommendedProviderId: string;
    recommended: boolean;
    promptPrice: number;
    completionPrice: number;
    promptCost: number;
    completionCost: number;
    fixedCost: number;
    grossMarginPrompt: number;
    grossMarginCompletion: number;
    pricingType: string;
    priceUnit: string;
    rpmLimit: number;
    tpmLimit: number;
    dailyLimit: number;
    concurrentLimit: number;
    priority: number;
    weight: number;
    currentRpm: number;
    currentTpm: number;
    saturationRatio: number;
    health: "healthy" | "degraded" | "down";
    availability: number;
    avgLatencyMs: number;
    consecutiveFailures: number;
    lastError: string | null;
  }>;
  issues: Array<{
    level: "critical" | "warning" | "info";
    scope: "provider" | "route" | "model";
    providerId?: string;
    modelId?: string;
    title: string;
    detail: string;
    action: string;
  }>;
  routePolicies: Array<{
    id: string;
    user_id: string | null;
    model_id: string;
    strategy: string;
    pinned_provider_id: string | null;
    allowed_providers: string[];
    blocked_providers: string[];
    min_availability: number | null;
    max_prompt_cost: number | null;
    max_completion_cost: number | null;
    is_enabled: boolean;
    notes: string;
  }>;
  routeAudits: Array<{
    id: string;
    provider_id: string;
    model_id: string;
    action: string;
    actor_id: string | null;
    reason: string;
    created_at: string;
  }>;
}

function ModelCombobox({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = query
    ? options.filter((o) => o.value.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <input
        placeholder="Search model ID..."
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 100, maxHeight: 220, overflowY: "auto", marginTop: 2 }}>
          {filtered.map((o) => (
            <div
              key={o.value}
              onMouseDown={() => { onChange(o.value); setQuery(o.value); setOpen(false); }}
              style={{ padding: "7px 10px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type TabKey = "dashboard" | "overview" | "operations" | "users" | "approvals" | "providers" | "models" | "tickets" | "logs";

const statusColors: Record<string, string> = {
  draft: "#d97706",
  enabled: "#10b981",
  disabled: "#ef4444",
  healthy: "#10b981",
  degraded: "#f59e0b",
  down: "#ef4444",
};

const statusLabels: Record<string, string> = {
  draft: "Pending",
  enabled: "Enabled",
  disabled: "Disabled",
};

const healthLabels: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
};

const fallbackLabels: Record<string, string> = {
  closed: "Normal",
  monitoring: "Monitoring",
  open: "Circuit Open",
};

const cardStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
};

function isTaskModelCategory(category?: string): boolean {
  return category === "Image Generation" || category === "Video Generation" || category === "Voice Model";
}

function formatPercent(value: number): string {
  return `${Math.round((value || 0) * 100)}%`;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userModelDiscounts, setUserModelDiscounts] = useState<UserModelDiscount[]>([]);
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [rateLimitRequests, setRateLimitRequests] = useState<RateLimitRequest[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [usageOverview, setUsageOverview] = useState<{
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    activeModels: number;
    avgLatency: number;
    successRate: number;
  } | null>(null);
  const [providerDetail, setProviderDetail] = useState<ProviderDetail | null>(null);
  const [monitorOverview, setMonitorOverview] = useState<MonitorOverview | null>(null);
  const [operations, setOperations] = useState<OperationsDashboard | null>(null);
  const [providerRouteMetrics, setProviderRouteMetrics] = useState<ProviderRouteMetrics[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [rateLimitForm, setRateLimitForm] = useState<{ model: string; qpm: string; tpm: string } | null>(null);
  const [rateLimitFormTarget, setRateLimitFormTarget] = useState<string | null>(null); // model being edited
  const [balanceForm, setBalanceForm] = useState<{ amount: string; description: string } | null>(null);
  const [discountForm, setDiscountForm] = useState<{ modelId: string; rate: string; notes: string; enabled: boolean; editId?: string } | null>(null);
  const [defaultLimitForm, setDefaultLimitForm] = useState<{ qpm: string; tpm: string } | null>(null);
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
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");
  const [providerViewMode, setProviderViewMode] = useState<"by-provider" | "by-model">("by-provider");
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [modelCategoryFilter, setModelCategoryFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [logSearchId, setLogSearchId] = useState("");
  const [logSearchModel, setLogSearchModel] = useState("");
  const [logSearchUser, setLogSearchUser] = useState("");
  const [logSearchFrom, setLogSearchFrom] = useState("");
  const [logSearchTo, setLogSearchTo] = useState("");
  const [logResults, setLogResults] = useState<any[]>([]);
  const [logSearching, setLogSearching] = useState(false);
  const [logExpandedId, setLogExpandedId] = useState<string | null>(null);
  const [logDetail, setLogDetail] = useState<any>(null);
  const [logDetailLoading, setLogDetailLoading] = useState(false);
  const [logDetailNote, setLogDetailNote] = useState("");

  // Route protection: redirect unauthenticated users to login
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (providers.length > 0 && (!selectedProviderId || !providers.some((provider) => provider.id === selectedProviderId))) {
      setSelectedProviderId(providers[0].id);
    }
  }, [providers, selectedProviderId]);

  useEffect(() => {
    if (!selectedUserId && users.length > 0) {
      setSelectedUserId(users[0].id);
    }
  }, [users, selectedUserId]);

  useEffect(() => {
    if (selectedProviderId) {
      loadProviderDetail(selectedProviderId);
    }
  }, [selectedProviderId]);

  useEffect(() => {
    if (activeTab === "users" && selectedUserId) {
      loadUserDetail(selectedUserId);
    }
  }, [activeTab, selectedUserId]);

  async function loadData(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const headers = authHeaders();
      const [providersRes, modelsRes, statsRes, usersRes, ticketsRes, requestsRes, usageRes, operationsRes, discountsRes] = await Promise.all([
        fetchAPI("/api/provider/admin/providers", { headers, signal }),
        fetchAPI("/api/provider/admin/models", { headers, signal }),
        fetchAPI("/api/provider/admin/stats", { headers, signal }),
        fetchAPI("/api/admin/users", { headers, signal }).catch(() => ({ success: false, data: [] })),
        fetchAPI("/api/tickets/admin/all", { headers, signal }).catch(() => ({ success: false, data: [] })),
        fetchAPI("/api/rate-limits/admin/requests", { headers, signal }).catch(() => ({ success: false, data: [] })),
        fetchAPI("/api/usage/overview?scope=all", { headers, signal }).catch(() => ({ success: false })),
        fetchAPI("/api/provider/admin/operations", { headers, signal }).catch(() => ({ success: false })),
        fetchAPI("/api/billing/admin/user-model-discounts", { headers, signal }).catch(() => ({ success: false, data: [] })),
      ]);

      if (providersRes.success) setProviders(providersRes.data || []);
      if (modelsRes.success) setModels(modelsRes.data || []);
      if (statsRes.success) setStats(statsRes.data || null);
      if (usersRes.success) {
        setUsers(((usersRes.data || []) as UserApiRecord[]).map((user) => ({
          ...user,
          createdAt: user.created_at || user.createdAt,
          updatedAt: user.updated_at || user.updatedAt,
        })));
      }
      if (ticketsRes.success) setTickets(ticketsRes.data || []);
      if (requestsRes.success) setRateLimitRequests(requestsRes.data || []);
      if (usageRes.success) setUsageOverview(usageRes.data || null);
      if (operationsRes.success) setOperations(operationsRes.data || null);
      if (discountsRes.success) setUserModelDiscounts(discountsRes.data || []);
      const monitorRes = await fetchAPI("/api/provider-monitor/overview", { headers, signal }).catch(() => ({ success: false }));
      if (monitorRes.success) setMonitorOverview(monitorRes.data || null);

      if (!providersRes.success || !modelsRes.success || !statsRes.success) {
        if (providersRes.status === 403 || providersRes.status === 401) {
          setAccessDenied(true);
        } else {
          setError("Insufficient admin privileges or backend API not available");
        }
      }
    } catch (loadErr) {
      console.error("Failed to load admin data", loadErr);
      setError("Failed to load admin data");
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
      console.error("Failed to load provider detail", detailErr);
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadUserDetail(userId: string) {
    setUserDetailLoading(true);
    try {
      const res = await fetchAPI(`/api/admin/users/${userId}/detail`, { headers: authHeaders() });
      if (res.success) {
        setSelectedUserDetail(res.data || null);
        if (Array.isArray(res.data?.discounts)) {
          setUserModelDiscounts((current) => [
            ...current.filter((item) => item.user_id !== userId),
            ...res.data.discounts,
          ]);
        }
      }
    } finally {
      setUserDetailLoading(false);
    }
  }

  function isActing(key: string) { return actionLoading.has(key); }
  async function withAction(key: string, fn: () => Promise<void>) {
    if (actionLoading.has(key)) return;
    setActionLoading((prev) => new Set(prev).add(key));
    try { await fn(); } finally {
      setActionLoading((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }

  async function handleApproveProvider(id: string) {
    await withAction(`enable-provider-${id}`, async () => {
      const res = await fetchAPI(`/api/provider/admin/providers/${id}/enable`, { method: "POST", headers: authHeaders() });
      if (res.success) { setNotice("Provider enabled"); loadData(); if (selectedProviderId === id) loadProviderDetail(id); }
      else setNotice(res.message || "Operation failed");
    });
  }

  async function handleRejectProvider(id: string) {
    await withAction(`disable-provider-${id}`, async () => {
      const reason = prompt("Enter disable reason (optional):");
      const res = await fetchAPI(`/api/provider/admin/providers/${id}/disable`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ reason }),
      });
      if (res.success) { setNotice("Provider disabled"); loadData(); if (selectedProviderId === id) loadProviderDetail(id); }
      else setNotice(res.message || "Operation failed");
    });
  }

  async function handleApproveModel(id: string) {
    await withAction(`enable-model-${id}`, async () => {
      const res = await fetchAPI(`/api/provider/admin/models/${id}/enable`, { method: "POST", headers: authHeaders() });
      if (res.success) { setNotice("Model enabled"); loadData(); }
      else setNotice(res.message || "Operation failed");
    });
  }

  async function handleRejectModel(id: string) {
    await withAction(`disable-model-${id}`, async () => {
      const res = await fetchAPI(`/api/provider/admin/models/${id}/disable`, { method: "POST", headers: authHeaders() });
      if (res.success) { setNotice("Model disabled"); loadData(); }
      else setNotice(res.message || "Operation failed");
    });
  }

  async function handleReplyTicket(id: string) {
    await withAction(`reply-ticket-${id}`, async () => {
      const reply = prompt("Enter admin reply:");
      if (!reply) return;
      const status = prompt("Enter status: open / in_progress / resolved / rejected", "in_progress");
      if (!status) return;
      const res = await fetchAPI(`/api/tickets/${id}/reply`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ reply, status }),
      });
      if (res.success) { setNotice("Reply sent"); loadData(); }
      else setNotice(res.message || "Reply failed");
    });
  }

  async function handleApproveRequest(id: string, request?: RateLimitRequest) {
    await withAction(`approve-request-${id}`, async () => {
      const reply = prompt("Approval note (optional)", "Approved");
      const res = await fetchAPI(`/api/rate-limits/admin/requests/${id}/approve`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          reply: reply || "Approved",
          model: request?.model,
          qpm: request?.requested_qpm,
          tpm: request?.requested_tpm,
        }),
      });
      if (res.success) { setNotice("Request approved"); loadData(); }
      else setNotice(res.message || "Operation failed");
    });
  }

  async function handleRejectRequest(id: string) {
    await withAction(`reject-request-${id}`, async () => {
      const reply = prompt("Rejection reason (optional)", "Not approved");
      const res = await fetchAPI(`/api/rate-limits/admin/requests/${id}/reject`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ reply: reply || "Not approved" }),
      });
      if (res.success) { setNotice("Request rejected"); loadData(); }
      else setNotice(res.message || "Operation failed");
    });
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
        setNotice("Provider config saved");
        setProviderForm((current) => ({ ...current, apiKey: "" }));
        await loadData();
        await loadProviderDetail(selectedProviderId);
      }
    } finally {
      setSavingProvider(false);
    }
  }

  async function handleCreateProvider() {
    const name = prompt("Provider name, e.g.: Volcengine Ark");
    if (!name) return;
    const apiBaseUrl = prompt("API Base URL, e.g.: https://ark.cn-beijing.volces.com/api/v3");
    if (!apiBaseUrl) return;
    const apiKey = prompt("API Key (can be left empty to fill later)", "") || "";
    const res = await fetchAPI("/api/provider/admin/providers", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name,
        api_base_url: apiBaseUrl,
        api_key: apiKey,
        contact_name: "Platform Ops",
        contact_email: "ops@nexusflow.ai",
      }),
    });
    if (res.success) {
      setNotice("Provider created");
      await loadData();
      if (res.data?.id) setSelectedProviderId(res.data.id);
    }
  }

  async function handleSwitchChannel(providerId: string, channel: string) {
    setNotice("");
    const res = await fetchAPI(`/api/provider/${providerId}/switch-channel`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ channel }),
    });
    if (res.success) {
      setNotice(res.message || "Provider channel switched");
      await loadData();
      await loadProviderDetail(providerId);
    } else {
      setNotice(res.message || "Provider channel switch failed");
    }
  }

  async function handleSaveCapacity(modelId: string, current?: CapacityRecord) {
    if (!selectedProviderId) return;
    const model = providerDetail?.models.find((item) => item.modelId === modelId);
    const isTaskModel = isTaskModelCategory(model?.category);

    const rpm = prompt(isTaskModel ? "Task submission RPM limit" : "RPM limit", String(current?.rpmLimit ?? 60));
    if (rpm === null) return;
    let tpm = String(current?.tpmLimit ?? 100000);
    if (!isTaskModel) {
      const nextTpm = prompt("TPM limit", tpm);
      if (nextTpm === null) return;
      tpm = nextTpm;
    } else {
      tpm = String(current?.tpmLimit ?? 0);
    }
    const daily = prompt("Daily request limit", String(current?.dailyLimit ?? 10000));
    if (daily === null) return;
    let concurrent = String(current?.concurrentLimit ?? 10);
    if (isTaskModel) {
      const nextConcurrent = prompt("Background task concurrency limit", concurrent);
      if (nextConcurrent === null) return;
      concurrent = nextConcurrent;
    }
    const priority = prompt("Priority", String(current?.priority ?? 0));
    if (priority === null) return;
    const weight = prompt("Weight", String(current?.weight ?? 100));
    if (weight === null) return;
    const enabled = prompt("Enable: true / false", String(current?.isEnabled ?? true));
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
      setNotice(`Model ${modelId} capacity policy updated`);
      loadProviderDetail(selectedProviderId);
    }
  }

  async function handleSaveModelRoute(model: Model, route?: NonNullable<Model["routes"]>[number]) {
    const providerId = route?.providerId || prompt("Select provider ID (check Provider Console, e.g. dashscope or volcengine-ark)", providers[0]?.id || "");
    if (!providerId) return;
    const isTaskModel = isTaskModelCategory(model.category);
    const rpm = prompt(isTaskModel ? "Task submission RPM limit" : "RPM limit", String(route?.rpmLimit ?? 1000));
    if (rpm === null) return;
    let tpm = String(route?.tpmLimit ?? 1000000);
    if (!isTaskModel) {
      const nextTpm = prompt("TPM limit", tpm);
      if (nextTpm === null) return;
      tpm = nextTpm;
    } else {
      tpm = String(route?.tpmLimit ?? 0);
    }
    const daily = prompt("Daily request limit", String(route?.dailyLimit ?? 100000));
    if (daily === null) return;
    let concurrent = String(route?.concurrentLimit ?? 50);
    if (isTaskModel) {
      const nextConcurrent = prompt("Background task concurrency limit", concurrent);
      if (nextConcurrent === null) return;
      concurrent = nextConcurrent;
    }
    const priority = prompt("Priority, higher = more preferred", String(route?.priority ?? 0));
    if (priority === null) return;
    const weight = prompt("Weight, higher = more likely selected at same priority", String(route?.weight ?? 100));
    if (weight === null) return;
    const enabled = prompt("Enable: true / false", String(route?.isEnabled ?? true));
    if (enabled === null) return;

    const res = await fetchAPI(`/api/provider/${providerId}/capacity/${model.modelId}`, {
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
      setNotice(`$Route saved for {model.modelId}`);
      await loadData();
      if (selectedProviderId) loadProviderDetail(selectedProviderId);
    }
  }

  function openDiscountForm(userId: string, existing?: UserModelDiscount) {
    setDiscountForm({
      modelId: existing?.model_id ?? "",
      rate: existing ? String(existing.discount_rate) : "0.9",
      notes: existing?.notes ?? "",
      enabled: existing ? existing.is_enabled : true,
      editId: existing?.id,
    });
  }

  async function submitDiscountForm(userId: string) {
    if (!discountForm) return;
    const discountRate = Number(discountForm.rate);
    if (!Number.isFinite(discountRate) || discountRate < 0 || discountRate > 1) {
      setNotice("Discount rate must be between 0 and 1");
      return;
    }
    if (!discountForm.modelId.trim()) {
      setNotice("Model ID cannot be empty");
      return;
    }
    const res = await fetchAPI("/api/billing/admin/user-model-discounts", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        userId,
        modelId: discountForm.modelId.trim(),
        discountRate,
        notes: discountForm.notes,
        enabled: discountForm.enabled,
      }),
    });
    if (res.success) {
      setNotice("User model discount saved");
      setDiscountForm(null);
      await loadData();
      await loadUserDetail(userId);
    } else {
      setNotice(res.message || "Discount save failed");
    }
  }

  async function handleDeleteUserDiscount(id: string) {
    await withAction(`delete-discount-${id}`, async () => {
      const res = await fetchAPI(`/api/billing/admin/user-model-discounts/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.success) {
        setNotice("Discount deleted");
        await loadData();
        if (selectedUserId) await loadUserDetail(selectedUserId);
      } else {
        setNotice(res.message || "Discount delete failed");
      }
    });
  }

  function openBalanceForm(userId: string) {
    setBalanceForm({ amount: "", description: "" });
  }

  async function submitBalanceForm(userId: string) {
    if (!balanceForm) return;
    const amountDelta = Number(balanceForm.amount);
    if (!Number.isFinite(amountDelta) || amountDelta === 0) {
      setNotice("Adjustment amount must be a non-zero number");
      return;
    }
    const description = balanceForm.description.trim() || (amountDelta > 0 ? "Admin balance increase" : "Admin balance decrease");
    const res = await fetchAPI(`/api/admin/users/${userId}/balance-adjust`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ amountDelta, description }),
    });
    if (res.success) {
      setNotice("User balance adjusted");
      setBalanceForm(null);
      await loadData();
      await loadUserDetail(userId);
    } else {
      setNotice(res.message || "Balance adjustment failed");
    }
  }

  function openRateLimitForm(userId: string, current?: NonNullable<User["customLimits"]>[number]) {
    setRateLimitFormTarget(current?.model ?? null);
    setRateLimitForm({
      model: current?.model ?? "",
      qpm: String(current?.qpm ?? 60),
      tpm: String(current?.tpm ?? 100000),
    });
  }

  async function submitRateLimitForm(userId: string) {
    if (!rateLimitForm) return;
    const model = rateLimitForm.model.trim() || "*";
    const qpm = Number(rateLimitForm.qpm);
    const tpm = Number(rateLimitForm.tpm);
    if (!Number.isFinite(qpm) || qpm <= 0 || !Number.isFinite(tpm) || tpm <= 0) {
      setNotice("QPM and TPM must be numbers greater than 0");
      return;
    }
    const res = await fetchAPI(`/api/rate-limits/admin/users/${userId}/models/${encodeURIComponent(model)}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ qpm, tpm }),
    });
    if (res.success) {
      setNotice("User model rate limit updated");
      setRateLimitForm(null);
      setRateLimitFormTarget(null);
      await loadData();
      await loadUserDetail(userId);
    } else {
      setNotice(res.message || "Rate limit update failed");
    }
  }

  async function handleDeleteUserRateLimit(userId: string, model: string) {
    await withAction(`delete-ratelimit-${userId}-${model}`, async () => {
      const res = await fetchAPI(`/api/rate-limits/admin/users/${userId}/models/${encodeURIComponent(model)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.success) {
        setNotice("User model rate limit deleted");
        await loadData();
        await loadUserDetail(userId);
      } else {
        setNotice(res.message || "Rate limit delete failed");
      }
    });
  }

  async function handleExportUserBilling(userId: string) {
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultEnd = now.toISOString().slice(0, 10);
    const startDate = prompt("Billing start date YYYY-MM-DD", defaultStart);
    if (!startDate) return;
    const endDate = prompt("Billing end date YYYY-MM-DD", defaultEnd);
    if (!endDate) return;
    if (startDate > endDate) {
      setNotice("Start date cannot be later than end date");
      return;
    }

    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/billing-export.csv?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nexusflow-user-${userId}-billing-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("User billing CSV exported");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Billing export failed");
    }
  }

  async function submitDefaultLimitForm(userId: string) {
    if (!defaultLimitForm) return;
    const qpm = Number(defaultLimitForm.qpm);
    const tpm = Number(defaultLimitForm.tpm);
    if (!Number.isFinite(qpm) || qpm <= 0 || !Number.isFinite(tpm) || tpm <= 0) {
      setNotice("QPM and TPM must be numbers greater than 0");
      return;
    }
    const res = await fetchAPI(`/api/rate-limits/admin/users/${userId}/models/${encodeURIComponent("*")}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ qpm, tpm }),
    });
    if (res.success) {
      setNotice("Default limits updated");
      setDefaultLimitForm(null);
      await loadData();
      await loadUserDetail(userId);
    } else {
      setNotice(res.message || "Default limits update failed");
    }
  }

  async function handleLogSearch() {
    setLogSearching(true);
    setLogExpandedId(null);
    setLogDetail(null);
    const params = new URLSearchParams();
    if (logSearchId.trim()) params.set("log_id", logSearchId.trim());
    if (logSearchModel.trim()) params.set("model", logSearchModel.trim());
    if (logSearchUser.trim()) {
      const v = logSearchUser.trim();
      // If it looks like a UUID, treat as user_id; otherwise search by email/nickname on the client side
      if (/^[0-9a-f-]{36}$/i.test(v)) params.set("user_id", v);
    }
    if (logSearchFrom) params.set("from", new Date(logSearchFrom).toISOString());
    if (logSearchTo) params.set("to", new Date(logSearchTo).toISOString());
    params.set("limit", "100");
    const headers = authHeaders();
    const res = await fetchAPI(`/api/admin/logs/search?${params}`, { headers });
    if (res.success) {
      let rows = res.data || [];
      // Client-side filter by email/nickname if not a UUID
      const kw = logSearchUser.trim().toLowerCase();
      if (kw && !/^[0-9a-f-]{36}$/i.test(kw)) {
        rows = rows.filter((r: any) =>
          (r.user_email || "").toLowerCase().includes(kw) ||
          (r.user_nickname || "").toLowerCase().includes(kw)
        );
      }
      setLogResults(rows);
    }
    setLogSearching(false);
  }

  async function handleLogDetail(logId: string) {
    if (logExpandedId === logId) { setLogExpandedId(null); return; }
    setLogExpandedId(logId);
    setLogDetailLoading(true);
    setLogDetail(null);
    setLogDetailNote("");
    const headers = authHeaders();
    const res = await fetchAPI(`/api/admin/logs/${logId}/detail`, { headers });
    if (res.success) {
      setLogDetail(res.data);
      if (res.note) setLogDetailNote(res.note);
    } else {
      setLogDetailNote(res.message || "Query failed");
    }
    setLogDetailLoading(false);
  }

  function formatLogJson(s: string | null | undefined): string {
    if (!s) return "";
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
  }

  const filteredProviders = filter === "all" ? providers : providers.filter((provider) => provider.status === filter);
  const filteredModels = filter === "all" ? models : models.filter((model) => model.status === filter);
  const filteredTickets = filter === "all" ? tickets : tickets.filter((ticket) => ticket.status === filter);

  const filteredByModelModels = useMemo(() => {
    let result = models;
    if (modelCategoryFilter !== "all") {
      result = result.filter((m) => m.category === modelCategoryFilter);
    }
    if (modelSearchQuery.trim()) {
      const q = modelSearchQuery.trim().toLowerCase();
      result = result.filter((m) => m.modelId.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
    }
    return result;
  }, [models, modelCategoryFilter, modelSearchQuery]);

  const modelCategories = useMemo(() => {
    const cats = new Set(models.map((m) => m.category));
    return Array.from(cats).sort();
  }, [models]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "overview", label: "Overview" },
    { key: "operations", label: "Provider Operations" },
    { key: "users", label: "User Management" },
    { key: "approvals", label: "Rate Limit Approvals" },
    { key: "providers", label: "Provider Console" },
    { key: "models", label: "Model Management" },
    { key: "tickets", label: "Tickets" },
    { key: "logs", label: "Log Search" },
  ];

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) || null,
    [providers, selectedProviderId]
  );

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const selectedUserDiscounts = useMemo(
    () => userModelDiscounts.filter((discount) => discount.user_id === selectedUserId),
    [userModelDiscounts, selectedUserId]
  );

  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((user) => [
      user.nickname,
      user.email || "",
      user.phone || "",
      user.id,
    ].some((value) => String(value).toLowerCase().includes(keyword)));
  }, [users, userSearch]);

  const selectedProviderTotals = useMemo(() => {
    if (!providerDetail) return null;
    const routes = providerRouteMetrics;
    const capacity = providerDetail.capacity;
    return {
      modelCount: providerDetail.models.length,
      enabledRoutes: providerDetail.models.filter((model) => {
        const current = capacity.find((item) => item.modelId === model.modelId);
        return current?.isEnabled ?? true;
      }).length,
      currentRpm: routes.reduce((sum, route) => sum + (route.currentRpm || 0), 0),
      currentTpm: routes.reduce((sum, route) => sum + (route.currentTpm || 0), 0),
      rpmLimit: routes.reduce((sum, route) => sum + (route.rpmLimit || 0), 0),
      tpmLimit: routes.reduce((sum, route) => sum + (route.tpmLimit || 0), 0),
      taskConcurrentLimit: capacity.reduce((sum, item) => {
        const model = providerDetail.models.find((record) => record.modelId === item.modelId);
        return isTaskModelCategory(model?.category) ? sum + (item.concurrentLimit || 0) : sum;
      }, 0),
    };
  }, [providerDetail, providerRouteMetrics]);

  // Show nothing while auth is being resolved (avoids flash before redirect)
  if (authLoading || (!authLoading && !user)) {
    return null;
  }

  // 403 — logged in but not an admin
  if (accessDenied) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f3f4f6", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: "#111827" }}>403</div>
          <div style={{ fontSize: 18, color: "#374151", marginTop: 8 }}>No admin access</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>Your account is not authorized to access the admin console.</div>
          <Link href="/" style={{ display: "inline-block", marginTop: 24, padding: "10px 20px", background: "#111827", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 14 }}>
            Back to main site
          </Link>
        </div>
      </div>
    );
  }

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
            &larr; Back to main site
          </Link>
        </div>
      </aside>

      <main style={{ flex: 1, padding: "28px 32px 36px", overflow: "auto" }}>
        {loading ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: 80, color: "#6b7280" }}>Loading...</div>
        ) : error ? (
          <div style={{ background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", padding: 16, borderRadius: 12 }}>{error}</div>
        ) : (
          <>
            {notice ? (
              <div style={{ marginBottom: 16, background: "#ecfdf5", border: "1px solid #86efac", color: "#166534", padding: 14, borderRadius: 12 }}>{notice}</div>
            ) : null}

            {activeTab === "dashboard" ? (
              <AdminDashboard />
            ) : activeTab === "overview" ? (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 20 }}>Admin Overview</h1>
                {stats ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
                    {[
                      { label: "Pending Providers", value: stats.providers.draft, color: "#d97706" },
                      { label: "Enabled Providers", value: stats.providers.enabled, color: "#10b981" },
                      { label: "Disabled Providers", value: stats.providers.disabled, color: "#ef4444" },
                      { label: "Draft Models", value: stats.models.draft, color: "#d97706" },
                      { label: "Enabled Models", value: stats.models.enabled, color: "#10b981" },
                      { label: "Disabled Models", value: stats.models.disabled, color: "#ef4444" },
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
                        { label: "Site Current RPM", value: monitorOverview.totals.currentRpm, color: "#2563eb" },
                        { label: "Site Current TPM", value: monitorOverview.totals.currentTpm, color: "#0f766e" },
                        { label: "Site Total RPM Limit", value: monitorOverview.totals.rpmLimit, color: "#7c3aed" },
                        { label: "Site Total TPM Limit", value: monitorOverview.totals.tpmLimit, color: "#b45309" },
                      ].map((item) => (
                        <div key={item.label} style={{ ...cardStyle, padding: 20 }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: item.color, fontVariantNumeric: "tabular-nums" }}>{Number(item.value || 0).toLocaleString()}</div>
                          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
                      {[
                        { label: "Healthy Providers", value: monitorOverview.totals.healthyProviders, color: "#10b981" },
                        { label: "Degraded Providers", value: monitorOverview.totals.degradedProviders, color: "#f59e0b" },
                        { label: "Down Providers", value: monitorOverview.totals.downProviders, color: "#ef4444" },
                        { label: "Monitored At", value: new Date(monitorOverview.generatedAt).toLocaleTimeString("zh-CN"), color: "#2563eb" },
                      ].map((item) => (
                        <div key={item.label} style={{ ...cardStyle, padding: 20 }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: item.color }}>{item.value}</div>
                          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16, marginBottom: 20 }}>
                      <div style={{ ...cardStyle, padding: 20 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 14 }}>Provider Health Status</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {monitorOverview.providers.map((provider) => (
                            <div key={provider.providerId} style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr 0.7fr 0.7fr", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{provider.providerName}</div>
                                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                                  Routes {provider.enabledRoutes}/{provider.modelCount} · Circuit {fallbackLabels[provider.fallbackState]}
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
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 14 }}>Alert Panel</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {monitorOverview.alerts.length === 0 ? (
                            <div style={{ color: "#6b7280", fontSize: 13 }}>No active alerts.</div>
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
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 12 }}>Registered Users</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>{users.length}</div>
                  </div>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 12 }}>Pending Tickets</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>
                      {tickets.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress").length}
                    </div>
                  </div>
                </div>
              </>
            ) : activeTab === "operations" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>Provider Operations</h1>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>Unified view of upstream providers, model routing, pricing, rate limits and health status</div>
                  </div>
                  <button onClick={() => loadData()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                    Refresh
                  </button>
                </div>

                {!operations ? (
                  <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>No provider operations data available</div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 14, marginBottom: 18 }}>
                      {[
                        { label: "Active Providers", value: `${operations.summary.enabledProviders}/${operations.summary.providers}`, color: "#10b981" },
                        { label: "Routed Models", value: `${operations.summary.routedModels}/${operations.summary.models}`, color: "#2563eb" },
                        { label: "EnableRoutes", value: `${operations.summary.enabledRoutes}/${operations.summary.routes}`, color: "#0f766e" },
                        { label: "Cost Coverage", value: `${operations.summary.costedRoutes}/${operations.summary.routes}`, color: "#7c3aed" },
                        { label: "Policy Coverage", value: operations.summary.routePolicies, color: "#b45309" },
                        { label: "Risks", value: `${operations.summary.criticalIssues}/${operations.summary.warningIssues}`, color: "#dc2626" },
                      ].map((item) => (
                        <div key={item.label} style={{ ...cardStyle, padding: 16 }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: item.color, fontVariantNumeric: "tabular-nums" }}>{item.value}</div>
                          <div style={{ marginTop: 5, fontSize: 12, color: "#6b7280" }}>{item.label}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 16, marginBottom: 18, alignItems: "start" }}>
                      <div style={{ ...cardStyle, padding: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
                          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: 0 }}>Provider Ledger</h2>
                          <span style={{ fontSize: 12, color: "#6b7280" }}>Generated at {new Date(operations.generatedAt).toLocaleTimeString("zh-CN")}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {operations.providers.map((provider) => (
                            <button
                              key={provider.id}
                              onClick={() => {
                                setSelectedProviderId(provider.id);
                                setActiveTab("providers");
                              }}
                              style={{ width: "100%", padding: 14, borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
                            >
                              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr 0.8fr 0.8fr", gap: 12, alignItems: "center" }}>
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{provider.name}</span>
                                    <span style={{ padding: "2px 8px", borderRadius: 9999, fontSize: 11.5, background: `${statusColors[provider.status]}15`, color: statusColors[provider.status] }}>{statusLabels[provider.status]}</span>
                                    <span style={{ padding: "2px 8px", borderRadius: 9999, fontSize: 11.5, background: `${statusColors[provider.health]}15`, color: statusColors[provider.health] }}>{healthLabels[provider.health]}</span>
                                  </div>
                                  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", overflowWrap: "anywhere" }}>{provider.apiBaseUrl}</div>
                                  <div style={{ marginTop: 4, fontSize: 12, color: provider.missingApiKey ? "#b91c1c" : "#6b7280" }}>Key: {provider.apiKeyMasked}</div>
                                </div>
                                <div style={{ fontSize: 12, color: "#4b5563" }}>
                                  Model {provider.modelCount}
                                  <br />
                                  Routes {provider.enabledRoutes}
                                </div>
                                <div style={{ fontSize: 12, color: "#4b5563" }}>
                                  RPM {provider.currentRpm}/{provider.rpmLimit}
                                  <br />
                                  TPM {provider.currentTpm}/{provider.tpmLimit}
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <div style={{ fontSize: 20, fontWeight: 700, color: provider.saturationRatio >= 0.8 ? "#dc2626" : provider.saturationRatio >= 0.5 ? "#d97706" : "#10b981" }}>{formatPercent(provider.saturationRatio)}</div>
                                  <div style={{ fontSize: 12, color: "#6b7280" }}>Capacity</div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ ...cardStyle, padding: 20 }}>
                        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: "0 0 14px" }}>Operational Risk List</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {operations.issues.length === 0 ? (
                            <div style={{ color: "#6b7280", fontSize: 13 }}>No configuration risks found.</div>
                          ) : operations.issues.slice(0, 12).map((issue, index) => (
                            <div key={`${issue.title}-${index}`} style={{
                              borderRadius: 10,
                              border: `1px solid ${issue.level === "critical" ? "#fecaca" : "#fed7aa"}`,
                              background: issue.level === "critical" ? "#fef2f2" : "#fff7ed",
                              padding: 12,
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: issue.level === "critical" ? "#b91c1c" : "#c2410c" }}>{issue.title}</div>
                                <span style={{ fontSize: 11, color: "#6b7280" }}>{issue.scope}</span>
                              </div>
                              <div style={{ marginTop: 6, fontSize: 12, color: "#4b5563", lineHeight: 1.6 }}>{issue.detail}</div>
                              <div style={{ marginTop: 6, fontSize: 12, color: "#111827", lineHeight: 1.6 }}>Suggestion: {issue.action}</div>
                            </div>
                          ))}
                          {operations.issues.length > 12 ? (
                            <div style={{ fontSize: 12, color: "#6b7280" }}>more {operations.issues.length - 12} risks. Check Model Management and Provider Console for more.</div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18, alignItems: "start" }}>
                      <div style={{ ...cardStyle, padding: 20 }}>
                        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: "0 0 14px" }}>Customer/Model Route Policies</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {operations.routePolicies.length === 0 ? (
                            <div style={{ color: "#6b7280", fontSize: 13 }}>No customer-level override policies. System dispatches by global weight and health.</div>
                          ) : operations.routePolicies.slice(0, 8).map((policy) => (
                            <div key={policy.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{policy.model_id} · {policy.strategy}</div>
                                <span style={{ fontSize: 12, color: policy.is_enabled ? "#059669" : "#6b7280" }}>{policy.is_enabled ? "Enable" : "Disabled"}</span>
                              </div>
                              <div style={{ marginTop: 6, fontSize: 12, color: "#4b5563", lineHeight: 1.6 }}>
                                Customer {policy.user_id || "Global"} · Pinned Provider {policy.pinned_provider_id || "-"} · SLA {policy.min_availability ?? "-"}%
                              </div>
                              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                                Allowed {policy.allowed_providers.length ? policy.allowed_providers.join(", ") : "Any"} · Blocked {policy.blocked_providers.length ? policy.blocked_providers.join(", ") : "None"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ ...cardStyle, padding: 20 }}>
                        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: "0 0 14px" }}>Recent Route Change Audits</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {operations.routeAudits.length === 0 ? (
                            <div style={{ color: "#6b7280", fontSize: 13 }}>No route, cost or policy changes recorded.</div>
                          ) : operations.routeAudits.map((audit) => (
                            <div key={audit.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{audit.action}</div>
                                <span style={{ fontSize: 12, color: "#6b7280" }}>{new Date(audit.created_at).toLocaleString("zh-CN")}</span>
                              </div>
                              <div style={{ marginTop: 6, fontSize: 12, color: "#4b5563" }}>
                                {audit.provider_id} / {audit.model_id}
                              </div>
                              {audit.reason ? <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>{audit.reason}</div> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div style={{ ...cardStyle, overflow: "hidden" }}>
                      <div style={{ padding: "16px 18px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", background: "#f8fafc" }}>
                        <div>
                          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: 0 }}>Model Route Matrix</h2>
                          <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>Each row is an upstream route. Pricing from model catalog, capacity from provider config</div>
                        </div>
                        <button onClick={() => setActiveTab("models")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                          EditModelRoutes
                        </button>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse", fontSize: 12.5 }}>
                          <thead>
                            <tr style={{ background: "#fff" }}>
                              {["Model", "Provider", "Status", "Price/Margin", "Rate Limit", "Weight", "SLA", "Capacity"].map((head) => (
                                <th key={head} style={{ padding: "11px 12px", borderBottom: "1px solid #e5e7eb", color: "#6b7280", textAlign: "left", fontWeight: 700 }}>{head}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {operations.routes.map((route) => {
                              const isTaskModel = isTaskModelCategory(route.category);
                              return (
                                <tr key={`${route.providerId}-${route.modelId}`} style={{ background: route.enabled ? "#fff" : "#fafafa" }}>
                                  <td style={{ padding: "12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" }}>
                                    <div style={{ fontWeight: 700, color: "#111827" }}>{route.modelName}</div>
                                    <code style={{ display: "inline-block", marginTop: 5, color: "#1d4ed8", background: "#eff6ff", borderRadius: 6, padding: "2px 7px" }}>{route.modelId}</code>
                                    <div style={{ marginTop: 5, color: "#6b7280" }}>{route.category}</div>
                                  </td>
                                  <td style={{ padding: "12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" }}>
                                    <div style={{ fontWeight: 700, color: "#111827" }}>{route.providerName}</div>
                                    <div style={{ marginTop: 5, color: route.recommended ? "#059669" : "#b45309" }}>{route.recommended ? "Recommended" : `Consider routing to ${route.recommendedProviderId}`}</div>
                                  </td>
                                  <td style={{ padding: "12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" }}>
                                    <span style={{ padding: "3px 8px", borderRadius: 9999, background: route.enabled ? "#ecfdf5" : "#f3f4f6", color: route.enabled ? "#166534" : "#6b7280" }}>{route.enabled ? "Enable" : "Disabled"}</span>
                                    <div style={{ marginTop: 6, color: "#6b7280" }}>Provider {statusLabels[route.providerStatus] || route.providerStatus}</div>
                                  </td>
                                  <td style={{ padding: "12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top", color: "#4b5563" }}>
                                    Price In {route.promptPrice}
                                    <br />
                                    Price Out {route.completionPrice}
                                    <br />
                                    Cost {route.promptCost}/{route.completionCost}
                                    <br />
                                    Margin {route.grossMarginPrompt}%/{route.grossMarginCompletion}%
                                    <br />
                                    {route.priceUnit}
                                  </td>
                                  <td style={{ padding: "12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top", color: "#4b5563" }}>
                                    {isTaskModel ? "Task Submit" : "RPM"} {route.currentRpm}/{route.rpmLimit}
                                    <br />
                                    {isTaskModel ? `Task Concur. ${route.concurrentLimit}` : `TPM ${route.currentTpm}/${route.tpmLimit}`}
                                    <br />
                                    Daily Limit {route.dailyLimit}
                                  </td>
                                  <td style={{ padding: "12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top", color: "#4b5563" }}>
                                    Priority {route.priority}
                                    <br />
                                    Weight {route.weight}
                                  </td>
                                  <td style={{ padding: "12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" }}>
                                    <span style={{ padding: "3px 8px", borderRadius: 9999, background: `${statusColors[route.health]}15`, color: statusColors[route.health] }}>{healthLabels[route.health]}</span>
                                    <div style={{ marginTop: 6, color: "#6b7280" }}>Latency {route.avgLatencyMs}ms</div>
                                    <div style={{ marginTop: 4, color: "#6b7280" }}>Availability {route.availability}%</div>
                                    {route.lastError ? <div style={{ marginTop: 4, color: "#b91c1c", maxWidth: 220, overflowWrap: "anywhere" }}>{route.lastError}</div> : null}
                                  </td>
                                  <td style={{ padding: "12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top", textAlign: "right" }}>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: route.saturationRatio >= 0.8 ? "#dc2626" : route.saturationRatio >= 0.5 ? "#d97706" : "#10b981" }}>{formatPercent(route.saturationRatio)}</div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : activeTab === "users" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>User Management</h1>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>View accounts, balances, usage, default limits and per-model override rules</div>
                  </div>
                  {usageOverview ? (
                    <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#4b5563" }}>
                      <span style={{ padding: "6px 10px", borderRadius: 9999, background: "#f3f4f6" }}>Requests {usageOverview.totalRequests.toLocaleString()}</span>
                      <span style={{ padding: "6px 10px", borderRadius: 9999, background: "#f3f4f6" }}>Tokens {usageOverview.totalTokens.toLocaleString()}</span>
                    </div>
                  ) : null}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 0.9fr) minmax(420px, 1.1fr)", gap: 16, alignItems: "start" }}>
                  <div style={{ ...cardStyle, overflow: "hidden" }}>
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                      User List
                    </div>
                    <div style={{ padding: 12, borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
                      <input
                        value={userSearch}
                        onChange={(event) => setUserSearch(event.target.value)}
                        placeholder="Search nickname, email, phone or user ID"
                        style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 10px", fontSize: 13, fontFamily: "inherit" }}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {filteredUsers.length === 0 ? (
                        <div style={{ padding: 36, textAlign: "center", color: "#6b7280" }}>No user data available</div>
                      ) : filteredUsers.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => setSelectedUserId(user.id)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: 14,
                            border: "none",
                            borderBottom: "1px solid #f3f4f6",
                            background: selectedUserId === user.id ? "#eff6ff" : "#fff",
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{user.nickname}</div>
                              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>{user.email || user.phone}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }}>¥{Number(user.balance || 0).toFixed(2)}</div>
                              <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                                {user.customLimitCount || 0} limits · {userModelDiscounts.filter((discount) => discount.user_id === user.id).length} discounts
                              </div>
                            </div>
                          </div>
                          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11.5, color: "#4b5563" }}>
                            <span style={{ padding: "4px 8px", borderRadius: 9999, background: "#f3f4f6" }}>Default QPM {user.defaultQpm?.toLocaleString?.() || "-"}</span>
                            <span style={{ padding: "4px 8px", borderRadius: 9999, background: "#f3f4f6" }}>Default TPM {user.defaultTpm?.toLocaleString?.() || "-"}</span>
                            <span style={{ padding: "4px 8px", borderRadius: 9999, background: "#f3f4f6" }}>Pending {user.pendingRequestCount || 0}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {selectedUser ? (
                      <>
                        {/* ── User header + balance ── */}
                        <div style={{ ...cardStyle, padding: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
                            <div>
                              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>{selectedUser.nickname}</h2>
                              <div style={{ marginTop: 4, fontSize: 13, color: "#6b7280" }}>{selectedUser.email || selectedUser.phone}</div>
                              <div style={{ marginTop: 2, fontSize: 11, color: "#9ca3af" }}>ID: {selectedUser.id}</div>
                              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>Registered on {new Date(selectedUser.createdAt).toLocaleString("zh-CN")}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 26, fontWeight: 700, color: "#10b981" }}>¥{Number(selectedUser.balance || 0).toFixed(2)}</div>
                              <div style={{ fontSize: 12, color: "#6b7280" }}>Account Balance</div>
                              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
                                <button
                                  onClick={() => { setBalanceForm(null); openBalanceForm(selectedUser.id); }}
                                  style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 8, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}
                                >
                                  Adjust Balance
                                </button>
                                <button
                                  onClick={() => handleExportUserBilling(selectedUser.id)}
                                  style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 8, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}
                                >
                                  Export Billing
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Inline balance form */}
                          {balanceForm && (
                            <div style={{ marginTop: 14, padding: 14, background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0" }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 10 }}>Adjust Balance</div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
                                  Adjustment amount (positive = increase, negative = decrease)
                                  <input
                                    type="number"
                                    value={balanceForm.amount}
                                    onChange={(e) => setBalanceForm({ ...balanceForm, amount: e.target.value })}
                                    placeholder="e.g. 100 or -50"
                                    style={{ padding: "8px 10px", borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13 }}
                                  />
                                </label>
                                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
                                  Description
                                  <input
                                    value={balanceForm.description}
                                    onChange={(e) => setBalanceForm({ ...balanceForm, description: e.target.value })}
                                    placeholder="Adjustment description (optional)"
                                    style={{ padding: "8px 10px", borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13 }}
                                  />
                                </label>
                              </div>
                              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                <button onClick={() => submitBalanceForm(selectedUser.id)} style={{ border: "none", background: "#111827", color: "#fff", borderRadius: 7, padding: "7px 16px", fontSize: 13, cursor: "pointer" }}>Confirm Adjustment</button>
                                <button onClick={() => setBalanceForm(null)} style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 7, padding: "7px 12px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                              </div>
                            </div>
                          )}

                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
                            {[
                              { label: "Default QPM", value: (selectedUserDetail?.defaultQpm ?? selectedUser.defaultQpm)?.toLocaleString?.() || "-" },
                              { label: "Default TPM", value: (selectedUserDetail?.defaultTpm ?? selectedUser.defaultTpm)?.toLocaleString?.() || "-" },
                              { label: "Model Limits", value: (selectedUserDetail?.customLimits ?? selectedUser.customLimits)?.length || 0 },
                              { label: "Pending", value: selectedUser.pendingRequestCount || 0 },
                            ].map((item) => (
                              <div key={item.label} style={{ padding: 14, borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc" }}>
                                <div style={{ fontSize: 12, color: "#6b7280" }}>{item.label}</div>
                                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: "#111827" }}>{item.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* ── Default rate limit (*) ── */}
                        <div style={{ ...cardStyle, padding: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                            <div>
                              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: 0 }}>Default Limits</h3>
                              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>Applies to all models without specific overrides</div>
                            </div>
                            {!defaultLimitForm && (
                              <button
                                onClick={() => setDefaultLimitForm({
                                  qpm: String(selectedUserDetail?.defaultQpm ?? selectedUser.defaultQpm ?? 60),
                                  tpm: String(selectedUserDetail?.defaultTpm ?? selectedUser.defaultTpm ?? 100000),
                                })}
                                style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 8, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}
                              >
                                Edit
                              </button>
                            )}
                          </div>
                          {defaultLimitForm ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
                              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
                                QPM
                                <input type="number" value={defaultLimitForm.qpm} onChange={(e) => setDefaultLimitForm({ ...defaultLimitForm, qpm: e.target.value })}
                                  style={{ padding: "8px 10px", borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13 }} />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
                                TPM
                                <input type="number" value={defaultLimitForm.tpm} onChange={(e) => setDefaultLimitForm({ ...defaultLimitForm, tpm: e.target.value })}
                                  style={{ padding: "8px 10px", borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13 }} />
                              </label>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => submitDefaultLimitForm(selectedUser.id)} style={{ border: "none", background: "#111827", color: "#fff", borderRadius: 7, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>Save</button>
                                <button onClick={() => setDefaultLimitForm(null)} style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 7, padding: "8px 10px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 20 }}>
                              <span style={{ fontSize: 13, color: "#374151" }}>QPM <strong>{(selectedUserDetail?.defaultQpm ?? selectedUser.defaultQpm)?.toLocaleString?.() || "-"}</strong></span>
                              <span style={{ fontSize: 13, color: "#374151" }}>TPM <strong>{(selectedUserDetail?.defaultTpm ?? selectedUser.defaultTpm)?.toLocaleString?.() || "-"}</strong></span>
                            </div>
                          )}
                        </div>

                        {/* ── Per-model rate limits ── */}
                        <div style={{ ...cardStyle, padding: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: 0 }}>Model Rate Limit Details</h3>
                            <button
                              onClick={() => { setRateLimitFormTarget(null); setRateLimitForm({ model: "", qpm: "60", tpm: "100000" }); }}
                              style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 8, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}
                            >
                              + Add New
                            </button>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 140px", gap: 8, padding: "6px 10px", fontSize: 11, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #f3f4f6", marginBottom: 4 }}>
                            <div>Model</div><div>QPM</div><div>TPM</div><div></div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column" }}>
                            {(() => {
                              const limits = selectedUserDetail?.customLimits ?? selectedUser.customLimits ?? [];
                              return limits.length > 0 ? limits.map((limit) => (
                                <div key={limit.id}>
                                  {rateLimitForm && rateLimitFormTarget === limit.model ? (
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 140px", gap: 8, padding: "8px 10px", alignItems: "center", background: "#f8fafc", borderRadius: 8, marginBottom: 4, border: "1px solid #e0e7ff" }}>
                                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{limit.model}</div>
                                      <input type="number" value={rateLimitForm.qpm} onChange={(e) => setRateLimitForm({ ...rateLimitForm, qpm: e.target.value })}
                                        style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
                                      <input type="number" value={rateLimitForm.tpm} onChange={(e) => setRateLimitForm({ ...rateLimitForm, tpm: e.target.value })}
                                        style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
                                      <div style={{ display: "flex", gap: 6 }}>
                                        <button onClick={() => submitRateLimitForm(selectedUser.id)} style={{ border: "none", background: "#111827", color: "#fff", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", flex: 1 }}>Save</button>
                                        <button onClick={() => { setRateLimitForm(null); setRateLimitFormTarget(null); }} style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 140px", gap: 8, padding: "10px 10px", alignItems: "center", borderRadius: 8, borderBottom: "1px solid #f3f4f6" }}>
                                      <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{limit.model}</div>
                                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{limit.source}</div>
                                      </div>
                                      <div style={{ fontSize: 13, color: "#374151" }}>{limit.qpm.toLocaleString()}</div>
                                      <div style={{ fontSize: 13, color: "#374151" }}>{limit.tpm.toLocaleString()}</div>
                                      <div style={{ display: "flex", gap: 6 }}>
                                        <button onClick={() => openRateLimitForm(selectedUser.id, limit)} style={{ border: "1px solid #d1d5db", background: "#fff", color: "#374151", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", flex: 1 }}>Edit</button>
                                        <button onClick={() => handleDeleteUserRateLimit(selectedUser.id, limit.model)} style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#be123c", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>Delete</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )) : (
                                <div style={{ padding: "12px 10px", color: "#6b7280", fontSize: 13 }}>No model-level overrides. Default limits apply.</div>
                              );
                            })()}

                            {rateLimitForm && rateLimitFormTarget === null && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 140px", gap: 8, padding: "8px 10px", alignItems: "center", background: "#f0fdf4", borderRadius: 8, marginTop: 8, border: "1px solid #bbf7d0" }}>
                                <ModelCombobox
                                  value={rateLimitForm.model}
                                  onChange={(v) => setRateLimitForm({ ...rateLimitForm, model: v })}
                                  options={[
                                    { value: "*", label: "* Global Default" },
                                    ...models.map((m) => ({ value: m.modelId, label: m.modelId })),
                                  ]}
                                />
                                <input type="number" value={rateLimitForm.qpm} onChange={(e) => setRateLimitForm({ ...rateLimitForm, qpm: e.target.value })}
                                  style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
                                <input type="number" value={rateLimitForm.tpm} onChange={(e) => setRateLimitForm({ ...rateLimitForm, tpm: e.target.value })}
                                  style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button onClick={() => submitRateLimitForm(selectedUser.id)} style={{ border: "none", background: "#111827", color: "#fff", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", flex: 1 }}>Save</button>
                                  <button onClick={() => { setRateLimitForm(null); setRateLimitFormTarget(null); }} style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── Model discounts ── */}
                        <div style={{ ...cardStyle, padding: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                            <div>
                              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: 0 }}>Model Discounts</h3>
                              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>Override catalog price by user + model</div>
                            </div>
                            {!discountForm && (
                              <button onClick={() => openDiscountForm(selectedUser.id)}
                                style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 12, cursor: "pointer" }}>
                                Add Discount
                              </button>
                            )}
                          </div>

                          {discountForm && (
                            <div style={{ padding: 14, background: "#f8fafc", borderRadius: 10, border: "1px solid #e0e7ff", marginBottom: 12 }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
                                  Model ID
                                  <input value={discountForm.modelId} onChange={(e) => setDiscountForm({ ...discountForm, modelId: e.target.value })}
                                    placeholder="e.g. qwen-plus" disabled={!!discountForm.editId}
                                    style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13, background: discountForm.editId ? "#f3f4f6" : "#fff" }} />
                                </label>
                                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
                                  Discount rate (0-1, 0.8 = 20% off)
                                  <input type="number" step="0.01" min="0" max="1" value={discountForm.rate}
                                    onChange={(e) => setDiscountForm({ ...discountForm, rate: e.target.value })}
                                    style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13 }} />
                                </label>
                                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
                                  Notes
                                  <input value={discountForm.notes} onChange={(e) => setDiscountForm({ ...discountForm, notes: e.target.value })}
                                    placeholder="Optional" style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid #d1d5db", fontSize: 13 }} />
                                </label>
                              </div>
                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", cursor: "pointer" }}>
                                  <input type="checkbox" checked={discountForm.enabled} onChange={(e) => setDiscountForm({ ...discountForm, enabled: e.target.checked })} />
                                  Enable
                                </label>
                                <button onClick={() => submitDiscountForm(selectedUser.id)} style={{ border: "none", background: "#111827", color: "#fff", borderRadius: 7, padding: "7px 16px", fontSize: 13, cursor: "pointer" }}>Save</button>
                                <button onClick={() => setDiscountForm(null)} style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 7, padding: "7px 12px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                              </div>
                            </div>
                          )}

                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {selectedUserDiscounts.length > 0 ? selectedUserDiscounts.map((discount) => (
                              <div key={discount.id} style={{ padding: 14, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                                  <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{discount.model_id}</div>
                                    <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                                      {discount.notes || "NoneNotes"} · {discount.is_enabled ? "Enable" : "Disabled"}
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ textAlign: "right" }}>
                                      <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{Math.round(Number(discount.discount_rate || 1) * 100)}%</div>
                                      <div style={{ fontSize: 11, color: "#6b7280" }}>Actual Pay Rate</div>
                                    </div>
                                    <button onClick={() => openDiscountForm(selectedUser.id, discount)}
                                      style={{ border: "1px solid #d1d5db", background: "#fff", color: "#374151", borderRadius: 8, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}>Edit</button>
                                    <button onClick={() => handleDeleteUserDiscount(discount.id)}
                                      style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#be123c", borderRadius: 8, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}>Delete</button>
                                  </div>
                                </div>
                              </div>
                            )) : (
                              <div style={{ color: "#6b7280", fontSize: 13 }}>No model discounts. All models billed at catalog price.</div>
                            )}
                          </div>
                        </div>

                        {/* ── Usage stats ── */}
                        <div style={{ ...cardStyle, padding: 20 }}>
                          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: "0 0 14px" }}>Usage</h3>
                          {userDetailLoading ? (
                            <div style={{ color: "#6b7280", fontSize: 13 }}>Loading usage...</div>
                          ) : (selectedUserDetail?.usage || selectedUser.usage) ? (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                              {(() => {
                                const usage = selectedUserDetail?.usage || selectedUser.usage!;
                                return [
                                  { label: "Requests", value: usage.totalRequests.toLocaleString() },
                                  { label: "Tokens", value: usage.totalTokens.toLocaleString() },
                                  { label: "Cost", value: `¥${Number(usage.totalCost || 0).toFixed(4)}` },
                                  { label: "Success Rate", value: `${Number(usage.successRate || 0).toFixed(1)}%` },
                                ].map((item) => (
                                  <div key={item.label} style={{ padding: 14, borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff" }}>
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>{item.label}</div>
                                    <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: "#111827" }}>{item.value}</div>
                                  </div>
                                ));
                              })()}
                            </div>
                          ) : <div style={{ color: "#6b7280", fontSize: 13 }}>No usage data available</div>}
                        </div>

                        {/* ── By-model usage ── */}
                        <div style={{ ...cardStyle, padding: 20 }}>
                          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: "0 0 14px" }}>Usage by Model</h3>
                          {selectedUserDetail?.byModel && selectedUserDetail.byModel.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {selectedUserDetail.byModel.map((row) => (
                                <div key={row.model} style={{ display: "grid", gridTemplateColumns: "1fr 90px 110px 90px", gap: 10, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10, alignItems: "center" }}>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{row.model}</div>
                                    <div style={{ marginTop: 3, fontSize: 11.5, color: "#6b7280" }}>{row.percentage}% request share</div>
                                  </div>
                                  <div style={{ textAlign: "right", fontSize: 12, color: "#4b5563" }}>{row.requests.toLocaleString()} times</div>
                                  <div style={{ textAlign: "right", fontSize: 12, color: "#4b5563" }}>{row.tokens.toLocaleString()} tokens</div>
                                  <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: "#111827" }}>¥{Number(row.cost || 0).toFixed(4)}</div>
                                </div>
                              ))}
                            </div>
                          ) : <div style={{ color: "#6b7280", fontSize: 13 }}>No model usage details available</div>}
                        </div>

                        {/* ── Recent API calls ── */}
                        <div style={{ ...cardStyle, padding: 20 }}>
                          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: "0 0 14px" }}>Recent API Calls</h3>
                          {selectedUserDetail?.recent && selectedUserDetail.recent.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {selectedUserDetail.recent.slice(0, 20).map((call, index) => (
                                <div key={`${call.time}-${call.model}-${index}`} style={{ display: "grid", gridTemplateColumns: "90px 1fr 96px 86px 70px", gap: 10, padding: 11, border: "1px solid #e5e7eb", borderRadius: 10, alignItems: "center" }}>
                                  <div style={{ fontSize: 11.5, color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>{call.time}</div>
                                  <div style={{ minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{call.model}</div>
                                  <div style={{ textAlign: "right", fontSize: 12, color: "#4b5563" }}>{Number(call.tokens || 0).toLocaleString()} tokens</div>
                                  <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: "#111827" }}>¥{Number(call.cost || 0).toFixed(6)}</div>
                                  <div style={{ textAlign: "right", fontSize: 12, color: call.status === "Success" ? "#059669" : "#dc2626" }}>{call.status}</div>
                                </div>
                              ))}
                            </div>
                          ) : <div style={{ color: "#6b7280", fontSize: 13 }}>No API call details available</div>}
                        </div>

                        {/* ── Transactions ── */}
                        <div style={{ ...cardStyle, padding: 20 }}>
                          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: "0 0 14px" }}>Recent Transactions</h3>
                          {selectedUserDetail?.transactions?.rows?.length ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {selectedUserDetail.transactions.rows.slice(0, 8).map((tx) => (
                                <div key={tx.id} style={{ display: "grid", gridTemplateColumns: "110px 1fr 90px 90px", gap: 10, padding: 11, border: "1px solid #e5e7eb", borderRadius: 10, alignItems: "center" }}>
                                  <div style={{ fontSize: 12, color: "#6b7280" }}>{tx.type}</div>
                                  <div style={{ minWidth: 0, fontSize: 12.5, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description}</div>
                                  <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: Number(tx.amount) >= 0 ? "#059669" : "#dc2626" }}>¥{Number(tx.amount || 0).toFixed(6)}</div>
                                  <div style={{ textAlign: "right", fontSize: 12, color: "#4b5563" }}>¥{Number(tx.balance_after || 0).toFixed(2)}</div>
                                </div>
                              ))}
                            </div>
                          ) : <div style={{ color: "#6b7280", fontSize: 13 }}>No transactions available</div>}
                        </div>

                        {/* ── All requests history ── */}
                        <div style={{ ...cardStyle, padding: 20 }}>
                          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: "0 0 14px" }}>Rate Limit Request History</h3>
                          {userDetailLoading ? (
                            <div style={{ color: "#6b7280", fontSize: 13 }}>Loading...</div>
                          ) : selectedUserDetail?.requests && selectedUserDetail.requests.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {selectedUserDetail.requests.map((req) => (
                                <div key={req.id} style={{ padding: 14, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                                    <div>
                                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{req.model}</div>
                                      <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                                        QPM {req.requested_qpm.toLocaleString()} · TPM {req.requested_tpm.toLocaleString()}
                                      </div>
                                      {req.reason ? <div style={{ marginTop: 4, fontSize: 12, color: "#4b5563" }}>{req.reason}</div> : null}
                                      {req.admin_reply ? <div style={{ marginTop: 6, fontSize: 12, color: "#334155", background: "#f8fafc", borderRadius: 6, padding: "6px 10px" }}>Approval note: {req.admin_reply}</div> : null}
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                                      <span style={{
                                        padding: "3px 10px", borderRadius: 9999, fontSize: 12,
                                        background: req.status === "pending" ? "#fff7ed" : req.status === "approved" ? "#ecfdf5" : "#fef2f2",
                                        color: req.status === "pending" ? "#c2410c" : req.status === "approved" ? "#166534" : "#b91c1c",
                                      }}>{req.status === "pending" ? "Pending" : req.status === "approved" ? "Approved" : "Rejected"}</span>
                                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{new Date(req.created_at).toLocaleString("zh-CN")}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : <div style={{ color: "#6b7280", fontSize: 13 }}>No request history available</div>}
                        </div>
                      </>
                    ) : (
                      <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "#6b7280" }}>Select a user to view details</div>
                    )}
                  </div>
                </div>
              </>
            ) : activeTab === "approvals" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>Rate Limit Approvals</h1>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>Users submit QPM/TPM requests here for admin approval or rejection</div>
                  </div>
                  <button onClick={() => loadData()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                    Refresh
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {rateLimitRequests.length === 0 ? (
                    <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>No rate limit requests</div>
                  ) : rateLimitRequests.map((request) => {
                    const user = users.find((item) => item.id === request.user_id);
                    return (
                      <div key={request.id} style={{ ...cardStyle, padding: 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{user?.nickname || request.user_id}</span>
                              <span style={{ fontSize: 12, color: "#6b7280" }}>{user?.email || user?.phone || "Unknown account"}</span>
                              <span style={{ padding: "3px 10px", borderRadius: 9999, fontSize: 12, background: request.status === "pending" ? "#fff7ed" : request.status === "approved" ? "#ecfdf5" : "#fef2f2", color: request.status === "pending" ? "#c2410c" : request.status === "approved" ? "#166534" : "#b91c1c" }}>
                                {request.status}
                              </span>
                            </div>
                            <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#4b5563" }}>
                              <span>Model: {request.model}</span>
                              <span>QPM: {request.requested_qpm}</span>
                              <span>TPM: {request.requested_tpm}</span>
                              <span>Created At: {new Date(request.created_at).toLocaleString("zh-CN")}</span>
                            </div>
                            {request.reason ? (
                              <div style={{ marginTop: 8, fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>{request.reason}</div>
                            ) : null}
                            {request.admin_reply ? (
                              <div style={{ marginTop: 10, fontSize: 12.5, color: "#334155", background: "#f8fafc", borderRadius: 8, padding: 10 }}>
                                Approval note: {request.admin_reply}
                              </div>
                            ) : null}
                          </div>
                          {request.status === "pending" ? (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => handleApproveRequest(request.id, request)}
                                disabled={isActing(`approve-request-${request.id}`) || isActing(`reject-request-${request.id}`)}
                                style={{ padding: "8px 14px", border: "none", borderRadius: 8, background: "#10b981", color: "#fff", cursor: "pointer", fontFamily: "inherit", opacity: isActing(`approve-request-${request.id}`) ? 0.6 : 1 }}
                              >
                                {isActing(`approve-request-${request.id}`) ? "Processing..." : "Approve"}
                              </button>
                              <button
                                onClick={() => handleRejectRequest(request.id)}
                                disabled={isActing(`approve-request-${request.id}`) || isActing(`reject-request-${request.id}`)}
                                style={{ padding: "8px 14px", border: "none", borderRadius: 8, background: "#ef4444", color: "#fff", cursor: "pointer", fontFamily: "inherit", opacity: isActing(`reject-request-${request.id}`) ? 0.6 : 1 }}
                              >
                                {isActing(`reject-request-${request.id}`) ? "Processing..." : "Reject"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : activeTab === "providers" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>Provider Console</h1>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>Unified management of upstream provider config, capacity policies and health status</div>
                  </div>
                  <button onClick={() => loadData()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                    Refresh
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {(["by-provider", "by-model"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setProviderViewMode(mode)}
                      style={{
                        padding: "8px 16px",
                        background: providerViewMode === mode ? "#111827" : "#fff",
                        color: providerViewMode === mode ? "#fff" : "#4b5563",
                        border: "1px solid #d1d5db",
                        borderRadius: 9999,
                        fontSize: 13,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontWeight: providerViewMode === mode ? 600 : 400,
                      }}
                    >
                      {mode === "by-provider" ? "By Provider" : "By Model"}
                    </button>
                  ))}
                </div>

                {providerViewMode === "by-provider" ? (
                <>

                {monitorOverview ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 18 }}>
                    {[
                      { label: "Site Current RPM", value: monitorOverview.totals.currentRpm, color: "#2563eb" },
                      { label: "Site Current TPM", value: monitorOverview.totals.currentTpm, color: "#0f766e" },
                      { label: "Site Total RPM Limit", value: monitorOverview.totals.rpmLimit, color: "#7c3aed" },
                      { label: "Site Total TPM Limit", value: monitorOverview.totals.tpmLimit, color: "#b45309" },
                    ].map((item) => (
                      <div key={item.label} style={{ ...cardStyle, padding: 18 }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: item.color, fontVariantNumeric: "tabular-nums" }}>{Number(item.value || 0).toLocaleString()}</div>
                        <div style={{ fontSize: 12.5, color: "#6b7280", marginTop: 4 }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

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
                            {item === "all" ? "All" : statusLabels[item]}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {filteredProviders.length === 0 ? (
                          <div style={{ padding: 32, textAlign: "center", color: "#6b7280" }}>No provider data available</div>
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
                              Model {provider.modelCount ?? 0} · Routes {provider.enabledRoutes ?? 0} · TPM {Number(provider.currentTpm || 0).toLocaleString()}/{Number(provider.tpmLimit || 0).toLocaleString()}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {detailLoading ? (
                      <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "#6b7280" }}>Loading provider details...</div>
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
                                slug: <code>{selectedProvider.slug}</code> · Key: {selectedProvider.apiKeyMasked}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              {selectedProvider.status !== "enabled" ? (
                                <button
                                  onClick={() => handleApproveProvider(selectedProvider.id)}
                                  disabled={isActing(`enable-provider-${selectedProvider.id}`) || isActing(`disable-provider-${selectedProvider.id}`)}
                                  style={{ padding: "8px 14px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", opacity: isActing(`enable-provider-${selectedProvider.id}`) ? 0.6 : 1 }}
                                >
                                  {isActing(`enable-provider-${selectedProvider.id}`) ? "Processing..." : "Enable Provider"}
                                </button>
                              ) : null}
                              {selectedProvider.status !== "disabled" ? (
                                <button
                                  onClick={() => handleRejectProvider(selectedProvider.id)}
                                  disabled={isActing(`enable-provider-${selectedProvider.id}`) || isActing(`disable-provider-${selectedProvider.id}`)}
                                  style={{ padding: "8px 14px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", opacity: isActing(`disable-provider-${selectedProvider.id}`) ? 0.6 : 1 }}
                                >
                                  {isActing(`disable-provider-${selectedProvider.id}`) ? "Processing..." : "Disable Provider"}
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {selectedProvider.channelConfig ? (
                            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 16, background: "#f8fafc" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 12 }}>
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Current Channel</div>
                                  <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                                    {selectedProvider.channelConfig.activeChannel}
                                  </div>
                                </div>
                                <select
                                  value={selectedProvider.channelConfig.activeChannel}
                                  onChange={(event) => handleSwitchChannel(selectedProvider.id, event.target.value)}
                                  style={{ minWidth: 180, padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 13, fontFamily: "inherit" }}
                                >
                                  {selectedProvider.channelConfig.channels.map((channel) => (
                                    <option key={channel.id} value={channel.id}>
                                      {channel.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                                {selectedProvider.channelConfig.channels.map((channel) => (
                                  <div key={channel.id} style={{ padding: 12, borderRadius: 8, border: selectedProvider.channelConfig?.activeChannel === channel.id ? "1px solid #2563eb" : "1px solid #e5e7eb", background: "#fff" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                                      <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{channel.name}</span>
                                      <span style={{ fontSize: 11, color: "#4b5563", background: "#f3f4f6", borderRadius: 9999, padding: "2px 8px" }}>{channel.adapter}</span>
                                    </div>
                                    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", overflowWrap: "anywhere" }}>{channel.apiBaseUrl}</div>
                                    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>Key: {channel.apiKeyMasked}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                            {[
                              { label: "Provider Name", key: "name", type: "text" },
                              { label: "Website", key: "website", type: "text" },
                              { label: "API Base URL", key: "apiBaseUrl", type: "text" },
                              { label: "Contact Name", key: "contactName", type: "text" },
                              { label: "Contact Email", key: "contactEmail", type: "text" },
                              { label: "Contact Phone", key: "contactPhone", type: "text" },
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
                            Provider Description
                            <textarea
                              value={providerForm.description}
                              onChange={(event) => setProviderForm((current) => ({ ...current, description: event.target.value }))}
                              rows={3}
                              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, color: "#111827", resize: "vertical" }}
                            />
                          </label>

                          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#6b7280", marginTop: 12 }}>
                            Update API Key
                            <input
                              type="password"
                              placeholder="Leave empty to keep current key"
                              value={providerForm.apiKey}
                              onChange={(event) => setProviderForm((current) => ({ ...current, apiKey: event.target.value }))}
                              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, color: "#111827" }}
                            />
                          </label>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>
                              {selectedProvider.createdAt ? `Created on ${new Date(selectedProvider.createdAt).toLocaleString("zh-CN")}` : "Platform built-in upstream provider"}
                            </div>
                            <button onClick={handleSaveProvider} disabled={savingProvider} style={{ padding: "10px 18px", background: "#111827", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", opacity: savingProvider ? 0.55 : 1 }}>
                              {savingProvider ? "Saving..." : "Save Provider Config"}
                            </button>
                          </div>
                        </div>

                        {selectedProviderTotals ? (
                          <div style={{ ...cardStyle, padding: 20 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                              {[
                                { label: "Total Models", value: selectedProviderTotals.modelCount },
                                { label: "EnableRoutes", value: selectedProviderTotals.enabledRoutes },
                                { label: "Current RPM", value: selectedProviderTotals.currentRpm.toLocaleString() },
                                { label: "Current TPM", value: selectedProviderTotals.currentTpm.toLocaleString() },
                                { label: "RPM Limit", value: selectedProviderTotals.rpmLimit.toLocaleString() },
                                { label: "TPM Limit", value: selectedProviderTotals.tpmLimit.toLocaleString() },
                                { label: "Task Concurrency Limit", value: selectedProviderTotals.taskConcurrentLimit.toLocaleString() },
                                { label: "Capacity Usage", value: `${selectedProviderTotals.rpmLimit > 0 ? Math.round((selectedProviderTotals.currentRpm / selectedProviderTotals.rpmLimit) * 100) : 0}%` },
                              ].map((item) => (
                                <div key={item.label} style={{ padding: 14, borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc" }}>
                                  <div style={{ fontSize: 12, color: "#6b7280" }}>{item.label}</div>
                                  <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: "#111827" }}>{item.value}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div style={{ ...cardStyle, padding: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: 0 }}>Capacity & Route Policy</h3>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>Text/VL: RPM/TPM; Image/Video/Voice: task submission rate and background concurrency</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {providerDetail.models.length === 0 ? (
                              <div style={{ color: "#6b7280", fontSize: 13 }}>No models on this provider yet.</div>
                            ) : providerDetail.models.map((model) => {
                              const capacity = providerDetail.capacity.find((item) => item.modelId === model.modelId);
                              const health = providerDetail.health.find((item) => item.modelId === model.modelId);
                              const isTaskModel = isTaskModelCategory(model.category);
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
                                        <span>Category: {model.category}</span>
                                        <span>Weight: {capacity?.weight ?? 100}</span>
                                        <span>Priority: {capacity?.priority ?? 0}</span>
                                        <span>{isTaskModel ? "Task Submit RPM" : "RPM"}: {capacity?.rpmLimit ?? 60}</span>
                                        {isTaskModel ? (
                                          <span>Task Concur.: {capacity?.concurrentLimit ?? 10}</span>
                                        ) : (
                                          <span>TPM: {capacity?.tpmLimit ?? 100000}</span>
                                        )}
                                      </div>
                                      {health ? (
                                        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                                          Latency {health.avgLatencyMs} ms · Consecutive failures {health.consecutiveFailures}
                                          {health.lastError ? ` · Recent error: ${health.lastError}` : ""}
                                        </div>
                                      ) : null}
                                    </div>
                                    <button onClick={() => handleSaveCapacity(model.modelId, capacity)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                                      EditCapacity
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div style={{ ...cardStyle, padding: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: 0 }}>Runtime Monitoring</h3>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>Capacity hit rate, circuit breaker status, latency trends</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {providerRouteMetrics.length === 0 ? (
                              <div style={{ color: "#6b7280", fontSize: 13 }}>No route monitoring data available.</div>
                            ) : providerRouteMetrics.map((route) => {
                              const model = providerDetail.models.find((item) => item.modelId === route.modelId);
                              const isTaskModel = isTaskModelCategory(model?.category);
                              return (
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
                                      <span>{isTaskModel ? "Task Submit RPM" : "RPM"} {route.currentRpm}/{route.rpmLimit}</span>
                                      {isTaskModel ? <span>Task Concur. {route.concurrentLimit}</span> : <span>TPM {route.currentTpm}/{route.tpmLimit}</span>}
                                      <span>Latency {route.avgLatencyMs} ms</span>
                                      <span>Failures {route.consecutiveFailures} times</span>
                                      <span>Weight {route.weight}</span>
                                    </div>
                                  </div>
                                  <div style={{ minWidth: 92, textAlign: "right" }}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: route.saturation >= 0.8 ? "#dc2626" : route.saturation >= 0.5 ? "#d97706" : "#10b981" }}>
                                      {Math.round(route.saturation * 100)}%
                                    </div>
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>Capacity Hit Rate</div>
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
                                  <div style={{ marginTop: 10, fontSize: 12, color: "#b91c1c" }}>Recent error: {route.lastError}</div>
                                ) : null}
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "#6b7280" }}>Select a provider to view details</div>
                    )}
                  </div>
                </div>
                </>
                ) : (
                <>
                  <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="text"
                        placeholder="Search model ID or name..."
                        value={modelSearchQuery}
                        onChange={(e) => setModelSearchQuery(e.target.value)}
                        style={{ flex: 1, minWidth: 200, padding: "9px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                      />
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          onClick={() => setModelCategoryFilter("all")}
                          style={{ padding: "6px 12px", background: modelCategoryFilter === "all" ? "#111827" : "#fff", color: modelCategoryFilter === "all" ? "#fff" : "#4b5563", border: "1px solid #d1d5db", borderRadius: 9999, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          All
                        </button>
                        {modelCategories.map((cat) => (
                          <button
                            key={cat}
                            onClick={() => setModelCategoryFilter(cat)}
                            style={{ padding: "6px 12px", background: modelCategoryFilter === cat ? "#111827" : "#fff", color: modelCategoryFilter === cat ? "#fff" : "#4b5563", border: "1px solid #d1d5db", borderRadius: 9999, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>Total {filteredByModelModels.length} models</div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {filteredByModelModels.length === 0 ? (
                      <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>No matching models</div>
                    ) : filteredByModelModels.map((model) => (
                      <div key={model.id} style={{ ...cardStyle, padding: "16px 20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{model.name}</span>
                            <code style={{ fontSize: 12, color: "#1d4ed8", background: "#eff6ff", padding: "2px 8px", borderRadius: 6 }}>{model.modelId}</code>
                            <span style={{ padding: "2px 8px", borderRadius: 9999, fontSize: 12, background: "#f3f4f6", color: "#374151" }}>{model.category}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                            {model.routes?.filter((r) => r.isEnabled).length || 0}/{model.routes?.length || 0} RoutesEnable
                          </div>
                        </div>

                        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                          {model.routes && model.routes.length > 0 ? model.routes.map((route) => {
                            const isTask = isTaskModelCategory(model.category);
                            return (
                              <div
                                key={`${model.modelId}-${route.providerId}`}
                                style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.8fr auto", gap: 12, alignItems: "center", padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", background: route.isEnabled ? "#f8fafc" : "#fff", opacity: route.isEnabled ? 1 : 0.6 }}
                              >
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{route.providerName}</div>
                                  <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                                    <span style={{ color: route.isEnabled ? "#10b981" : "#ef4444", fontWeight: 600 }}>{route.isEnabled ? "Enable" : "Disabled"}</span>
                                  </div>
                                </div>
                                {isTask ? (
                                  <div style={{ fontSize: 12, color: "#4b5563" }}>
                                    RPM {route.currentRpm}/{route.rpmLimit}<br />
                                    Task Concur. {route.concurrentLimit}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 12, color: "#4b5563" }}>
                                    RPM {route.currentRpm}/{route.rpmLimit}<br />
                                    TPM {route.currentTpm}/{route.tpmLimit}
                                  </div>
                                )}
                                <div style={{ fontSize: 12, color: "#4b5563" }}>
                                  Priority {route.priority}<br />
                                  Weight {route.weight}
                                </div>
                                <button
                                  onClick={() => handleSaveModelRoute(model, route)}
                                  style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}
                                >
                                  Edit
                                </button>
                              </div>
                            );
                          }) : (
                            <div style={{ fontSize: 12.5, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 12 }}>
                              No active provider routes
                            </div>
                          )}
                          <button
                            onClick={() => handleSaveModelRoute(model)}
                            style={{ alignSelf: "flex-start", padding: "7px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}
                          >
                            + Add Provider Route
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
                )}
              </>
            ) : activeTab === "models" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>Model Management</h1>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>Manage upstream provider routes per model. E.g. glm-5.1 can route to both DashScope and Ark, with priority/weight determining which.</div>
                  </div>
                  <button onClick={() => loadData()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                    Refresh
                  </button>
                </div>
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
                      {item === "all" ? "All" : statusLabels[item]}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {filteredModels.length === 0 ? (
                    <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>No model data available</div>
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
                            <button
                              onClick={() => handleApproveModel(model.id)}
                              disabled={isActing(`enable-model-${model.id}`) || isActing(`disable-model-${model.id}`)}
                              style={{ padding: "6px 16px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", opacity: isActing(`enable-model-${model.id}`) ? 0.6 : 1 }}
                            >
                              {isActing(`enable-model-${model.id}`) ? "..." : "Enable"}
                            </button>
                            <button
                              onClick={() => handleRejectModel(model.id)}
                              disabled={isActing(`enable-model-${model.id}`) || isActing(`disable-model-${model.id}`)}
                              style={{ padding: "6px 16px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", opacity: isActing(`disable-model-${model.id}`) ? 0.6 : 1 }}
                            >
                              {isActing(`disable-model-${model.id}`) ? "..." : "Disabled"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, color: "#4b5563" }}>{model.description || "No description"}</div>
                      <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 12, color: "#6b7280" }}>
                        <span>Category: {model.category}</span>
                        <span>Provider Routes: {model.routes?.filter((route) => route.isEnabled).length || 0}/{model.routes?.length || 0}</span>
                      </div>
                      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                        {model.routes && model.routes.length > 0 ? model.routes.map((route) => {
                          const isTaskModel = isTaskModelCategory(model.category);
                          return (
                          <div key={`${model.modelId}-${route.providerId}`} style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 0.8fr auto", gap: 12, alignItems: "center", padding: 12, borderRadius: 10, border: "1px solid #e5e7eb", background: route.isEnabled ? "#f8fafc" : "#fff" }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{route.providerName}</div>
                              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>{route.providerId} · {route.isEnabled ? "Enable" : "Disabled"}</div>
                            </div>
                            {isTaskModel ? (
                              <div style={{ fontSize: 12, color: "#4b5563" }}>
                                Submit RPM {route.currentRpm}/{route.rpmLimit}
                                <br />
                                Task Concur. {route.concurrentLimit}
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: "#4b5563" }}>
                                RPM {route.currentRpm}/{route.rpmLimit}
                                <br />
                                TPM {route.currentTpm}/{route.tpmLimit}
                              </div>
                            )}
                            <div style={{ fontSize: 12, color: "#4b5563" }}>
                              Priority {route.priority}
                              <br />
                              Weight {route.weight}
                            </div>
                            <button onClick={() => handleSaveModelRoute(model, route)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                              EditRoutes
                            </button>
                          </div>
                          );
                        }) : (
                          <div style={{ fontSize: 12.5, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 12 }}>
                            No active provider routes. API calls will not select this model.
                          </div>
                        )}
                        <button onClick={() => handleSaveModelRoute(model)} style={{ alignSelf: "flex-start", padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                          Add Provider Route
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : activeTab === "tickets" ? (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 20 }}>Ticket Center</h1>
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
                      {item === "all" ? "All" : item}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {filteredTickets.length === 0 ? (
                    <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>No tickets</div>
                  ) : filteredTickets.map((ticket) => (
                    <div key={ticket.id} style={{ ...cardStyle, padding: "16px 20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{ticket.subject}</div>
                          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>User: {users.find((u) => u.id === ticket.user_id)?.nickname || ticket.user_id} · Type: {ticket.type} · Status: {ticket.status}</div>
                        </div>
                        <button
                          onClick={() => handleReplyTicket(ticket.id)}
                          disabled={isActing(`reply-ticket-${ticket.id}`)}
                          style={{ padding: "6px 16px", background: "#111827", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", opacity: isActing(`reply-ticket-${ticket.id}`) ? 0.6 : 1 }}
                        >
                          {isActing(`reply-ticket-${ticket.id}`) ? "Processing..." : "Handle"}
                        </button>
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.7, color: "#4b5563", marginBottom: 8 }}>{ticket.description}</div>
                      {(ticket.model || ticket.requested_qpm || ticket.requested_tpm) ? (
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                          {ticket.model ? <span>Model: {ticket.model}</span> : null}
                          {ticket.requested_qpm ? <span>QPM: {ticket.requested_qpm}</span> : null}
                          {ticket.requested_tpm ? <span>TPM: {ticket.requested_tpm}</span> : null}
                        </div>
                      ) : null}
                      {ticket.admin_reply ? (
                        <div style={{ padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 13, color: "#334155" }}>
                          Admin reply: {ticket.admin_reply}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 20 }}>Log Search</h1>
                <div style={{ ...cardStyle, padding: 20, marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
                    <div>
                      <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>Request ID</label>
                      <input value={logSearchId} onChange={(e) => setLogSearchId(e.target.value)} placeholder="Enter Request ID" onKeyDown={(e) => e.key === "Enter" && handleLogSearch()} style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, fontFamily: "inherit", background: "#fff" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>Model</label>
                      <input value={logSearchModel} onChange={(e) => setLogSearchModel(e.target.value)} placeholder="e.g. qwen3.7-max" style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, fontFamily: "inherit", background: "#fff" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>User ID / Email</label>
                      <input value={logSearchUser} onChange={(e) => setLogSearchUser(e.target.value)} placeholder="User ID or email" style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, fontFamily: "inherit", background: "#fff" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>Start Time</label>
                      <input type="datetime-local" value={logSearchFrom} onChange={(e) => setLogSearchFrom(e.target.value)} style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, fontFamily: "inherit", background: "#fff" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>End Time</label>
                      <input type="datetime-local" value={logSearchTo} onChange={(e) => setLogSearchTo(e.target.value)} style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, fontFamily: "inherit", background: "#fff" }} />
                    </div>
                    <button onClick={handleLogSearch} disabled={logSearching} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "#111827", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", height: 34 }}>
                      {logSearching ? "Searching..." : "Search"}
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12, padding: "8px 12px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e5e7eb" }}>
                  💡 Admins can view all user logs. Enter Request ID for precise search. Logs take ~1-2 min before details are queryable.
                </div>

                {logResults.length > 0 ? (
                  <div style={{ ...cardStyle, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.6fr 0.6fr 0.6fr 1fr", padding: "10px 16px", fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const, color: "#6b7280", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      <span>Request ID</span><span>User</span><span>Model</span><span>Tokens</span><span>Cost</span><span>Status</span><span>Time</span>
                    </div>
                    {logResults.map((r) => (
                      <div key={r.log_id}>
                        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.6fr 0.6fr 0.6fr 1fr", padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", alignItems: "center" }} onClick={() => handleLogDetail(r.log_id)}>
                          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#1d4ed8", overflow: "hidden", textOverflow: "ellipsis" }}>{r.log_id?.slice(0, 12)}...</span>
                          <span style={{ fontSize: 12, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis" }}>{r.user_nickname || r.user_email || r.user_id?.slice(0, 8)}</span>
                          <span style={{ fontSize: 12, color: "#111827", fontWeight: 500 }}>{r.model}</span>
                          <span style={{ fontSize: 12, color: "#4b5563", fontVariantNumeric: "tabular-nums" }}>{r.total_tokens?.toLocaleString()}</span>
                          <span style={{ fontSize: 12, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>¥{r.cost}</span>
                          <span><span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: r.status === "success" ? "#10b981" : "#ef4444" }} /></span>
                          <span style={{ fontSize: 11.5, color: "#6b7280" }}>{r.time}</span>
                        </div>
                        {logExpandedId === r.log_id && (
                          <div style={{ padding: "16px 20px", background: "#f9fafb", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }}>
                            {logDetailLoading ? (
                              <div style={{ color: "#6b7280", fontSize: 13 }}>Loading...</div>
                            ) : logDetail ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {logDetail.user_email || logDetail.user_nickname ? (
                                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                                    User：{logDetail.user_nickname || ""} {logDetail.user_email ? `(${logDetail.user_email})` : ""}
                                  </div>
                                ) : null}
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>REQUEST</div>
                                  <pre style={{ margin: 0, padding: 12, background: "#111827", color: "#e5e7eb", borderRadius: 6, fontSize: 11.5, lineHeight: 1.5, overflow: "auto", maxHeight: 400 }}>{formatLogJson(logDetail.request)}</pre>
                                </div>
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>RESPONSE</div>
                                  <pre style={{ margin: 0, padding: 12, background: "#111827", color: "#e5e7eb", borderRadius: 6, fontSize: 11.5, lineHeight: 1.5, overflow: "auto", maxHeight: 400 }}>{formatLogJson(logDetail.response)}</pre>
                                </div>
                              </div>
                            ) : (
                              <div style={{ color: "#6b7280", fontSize: 13 }}>{logDetailNote || "No detail data available"}</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : logResults.length === 0 && logSearching === false && logSearchId ? (
                  <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>No matching logs found</div>
                ) : null}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
