"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchAPI } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import { formatCny } from "@/lib/money";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

type TimeRange = "1h" | "3h" | "6h" | "24h" | "7d" | "30d";

interface TimeSeriesPoint {
  date: string;
  label: string;
  requests: number;
  success: number;
  errors: number;
  cost: number;
  successRate: number;
}

interface DashboardData {
  timeSeries: TimeSeriesPoint[];
  userGrowth: { date: string; newUsers: number; totalUsers: number }[];
  activeUsers: { dau: number; wau: number; mau: number; totalUsers: number };
  topUsers: { userId: string; email: string; nickname: string; requests: number; tokens: number; cost: number; successRate: number }[];
  revenue: { daily: { date: string; recharge: number; consumption: number }[]; totalRecharge: number; totalConsumption: number };
  modelDist: { model: string; requests: number; tokens: number; cost: number; requestPct: number; costPct: number }[];
  overview: { totalRequests: number; totalTokens: number; totalCost: number; activeModels: number; avgLatency: number; successRate: number };
  granularity: "hourly" | "daily";
  period: { requests: number; successRate: number; cost: number };
}

const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: "1h", label: "1小时" },
  { key: "3h", label: "3小时" },
  { key: "6h", label: "6小时" },
  { key: "24h", label: "24小时" },
  { key: "7d", label: "7天" },
  { key: "30d", label: "30天" },
];

const RANGE_LABELS: Record<TimeRange, string> = {
  "1h": "最近1小时",
  "3h": "最近3小时",
  "6h": "最近6小时",
  "24h": "最近24小时",
  "7d": "最近7天",
  "30d": "最近30天",
};

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b"];

const cardStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export default function AdminDashboard() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const loadData = useCallback((r: TimeRange) => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchAPI(`/api/admin/dashboard?range=${r}`, {
      headers: authHeaders(),
      signal: controller.signal,
    })
      .then((res: any) => {
        if (res.success) setData(res.data);
        else setError(res.message || "加载失败");
      })
      .catch(() => { if (!controller.signal.aborted) setError("网络错误"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const cleanup = loadData(range);
    return cleanup;
  }, [range, loadData]);

  const isHourly = data?.granularity === "hourly";
  const rangeLabel = RANGE_LABELS[range];

  return (
    <>
      {/* Header with time range selector */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>监控大盘</h1>
        <div style={{ display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 3 }}>
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.key}
              onClick={() => setRange(tr.key)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                background: range === tr.key ? "#fff" : "transparent",
                boxShadow: range === tr.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                color: range === tr.key ? "#111827" : "#64748b",
                fontSize: 13,
                fontWeight: range === tr.key ? 600 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s ease",
              }}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>
          <div style={{ fontSize: 14 }}>加载监控数据中...</div>
        </div>
      ) : error ? (
        <div style={{ padding: 20, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 12, color: "#991b1b" }}>
          {error}
        </div>
      ) : data ? (
        <DashboardContent data={data} range={range} rangeLabel={rangeLabel} isHourly={isHourly} mounted={mounted} />
      ) : null}
    </>
  );
}

