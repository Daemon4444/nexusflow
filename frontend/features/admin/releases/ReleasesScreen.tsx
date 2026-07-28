"use client";

import { useMemo } from "react";
import { Input, Select, Table } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import { adminGet, appendQuery, extractItems } from "../client";
import type { Paginated, ReleaseRecord } from "../contracts";
import { AdminMetric, AdminPageHeader, AdminState, StatusTag, TruthBar } from "../shared/AdminUI";
import { displayDate, displayNumber } from "../shared/format";
import { asRecord, optionalText, pickValue, textValue } from "../shared/normalize";
import { positiveInt, useAdminQuery } from "../shared/useAdminQuery";
import { useAdminResource } from "../shared/useAdminResource";

function normalizeRelease(value: unknown): ReleaseRecord {
  const row = asRecord(value);
  const nodes = Array.isArray(row.nodes) ? row.nodes.map((value) => {
    const node = asRecord(value);
    return {
      id: textValue(pickValue(node, "id", "nodeId", "node_id"), "unknown"),
      status: textValue(node.status, "unknown"),
      sha: optionalText(node.sha),
      buildId: optionalText(pickValue(node, "buildId", "build_id")),
      health: optionalText(node.health),
    };
  }) : undefined;
  const sha = textValue(pickValue(row, "sha", "commitSha", "commit_sha"), "unknown");
  return {
    id: textValue(row.id, sha),
    sha,
    status: textValue(row.status, "unknown"),
    buildId: optionalText(pickValue(row, "buildId", "build_id")),
    environment: optionalText(row.environment),
    actor: optionalText(row.actor),
    startedAt: optionalText(pickValue(row, "startedAt", "started_at", "createdAt", "created_at")),
    completedAt: optionalText(pickValue(row, "completedAt", "completed_at")),
    nodes,
    notes: optionalText(row.notes),
  };
}

interface ReleasesEnvelope {
  generatedAt?: string;
  releases?: unknown[];
  nodes?: unknown[];
  incidents?: unknown[];
  truth?: Record<string, unknown>;
}

