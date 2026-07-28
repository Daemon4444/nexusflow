"use client";

import { useMemo, useState } from "react";
import { Button, Descriptions, Drawer, Input, Select, Space, Table, Tabs } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { EyeOutlined, SearchOutlined } from "@ant-design/icons";
import { adminGet, appendQuery, extractItems } from "../client";
import type { AuditEvent, Paginated } from "../contracts";
import { AdminPageHeader, AdminState, StatusTag, TruthBar } from "../shared/AdminUI";
import { displayDate } from "../shared/format";
import { asRecord, optionalText, pickValue, textValue } from "../shared/normalize";
import { positiveInt, useAdminQuery } from "../shared/useAdminQuery";
import { useAdminResource } from "../shared/useAdminResource";

function parseObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return { value };
    }
  }
  return null;
}

function normalizeAudit(value: unknown): AuditEvent {
  const row = asRecord(value);
  return {
    id: textValue(row.id, "unknown"),
    action: textValue(row.action, "unknown"),
    resourceType: optionalText(pickValue(row, "resourceType", "resource_type")),
    resourceId: optionalText(pickValue(row, "resourceId", "resource_id")),
    actorId: optionalText(pickValue(row, "actorId", "actorUserId", "actor_user_id")),
    actorEmail: optionalText(pickValue(row, "actorEmail", "actor_email")),
    actorRole: optionalText(pickValue(row, "actorRole", "actor_role")),
    requestId: optionalText(pickValue(row, "requestId", "request_id")),
    idempotencyKey: optionalText(pickValue(row, "idempotencyKey", "idempotency_key")),
    outcome: optionalText(row.outcome),
    reason: optionalText(row.reason),
    metadata: parseObject(row.metadata),
    beforeData: pickValue(row, "beforeData", "before_data", "before"),
    afterData: pickValue(row, "afterData", "after_data", "after"),
    ipAddress: optionalText(pickValue(row, "ipAddress", "ip_address")),
    createdAt: textValue(pickValue(row, "createdAt", "created_at")),
  };
}

