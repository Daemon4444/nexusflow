"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
} from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { EyeOutlined, SearchOutlined } from "@ant-design/icons";
import { adminGet, appendQuery, extractItems } from "../client";
import type { Paginated, TrafficRecord } from "../contracts";
import { AdminPageHeader, AdminState, StatusTag, TruthBar } from "../shared/AdminUI";
import { displayDate, displayLatency, displayMoney, displayNumber } from "../shared/format";
import { asRecord, numberValue, optionalText, pickValue, textValue } from "../shared/normalize";
import { positiveInt, useAdminQuery } from "../shared/useAdminQuery";
import { useAdminResource } from "../shared/useAdminResource";

interface TrafficDetail {
  request?: unknown;
  response?: unknown;
  user_email?: string | null;
  user_nickname?: string | null;
  structural?: unknown;
  note?: string | null;
  truth?: Record<string, unknown>;
}

function normalizeTraffic(value: unknown): TrafficRecord {
  const row = asRecord(value);
  const id = textValue(pickValue(row, "id", "requestId", "request_id", "log_id"), "unknown");
  return {
    id,
    requestId: optionalText(pickValue(row, "requestId", "request_id", "log_id")) || id,
    userId: textValue(pickValue(row, "userId", "user_id"), "unknown"),
    userEmail: optionalText(pickValue(row, "userEmail", "user_email")),
    userNickname: optionalText(pickValue(row, "userNickname", "user_nickname")),
    model: textValue(row.model, "unknown"),
    provider: optionalText(pickValue(row, "provider", "providerName", "provider_name")),
    status: textValue(row.status, "unknown"),
    promptTokens: numberValue(pickValue(row, "promptTokens", "prompt_tokens")),
    completionTokens: numberValue(pickValue(row, "completionTokens", "completion_tokens")),
    totalTokens: numberValue(pickValue(row, "totalTokens", "total_tokens")),
    cachedTokens: numberValue(pickValue(row, "cachedTokens", "cached_tokens")),
    cost: numberValue(row.cost),
    latencyMs: numberValue(pickValue(row, "latencyMs", "latency_ms")),
    createdAt: textValue(pickValue(row, "createdAt", "created_at", "time")),
  };
}

function JsonPanel({ value, emptyText }: { value: unknown; emptyText: string }) {
  if (value === null || value === undefined || value === "") {
    return <div className="nf-admin-empty-inline">{emptyText}</div>;
  }
  const content = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return <pre className="nf-admin-code-block">{content}</pre>;
}