export default function ReleasesScreen() {
  const { searchParams, setQuery } = useAdminQuery();
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "all";
  const environment = searchParams.get("environment") || "all";
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(searchParams.get("pageSize"), 20);

  const resource = useAdminResource(async (signal) => {
    const payload = await adminGet<ReleasesEnvelope | Paginated<unknown> | unknown[]>(
      appendQuery("/api/admin/releases", {
        q,
        status: status === "all" ? undefined : status,
        environment: environment === "all" ? undefined : environment,
        page,
        pageSize,
      }),
      signal
    );
    const envelope = asRecord(payload);
    const releaseRows = Array.isArray(envelope.releases)
      ? envelope.releases
      : payload as Paginated<unknown> | unknown[];
    const normalized = extractItems(releaseRows, page, pageSize);
    return {
      ...normalized,
      items: normalized.items.map(normalizeRelease),
      legacyArray: Array.isArray(releaseRows),
      generatedAt: optionalText(envelope.generatedAt),
      truth: asRecord(envelope.truth),
      nodeCount: Array.isArray(envelope.nodes) ? envelope.nodes.length : null,
      incidentCount: Array.isArray(envelope.incidents) ? envelope.incidents.length : null,
    };
  }, [q, status, environment, page, pageSize]);

  const items = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return (resource.data?.items || []).filter((item) => {
      const matchesQuery = !keyword || [item.id, item.sha, item.buildId, item.actor, item.notes]
        .some((value) => value?.toLowerCase().includes(keyword));
      return matchesQuery
        && (status === "all" || item.status === status)
        && (environment === "all" || item.environment === environment);
    });
  }, [environment, q, resource.data, status]);

  const environments = useMemo(
    () => [...new Set((resource.data?.items || []).map((item) => item.environment).filter((value): value is string => Boolean(value)))].sort(),
    [resource.data]
  );

  const columns: ColumnsType<ReleaseRecord> = [
    { title: "开始时间", dataIndex: "startedAt", width: 170, render: displayDate },
    {
      title: "版本",
      key: "release",
      width: 240,
      render: (_, row) => (
        <div>
          <code className="nf-admin-table-primary nf-admin-mono">{row.sha}</code>
          <div className="nf-admin-table-secondary">{row.buildId || row.id}</div>
        </div>
      ),
    },
    { title: "环境", dataIndex: "environment", width: 120, render: (value) => value || "unknown" },
    { title: "状态", dataIndex: "status", width: 110, render: (value) => <StatusTag status={value} /> },
    { title: "发起人", dataIndex: "actor", width: 170, render: (value) => value || "unknown" },
    { title: "完成时间", dataIndex: "completedAt", width: 170, render: displayDate },
    {
      title: "节点",
      dataIndex: "nodes",
      width: 100,
      align: "right",
      render: (nodes) => Array.isArray(nodes) ? displayNumber(nodes.length) : "unknown",
    },
    { title: "说明", dataIndex: "notes", ellipsis: true, render: (value) => value || "—" },
  ];

  const nodeColumns: ColumnsType<NonNullable<ReleaseRecord["nodes"]>[number]> = [
    { title: "节点", dataIndex: "id" },
    { title: "状态", dataIndex: "status", render: (value) => <StatusTag status={value} /> },
    { title: "健康", dataIndex: "health", render: (value) => <StatusTag status={value} /> },
    { title: "SHA", dataIndex: "sha", render: (value) => value ? <code className="nf-admin-mono">{value}</code> : "unknown" },
    { title: "Build ID", dataIndex: "buildId", render: (value) => value || "unknown" },
  ];

  const pagination: TablePaginationConfig = {
    current: resource.data?.pagination.page || page,
    pageSize: resource.data?.pagination.pageSize || pageSize,
    total: resource.data?.legacyArray ? items.length : resource.data?.pagination.total || items.length,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total.toLocaleString("zh-CN")} 次发布`,
    onChange: (nextPage, nextPageSize) => setQuery({ page: nextPage, pageSize: nextPageSize }),
  };

  const successful = items.filter((item) => ["success", "succeeded", "completed"].includes(item.status)).length;
  const failed = items.filter((item) => item.status === "failed" || item.status === "error").length;
  const inProgress = items.filter((item) => ["started", "deploying", "running", "in_progress"].includes(item.status)).length;

  return (
    <>
      <AdminPageHeader
        eyebrow="Release evidence"
        title="发布中心"
        description="查看真实发布版本、构建标识、节点一致性和健康结果；没有发布事实时不推断部署状态。"
      />
      <div className="nf-admin-filterbar" role="search">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={q}
          onChange={(event) => setQuery({ q: event.target.value, page: 1 })}
          placeholder="SHA、Build ID、发起人或说明"
          style={{ width: 330 }}
          aria-label="搜索发布记录"
        />
        <Select
          value={status}
          onChange={(value) => setQuery({ status: value, page: 1 })}
          style={{ width: 150 }}
          aria-label="发布状态"
          options={[
            { label: "全部状态", value: "all" },
            { label: "进行中", value: "started" },
            { label: "成功", value: "succeeded" },
            { label: "失败", value: "failed" },
            { label: "已回滚", value: "rolled_back" },
          ]}
        />
        <Select
          value={environment}
          onChange={(value) => setQuery({ environment: value, page: 1 })}
          style={{ width: 170 }}
          aria-label="发布环境"
          options={[{ label: "全部环境", value: "all" }, ...environments.map((value) => ({ label: value, value }))]}
        />
      </div>
      <AdminState
        loading={resource.loading}
        error={resource.error}
        empty={!resource.data}
        emptyText="发布事实数据不可用"
        onRetry={resource.reload}
      >
        <>
          <TruthBar truth={resource.data?.truth} generatedAt={resource.data?.generatedAt} />
          <div className="nf-admin-metric-grid">
            <AdminMetric label="当前筛选发布" value={displayNumber(items.length)} />
            <AdminMetric label="成功" value={displayNumber(successful)} />
            <AdminMetric label="进行中" value={displayNumber(inProgress)} />
            <AdminMetric label="失败" value={displayNumber(failed)} />
            <AdminMetric label="上报节点" value={displayNumber(resource.data?.nodeCount)} unknown={resource.data?.nodeCount == null} />
            <AdminMetric label="事故记录" value={displayNumber(resource.data?.incidentCount)} unknown={resource.data?.incidentCount == null} />
          </div>
          <Table
            className="nf-admin-table"
            rowKey="id"
            columns={columns}
            dataSource={items}
            pagination={pagination}
            scroll={{ x: 1200 }}
            locale={{ emptyText: "该筛选下没有真实发布记录" }}
            expandable={{
              rowExpandable: (row) => Boolean(row.nodes?.length),
              expandedRowRender: (row) => (
                <Table
                  size="small"
                  rowKey="id"
                  columns={nodeColumns}
                  dataSource={row.nodes || []}
                  pagination={false}
                />
              ),
            }}
          />
        </>
      </AdminState>
    </>
  );
}
