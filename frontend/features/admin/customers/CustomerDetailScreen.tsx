"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tabs,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, CreditCardOutlined, WalletOutlined } from "@ant-design/icons";
import { adminGet, adminRequest } from "../client";
import type {
  CustomerControlPlane,
  CustomerDiscount,
  CustomerLimit,
  CustomerModelUsage,
  CustomerTransaction,
  TrafficRecord,
} from "../contracts";
import { Permission } from "../gate/AdminGate";
import { AdminMetric, AdminPageHeader, AdminState, StatusTag, TruthBar } from "../shared/AdminUI";
import { displayDate, displayLatency, displayMoney, displayNumber, displayPercent } from "../shared/format";
import { useAdminResource } from "../shared/useAdminResource";

interface AdjustmentForm {
  amount: number;
  description: string;
}

export default function CustomerDetailScreen() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { message } = App.useApp();
  const [form] = Form.useForm<AdjustmentForm>();
  const [adjustment, setAdjustment] = useState<"balance" | "credit" | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const amount = Form.useWatch("amount", form);

  const resource = useAdminResource(
    (signal) => adminGet<CustomerControlPlane>(
      `/api/admin/customers/${encodeURIComponent(id)}/control-plane`,
      signal
    ),
    [id]
  );

  const customer = resource.data?.customer;
  const currentValue = adjustment === "credit" ? customer?.creditBalance : customer?.balance;
  const projected = typeof currentValue === "number" && typeof amount === "number"
    ? currentValue + amount
    : null;

  const openAdjustment = (kind: "balance" | "credit") => {
    form.resetFields();
    setIdempotencyKey(crypto.randomUUID());
    setAdjustment(kind);
  };

  const submitAdjustment = async () => {
    if (!adjustment || !customer) return;
    const values = await form.validateFields();
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

  const transactionColumns: ColumnsType<CustomerTransaction> = [
    { title: "时间", dataIndex: "createdAt", width: 170, render: displayDate },
    { title: "类型", dataIndex: "type", width: 110, render: (value) => <StatusTag status={value} /> },
    { title: "描述", dataIndex: "description", ellipsis: true },
    { title: "发起账号", dataIndex: "actor", width: 150, render: (value) => value || "本人" },
    { title: "金额", dataIndex: "amount", align: "right", width: 120, render: (value) => displayMoney(value, true) },
    { title: "余额", dataIndex: "balanceAfter", align: "right", width: 110, render: (value) => displayMoney(value) },
    { title: "信控", dataIndex: "creditAfter", align: "right", width: 110, render: (value) => displayMoney(value) },
  ];

  const modelColumns: ColumnsType<CustomerModelUsage> = [
    { title: "模型", dataIndex: "model", render: (value) => <code className="nf-admin-mono">{value}</code> },
    { title: "请求", dataIndex: "requests", align: "right", render: displayNumber },
    { title: "Tokens", dataIndex: "tokens", align: "right", render: displayNumber },
    { title: "消费", dataIndex: "cost", align: "right", render: (value) => displayMoney(value, true) },
    { title: "占比", dataIndex: "percentage", align: "right", render: (value) => displayPercent(value, "ratio") },
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
    { title: "模型", dataIndex: "model", render: (value) => <code className="nf-admin-mono">{value}</code> },
    { title: "QPM", dataIndex: "qpm", align: "right", render: displayNumber },
    { title: "TPM", dataIndex: "tpm", align: "right", render: displayNumber },
    { title: "来源", dataIndex: "source", render: (value) => value || "unknown" },
  ];

  const discountColumns: ColumnsType<CustomerDiscount> = [
    { title: "模型", dataIndex: "modelId", render: (value) => <code className="nf-admin-mono">{value}</code> },
    { title: "实付比例", dataIndex: "discountRate", align: "right", render: (value) => displayPercent(value, "ratio") },
    { title: "状态", dataIndex: "enabled", render: (value) => <StatusTag status={value ? "enabled" : "disabled"} /> },
    { title: "备注", dataIndex: "notes", render: (value) => value || "—" },
  ];

  const transactions = useMemo(() => {
    const data = resource.data?.transactions;
    if (!data) return [];
    return Array.isArray(data) ? data : data.items;
  }, [resource.data]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Customer 360"
        title={customer?.nickname || "客户详情"}
        description="账号、资金、限额、折扣和真实调用的统一客户视图。"
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} href="/admin/customers">客户列表</Button>
            <Permission name="billing.manage">
              <Button icon={<WalletOutlined />} onClick={() => openAdjustment("balance")}>调整余额</Button>
              <Button type="primary" icon={<CreditCardOutlined />} onClick={() => openAdjustment("credit")}>调整信控</Button>
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
                  { key: "parent", label: "主账号", children: customer.parentUserId || "—" },
                  { key: "created", label: "注册时间", children: displayDate(customer.createdAt) },
                  { key: "active", label: "最近活跃", children: displayDate(customer.lastActiveAt) },
                ]}
              />
            </Card>
            <Card className="nf-admin-section">
              <Tabs
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
                    children: <Table rowKey={(row) => row.id || row.model} columns={limitColumns} dataSource={resource.data.limits} pagination={false} />,
                  },
                  {
                    key: "discounts",
                    label: `折扣 ${resource.data.discounts.length}`,
                    children: <Table rowKey="id" columns={discountColumns} dataSource={resource.data.discounts} pagination={false} />,
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
            extra="正数增加，负数扣减；金额将写入真实账本。"
            rules={[
              { required: true, message: "请输入调整金额" },
              {
                validator: (_, value) => Number(value) !== 0
                  ? Promise.resolve()
                  : Promise.reject(new Error("调整金额不能为 0")),
              },
            ]}
          >
            <InputNumber precision={6} style={{ width: "100%" }} placeholder="例如 100 或 -50" />
          </Form.Item>
          <div className="nf-admin-kv">
            <span>调整前</span><span>{displayMoney(currentValue, true)}</span>
          </div>
          <div className="nf-admin-kv" style={{ marginBottom: 14 }}>
            <span>调整后</span><span>{displayMoney(projected, true)}</span>
          </div>
          <Form.Item
            name="description"
            label="操作原因"
            rules={[{ required: true, whitespace: true, min: 3, message: "请填写至少 3 个字符的操作原因" }]}
          >
            <Input.TextArea rows={3} maxLength={300} showCount placeholder="该原因会进入账本和审计记录" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
