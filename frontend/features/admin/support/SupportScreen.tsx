"use client";

import { useMemo, useState } from "react";
import { App, Button, Descriptions, Form, Input, Modal, Select, Table, Typography } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { MessageOutlined, SearchOutlined } from "@ant-design/icons";
import { adminGet, adminPost, appendQuery, extractItems } from "../client";
import type { Paginated, SupportTicket } from "../contracts";
import { Permission } from "../gate/AdminGate";
import { AdminPageHeader, AdminState, StatusTag } from "../shared/AdminUI";
import { displayDate } from "../shared/format";
import { asRecord, optionalText, pickValue, textValue } from "../shared/normalize";
import { positiveInt, useAdminQuery } from "../shared/useAdminQuery";
import { useAdminResource } from "../shared/useAdminResource";

interface ReplyForm {
  status: "open" | "in_progress" | "resolved" | "rejected";
  reply: string;
}

function normalizeTicket(value: unknown): SupportTicket {
  const row = asRecord(value);
  return {
    id: textValue(row.id, "unknown"),
    userId: textValue(pickValue(row, "userId", "user_id"), "unknown"),
    userEmail: optionalText(pickValue(row, "userEmail", "user_email")),
    userNickname: optionalText(pickValue(row, "userNickname", "user_nickname")),
    type: textValue(row.type, "unknown"),
    subject: textValue(row.subject, "未命名工单"),
    description: textValue(row.description),
    model: optionalText(row.model),
    status: textValue(row.status, "open"),
    adminReply: optionalText(pickValue(row, "adminReply", "admin_reply")),
    createdAt: textValue(pickValue(row, "createdAt", "created_at")),
    updatedAt: optionalText(pickValue(row, "updatedAt", "updated_at")),
  };
}

