"use client";

import { useMemo, useState } from "react";
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Table } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { CheckOutlined, CloseOutlined, SearchOutlined } from "@ant-design/icons";
import { adminGet, adminPost, appendQuery, extractItems } from "../client";
import type { LimitApproval, Paginated } from "../contracts";
import { Permission } from "../gate/AdminGate";
import { AdminPageHeader, AdminState, StatusTag } from "../shared/AdminUI";
import { displayDate, displayNumber } from "../shared/format";
import { asRecord, numberValue, optionalText, pickValue, textValue } from "../shared/normalize";
import { positiveInt, useAdminQuery } from "../shared/useAdminQuery";
import { useAdminResource } from "../shared/useAdminResource";

interface ReviewForm {
  model: string;
  qpm: number;
  tpm: number;
  reply: string;
}

function normalizeApproval(value: unknown): LimitApproval {
  const row = asRecord(value);
  return {
    id: textValue(row.id, "unknown"),
    userId: textValue(pickValue(row, "userId", "user_id"), "unknown"),
    userEmail: optionalText(pickValue(row, "userEmail", "user_email")),
    userNickname: optionalText(pickValue(row, "userNickname", "user_nickname")),
    model: textValue(row.model, "*"),
    requestedQpm: numberValue(pickValue(row, "requestedQpm", "requested_qpm")),
    requestedTpm: numberValue(pickValue(row, "requestedTpm", "requested_tpm")),
    reason: optionalText(row.reason),
    status: textValue(row.status, "unknown"),
    adminReply: optionalText(pickValue(row, "adminReply", "admin_reply")),
    reviewedBy: optionalText(pickValue(row, "reviewedBy", "reviewed_by")),
    reviewedAt: optionalText(pickValue(row, "reviewedAt", "reviewed_at")),
    createdAt: textValue(pickValue(row, "createdAt", "created_at")),
  };
}

