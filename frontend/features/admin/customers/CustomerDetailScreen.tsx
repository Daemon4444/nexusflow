"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowLeftOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { adminDownload, adminGet, adminPost, adminRequest } from "../client";
import type {
  CustomerControlPlane,
  CustomerDiscount,
  CustomerLimit,
  CustomerModelUsage,
  CustomerTransaction,
  TrafficRecord,
} from "../contracts";
import { Permission, useAdminSession } from "../gate/AdminGate";
import { AdminMetric, AdminPageHeader, AdminState, StatusTag, TruthBar } from "../shared/AdminUI";
import {
  displayDate,
  displayLatency,
  displayLedgerAmount,
  displayMoney,
  displayNumber,
  displayPercent,
  ledgerAmountClass,
} from "../shared/format";
import { useAdminResource } from "../shared/useAdminResource";
import { validateOrNull } from "../shared/forms";

interface AdjustmentForm {
  amount: number;
  description: string;
}

interface LimitForm {
  model: string;
  qpm: number;
  tpm: number;
}

interface DiscountForm {
  modelId: string;
  payPercent: number;
  enabled: boolean;
  notes: string;
  confirmFree?: boolean;
}

type ExportRange = "this_month" | "last_month" | "last_30_days" | "last_90_days";

const EXPORT_RANGES: Array<{ value: ExportRange; label: string }> = [
  { value: "this_month", label: "本月至今" },
  { value: "last_month", label: "上个月" },
  { value: "last_30_days", label: "近 30 天" },
  { value: "last_90_days", label: "近 90 天" },
];

function isoDate(date: Date): string {
  // Export dates are calendar days in China Standard Time, like the ledger.
  return new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function exportRangeDates(range: ExportRange, now = new Date()): { startDate: string; endDate: string } {
  const cst = new Date(now.getTime() + 8 * 3_600_000);
  const year = cst.getUTCFullYear();
  const month = cst.getUTCMonth();
  const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - 8 * 3_600_000);
  if (range === "last_month") {
    return { startDate: isoDate(day(year, month - 1, 1)), endDate: isoDate(day(year, month, 0)) };
  }
  if (range === "last_30_days" || range === "last_90_days") {
    const days = range === "last_30_days" ? 29 : 89;
    return { startDate: isoDate(new Date(now.getTime() - days * 86_400_000)), endDate: isoDate(now) };
  }
  return { startDate: isoDate(day(year, month, 1)), endDate: isoDate(now) };
}

function discountPhrase(payPercent: number): string {
  if (payPercent <= 0) return "免费";
  if (payPercent >= 100) return "原价";
  return `相当于 ${Math.round(payPercent) / 10} 折`;
}

