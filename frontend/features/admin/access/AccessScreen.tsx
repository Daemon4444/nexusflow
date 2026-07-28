"use client";

import { useMemo, useState } from "react";
import { App, Button, Card, Form, Input, Modal, Select, Space, Table, Tag } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { PlusOutlined, SearchOutlined, StopOutlined } from "@ant-design/icons";
import { adminGet, adminRequest, appendQuery, extractItems } from "../client";
import type { AccessOverview, AccessPrincipal, Paginated } from "../contracts";
import { Permission } from "../gate/AdminGate";
import { AdminMetric, AdminPageHeader, AdminState, StatusTag, TruthBar } from "../shared/AdminUI";
import { displayDate, displayNumber } from "../shared/format";
import { asRecord, booleanValue, optionalText, pickValue, stringArray, textValue } from "../shared/normalize";
import { positiveInt, useAdminQuery } from "../shared/useAdminQuery";
import { useAdminResource } from "../shared/useAdminResource";

interface RoleDefinition {
  id: string;
  name: string;
  permissions: string[];
}

interface AccessResource {
  items: AccessPrincipal[];
  roles: RoleDefinition[];
  truth?: Record<string, unknown>;
  pagination: Paginated<unknown>["pagination"];
  legacyArray: boolean;
}

interface AccessChangeForm {
  userId?: string;
  role?: string;
  reason: string;
}

function normalizePrincipal(value: unknown): AccessPrincipal {
  const row = asRecord(value);
  const userId = optionalText(pickValue(row, "userId", "user_id")) || optionalText(row.id);
  const assignmentId = optionalText(pickValue(row, "assignmentId", "assignment_id")) || optionalText(row.id);
  const isActiveRaw = pickValue(row, "isActive", "is_active");
  const isActive = isActiveRaw === undefined ? textValue(row.status, "active") === "active" : booleanValue(isActiveRaw);
  return {
    id: assignmentId || userId || "unknown",
    assignmentId,
    userId,
    email: textValue(row.email, "unknown"),
    nickname: optionalText(row.nickname),
    role: textValue(row.role, "unknown"),
    roles: stringArray(row.roles),
    permissions: stringArray(row.permissions),
    status: textValue(row.status, isActive ? "active" : "revoked"),
    isActive,
    bootstrap: booleanValue(row.bootstrap),
    grantedBy: optionalText(pickValue(row, "grantedBy", "granted_by")),
    reason: optionalText(row.reason),
    createdAt: optionalText(pickValue(row, "createdAt", "created_at")),
    revokedAt: optionalText(pickValue(row, "revokedAt", "revoked_at")),
    mfaEnabled: pickValue(row, "mfaEnabled", "mfa_enabled") == null
      ? null
      : booleanValue(pickValue(row, "mfaEnabled", "mfa_enabled")),
    lastLoginAt: optionalText(pickValue(row, "lastLoginAt", "last_login_at")),
  };
}

function normalizeRoles(value: unknown): RoleDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = asRecord(entry);
    const id = textValue(pickValue(row, "id", "role"), "unknown");
    return {
      id,
      name: textValue(row.name, id),
      permissions: stringArray(row.permissions),
    };
  });
}