export default function ApprovalsScreen() {
  const { message } = App.useApp();
  const [form] = Form.useForm<ReviewForm>();
  const { searchParams, setQuery } = useAdminQuery();
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "pending";
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(searchParams.get("pageSize"), 20);
  const [review, setReview] = useState<{ item: LimitApproval; action: "approve" | "reject" } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resource = useAdminResource(async (signal) => {
    const payload = await adminGet<Paginated<unknown> | unknown[]>(
      appendQuery("/api/rate-limits/admin/requests", { status: status === "all" ? undefined : status, q, page, pageSize }),
      signal
    );
    const normalized = extractItems(payload, page, pageSize);
    return { ...normalized, items: normalized.items.map(normalizeApproval), legacyArray: Array.isArray(payload) };
  }, [q, status, page, pageSize]);

  const items = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return (resource.data?.items || []).filter((item) => {
      const matchesQuery = !keyword || [item.id, item.userId, item.userEmail, item.userNickname, item.model]
        .some((value) => value?.toLowerCase().includes(keyword));
      return matchesQuery && (status === "all" || item.status === status);
    });
  }, [q, resource.data, status]);

  const openReview = (item: LimitApproval, action: "approve" | "reject") => {
    form.setFieldsValue({
      model: item.model,
      qpm: item.requestedQpm || undefined,
      tpm: item.requestedTpm || undefined,
      reply: "",
    });
    setReview({ item, action });
  };

  const submitReview = async () => {
    if (!review) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await adminPost(
        `/api/rate-limits/admin/requests/${encodeURIComponent(review.item.id)}/${review.action}`,
        review.action === "approve"
          ? { model: values.model, qpm: values.qpm, tpm: values.tpm, reply: values.reply.trim() }
          : { reply: values.reply.trim() }
      );
      message.success(review.action === "approve" ? "申请已批准并写入真实限额" : "申请已拒绝");
      setReview(null);
      form.resetFields();
      resource.reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "审批失败");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<LimitApproval> = [
    { title: "申请时间", dataIndex: "createdAt", width: 170, render: displayDate },
    {
      title: "客户",
      key: "customer",
      width: 220,
      render: (_, row) => (
        <div>
          <div className="nf-admin-table-primary">{row.userNickname || row.userEmail || row.userId}</div>
          <div className="nf-admin-table-secondary">{row.userEmail || row.userId}</div>
        </div>
      ),
    },
    { title: "模型", dataIndex: "model", width: 190, render: (value) => <code className="nf-admin-mono">{value}</code> },
    { title: "申请 QPM", dataIndex: "requestedQpm", align: "right", width: 110, render: displayNumber },
    { title: "申请 TPM", dataIndex: "requestedTpm", align: "right", width: 120, render: displayNumber },
    { title: "申请原因", dataIndex: "reason", ellipsis: true, render: (value) => value || "未填写" },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <StatusTag status={value} /> },
    { title: "管理员回复", dataIndex: "adminReply", width: 180, ellipsis: true, render: (value) => value || "—" },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      width: 150,
      render: (_, row) => row.status === "pending" ? (
        <Permission name="support.manage" fallback="无写权限">
          <Space size={4}>
            <Button type="text" icon={<CheckOutlined />} onClick={() => openReview(row, "approve")}>批准</Button>
            <Button type="text" danger icon={<CloseOutlined />} onClick={() => openReview(row, "reject")}>拒绝</Button>
          </Space>
        </Permission>
      ) : "已处理",
    },
  ];

  const pagination: TablePaginationConfig = {
    current: resource.data?.pagination.page || page,
    pageSize: resource.data?.pagination.pageSize || pageSize,
    total: resource.data?.legacyArray ? items.length : resource.data?.pagination.total || items.length,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total.toLocaleString("zh-CN")} 个申请`,
    onChange: (nextPage, nextPageSize) => setQuery({ page: nextPage, pageSize: nextPageSize }),
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Controlled change"
        title="限额审批"
        description="审核客户 QPM/TPM 申请；批准后直接写入真实用户模型限额，所有决定保留理由。"
      />
      <div className="nf-admin-filterbar" role="search">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={q}
          onChange={(event) => setQuery({ q: event.target.value, page: 1 })}
          placeholder="客户、模型或申请 ID"
          style={{ width: 300 }}
          aria-label="搜索限额申请"
        />
        <Select
          value={status}
          onChange={(value) => setQuery({ status: value, page: 1 })}
          style={{ width: 150 }}
          aria-label="审批状态"
          options={[
            { label: "待审批", value: "pending" },
            { label: "已批准", value: "approved" },
            { label: "已拒绝", value: "rejected" },
            { label: "全部", value: "all" },
          ]}
        />
      </div>
      <AdminState
        loading={resource.loading}
        error={resource.error}
        empty={items.length === 0}
        emptyText="该筛选下没有真实限额申请"
        onRetry={resource.reload}
      >
        <Table
          className="nf-admin-table"
          rowKey="id"
          columns={columns}
          dataSource={items}
          pagination={pagination}
          scroll={{ x: 1370 }}
        />
      </AdminState>
      <Modal
        open={Boolean(review)}
        title={review?.action === "approve" ? "批准限额申请" : "拒绝限额申请"}
        okText={review?.action === "approve" ? "确认批准并写入限额" : "确认拒绝"}
        okButtonProps={{ danger: review?.action === "reject" }}
        confirmLoading={submitting}
        onOk={submitReview}
        onCancel={() => { if (!submitting) setReview(null); }}
        mask={{ closable: !submitting }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          {review?.action === "approve" ? (
            <>
              <Form.Item name="model" label="生效模型" rules={[{ required: true, whitespace: true, message: "请输入模型 ID" }]}>
                <Input />
              </Form.Item>
              <Space size={12} style={{ display: "flex" }}>
                <Form.Item name="qpm" label="批准 QPM" style={{ flex: 1 }} rules={[{ required: true, type: "number", min: 1, message: "QPM 必须大于 0" }]}>
                  <InputNumber min={1} precision={0} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item name="tpm" label="批准 TPM" style={{ flex: 1 }} rules={[{ required: true, type: "number", min: 1, message: "TPM 必须大于 0" }]}>
                  <InputNumber min={1} precision={0} style={{ width: "100%" }} />
                </Form.Item>
              </Space>
            </>
          ) : null}
          <Form.Item
            name="reply"
            label="审批说明"
            rules={[{ required: true, whitespace: true, min: 3, message: "请填写至少 3 个字符的审批说明" }]}
          >
            <Input.TextArea rows={4} maxLength={500} showCount placeholder="该说明将向客户展示并进入审计记录" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
