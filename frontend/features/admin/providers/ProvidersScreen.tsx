"use client";

import { useMemo } from "react";
import { Alert, Card, Input, Progress, Select, Table, Tabs } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import { adminGet } from "../client";
import type {
  ProviderCostTier,
  ProviderOperations,
  ProviderRoute,
  ProviderSummary,
} from "../contracts";
import { AdminMetric, AdminPageHeader, AdminState, StatusTag, TruthBar } from "../shared/AdminUI";
import {
  displayDate,
  displayLatency,
  displayMoney,
  displayNumber,
  displayPercent,
} from "../shared/format";
import { positiveInt, useAdminQuery } from "../shared/useAdminQuery";
import { useAdminResource } from "../shared/useAdminResource";

function ratioPercent(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value * 100));
}

function displayMoneyRange(
  min: number | null | undefined,
  max: number | null | undefined
): string {
  if (min == null || max == null) return "unknown";
  if (min === max) return displayMoney(min, true);
  return `${displayMoney(min, true)} – ${displayMoney(max, true)}`;
}

function displayTier(row: ProviderCostTier): string {
  const min = row.inputTierMinTokens.toLocaleString("zh-CN");
  const max = row.inputTierMaxTokens === null
    ? "∞"
    : row.inputTierMaxTokens.toLocaleString("zh-CN");
  return `[${min}, ${max})`;
}