export default function AccessScreen() {
  const { message } = App.useApp();
  const [form] = Form.useForm<AccessChangeForm>();
  const { searchParams, setQuery } = useAdminQuery();
  const q = searchParams.get("q") || "";
  const role = searchParams.get("role") || "all";
  const status = searchParams.get("status") || "active";
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(searchParams.get("pageSize"), 20);
  const [change, setChange] = useState<{ type: "assign" | "revoke"; item?: AccessPrincipal } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resource = useAdminResource<AccessResource>(async (signal) => {
    const payload = await adminGet<AccessOverview | Paginated<unknown> | unknown[]>(
      appendQuery("/api/admin/access", { q, role, status, page, pageSize }),
      signal
    );
    const record = asRecord(payload);
    const sourceRows = Array.isArray(record.assignments)
      ? record.assignments
      : payload as Paginated<unknown> | unknown[];
    const normalized = extractItems(sourceRows, page, pageSize);
    return {
      ...normalized,
      items: normalized.items.map(normalizePrincipal),
      roles: normalizeRoles(record.roles),
      truth: asRecord(record.truth),
      legacyArray: Array.isArray(sourceRows),
    };
  }, [q, role, status, page, pageSize]);

  const items = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return (resource.data?.items || []).filter((item) => {
      const matchesQuery = !keyword || [item.email, item.nickname, item.userId, item.role]
        .some((value) => value?.toLowerCase().includes(keyword));
      const active = item.isActive !== false && item.status !== "revoked" && item.status !== "disabled";
      const matchesStatus = status === "all" || (status === "active" ? active : !active);
      return matchesQuery && matchesStatus && (role === "all" || item.role === role || item.roles?.includes(role));
    });
  }, [q, resource.data, role, status]);

  const roles = useMemo(() => resource.data?.roles || [], [resource.data?.roles]);
  const roleOptions = useMemo(() => {
    const values = new Set<string>(roles.map((item) => item.id));
    for (const item of resource.data?.items || []) {
      values.add(item.role);
      item.roles?.forEach((value) => values.add(value));
    }
    return [...values].filter((value) => value !== "unknown").sort();
  }, [resource.data, roles]);

  const uniqueAdmins = new Set(items.map((item) => item.userId || item.email)).size;
  const activeAssignments = items.filter((item) => item.isActive !== false).length;

  const openAssign = () => {
    form.resetFields();
    setChange({ type: "assign" });
  };

  const openRevoke = (item: AccessPrincipal) => {
    form.resetFields();
    setChange({ type: "revoke", item });
  };

  const submitChange = async () => {
    if (!change) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (change.type === "assign") {
        await adminRequest("/api/admin/control-plane/access/assignments", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            userId: values.userId?.trim(),
            role: values.role,
            reason: values.reason.trim(),
          }),
        });
        message.success("管理员角色已生效");
      } else if (change.item?.assignmentId) {
        await adminRequest(
          `/api/admin/control-plane/access/assignments/${encodeURIComponent(change.item.assignmentId)}`,
          {
            method: "DELETE",
            headers: { "Idempotency-Key": crypto.randomUUID() },
            body: JSON.stringify({ reason: values.reason.trim() }),
          }
        );
        message.success("管理员角色已撤销");
      }
      setChange(null);
      form.resetFields();
      resource.reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "访问控制变更失败");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<AccessPrincipal> = [
    {
      title: "管理员",
      key: "principal",
      width: 260,
      render: (_, row) => (
        <div>
          <div className="nf-admin-table-primary">{row.nickname || row.email}</div>
          <div className="nf-admin-table-secondary">{row.email} · {row.userId || "unknown ID"}</div>
        </div>
      ),
    },
    { title: "角色", dataIndex: "role", width: 120, render: (value) => <Tag>{value}</Tag> },
    { title: "状态", dataIndex: "status", width: 105, render: (value, row) => <StatusTag status={row.isActive === false ? "revoked" : value} /> },
    { title: "来源", dataIndex: "bootstrap", width: 110, render: (value) => value ? <Tag color="gold">bootstrap</Tag> : <Tag>database</Tag> },
    { title: "授权原因", dataIndex: "reason", ellipsis: true, render: (value) => value || "未记录" },
    { title: "授权人", dataIndex: "grantedBy", width: 170, render: (value) => value || "unknown" },
    { title: "授权时间", dataIndex: "createdAt", width: 170, render: displayDate },
    { title: "撤销时间", dataIndex: "revokedAt", width: 170, render: displayDate },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      width: 100,
      render: (_, row) => row.isActive !== false && row.assignmentId ? (
        <Permission name="security.manage" fallback="只读">
          <Button type="text" danger icon={<StopOutlined />} onClick={() => openRevoke(row)}>撤权</Button>
        </Permission>
      ) : "—",
    },
  ];

  const pagination: TablePaginationConfig = {
    current: resource.data?.pagination.page || page,
    pageSize: resource.data?.pagination.pageSize || pageSize,
    total: resource.data?.legacyArray ? items.length : resource.data?.pagination.total || items.length,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total.toLocaleString("zh-CN")} 个角色授权`,
    onChange: (nextPage, nextPageSize) => setQuery({ page: nextPage, pageSize: nextPageSize }),
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Least privilege"
        title="访问控制"
        description="查看真实管理员身份、角色授权和权限边界。Bootstrap 恢复账号与数据库授权明确区分。"
        actions={
          <Permission name="security.manage">
            <Button type="primary" icon={<PlusOutlined />} onClick={openAssign}>新增角色授权</Button>
          </Permission>
        }
      />
      <div className="nf-admin-filterbar" role="search">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={q}
          onChange={(event) => setQuery({ q: event.target.value, page: 1 })}
          placeholder="管理员邮箱、昵称或用户 ID"
          style={{ width: 320 }}
          aria-label="搜索管理员"
        />
        <Select
          value={role}
          onChange={(value) => setQuery({ role: value, page: 1 })}
          style={{ width: 160 }}
          aria-label="筛选角色"
          options={[{ label: "全部角色", value: "all" }, ...roleOptions.map((value) => ({ label: value, value }))]}
        />
        <Select
          value={status}
          onChange={(value) => setQuery({ status: value, page: 1 })}
          style={{ width: 150 }}
          aria-label="筛选授权状态"
          options={[
            { label: "有效授权", value: "active" },
            { label: "已撤销", value: "revoked" },
            { label: "全部", value: "all" },
          ]}
        />
      </div>
      <AdminState
        loading={resource.loading}
        error={resource.error}
        empty={!resource.data}
        emptyText="访问控制数据不可用"
        onRetry={resource.reload}
      >
        <>
          <TruthBar truth={resource.data?.truth} />
          <div className="nf-admin-metric-grid">
            <AdminMetric label="当前筛选管理员" value={displayNumber(uniqueAdmins)} />
            <AdminMetric label="有效角色授权" value={displayNumber(activeAssignments)} />
            <AdminMetric label="Bootstrap 管理员" value="unknown" unknown description="环境恢复账号不会被此接口枚举" />
            <AdminMetric label="角色定义" value={displayNumber(roles.length)} />
          </div>
          <Table
            className="nf-admin-table"
            rowKey="id"
            columns={columns}
            dataSource={items}
            pagination={pagination}
            scroll={{ x: 1420 }}
            locale={{ emptyText: "该筛选下没有真实管理员授权" }}
          />
          {roles.length ? (
            <Card title="角色权限基线" className="nf-admin-section" style={{ marginTop: 14 }}>
              <div className="nf-admin-role-grid">
                {roles.map((item) => (
                  <div key={item.id} className="nf-admin-role-card">
                    <strong>{item.name}</strong>
                    <span>{item.permissions.length} permissions</span>
                    <div>{item.permissions.map((permission) => <Tag key={permission}>{permission}</Tag>)}</div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      </AdminState>
      <Modal
        open={Boolean(change)}
        title={change?.type === "assign" ? "新增管理员角色授权" : "撤销管理员角色授权"}
        okText={change?.type === "assign" ? "确认授权" : "确认撤权"}
        okButtonProps={{ danger: change?.type === "revoke" }}
        confirmLoading={submitting}
        onOk={submitChange}
        onCancel={() => { if (!submitting) setChange(null); }}
        mask={{ closable: !submitting }}
      >
        {change?.type === "revoke" && change.item ? (
          <div style={{ marginBottom: 16 }}>
            <div className="nf-admin-kv"><span>管理员</span><span>{change.item.nickname || change.item.email}</span></div>
            <div className="nf-admin-kv"><span>将撤销角色</span><span><Tag>{change.item.role}</Tag></span></div>
          </div>
        ) : null}
        <Form form={form} layout="vertical" requiredMark={false}>
          {change?.type === "assign" ? (
            <Space direction="vertical" size={0} style={{ width: "100%" }}>
              <Form.Item
                name="userId"
                label="用户 ID"
                extra="请输入 NexusFlow 用户表中的精确 ID；授权不会按邮箱猜测账号。"
                rules={[{ required: true, whitespace: true, message: "请输入用户 ID" }]}
                style={{ width: "100%" }}
              >
                <Input placeholder="用户 UUID" />
              </Form.Item>
              <Form.Item name="role" label="角色" rules={[{ required: true, message: "请选择角色" }]} style={{ width: "100%" }}>
                <Select
                  placeholder="选择最小必要角色"
                  options={roleOptions.map((value) => ({ label: value, value }))}
                />
              </Form.Item>
            </Space>
          ) : null}
          <Form.Item
            name="reason"
            label={change?.type === "assign" ? "授权原因" : "撤权原因"}
            rules={[{ required: true, whitespace: true, min: 3, message: "请填写至少 3 个字符的原因" }]}
          >
            <Input.TextArea rows={4} maxLength={500} showCount placeholder="该原因会进入真实审计日志" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