export default function TrafficScreen() {
  const { searchParams, setQuery } = useAdminQuery();
  const q = searchParams.get("q") || "";
  const userId = searchParams.get("userId") || "";
  const model = searchParams.get("model") || "";
  const status = searchParams.get("status") || "all";
  const range = searchParams.get("range") || "24h";
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(searchParams.get("pageSize"), 20);
  const [selected, setSelected] = useState<TrafficRecord | null>(null);

  const resource = useAdminResource(async (signal) => {
    const payload = await adminGet<Paginated<unknown> | unknown[]>(
      appendQuery("/api/admin/traffic", {
        q,
        userId,
        model,
        status: status === "all" ? undefined : status,
        range,
        page,
        pageSize,
      }),
      signal
    );
    const normalized = extractItems(payload, page, pageSize);
    return {
      ...normalized,
      items: normalized.items.map(normalizeTraffic),
      truth: asRecord(asRecord(payload).truth),
    };
  }, [q, userId, model, status, range, page, pageSize]);

  const detail = useAdminResource<TrafficDetail | null>(
    (signal) => selected
      ? adminGet<TrafficDetail | null>(`/api/admin/logs/${encodeURIComponent(selected.requestId || selected.id)}/detail`, signal)
      : Promise.resolve(null),
    [selected?.id]
  );

  const columns: ColumnsType<TrafficRecord> = [
    { title: "时间", dataIndex: "createdAt", width: 168, render: displayDate },
    {
      title: "Request ID",
      dataIndex: "requestId",
      width: 205,
      render: (value, row) => <code className="nf-admin-mono">{value || row.id}</code>,
    },
    {
      title: "客户",
      key: "customer",
      width: 210,
      render: (_, row) => (
        <div>
          <div className="nf-admin-table-primary">{row.userNickname || row.userEmail || row.userId}</div>
          <div className="nf-admin-table-secondary">{row.userEmail || row.userId}</div>
        </div>
      ),
    },
    { title: "模型", dataIndex: "model", width: 190, ellipsis: true },
    { title: "Provider", dataIndex: "provider", width: 130, render: (value) => value || "unknown" },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <StatusTag status={value} /> },
    { title: "Tokens", dataIndex: "totalTokens", align: "right", width: 105, render: displayNumber },
    { title: "费用", dataIndex: "cost", align: "right", width: 110, render: (value) => displayMoney(value, true) },
    { title: "延迟", dataIndex: "latencyMs", align: "right", width: 105, render: displayLatency },
    {
      title: "详情",
      key: "action",
      fixed: "right",
      width: 78,
      render: (_, row) => (
        <Button type="text" icon={<EyeOutlined />} aria-label={`查看请求 ${row.requestId || row.id}`} onClick={() => setSelected(row)} />
      ),
    },
  ];

  const pagination: TablePaginationConfig = {
    current: resource.data?.pagination.page || page,
    pageSize: resource.data?.pagination.pageSize || pageSize,
    total: resource.data?.pagination.total || 0,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total.toLocaleString("zh-CN")} 条请求`,
    onChange: (nextPage, nextPageSize) => setQuery({ page: nextPage, pageSize: nextPageSize }),
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Request ledger"
        title="实时流量"
        description="按真实请求日志检索模型、客户、状态、Token、费用和端到端延迟。"
        actions={
          <Segmented
            value={range}
            options={[
              { label: "1 小时", value: "1h" },
              { label: "24 小时", value: "24h" },
              { label: "7 天", value: "7d" },
              { label: "30 天", value: "30d" },
            ]}
            onChange={(value) => setQuery({ range: String(value), page: 1 })}
          />
        }
      />
      <div className="nf-admin-filterbar" role="search">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={q}
          onChange={(event) => setQuery({ q: event.target.value, page: 1 })}
          placeholder="Request ID、客户昵称或邮箱"
          style={{ width: 300 }}
          aria-label="搜索请求"
        />
        <Input
          allowClear
          value={userId}
          onChange={(event) => setQuery({ userId: event.target.value, page: 1 })}
          placeholder="精确用户 ID"
          style={{ width: 220 }}
          aria-label="筛选用户 ID"
        />
        <Input
          allowClear
          value={model}
          onChange={(event) => setQuery({ model: event.target.value, page: 1 })}
          placeholder="模型 ID"
          style={{ width: 220 }}
          aria-label="筛选模型"
        />
        <Select
          value={status}
          onChange={(value) => setQuery({ status: value, page: 1 })}
          style={{ width: 140 }}
          aria-label="请求状态"
          options={[
            { label: "全部状态", value: "all" },
            { label: "成功", value: "success" },
            { label: "失败", value: "error" },
          ]}
        />
      </div>
      <AdminState
        loading={resource.loading}
        error={resource.error}
        empty={resource.data?.items.length === 0}
        emptyText="该筛选下没有真实请求"
        onRetry={resource.reload}
      >
        <>
          <TruthBar truth={resource.data?.truth} />
          <Table
            className="nf-admin-table"
            rowKey="id"
            columns={columns}
            dataSource={resource.data?.items || []}
            pagination={pagination}
            scroll={{ x: 1460 }}
          />
        </>
      </AdminState>
      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="请求详情"
        width={720}
        destroyOnHidden
      >
        {selected ? (
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Card size="small">
              <Descriptions
                size="small"
                column={2}
                items={[
                  { key: "id", label: "Request ID", children: <code className="nf-admin-mono">{selected.requestId || selected.id}</code> },
                  { key: "status", label: "状态", children: <StatusTag status={selected.status} /> },
                  { key: "customer", label: "客户", children: selected.userNickname || selected.userEmail || selected.userId },
                  { key: "model", label: "模型", children: selected.model },
                  { key: "tokens", label: "Tokens", children: displayNumber(selected.totalTokens) },
                  { key: "latency", label: "延迟", children: displayLatency(selected.latencyMs) },
                ]}
              />
            </Card>
            <AdminState loading={detail.loading} error={detail.error} empty={false} onRetry={detail.reload}>
              <>
                {detail.data?.note ? <Alert type="info" showIcon title={detail.data.note} /> : null}
                <TruthBar truth={detail.data?.truth} />
                <Tabs
                  items={[
                    { key: "structural", label: "结构化字段", children: <JsonPanel value={detail.data?.structural} emptyText="没有结构化请求字段" /> },
                    { key: "request", label: "请求正文", children: <JsonPanel value={detail.data?.request} emptyText="请求正文未进入可检索日志" /> },
                    { key: "response", label: "响应正文", children: <JsonPanel value={detail.data?.response} emptyText="响应正文未进入可检索日志" /> },
                  ]}
                />
              </>
            </AdminState>
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}