function AuditJson({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <div className="nf-admin-empty-inline">没有记录该字段</div>;
  return <pre className="nf-admin-code-block">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>;
}

export default function AuditScreen() {
  const { searchParams, setQuery } = useAdminQuery();
  const actorId = searchParams.get("actorId") || "";
  const action = searchParams.get("action") || "";
  const resourceType = searchParams.get("resourceType") || "";
  const outcome = searchParams.get("outcome") || "all";
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(searchParams.get("pageSize"), 20);
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const resource = useAdminResource(async (signal) => {
    const payload = await adminGet<Paginated<unknown> | unknown[]>(
      appendQuery("/api/admin/audit-events", {
        actorId,
        action,
        resourceType,
        outcome: outcome === "all" ? undefined : outcome,
        page,
        pageSize,
      }),
      signal
    );
    const normalized = extractItems(payload, page, pageSize);
    return {
      ...normalized,
      items: normalized.items.map(normalizeAudit),
      legacyArray: Array.isArray(payload),
      truth: asRecord(asRecord(payload).truth),
    };
  }, [actorId, action, resourceType, outcome, page, pageSize]);

  const items = useMemo(() => {
    const actionQuery = action.trim().toLowerCase();
    return (resource.data?.items || []).filter((item) => {
      const matchesAction = !actionQuery || item.action.toLowerCase().includes(actionQuery);
      return matchesAction
        && (!actorId || item.actorId === actorId)
        && (!resourceType || item.resourceType === resourceType)
        && (outcome === "all" || item.outcome === outcome);
    });
  }, [action, actorId, outcome, resource.data, resourceType]);

  const columns: ColumnsType<AuditEvent> = [
    { title: "时间", dataIndex: "createdAt", width: 170, render: displayDate },
    {
      title: "操作人",
      key: "actor",
      width: 220,
      render: (_, row) => (
        <div>
          <div className="nf-admin-table-primary">{row.actorEmail || row.actorId || "system"}</div>
          <div className="nf-admin-table-secondary">{row.actorRole || "unknown role"}</div>
        </div>
      ),
    },
    { title: "动作", dataIndex: "action", width: 245, render: (value) => <code className="nf-admin-mono">{value}</code> },
    {
      title: "资源",
      key: "resource",
      width: 210,
      render: (_, row) => (
        <div>
          <div>{row.resourceType || "unknown"}</div>
          <div className="nf-admin-table-secondary">{row.resourceId || "—"}</div>
        </div>
      ),
    },
    { title: "结果", dataIndex: "outcome", width: 100, render: (value) => <StatusTag status={value} /> },
    { title: "原因", dataIndex: "reason", ellipsis: true, render: (value) => value || "未提供" },
    { title: "Request ID", dataIndex: "requestId", width: 190, ellipsis: true, render: (value) => value ? <code className="nf-admin-mono">{value}</code> : "unknown" },
    {
      title: "详情",
      key: "action",
      fixed: "right",
      width: 75,
      render: (_, row) => <Button type="text" icon={<EyeOutlined />} aria-label={`查看审计事件 ${row.id}`} onClick={() => setSelected(row)} />,
    },
  ];

  const pagination: TablePaginationConfig = {
    current: resource.data?.pagination.page || page,
    pageSize: resource.data?.pagination.pageSize || pageSize,
    total: resource.data?.legacyArray ? items.length : resource.data?.pagination.total || items.length,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total.toLocaleString("zh-CN")} 个事件`,
    onChange: (nextPage, nextPageSize) => setQuery({ page: nextPage, pageSize: nextPageSize }),
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Immutable evidence"
        title="审计日志"
        description="追踪管理员写操作、结果、资源、理由及脱敏前后快照。审计日志本身只读。"
      />
      <div className="nf-admin-filterbar" role="search">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={actorId}
          onChange={(event) => setQuery({ actorId: event.target.value, page: 1 })}
          placeholder="操作人用户 ID"
          style={{ width: 250 }}
          aria-label="筛选操作人用户 ID"
        />
        <Input
          allowClear
          value={action}
          onChange={(event) => setQuery({ action: event.target.value, page: 1 })}
          placeholder="完整动作，例如 finance.balance.adjust"
          style={{ width: 230 }}
          aria-label="筛选审计动作"
        />
        <Input
          allowClear
          value={resourceType}
          onChange={(event) => setQuery({ resourceType: event.target.value, page: 1 })}
          placeholder="资源类型"
          style={{ width: 190 }}
          aria-label="筛选资源类型"
        />
        <Select
          value={outcome}
          onChange={(value) => setQuery({ outcome: value, page: 1 })}
          style={{ width: 140 }}
          aria-label="筛选执行结果"
          options={[
            { label: "全部结果", value: "all" },
            { label: "成功", value: "success" },
            { label: "失败", value: "failure" },
          ]}
        />
      </div>
      <AdminState
        loading={resource.loading}
        error={resource.error}
        empty={items.length === 0}
        emptyText="该筛选下没有真实审计事件"
        onRetry={resource.reload}
      >
        <>
          <TruthBar truth={resource.data?.truth} />
          <Table
            className="nf-admin-table"
            rowKey="id"
            columns={columns}
            dataSource={items}
            pagination={pagination}
            scroll={{ x: 1430 }}
          />
        </>
      </AdminState>
      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="审计事件详情"
        width={760}
      >
        {selected ? (
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Descriptions
              size="small"
              column={2}
              items={[
                { key: "id", label: "事件 ID", children: <code className="nf-admin-mono">{selected.id}</code> },
                { key: "outcome", label: "结果", children: <StatusTag status={selected.outcome} /> },
                { key: "actor", label: "操作人", children: selected.actorEmail || selected.actorId || "system" },
                { key: "role", label: "角色", children: selected.actorRole || "unknown" },
                { key: "request", label: "Request ID", children: selected.requestId || "unknown" },
                { key: "ip", label: "IP", children: selected.ipAddress || "unknown" },
                { key: "reason", label: "原因", children: selected.reason || "未提供", span: 2 },
              ]}
            />
            <Tabs
              items={[
                { key: "metadata", label: "元数据", children: <AuditJson value={selected.metadata} /> },
                { key: "before", label: "操作前", children: <AuditJson value={selected.beforeData} /> },
                { key: "after", label: "操作后", children: <AuditJson value={selected.afterData} /> },
              ]}
            />
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}
