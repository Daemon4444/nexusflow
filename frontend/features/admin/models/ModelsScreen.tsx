"use client";

import { useMemo } from "react";
import { Input, Select, Table, Tag } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import { adminGet, AdminApiError } from "../client";
import type { CatalogModel, ModelCatalog } from "../contracts";
import { AdminMetric, AdminPageHeader, AdminState, StatusTag, TruthBar } from "../shared/AdminUI";
import { displayMoney, displayNumber } from "../shared/format";
import { positiveInt, useAdminQuery } from "../shared/useAdminQuery";
import { useAdminResource } from "../shared/useAdminResource";

interface CatalogModelWire extends CatalogModel {
  _source?: string;
}

export default function ModelsScreen() {
  const { searchParams, setQuery } = useAdminQuery();
  const q = searchParams.get("q") || "";
  const provider = searchParams.get("provider") || "all";
  const category = searchParams.get("category") || "all";
  const source = searchParams.get("source") || "all";
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(searchParams.get("pageSize"), 20);
  const resource = useAdminResource(async (signal) => {
    try {
      return await adminGet<ModelCatalog>("/api/admin/model-catalog", signal);
    } catch (error) {
      if (!(error instanceof AdminApiError) || error.status !== 404) throw error;
      return adminGet<ModelCatalog>("/api/admin/models", signal);
    }
  }, []);

  const models = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return (resource.data?.models || []).map((item) => {
      const wire = item as CatalogModelWire;
      return { ...item, source: item.source || wire._source || "static" };
    }).filter((item) => {
      const matchesQuery = !keyword || [item.id, item.name, item.provider, item.category]
        .some((value) => value?.toLowerCase().includes(keyword));
      return matchesQuery
        && (provider === "all" || item.provider === provider)
        && (category === "all" || item.category === category)
        && (source === "all" || item.source === source);
    });
  }, [category, provider, q, resource.data, source]);

  const providers = useMemo(
    () => [...new Set((resource.data?.models || []).map((item) => item.provider))].sort(),
    [resource.data]
  );
  const categories = useMemo(
    () => [...new Set((resource.data?.models || []).map((item) => item.category))].sort(),
    [resource.data]
  );

  const columns: ColumnsType<CatalogModel> = [
    {
      title: "模型",
      key: "model",
      fixed: "left",
      width: 280,
      render: (_, row) => (
        <div>
          <div className="nf-admin-table-primary">{row.name}</div>
          <code className="nf-admin-table-secondary nf-admin-mono">{row.id}</code>
        </div>
      ),
    },
    { title: "Provider", dataIndex: "provider", width: 150 },
    { title: "分类", dataIndex: "category", width: 120 },
    { title: "可用性", dataIndex: "availability", width: 150, render: (value, row) => <StatusTag status={value || row.status || "unknown"} /> },
    { title: "输入价格", dataIndex: "promptPrice", align: "right", width: 125, render: (value) => displayMoney(value, true) },
    { title: "输出价格", dataIndex: "completionPrice", align: "right", width: 125, render: (value) => displayMoney(value, true) },
    { title: "上下文", dataIndex: "contextLength", align: "right", width: 120, render: displayNumber },
    { title: "最大输出", dataIndex: "maxOutput", align: "right", width: 110, render: displayNumber },
    {
      title: "能力",
      dataIndex: "supported",
      width: 220,
      render: (values: string[] | undefined) => values?.length
        ? values.map((value) => <Tag key={value}>{value}</Tag>)
        : "unknown",
    },
    { title: "来源", dataIndex: "source", width: 105, render: (value) => <Tag>{value || "unknown"}</Tag> },
  ];

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total: models.length,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total.toLocaleString("zh-CN")} 个模型`,
    onChange: (nextPage, nextPageSize) => setQuery({ page: nextPage, pageSize: nextPageSize }),
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Catalog truth"
        title="模型与定价"
        description="有效模型目录、覆盖来源、能力、真实可用性与对客价格。目录展示不代表存在可用承载路由。"
      />
      <AdminState loading={resource.loading} error={resource.error} empty={!resource.data} onRetry={resource.reload}>
        {resource.data ? (
          <>
            <TruthBar truth={resource.data.truth} />
            <div className="nf-admin-metric-grid">
              <AdminMetric label="有效模型" value={displayNumber(resource.data.models.length)} />
              <AdminMetric label="静态目录" value={displayNumber(resource.data.staticCount)} unknown={resource.data.staticCount == null} />
              <AdminMetric label="目录覆盖" value={displayNumber(resource.data.overrideCount)} unknown={resource.data.overrideCount == null} />
              <AdminMetric label="已下架 ID" value={displayNumber(resource.data.disabledIds?.length)} unknown={!resource.data.disabledIds} />
            </div>
            <div className="nf-admin-filterbar" role="search">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                value={q}
                onChange={(event) => setQuery({ q: event.target.value, page: 1 })}
                placeholder="模型名称、ID 或 Provider"
                style={{ width: 300 }}
                aria-label="搜索模型"
              />
              <Select
                value={provider}
                onChange={(value) => setQuery({ provider: value, page: 1 })}
                style={{ width: 170 }}
                aria-label="筛选 Provider"
                options={[{ label: "全部 Provider", value: "all" }, ...providers.map((value) => ({ label: value, value }))]}
              />
              <Select
                value={category}
                onChange={(value) => setQuery({ category: value, page: 1 })}
                style={{ width: 160 }}
                aria-label="筛选分类"
                options={[{ label: "全部分类", value: "all" }, ...categories.map((value) => ({ label: value, value }))]}
              />
              <Select
                value={source}
                onChange={(value) => setQuery({ source: value, page: 1 })}
                style={{ width: 150 }}
                aria-label="筛选目录来源"
                options={[
                  { label: "全部来源", value: "all" },
                  { label: "静态默认", value: "static" },
                  { label: "已覆盖", value: "overridden" },
                  { label: "后台新增", value: "added" },
                ]}
              />
            </div>
            <Table
              className="nf-admin-table"
              rowKey="id"
              columns={columns}
              dataSource={models}
              pagination={pagination}
              scroll={{ x: 1510 }}
              locale={{ emptyText: "没有匹配的真实模型" }}
            />
          </>
        ) : null}
      </AdminState>
    </>
  );
}