export default function SupportScreen() {
  const { message } = App.useApp();
  const [form] = Form.useForm<ReplyForm>();
  const { searchParams, setQuery } = useAdminQuery();
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "open";
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(searchParams.get("pageSize"), 20);
  const [active, setActive] = useState<SupportTicket | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resource = useAdminResource(async (signal) => {
    const payload = await adminGet<Paginated<unknown> | unknown[]>(
      appendQuery("/api/tickets/admin/all", { status: status === "all" ? undefined : status, q, page, pageSize }),
      signal
    );
    const normalized = extractItems(payload, page, pageSize);
    return { ...normalized, items: normalized.items.map(normalizeTicket), legacyArray: Array.isArray(payload) };
  }, [q, status, page, pageSize]);

  const items = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return (resource.data?.items || []).filter((item) => {
      const matchesQuery = !keyword || [item.id, item.subject, item.description, item.userId, item.userEmail, item.model]
        .some((value) => value?.toLowerCase().includes(keyword));
      return matchesQuery && (status === "all" || item.status === status);
    });
  }, [q, resource.data, status]);

  const openReply = (ticket: SupportTicket) => {
    form.setFieldsValue({
      status: ticket.status === "resolved" || ticket.status === "rejected" ? ticket.status : "in_progress",
      reply: ticket.adminReply || "",
    });
    setActive(ticket);
  };

  const submitReply = async () => {
    if (!active) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await adminPost(`/api/tickets/${encodeURIComponent(active.id)}/reply`, {
        reply: values.reply.trim(),
        status: values.status,
      });
      message.success("工单回复和状态已写入");
      setActive(null);
      form.resetFields();
      resource.reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "工单处理失败");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<SupportTicket> = [
    { title: "创建时间", dataIndex: "createdAt", width: 170, render: displayDate },
    {
      title: "工单",
      key: "ticket",
      width: 300,
      render: (_, row) => (
        <div>
          <div className="nf-admin-table-primary">{row.subject}</div>
          <div className="nf-admin-table-secondary">{row.id}</div>
        </div>
      ),
    },
    {
      title: "客户",
      key: "customer",
      width: 210,
      render: (_, row) => (
        <div>
          <div>{row.userNickname || row.userEmail || row.userId}</div>
          <div className="nf-admin-table-secondary">{row.userEmail || row.userId}</div>
        </div>
      ),
    },
    { title: "类型", dataIndex: "type", width: 120, render: (value) => <StatusTag status={value} /> },
    { title: "模型", dataIndex: "model", width: 180, ellipsis: true, render: (value) => value || "—" },
    { title: "状态", dataIndex: "status", width: 105, render: (value) => <StatusTag status={value} /> },
    { title: "最近回复", dataIndex: "adminReply", ellipsis: true, render: (value) => value || "尚未回复" },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      width: 105,
      render: (_, row) => (
        <Permission name="support.manage" fallback="只读">
          <Button type="text" icon={<MessageOutlined />} onClick={() => openReply(row)}>处理</Button>
        </Permission>
      ),
    },
  ];

  const pagination: TablePaginationConfig = {
    current: resource.data?.pagination.page || page,
    pageSize: resource.data?.pagination.pageSize || pageSize,
    total: resource.data?.legacyArray ? items.length : resource.data?.pagination.total || items.length,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total.toLocaleString("zh-CN")} 个工单`,
    onChange: (nextPage, nextPageSize) => setQuery({ page: nextPage, pageSize: nextPageSize }),
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Customer operations"
        title="支持工单"
        description="统一处理客户问题、模型与限额诉求；回复和状态直接回写真实工单。"
      />
      <div className="nf-admin-filterbar" role="search">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={q}
          onChange={(event) => setQuery({ q: event.target.value, page: 1 })}
          placeholder="主题、内容、客户或工单 ID"
          style={{ width: 320 }}
          aria-label="搜索支持工单"
        />
        <Select
          value={status}
          onChange={(value) => setQuery({ status: value, page: 1 })}
          style={{ width: 160 }}
          aria-label="工单状态"
          options={[
            { label: "待处理", value: "open" },
            { label: "处理中", value: "in_progress" },
            { label: "已解决", value: "resolved" },
            { label: "已拒绝", value: "rejected" },
            { label: "全部", value: "all" },
          ]}
        />
      </div>
      <AdminState
        loading={resource.loading}
        error={resource.error}
        empty={items.length === 0}
        emptyText="该筛选下没有真实支持工单"
        onRetry={resource.reload}
      >
        <Table
          className="nf-admin-table"
          rowKey="id"
          columns={columns}
          dataSource={items}
          pagination={pagination}
          scroll={{ x: 1320 }}
        />
      </AdminState>
      <Modal
        open={Boolean(active)}
        title="处理支持工单"
        okText="保存回复和状态"
        confirmLoading={submitting}
        onOk={submitReply}
        onCancel={() => { if (!submitting) setActive(null); }}
        mask={{ closable: !submitting }}
        width={680}
      >
        {active ? (
          <>
            <Descriptions
              size="small"
              column={2}
              items={[
                { key: "id", label: "工单 ID", children: <code className="nf-admin-mono">{active.id}</code> },
                { key: "customer", label: "客户", children: active.userNickname || active.userEmail || active.userId },
                { key: "subject", label: "主题", children: active.subject, span: 2 },
              ]}
            />
            <Typography.Paragraph className="nf-admin-ticket-description">
              {active.description || "客户未提供详细描述"}
            </Typography.Paragraph>
          </>
        ) : null}
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="status" label="处理状态" rules={[{ required: true }]}>
            <Select
              options={[
                { label: "待处理", value: "open" },
                { label: "处理中", value: "in_progress" },
                { label: "已解决", value: "resolved" },
                { label: "已拒绝", value: "rejected" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="reply"
            label="回复内容"
            rules={[{ required: true, whitespace: true, min: 3, message: "请填写至少 3 个字符的回复" }]}
          >
            <Input.TextArea rows={5} maxLength={3000} showCount placeholder="该内容会回写真实工单并向客户展示" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