export default function ProvidersScreen() {
  const { searchParams, setQuery } = useAdminQuery();
  const q = searchParams.get("q") || "";
  const health = searchParams.get("health") || "all";
  const provider = searchParams.get("provider") || "all";
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(searchParams.get("pageSize"), 20);
  const resource = useAdminResource(
    (signal) => adminGet<ProviderOperations>("/api/provider/admin/operations", signal),
    []
  );

  const providers = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return (resource.data?.providers || []).filter((item) => {
      const matchesQuery = !keyword || [item.name, item.slug, item.id]
        .some((value) => value?.toLowerCase().includes(keyword));
      return matchesQuery && (health === "all" || item.health === health);
    });
  }, [health, q, resource.data]);

  const routes = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return (resource.data?.routes || []).filter((item) => {
      const matchesQuery = !keyword || [item.providerName, item.providerId, item.modelId, item.modelName]
        .some((value) => value?.toLowerCase().includes(keyword));
      const matchesProvider = provider === "all" || item.providerId === provider;
      const matchesHealth = health === "all" || item.health === health;
      return matchesQuery && matchesProvider && matchesHealth;
    });
  }, [health, provider, q, resource.data]);

  const costs = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return (resource.data?.costs || []).filter((item) => {
      const matchesQuery = !keyword || [
        item.providerId,
        item.modelId,
        item.sourceReference,
        item.priceBookId,
      ].some((value) => value?.toLowerCase().includes(keyword));
      return matchesQuery && (provider === "all" || item.providerId === provider);
    });
  }, [provider, q, resource.data]);

  const providerColumns: ColumnsType<ProviderSummary> = [
    {
      title: "Provider",
      key: "provider",
      width: 240,
      render: (_, row) => (
        <div>
          <div className="nf-admin-table-primary">{row.name}</div>
          <div className="nf-admin-table-secondary">{row.slug} · {row.apiKeyMasked || "密钥状态 unknown"}</div>
        </div>
      ),
    },
    { title: "状态", dataIndex: "status", width: 95, render: (value) => <StatusTag status={value} /> },
    { title: "健康", dataIndex: "health", width: 100, render: (value) => <StatusTag status={value} /> },
    { title: "路由", dataIndex: "enabledRoutes", width: 90, align: "right", render: (value, row) => `${displayNumber(value)} / ${displayNumber(row.modelCount)}` },
    {
      title: "容量使用",
      dataIndex: "saturationRatio",
      width: 180,
      render: (value) => value == null
        ? "unknown"
        : <Progress percent={ratioPercent(value)} size="small" status={value >= 0.9 ? "exception" : "normal"} />,
    },
    { title: "RPM", key: "rpm", width: 145, align: "right", render: (_, row) => `${displayNumber(row.currentRpm)} / ${displayNumber(row.rpmLimit)}` },
    { title: "TPM", key: "tpm", width: 165, align: "right", render: (_, row) => `${displayNumber(row.currentTpm)} / ${displayNumber(row.tpmLimit)}` },
    { title: "Base URL", dataIndex: "apiBaseUrl", ellipsis: true, render: (value) => value || "unknown" },
  ];

  const routeColumns: ColumnsType<ProviderRoute> = [
    {
      title: "承载路由",
      key: "route",
      width: 260,
      render: (_, row) => (
        <div>
          <div className="nf-admin-table-primary">{row.providerName} / {row.modelName || row.modelId}</div>
          <div className="nf-admin-table-secondary">{row.modelId}</div>
        </div>
      ),
    },
    { title: "启用", dataIndex: "enabled", width: 85, render: (value) => <StatusTag status={value ? "enabled" : "disabled"} /> },
    { title: "健康", dataIndex: "health", width: 100, render: (value, row) => <StatusTag status={row.healthObserved === false ? "unknown" : value} /> },
    { title: "优先级", dataIndex: "priority", align: "right", width: 85, render: displayNumber },
    { title: "权重", dataIndex: "weight", align: "right", width: 85, render: displayNumber },
    { title: "RPM", key: "rpm", align: "right", width: 140, render: (_, row) => `${displayNumber(row.currentRpm)} / ${displayNumber(row.rpmLimit)}` },
    { title: "TPM", key: "tpm", align: "right", width: 160, render: (_, row) => `${displayNumber(row.currentTpm)} / ${displayNumber(row.tpmLimit)}` },
    { title: "平均延迟", dataIndex: "avgLatencyMs", align: "right", width: 110, render: displayLatency },
    { title: "零售价 / 输入", dataIndex: "promptPrice", align: "right", width: 125, render: (value) => displayMoney(value, true) },
    {
      title: "成本 / 输入",
      key: "promptCost",
      align: "right",
      width: 175,
      render: (_, row) => displayMoneyRange(row.promptCostMin, row.promptCostMax),
    },
    {
      title: "成本覆盖",
      dataIndex: "costCoverageStatus",
      width: 105,
      render: (value, row) => (
        <StatusTag
          status={value || "unknown"}
          label={value === "full"
            ? `完整 · ${displayNumber(row.costTierCount)} 档`
            : value === "partial"
              ? `部分 · ${displayNumber(row.costTierCount)} 档`
              : "未知"}
        />
      ),
    },
    { title: "输入毛利率", dataIndex: "grossMarginPrompt", align: "right", width: 110, render: (value) => displayPercent(value) },
  ];

  const costColumns: ColumnsType<ProviderCostTier> = [
    {
      title: "成本账本",
      key: "costBook",
      width: 260,
      render: (_, row) => (
        <div>
          <div className="nf-admin-table-primary">{row.providerId} / {row.modelId}</div>
          <div className="nf-admin-table-secondary">{row.priceBookId}</div>
        </div>
      ),
    },
    {
      title: "输入 Token 档位",
      key: "tier",
      width: 150,
      render: (_, row) => displayTier(row),
    },
    { title: "输入价 / 百万", dataIndex: "promptCost", align: "right", width: 130, render: (value) => displayMoney(value, true) },
    { title: "输出价 / 百万", dataIndex: "completionCost", align: "right", width: 130, render: (value) => displayMoney(value, true) },
    { title: "隐式缓存读取", dataIndex: "cacheReadImplicitCost", align: "right", width: 135, render: (value) => displayMoney(value, true) },
    { title: "显式缓存读取", dataIndex: "cacheReadExplicitCost", align: "right", width: 135, render: (value) => displayMoney(value, true) },
    { title: "5 分钟缓存创建", dataIndex: "cacheCreation5mCost", align: "right", width: 145, render: (value) => displayMoney(value, true) },
    {
      title: "覆盖",
      dataIndex: "coverageStatus",
      width: 90,
      render: (value) => (
        <StatusTag
          status={value || "unknown"}
          label={value === "full" ? "完整" : value === "partial" ? "部分" : "legacy"}
        />
      ),
    },
    {
      title: "来源",
      key: "source",
      width: 220,
      render: (_, row) => (
        <div>
          <div className="nf-admin-table-primary">{row.source} · {row.sourceReference || "unknown"}</div>
          <div className="nf-admin-table-secondary">
            {row.sourceSha256 ? `SHA-256 ${row.sourceSha256.slice(0, 12)}…` : "无来源哈希"}
          </div>
        </div>
      ),
    },
    { title: "生效时间", dataIndex: "effectiveFrom", width: 165, render: displayDate },
  ];

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total: routes.length,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total.toLocaleString("zh-CN")} 条路由`,
    onChange: (nextPage, nextPageSize) => setQuery({ page: nextPage, pageSize: nextPageSize }),
  };

  const summary = resource.data?.summary || {};

  return (
    <>
      <AdminPageHeader
        eyebrow="Upstream operations"
        title="Provider 与承载路由"
        description="查看真实渠道配置、容量、水位、成本和由业务请求形成的健康观测。未观测不等于健康。"
      />
      <AdminState loading={resource.loading} error={resource.error} empty={!resource.data} onRetry={resource.reload}>
        {resource.data ? (
          <>
            <TruthBar truth={resource.data.truth || resource.data.semantics} generatedAt={resource.data.generatedAt} />
            <div className="nf-admin-metric-grid">
              <AdminMetric label="Provider" value={displayNumber(summary.providers)} unknown={summary.providers == null} />
              <AdminMetric label="已启用 Provider" value={displayNumber(summary.enabledProviders)} unknown={summary.enabledProviders == null} />
              <AdminMetric label="承载路由" value={displayNumber(summary.routes)} unknown={summary.routes == null} />
              <AdminMetric label="已启用路由" value={displayNumber(summary.enabledRoutes)} unknown={summary.enabledRoutes == null} />
              <AdminMetric label="当前 RPM" value={displayNumber(summary.currentRpm)} unknown={summary.currentRpm == null} />
              <AdminMetric label="当前 TPM" value={displayNumber(summary.currentTpm)} unknown={summary.currentTpm == null} />
              <AdminMetric label="严重问题" value={displayNumber(summary.criticalIssues)} unknown={summary.criticalIssues == null} />
              <AdminMetric label="警告" value={displayNumber(summary.warningIssues)} unknown={summary.warningIssues == null} />
              <AdminMetric label="有成本账本路由" value={displayNumber(summary.costedRoutes)} unknown={summary.costedRoutes == null} />
            </div>
            <div className="nf-admin-filterbar" role="search">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                value={q}
                onChange={(event) => setQuery({ q: event.target.value, page: 1 })}
                placeholder="Provider、模型或路由 ID"
                style={{ width: 300 }}
                aria-label="搜索 Provider 或路由"
              />
              <Select
                value={provider}
                onChange={(value) => setQuery({ provider: value, page: 1 })}
                style={{ width: 190 }}
                aria-label="筛选 Provider"
                options={[
                  { label: "全部 Provider", value: "all" },
                  ...resource.data.providers.map((item) => ({ label: item.name, value: item.id })),
                ]}
              />
              <Select
                value={health}
                onChange={(value) => setQuery({ health: value, page: 1 })}
                style={{ width: 150 }}
                aria-label="筛选健康状态"
                options={[
                  { label: "全部健康状态", value: "all" },
                  { label: "健康", value: "healthy" },
                  { label: "降级", value: "degraded" },
                  { label: "不可用", value: "down" },
                  { label: "未观测", value: "unknown" },
                ]}
              />
            </div>
            <Tabs
              items={[
                {
                  key: "providers",
                  label: `Provider ${providers.length}`,
                  children: (
                    <Table
                      className="nf-admin-table"
                      rowKey="id"
                      columns={providerColumns}
                      dataSource={providers}
                      pagination={false}
                      scroll={{ x: 1180 }}
                      locale={{ emptyText: "没有匹配的真实 Provider" }}
                    />
                  ),
                },
                {
                  key: "routes",
                  label: `承载路由 ${routes.length}`,
                  children: (
                    <Table
                      className="nf-admin-table"
                      rowKey={(row) => `${row.providerId}:${row.modelId}`}
                      columns={routeColumns}
                      dataSource={routes}
                      pagination={pagination}
                      scroll={{ x: 1640 }}
                      locale={{ emptyText: "没有匹配的真实承载路由" }}
                    />
                  ),
                },
                {
                  key: "costs",
                  label: `成本账本 ${costs.length}`,
                  children: (
                    <>
                      <Alert
                        type={costs.some((item) => item.coverageStatus === "partial") ? "warning" : "info"}
                        showIcon
                        title="成本按真实上游条件分档"
                        description="缺失某种缓存价格时，对应调用的上游成本保持 unknown；不会用输入价或经验倍率补齐。路由策略在不知道本次 token 档位时采用最高生效档位作保守判断。"
                        style={{ marginBottom: 16 }}
                      />
                      <Table
                        className="nf-admin-table"
                        rowKey="id"
                        columns={costColumns}
                        dataSource={costs}
                        pagination={false}
                        scroll={{ x: 1560 }}
                        locale={{ emptyText: "当前没有可核验的上游成本版本" }}
                      />
                    </>
                  ),
                },
                {
                  key: "issues",
                  label: `运营问题 ${resource.data.issues.length}`,
                  children: (
                    <Card className="nf-admin-section">
                      <div className="nf-admin-alert-stack">
                        {resource.data.issues.length ? resource.data.issues.map((issue, index) => (
                          <Alert
                            key={issue.id || `${issue.title}-${index}`}
                            type={issue.level === "critical" ? "error" : issue.level === "warning" ? "warning" : "info"}
                            showIcon
                            title={issue.title}
                            description={issue.detail || undefined}
                          />
                        )) : <Alert type="success" showIcon title="当前没有运营问题" />}
                      </div>
                    </Card>
                  ),
                },
              ]}
            />
          </>
        ) : null}
      </AdminState>
    </>
  );
}