function DashboardContent({ data, range, rangeLabel, isHourly, mounted }: {
  data: DashboardData;
  range: TimeRange;
  rangeLabel: string;
  isHourly: boolean;
  mounted: boolean;
}) {
  const { timeSeries, userGrowth, activeUsers, topUsers, revenue, modelDist, overview, period } = data;

  const growthChartData = userGrowth.map((d) => ({
    ...d,
    label: d.date.slice(5),
  }));

  const revenueChartData = revenue.daily.map((d) => ({
    ...d,
    label: d.date.slice(5),
  }));

  const kpiCards = [
    { label: `${rangeLabel}请求`, value: period.requests.toLocaleString(), sub: `总计 ${formatNumber(overview.totalRequests)}`, color: "#6366f1" },
    { label: "成功率", value: `${period.successRate}%`, sub: `全局 ${overview.successRate}%`, color: period.successRate >= 95 ? "#22c55e" : "#f59e0b" },
    { label: `${rangeLabel}收入`, value: formatCny(period.cost), sub: `总计 ${formatCny(overview.totalCost)}`, color: "#3b82f6" },
    { label: "日活 DAU", value: activeUsers.dau, sub: `WAU ${activeUsers.wau}`, color: "#8b5cf6" },
    { label: "周活 WAU", value: activeUsers.wau, sub: `MAU ${activeUsers.mau}`, color: "#ec4899" },
    { label: "注册用户", value: activeUsers.totalUsers.toLocaleString(), sub: `活跃模型 ${overview.activeModels}`, color: "#14b8a6" },
  ];

  return (
    <>
      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 14, marginBottom: 20 }}>
        {kpiCards.map((item) => (
          <div key={item.label} style={{ ...cardStyle, padding: "18px 16px" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: item.color, lineHeight: 1.1 }}>{item.value}</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Row 1: Request Trend + Revenue Trend */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Request Trend */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 16 }}>请求趋势（{rangeLabel}）</div>
          {mounted ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={timeSeries} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                  formatter={(value: any, name: any) => [Number(value).toLocaleString(), name === "requests" ? "请求数" : name === "errors" ? "错误数" : String(name)]}
                  labelFormatter={(label: any) => isHourly ? `时间: ${label}` : `日期: ${label}`}
                />
                <Area type="monotone" dataKey="requests" stroke="#6366f1" strokeWidth={2} fill="url(#reqGrad)" name="requests" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div style={{ height: 220 }} />}
        </div>

        {/* Revenue Trend (only for daily ranges) */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 16 }}>
            {isHourly ? `请求错误（${rangeLabel}）` : `收入与消费（${rangeLabel}）`}
          </div>
          {mounted ? (
            isHourly ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={timeSeries} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                    formatter={(value: any) => [Number(value).toLocaleString(), "错误数"]}
                    labelFormatter={(label: any) => `时间: ${label}`}
                  />
                  <Area type="monotone" dataKey="errors" stroke="#ef4444" strokeWidth={2} fill="url(#errGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                    formatter={(value: any, name: any) => [formatCny(Number(value)), name === "recharge" ? "充值" : "消费"]}
                    labelFormatter={(label: any) => `日期: ${label}`}
                  />
                  <Legend formatter={(v: any) => (v === "recharge" ? "充值" : "消费")} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="recharge" fill="#22c55e" radius={[4, 4, 0, 0]} name="recharge" />
                  <Bar dataKey="consumption" fill="#ef4444" radius={[4, 4, 0, 0]} name="consumption" />
                </BarChart>
              </ResponsiveContainer>
            )
          ) : <div style={{ height: 220 }} />}
        </div>
      </div>

      {/* Row 2: Model Distribution + User Growth */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Model Distribution */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 16 }}>模型分布（7天 Top 10）</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {mounted && modelDist.length > 0 ? (
              <>
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie
                      data={modelDist}
                      dataKey="requests"
                      nameKey="model"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      strokeWidth={0}
                    >
                      {modelDist.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                      formatter={(value: any) => [Number(value).toLocaleString() + " 次", "请求数"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                  {modelDist.map((m, i) => (
                    <div key={m.model} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                      <span style={{ flex: 1, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.model}</span>
                      <span style={{ color: "#9ca3af", whiteSpace: "nowrap" }}>{m.requestPct}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ width: "100%", textAlign: "center", color: "#9ca3af", padding: 40, fontSize: 13 }}>暂无数据</div>
            )}
          </div>
        </div>

        {/* User Growth */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 16 }}>用户增长（30天）</div>
          {mounted ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={growthChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                  formatter={(value: any, name: any) => [Number(value).toLocaleString(), name === "totalUsers" ? "累计用户" : "新增用户"]}
                  labelFormatter={(label: any) => `日期: ${label}`}
                />
                <Area type="monotone" dataKey="totalUsers" stroke="#14b8a6" strokeWidth={2} fill="url(#growthGrad)" name="totalUsers" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div style={{ height: 200 }} />}
        </div>
      </div>

      {/* Row 3: Top Users */}
      <div style={{ ...cardStyle, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>用户排行 Top 10（{rangeLabel}）</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            总充值 {formatCny(revenue.totalRecharge)} / 总消费 {formatCny(revenue.totalConsumption)}
          </div>
        </div>
        {topUsers.length > 0 ? (
          mounted ? (
            <div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 120px 100px 100px 80px",
                gap: 8,
                padding: "8px 12px",
                fontSize: 11,
                color: "#9ca3af",
                fontWeight: 500,
                borderBottom: "1px solid #f1f5f9",
              }}>
                <span>#</span>
                <span>用户</span>
                <span style={{ textAlign: "right" }}>请求数</span>
                <span style={{ textAlign: "right" }}>消费</span>
                <span style={{ textAlign: "right" }}>Tokens</span>
                <span style={{ textAlign: "right" }}>成功率</span>
              </div>
              {topUsers.map((u, i) => (
                <div
                  key={u.userId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr 120px 100px 100px 80px",
                    gap: 8,
                    padding: "10px 12px",
                    fontSize: 13,
                    borderBottom: i < topUsers.length - 1 ? "1px solid #f8fafc" : "none",
                    alignItems: "center",
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: i < 3 ? COLORS[i] : "#e5e7eb",
                    color: i < 3 ? "#fff" : "#6b7280",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 600,
                  }}>
                    {i + 1}
                  </span>
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.nickname || u.email || u.userId.slice(0, 8)}
                    </div>
                    {u.nickname && u.email ? (
                      <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                    ) : null}
                  </div>
                  <span style={{ textAlign: "right", color: "#374151" }}>{u.requests.toLocaleString()}</span>
                  <span style={{ textAlign: "right", color: "#ef4444", fontWeight: 500 }}>{formatCny(u.cost)}</span>
                  <span style={{ textAlign: "right", color: "#6b7280" }}>{formatNumber(u.tokens)}</span>
                  <span style={{ textAlign: "right", color: u.successRate >= 95 ? "#22c55e" : "#f59e0b" }}>{u.successRate}%</span>
                </div>
              ))}
            </div>
          ) : <div style={{ height: 200 }} />
        ) : (
          <div style={{ textAlign: "center", color: "#9ca3af", padding: 40, fontSize: 13 }}>暂无用户数据</div>
        )}
      </div>

      {/* Row 4: Success Rate Trend */}
      <div style={{ ...cardStyle, padding: 20, marginTop: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 16 }}>成功率趋势（{rangeLabel}）</div>
        {mounted ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={timeSeries} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis domain={[Math.min(80, ...timeSeries.map((t) => t.successRate)), 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={40} unit="%" />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                formatter={(value: any) => [`${value}%`, "成功率"]}
                labelFormatter={(label: any) => isHourly ? `时间: ${label}` : `日期: ${label}`}
              />
              <Area type="monotone" dataKey="successRate" stroke="#22c55e" strokeWidth={2} fill="#22c55e" fillOpacity={0.08} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <div style={{ height: 180 }} />}
      </div>
    </>
  );
}
