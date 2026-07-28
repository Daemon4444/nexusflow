"use client";

import { useMemo } from "react";
import { Alert, Card, Segmented, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminGet, appendQuery } from "../client";
import type { ControlPlaneOverview, OverviewCustomer, OverviewMetric } from "../contracts";
import { AdminMetric, AdminPageHeader, AdminState, TruthBar } from "../shared/AdminUI";
import { displayCompact, displayMoney, displayNumber, displayPercent } from "../shared/format";
import { useAdminQuery } from "../shared/useAdminQuery";
import { useAdminResource } from "../shared/useAdminResource";

const RANGE_OPTIONS = [
  { label: "1 小时", value: "1h" },
  { label: "24 小时", value: "24h" },
  { label: "7 天", value: "7d" },
  { label: "30 天", value: "30d" },
];

const METRIC_LABELS: Record<string, string> = {
  revenue: "收入",
  upstreamCost: "上游成本",
  grossProfit: "毛利",
  grossMargin: "毛利率",
  requests: "请求量",
  totalRequests: "请求量",
  tokens: "Tokens",
  totalTokens: "Tokens",
  activeCustomers: "活跃客户",
  activeUsers: "活跃客户",
  successRate: "成功率",
  p95LatencyMs: "P95 延迟",
  reservedBalance: "资金预占",
  creditExposure: "信控敞口",
};

function normalizeMetrics(metrics: ControlPlaneOverview["metrics"]): OverviewMetric[] {
  if (Array.isArray(metrics)) return metrics;
  return Object.entries(metrics || {}).map(([key, value]) => ({
    key,
    label: METRIC_LABELS[key] || key,
    value,
  }));
}

function metricDisplay(metric: OverviewMetric): string {
  const key = metric.key.toLowerCase();
  if (key.includes("margin") || key.includes("rate")) {
    return displayPercent(metric.value, metric.unit === "ratio" ? "ratio" : "percent");
  }
  if (key.includes("cost") || key.includes("revenue") || key.includes("profit") || key.includes("balance") || key.includes("exposure")) {
    return displayMoney(metric.value);
  }
  if (key.includes("token") || key.includes("request")) return displayCompact(metric.value);
  if (key.includes("latency")) return metric.value === null ? "unknown" : `${displayNumber(metric.value)} ms`;
  return displayNumber(metric.value);
}

export default function OverviewScreen() {
  const { searchParams, setQuery } = useAdminQuery();
  const range = searchParams.get("range") || "24h";
  const resource = useAdminResource(
    (signal) => adminGet<ControlPlaneOverview>(
      appendQuery("/api/admin/control-plane/overview", { range }),
      signal
    ),
    [range]
  );

  const metrics = useMemo(() => normalizeMetrics(resource.data?.metrics || []), [resource.data]);
  const chartData = useMemo(() => (resource.data?.timeSeries || []).map((point) => ({
    ...point,
    axisLabel: point.label || point.time || (point.timestamp
      ? new Date(point.timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" })
      : "unknown"),
  })), [resource.data]);

  const customerColumns: ColumnsType<OverviewCustomer> = [
    {
      title: "客户",
      dataIndex: "nickname",
      render: (_, row) => (
        <div>
          <div className="nf-admin-table-primary">{row.nickname}</div>
          <div className="nf-admin-table-secondary">{row.email || row.id}</div>
        </div>
      ),
    },
    { title: "请求", dataIndex: "requests", align: "right", render: displayNumber },
    { title: "Tokens", dataIndex: "tokens", align: "right", render: displayCompact },
    { title: "消费", dataIndex: "cost", align: "right", render: (value) => displayMoney(value) },
    { title: "成功率", dataIndex: "successRate", align: "right", render: (value) => displayPercent(value, "ratio") },
  ];

  return (
    <>
      <AdminPageHeader
        eyebrow="Command center"
        title="运营控制中心"
        description="收入、成本、客户流量与平台健康的真实聚合视图。缺少事实来源时明确显示 unknown。"
        actions={
          <Segmented
            options={RANGE_OPTIONS}
            value={range}
            onChange={(value) => setQuery({ range: String(value) })}
          />
        }
      />
      <AdminState
        loading={resource.loading}
        error={resource.error}
        empty={!resource.data}
        onRetry={resource.reload}
      >
        {resource.data ? (
          <>
            <TruthBar truth={resource.data.truth} generatedAt={resource.data.generatedAt} />
            <div className="nf-admin-metric-grid">
              {metrics.map((metric) => (
                <AdminMetric
                  key={metric.key}
                  label={metric.label || metric.key}
                  value={metricDisplay(metric)}
                  description={metric.description}
                  unknown={metric.value === null}
                />
              ))}
            </div>
            <div className="nf-admin-grid-main">
              <Card title="请求趋势" className="nf-admin-section">
                {chartData.length ? (
                  <div role="img" aria-label={`${range} 真实请求趋势`} style={{ width: "100%", height: 290 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                        <defs>
                          <linearGradient id="nfAdminRequests" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0f766e" stopOpacity={0.24} />
                            <stop offset="95%" stopColor="#0f766e" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.18)" />
                        <XAxis dataKey="axisLabel" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip formatter={(value) => [displayNumber(Number(value)), "请求"]} />
                        <Area type="monotone" dataKey="requests" stroke="#0f766e" strokeWidth={2} fill="url(#nfAdminRequests)" connectNulls={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : <Alert type="info" showIcon title="该时间范围暂无真实序列" />}
              </Card>
              <Card title="风险与告警" className="nf-admin-section">
                {resource.data.alerts.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {resource.data.alerts.map((alert, index) => (
                      <Alert
                        key={alert.id || `${alert.title}-${index}`}
                        type={alert.level === "critical" ? "error" : alert.level === "warning" ? "warning" : "info"}
                        showIcon
                        title={alert.title}
                        description={alert.detail || undefined}
                      />
                    ))}
                  </div>
                ) : <Alert type="success" showIcon title="当前没有激活告警" />}
              </Card>
            </div>
            <Card title="高活跃客户" className="nf-admin-section" style={{ marginTop: 14 }}>
              <Table
                className="nf-admin-table"
                rowKey="id"
                columns={customerColumns}
                dataSource={resource.data.topCustomers}
                pagination={false}
                locale={{ emptyText: "该时间范围暂无真实客户用量" }}
                scroll={{ x: 700 }}
              />
            </Card>
          </>
        ) : null}
      </AdminState>
    </>
  );
}