function roundMoney(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export default function CustomerDetailScreen() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { message } = App.useApp();
  const { can } = useAdminSession();
  const [form] = Form.useForm<AdjustmentForm>();
  const [limitForm] = Form.useForm<LimitForm>();
  const [discountForm] = Form.useForm<DiscountForm>();
  const [adjustment, setAdjustment] = useState<"balance" | "credit" | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [limitEditor, setLimitEditor] = useState<{ existing: CustomerLimit | null } | null>(null);
  const [discountEditor, setDiscountEditor] = useState<{ existing: CustomerDiscount | null } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRange, setExportRange] = useState<ExportRange>("this_month");
  const [exporting, setExporting] = useState(false);
  // Kept here (not inside <Tabs>) so reloading after an edit stays on the tab.
  const [activeTab, setActiveTab] = useState("models");
  const amount = Form.useWatch("amount", form);
  const payPercent = Form.useWatch("payPercent", discountForm);

  const resource = useAdminResource(
    (signal) => adminGet<CustomerControlPlane>(
      `/api/admin/customers/${encodeURIComponent(id)}/control-plane`,
      signal
    ),
    [id]
  );

  const customer = resource.data?.customer;
  const isSubAccount = Boolean(customer?.parentUserId) || customer?.accountType === "sub";
  const currentValue = adjustment === "credit" ? customer?.creditBalance : customer?.balance;
  const projected = typeof currentValue === "number" && typeof amount === "number"
    ? roundMoney(currentValue + amount)
    : null;
  const projectedNegative = projected !== null && projected < 0;

  // Model ids the operator is most likely to need, plus the wildcard.
  const modelOptions = useMemo(() => {
    const ids = new Set<string>(["*"]);
    for (const row of resource.data?.byModel || []) ids.add(row.model);
    for (const row of resource.data?.limits || []) ids.add(row.model);
    for (const row of resource.data?.discounts || []) ids.add(row.modelId);
    return [...ids].map((value) => ({ value, label: value === "*" ? "* （全部模型 / 默认）" : value }));
  }, [resource.data]);

  const openAdjustment = (kind: "balance" | "credit") => {
    form.resetFields();
    setIdempotencyKey(crypto.randomUUID());
    setAdjustment(kind);
  };

  const submitAdjustment = async () => {
    if (!adjustment || !customer) return;
    const values = await validateOrNull(form);
    if (!values) return;
    if (projectedNegative) return;
    setSubmitting(true);
    try {
      await adminRequest(
        `/api/admin/control-plane/finance/adjustments/${encodeURIComponent(customer.id)}/${adjustment}`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({ amountDelta: values.amount, description: values.description.trim() }),
        }
      );
      message.success(adjustment === "credit" ? "信控已调整" : "余额已调整");
      setAdjustment(null);
      setIdempotencyKey("");
      form.resetFields();
      resource.reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "调整失败");
    } finally {
      setSubmitting(false);
    }
  };

  const limitPath = (model: string) =>
    `/api/rate-limits/admin/users/${encodeURIComponent(id)}/models/${encodeURIComponent(model)}`;

  const openLimitEditor = (existing: CustomerLimit | null) => {
    limitForm.resetFields();
    if (existing) {
      limitForm.setFieldsValue({ model: existing.model, qpm: Number(existing.qpm) || undefined, tpm: Number(existing.tpm) || undefined });
    }
    setLimitEditor({ existing });
  };

  const submitLimit = async () => {
    const values = await validateOrNull(limitForm);
    if (!values) return;
    setSubmitting(true);
    try {
      await adminRequest(limitPath(values.model.trim()), {
        method: "PUT",
        body: JSON.stringify({ qpm: values.qpm, tpm: values.tpm }),
      });
      message.success("限额已写入");
      setLimitEditor(null);
      resource.reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "限额保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteLimit = async (row: CustomerLimit) => {
    try {
      await adminRequest(limitPath(row.model), { method: "DELETE" });
      message.success(row.model === "*" ? "默认限额已删除，恢复平台默认值" : "模型限额已删除，回落到默认限额");
      resource.reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const openDiscountEditor = (existing: CustomerDiscount | null) => {
    discountForm.resetFields();
    discountForm.setFieldsValue(existing
      ? {
        modelId: existing.modelId,
        payPercent: Math.round(Number(existing.discountRate ?? 1) * 10_000) / 100,
        enabled: existing.enabled,
        notes: existing.notes || "",
      }
      : { enabled: true, notes: "" });
    setDiscountEditor({ existing });
  };

  const submitDiscount = async () => {
    const values = await validateOrNull(discountForm);
    if (!values) return;
    setSubmitting(true);
    try {
      await adminPost("/api/billing/admin/user-model-discounts", {
        userId: id,
        modelId: values.modelId.trim(),
        discountRate: Math.round(values.payPercent * 100) / 10_000,
        enabled: values.enabled,
        notes: values.notes.trim(),
      });
      message.success("折扣已保存，下一次调用起生效");
      setDiscountEditor(null);
      resource.reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "折扣保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDiscount = async (row: CustomerDiscount, enabled: boolean) => {
    try {
      await adminPost("/api/billing/admin/user-model-discounts", {
        userId: id,
        modelId: row.modelId,
        discountRate: row.discountRate,
        enabled,
        notes: row.notes || "",
      });
      message.success(enabled ? "折扣已启用" : "折扣已停用");
      resource.reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const deleteDiscount = async (row: CustomerDiscount) => {
    try {
      await adminRequest(`/api/billing/admin/user-model-discounts/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      message.success("折扣已删除，恢复原价");
      resource.reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const runExport = async () => {
    if (!customer) return;
    const { startDate, endDate } = exportRangeDates(exportRange);
    setExporting(true);
    try {
      const query = new URLSearchParams({ startDate, endDate }).toString();
      await adminDownload(
        `/api/admin/customers/${encodeURIComponent(customer.id)}/billing-export.csv?${query}`,
        `nexusflow-${customer.id}-billing-${startDate}-to-${endDate}.csv`
      );
      setExportOpen(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const transactionColumns: ColumnsType<CustomerTransaction> = [
    { title: "时间", dataIndex: "createdAt", width: 170, render: displayDate },
    { title: "类型", dataIndex: "type", width: 110, render: (value) => <StatusTag status={value} /> },
    { title: "描述", dataIndex: "description", ellipsis: true },
    { title: "发起账号", dataIndex: "actor", width: 150, render: (value) => value || "本人" },
    {
      title: "金额",
      dataIndex: "amount",
      align: "right",
      width: 120,
      render: (value, row) => <span className={ledgerAmountClass(row.type, value)}>{displayLedgerAmount(row.type, value)}</span>,
    },
    { title: "余额", dataIndex: "balanceAfter", align: "right", width: 110, render: (value) => displayMoney(value) },
    { title: "信控", dataIndex: "creditAfter", align: "right", width: 110, render: (value) => displayMoney(value) },
  ];

  const modelColumns: ColumnsType<CustomerModelUsage> = [
    { title: "模型", dataIndex: "model", render: (value) => <code className="nf-admin-mono">{value}</code> },
    { title: "请求", dataIndex: "requests", align: "right", render: displayNumber },
    { title: "Tokens", dataIndex: "tokens", align: "right", render: displayNumber },
    { title: "消费", dataIndex: "cost", align: "right", render: (value) => displayMoney(value, true) },
    { title: "请求占比", dataIndex: "percentage", align: "right", render: (value) => displayPercent(value, "ratio") },
  ];

  const trafficColumns: ColumnsType<TrafficRecord> = [
    { title: "时间", dataIndex: "createdAt", width: 170, render: displayDate },
    { title: "Request ID", dataIndex: "requestId", width: 190, render: (value, row) => <code className="nf-admin-mono">{value || row.id}</code> },
    { title: "模型", dataIndex: "model" },
    { title: "状态", dataIndex: "status", render: (value) => <StatusTag status={value} /> },
    { title: "Tokens", dataIndex: "totalTokens", align: "right", render: displayNumber },
    { title: "费用", dataIndex: "cost", align: "right", render: (value) => displayMoney(value, true) },
    { title: "延迟", dataIndex: "latencyMs", align: "right", render: displayLatency },
  ];

  const limitColumns: ColumnsType<CustomerLimit> = [
    {
      title: "模型",
      dataIndex: "model",
      render: (value) => value === "*"
        ? <Tooltip title="该客户所有模型的默认限额；单模型限额优先"><code className="nf-admin-mono">* 默认</code></Tooltip>
        : <code className="nf-admin-mono">{value}</code>,
    },
    { title: "QPM", dataIndex: "qpm", align: "right", render: displayNumber },
    { title: "TPM", dataIndex: "tpm", align: "right", render: displayNumber },
    { title: "来源", dataIndex: "source", render: (value) => value || "unknown" },
    ...(can("support.manage") ? [{
      title: "操作",
      key: "actions",
      width: 110,
      render: (_: unknown, row: CustomerLimit) => (
        <Space size={0}>
          <Tooltip title="修改">
            <Button type="text" icon={<EditOutlined />} aria-label={`修改 ${row.model} 限额`} onClick={() => openLimitEditor(row)} />
          </Tooltip>
          <Popconfirm
            title="删除该限额？"
            description={row.model === "*" ? "删除后回落到平台默认限额。" : "删除后该模型使用客户默认限额。"}
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => deleteLimit(row)}
          >
            <Tooltip title="删除">
              <Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除 ${row.model} 限额`} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  const canEditDiscounts = can("billing.manage") && !isSubAccount;
  const discountColumns: ColumnsType<CustomerDiscount> = [
    { title: "模型", dataIndex: "modelId", render: (value) => <code className="nf-admin-mono">{value}</code> },
    {
      title: "实付比例",
      dataIndex: "discountRate",
      align: "right",
      render: (value) => (
        <Tooltip title="客户按目录价的这个比例付费；100% 为原价">
          <span>{displayPercent(value, "ratio")}</span>
        </Tooltip>
      ),
    },
    {
      title: "状态",
      dataIndex: "enabled",
      render: (value, row) => canEditDiscounts
        ? <Switch size="small" checked={Boolean(value)} onChange={(checked) => toggleDiscount(row, checked)} aria-label={`${row.modelId} 折扣开关`} />
        : <StatusTag status={value ? "enabled" : "disabled"} />,
    },
    { title: "备注", dataIndex: "notes", render: (value) => value || "—" },
    ...(canEditDiscounts ? [{
      title: "操作",
      key: "actions",
      width: 110,
      render: (_: unknown, row: CustomerDiscount) => (
        <Space size={0}>
          <Tooltip title="修改">
            <Button type="text" icon={<EditOutlined />} aria-label={`修改 ${row.modelId} 折扣`} onClick={() => openDiscountEditor(row)} />
          </Tooltip>
          <Popconfirm
            title="删除该折扣？"
            description="删除后该客户按目录原价计费。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => deleteDiscount(row)}
          >
            <Tooltip title="删除">
              <Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除 ${row.modelId} 折扣`} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  const transactions = useMemo(() => {
    const data = resource.data?.transactions;
    if (!data) return [];
    return Array.isArray(data) ? data : data.items;
  }, [resource.data]);

  const subAccountHint = "子账号没有独立资金账户，请在主账号上调整";

  return (
    <>
      <AdminPageHeader
        eyebrow="Customer 360"
        title={customer?.nickname || "客户详情"}
        description="账号、资金、限额、折扣和真实调用的统一客户视图。"
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} href="/admin/customers">客户列表</Button>
            <Permission name="billing.read">
              <Button icon={<DownloadOutlined />} disabled={!customer} onClick={() => setExportOpen(true)}>导出账单</Button>
            </Permission>
            <Permission name="billing.manage">
              <Tooltip title={isSubAccount ? subAccountHint : undefined}>
                <Button icon={<WalletOutlined />} disabled={!customer || isSubAccount} onClick={() => openAdjustment("balance")}>调整余额</Button>
              </Tooltip>
              <Tooltip title={isSubAccount ? subAccountHint : undefined}>
                <Button type="primary" icon={<CreditCardOutlined />} disabled={!customer || isSubAccount} onClick={() => openAdjustment("credit")}>调整信控</Button>
              </Tooltip>
            </Permission>
          </Space>
        }
      />
      <AdminState
        loading={resource.loading}
        error={resource.error}
        empty={!resource.data}
        emptyText="客户不存在或已不可访问"
        onRetry={resource.reload}
      >
        {resource.data && customer ? (
          <>
            <TruthBar truth={resource.data.truth} />
            {isSubAccount ? (
              <Alert
                className="nf-admin-section"
                style={{ marginBottom: 14 }}
                type="info"
                showIcon
                title="这是子账号"
                description={
                  <span>
                    费用从主账号扣除，折扣也按主账号计算。
                    {customer.parentUserId ? <> 主账号：<a href={`/admin/customers/${encodeURIComponent(customer.parentUserId)}`}>{customer.parentUserId}</a></> : null}
                  </span>
                }
              />
            ) : null}
            <div className="nf-admin-metric-grid">
              <AdminMetric label="余额" value={displayMoney(customer.balance)} unknown={customer.balance === null} />
              <AdminMetric label="信控" value={displayMoney(customer.creditBalance)} unknown={customer.creditBalance === null} />
              <AdminMetric label="可用合计" value={displayMoney(customer.availableBalance)} unknown={customer.availableBalance === null} />
              <AdminMetric label="请求" value={displayNumber(resource.data.usage?.totalRequests)} unknown={resource.data.usage?.totalRequests == null} />
              <AdminMetric label="Tokens" value={displayNumber(resource.data.usage?.totalTokens)} unknown={resource.data.usage?.totalTokens == null} />
              <AdminMetric label="成功率" value={displayPercent(resource.data.usage?.successRate, "ratio")} unknown={resource.data.usage?.successRate == null} />
            </div>
            <Card className="nf-admin-section" style={{ marginBottom: 14 }}>
              <Descriptions
                column={{ xs: 1, sm: 2, lg: 4 }}
                items={[
                  { key: "id", label: "用户 ID", children: <code className="nf-admin-mono">{customer.id}</code> },
                  { key: "email", label: "邮箱", children: customer.email || "unknown" },
                  { key: "username", label: "用户名", children: customer.username || "unknown" },
                  { key: "type", label: "账户类型", children: <StatusTag status={customer.accountType} /> },
                  { key: "status", label: "状态", children: <StatusTag status={customer.status} /> },
                  {
                    key: "parent",
                    label: "主账号",
                    children: customer.parentUserId
                      ? <a href={`/admin/customers/${encodeURIComponent(customer.parentUserId)}`}>{customer.parentUserId}</a>
                      : "—",
                  },
                  { key: "created", label: "注册时间", children: displayDate(customer.createdAt) },
                  { key: "active", label: "最近活跃", children: displayDate(customer.lastActiveAt) },
                ]}
              />
            </Card>
            <Card className="nf-admin-section">
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                  {
                    key: "models",
                    label: `模型用量 ${resource.data.byModel.length}`,
                    children: <Table rowKey="model" columns={modelColumns} dataSource={resource.data.byModel} pagination={false} scroll={{ x: 680 }} />,
                  },
                  {
                    key: "transactions",
                    label: `账务流水 ${transactions.length}`,
                    children: <Table rowKey="id" columns={transactionColumns} dataSource={transactions} pagination={false} scroll={{ x: 1000 }} />,
                  },
                  {
                    key: "limits",
                    label: `限额 ${resource.data.limits.length}`,
                    children: (
                      <>
                        <Permission name="support.manage">
                          <div className="nf-admin-tab-actions">
                            <Button icon={<PlusOutlined />} onClick={() => openLimitEditor(null)}>新增限额</Button>
                          </div>
                        </Permission>
                        <Table rowKey={(row) => row.id || row.model} columns={limitColumns} dataSource={resource.data.limits} pagination={false} scroll={{ x: 560 }} />
                      </>
                    ),
                  },
                  {
                    key: "discounts",
                    label: `折扣 ${resource.data.discounts.length}`,
                    children: (
                      <>
                        {canEditDiscounts ? (
                          <div className="nf-admin-tab-actions">
                            <Button icon={<PlusOutlined />} onClick={() => openDiscountEditor(null)}>新增折扣</Button>
                          </div>
                        ) : null}
                        <Table rowKey="id" columns={discountColumns} dataSource={resource.data.discounts} pagination={false} scroll={{ x: 560 }} />
                      </>
                    ),
                  },
                  {
                    key: "traffic",
                    label: `最近请求 ${resource.data.recentRequests.length}`,
                    children: <Table rowKey="id" columns={trafficColumns} dataSource={resource.data.recentRequests} pagination={false} scroll={{ x: 1000 }} />,
                  },
                ]}
              />
            </Card>
          </>
        ) : null}
      </AdminState>

      <Modal
        open={Boolean(adjustment)}
        title={adjustment === "credit" ? "调整客户信控" : "调整客户余额"}
        okText="确认写入真实账本"
        cancelText="取消"
        confirmLoading={submitting}
        okButtonProps={{ disabled: projectedNegative }}
        onOk={submitAdjustment}
        onCancel={() => {
          if (!submitting) {
            setAdjustment(null);
            setIdempotencyKey("");
          }
        }}
        mask={{ closable: !submitting }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="amount"
            label="调整金额"
            extra="正数增加，负数扣减；金额将写入真实账本。单次不超过 100000 元。"
            rules={[
              { required: true, message: "请输入调整金额" },
              {
                validator: (_, value) => Number(value) !== 0
                  ? Promise.resolve()
                  : Promise.reject(new Error("调整金额不能为 0")),
              },
              {
                validator: (_, value) => value === undefined || value === null || Math.abs(Number(value)) <= 100_000
                  ? Promise.resolve()
                  : Promise.reject(new Error("单次调整金额不能超过 100000 元")),
              },
            ]}
          >
            <InputNumber precision={6} style={{ width: "100%" }} placeholder="例如 100 或 -50" />
          </Form.Item>
          <div className="nf-admin-kv">
            <span>调整前</span><span>{displayMoney(currentValue, true)}</span>
          </div>
          <div className="nf-admin-kv" style={{ marginBottom: 14 }}>
            <span>调整后</span>
            <span className={projectedNegative ? "nf-admin-amount-out" : undefined}>{displayMoney(projected, true)}</span>
          </div>
          {projectedNegative ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 14 }}
              title={adjustment === "credit" ? "调整后信控不能为负" : "调整后余额不能为负"}
            />
          ) : null}
          <Form.Item
            name="description"
            label="操作原因"
            rules={[{ required: true, whitespace: true, min: 3, message: "请填写至少 3 个字符的操作原因" }]}
          >
            <Input.TextArea rows={3} maxLength={300} showCount placeholder="该原因会进入账本和审计记录" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(limitEditor)}
        title={limitEditor?.existing ? "修改客户限额" : "新增客户限额"}
        okText="保存限额"
        cancelText="取消"
        confirmLoading={submitting}
        onOk={submitLimit}
        onCancel={() => !submitting && setLimitEditor(null)}
        forceRender
      >
        <Form form={limitForm} layout="vertical" requiredMark={false}>
          <Form.Item
            name="model"
            label="模型"
            extra="填 * 设置该客户所有模型的默认限额；单模型限额优先于默认。"
            rules={[{ required: true, whitespace: true, message: "请输入模型 ID 或 *" }]}
          >
            <AutoComplete options={modelOptions} disabled={Boolean(limitEditor?.existing)} placeholder="例如 qwen3.8-max 或 *" filterOption />
          </Form.Item>
          <div className="nf-admin-form-pair">
            <Form.Item name="qpm" label="QPM（次/分钟）" rules={[{ required: true, type: "number", min: 1, message: "QPM 必须大于 0" }]}>
              <InputNumber precision={0} min={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="tpm" label="TPM（tokens/分钟）" rules={[{ required: true, type: "number", min: 1, message: "TPM 必须大于 0" }]}>
              <InputNumber precision={0} min={1} style={{ width: "100%" }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        open={Boolean(discountEditor)}
        title={discountEditor?.existing ? "修改客户折扣" : "新增客户折扣"}
        okText="保存折扣"
        cancelText="取消"
        confirmLoading={submitting}
        onOk={submitDiscount}
        onCancel={() => !submitting && setDiscountEditor(null)}
        forceRender
      >
        <Form form={discountForm} layout="vertical" requiredMark={false}>
          <Form.Item
            name="modelId"
            label="模型"
            extra="* 为全部模型；qwen* 这样的前缀匹配一组模型；精确模型优先。"
            rules={[{ required: true, whitespace: true, message: "请输入模型 ID、前缀或 *" }]}
          >
            <AutoComplete options={modelOptions} disabled={Boolean(discountEditor?.existing)} placeholder="例如 qwen3.8-max、qwen* 或 *" filterOption />
          </Form.Item>
          <Form.Item
            name="payPercent"
            label="实付比例（%）"
            extra={typeof payPercent === "number" ? `客户按目录价的 ${payPercent}% 付费：${discountPhrase(payPercent)}。` : "100 为原价，80 为八折。"}
            rules={[{ required: true, type: "number", min: 0, max: 100, message: "请输入 0–100" }]}
          >
            <InputNumber min={0} max={100} precision={2} style={{ width: "100%" }} suffix="%" />
          </Form.Item>
          {payPercent === 0 ? (
            <Form.Item
              name="confirmFree"
              valuePropName="checked"
              rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error("实付 0% 等于免费，请确认")) }]}
            >
              <Checkbox>我确认该客户在这些模型上免费使用（仍会记录用量）</Checkbox>
            </Form.Item>
          ) : null}
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="notes" label="备注" rules={[{ required: true, whitespace: true, min: 3, message: "请写明折扣依据（合同、活动等）" }]}>
            <Input.TextArea rows={2} maxLength={200} showCount placeholder="例如：2026Q4 年框合同 8 折" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={exportOpen}
        title="导出客户账单"
        okText="下载 CSV"
        cancelText="取消"
        confirmLoading={exporting}
        onOk={runExport}
        onCancel={() => !exporting && setExportOpen(false)}
      >
        <p>逐条导出该客户的调用计费明细（目录价、折扣、实收），按北京时间自然日。</p>
        <Select
          value={exportRange}
          onChange={setExportRange}
          options={EXPORT_RANGES}
          style={{ width: "100%" }}
          aria-label="导出时间范围"
        />
        <p className="nf-admin-muted-text" style={{ marginTop: 10 }}>
          {(() => { const r = exportRangeDates(exportRange); return `${r.startDate} 至 ${r.endDate}`; })()}
        </p>
      </Modal>
    </>
  );
}
