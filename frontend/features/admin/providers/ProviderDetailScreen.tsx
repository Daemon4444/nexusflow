"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { App, Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Space, Switch, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, EditOutlined, PauseCircleOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { adminGet, adminPost, adminRequest } from "../client";
import type { ProviderSummary } from "../contracts";
import { AdminMetric, AdminPageHeader, AdminState, StatusTag } from "../shared/AdminUI";
import { displayLatency, displayNumber } from "../shared/format";
import { useAdminResource } from "../shared/useAdminResource";

interface CapacityRow {
  modelId: string; rpmLimit: number; tpmLimit: number; dailyLimit: number;
  concurrentLimit: number; priority: number; weight: number; isEnabled: boolean;
}
interface HealthRow { modelId: string; status: string; consecutiveFailures: number; avgLatencyMs: number | null; lastError: string | null; }
interface ProviderDetail { provider: ProviderSummary & { channelConfig?: { activeChannel?: string; channels?: unknown[] } }; models: Array<{ id: string; name?: string }>; capacity: CapacityRow[]; health: HealthRow[]; }
interface CapacityForm { rpmLimit: number; tpmLimit: number; dailyLimit: number; concurrentLimit: number; priority: number; weight: number; isEnabled: boolean; reason: string; }

export default function ProviderDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const { message } = App.useApp();
  const [form] = Form.useForm<CapacityForm>();
  const [editing, setEditing] = useState<CapacityRow | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const resource = useAdminResource((signal) => adminGet<ProviderDetail>(`/api/provider/admin/providers/${encodeURIComponent(id)}`, signal), [id]);
  const provider = resource.data?.provider;
  const healthByModel = new Map((resource.data?.health || []).map((row) => [row.modelId, row]));

  function edit(row: CapacityRow) {
    setEditing(row);
    form.setFieldsValue({ ...row, reason: "调整上游容量与路由参数" });
  }
  async function saveCapacity() {
    if (!editing) return;
    const values = await form.validateFields();
    try {
      await adminRequest(`/api/provider/${encodeURIComponent(id)}/capacity/${encodeURIComponent(editing.modelId)}`, {
        method: "PUT",
        body: JSON.stringify({ rpm_limit: values.rpmLimit, tpm_limit: values.tpmLimit, daily_limit: values.dailyLimit, concurrent_limit: values.concurrentLimit, priority: values.priority, weight: values.weight, is_enabled: values.isEnabled, reason: values.reason.trim() }),
      });
      message.success("容量与路由参数已保存"); setEditing(null); resource.reload();
    } catch (error) { message.error(error instanceof Error ? error.message : "保存失败"); }
  }
  async function toggleProvider() {
    if (!provider) return;
    const disabling = provider.status === "enabled";
    if (disabling && !window.confirm("停用 Provider 会使它退出路由候选。确认继续？")) return;
    setStatusBusy(true);
    try {
      await adminPost(`/api/provider/admin/providers/${encodeURIComponent(id)}/${disabling ? "disable" : "enable"}`, disabling ? { reason: "管理员从 Provider 控制台停用" } : undefined);
      message.success(disabling ? "Provider 已停用" : "Provider 已启用"); resource.reload();
    } catch (error) { message.error(error instanceof Error ? error.message : "操作失败"); }
    finally { setStatusBusy(false); }
  }

  const columns: ColumnsType<CapacityRow> = [
    { title: "模型路由", dataIndex: "modelId", render: (value) => <code className="nf-admin-mono">{value}</code> },
    { title: "状态", dataIndex: "isEnabled", width: 90, render: (value) => <StatusTag status={value ? "enabled" : "disabled"} /> },
    { title: "健康", key: "health", width: 95, render: (_, row) => <StatusTag status={healthByModel.get(row.modelId)?.status || "unknown"} /> },
    { title: "优先级", dataIndex: "priority", width: 85, align: "right", render: displayNumber },
    { title: "权重分", dataIndex: "weight", width: 85, align: "right", render: displayNumber },
    { title: "RPM", dataIndex: "rpmLimit", width: 110, align: "right", render: displayNumber },
    { title: "TPM", dataIndex: "tpmLimit", width: 120, align: "right", render: displayNumber },
    { title: "并发", dataIndex: "concurrentLimit", width: 85, align: "right", render: displayNumber },
    { title: "延迟", key: "latency", width: 95, align: "right", render: (_, row) => displayLatency(healthByModel.get(row.modelId)?.avgLatencyMs) },
    { title: "操作", key: "action", width: 90, fixed: "right", render: (_, row) => <Button size="small" icon={<EditOutlined />} onClick={() => edit(row)}>编辑</Button> },
  ];

  return <>
    <AdminPageHeader eyebrow="Upstream control plane" title={provider?.name || "Provider 详情"} description="配置上游状态、承载模型、容量和确定性路由评分。所有写操作进入审计日志。" actions={<Space><Button href="/admin/providers" icon={<ArrowLeftOutlined />}>Provider 列表</Button>{provider && <Button danger={provider.status === "enabled"} loading={statusBusy} onClick={toggleProvider} icon={provider.status === "enabled" ? <PauseCircleOutlined /> : <PlayCircleOutlined />}>{provider.status === "enabled" ? "停用 Provider" : "启用 Provider"}</Button>}</Space>} />
    <AdminState loading={resource.loading} error={resource.error} empty={!resource.data} emptyText="Provider 不存在" onRetry={resource.reload}>
      {resource.data && provider ? <>
        <div className="nf-admin-metric-grid"><AdminMetric label="状态" value={provider.status} /><AdminMetric label="健康" value={provider.health || "unknown"} /><AdminMetric label="承载路由" value={displayNumber(provider.modelCount)} /><AdminMetric label="已启用路由" value={displayNumber(provider.enabledRoutes)} /><AdminMetric label="当前 RPM" value={displayNumber(provider.currentRpm)} unknown={provider.currentRpm == null} /><AdminMetric label="当前 TPM" value={displayNumber(provider.currentTpm)} unknown={provider.currentTpm == null} /></div>
        <Alert type="info" showIcon title="权重当前是确定性评分，不是按比例随机分流" description="调度器会综合优先级、权重分、健康、容量和成本选择候选；在路由模拟器与灰度比例算法上线前，不应把 80/20 理解成真实流量比例。" style={{ marginBottom: 14 }} />
        <Card className="nf-admin-section" style={{ marginBottom: 14 }}><Descriptions column={{ xs: 1, md: 2, xl: 4 }} items={[{ key: "id", label: "Provider ID", children: <code className="nf-admin-mono">{provider.id}</code> }, { key: "slug", label: "Slug", children: provider.slug }, { key: "base", label: "API Base URL", children: provider.apiBaseUrl || "unknown" }, { key: "key", label: "密钥", children: provider.apiKeyMasked || "unknown" }]} /></Card>
        <Card className="nf-admin-section" title={`承载路由 ${resource.data.capacity.length}`}><Table rowKey="modelId" columns={columns} dataSource={resource.data.capacity} pagination={false} scroll={{ x: 1100 }} locale={{ emptyText: "当前 Provider 尚未配置模型容量" }} /></Card>
      </> : null}
    </AdminState>
    <Modal open={!!editing} title={editing ? `编辑 ${editing.modelId}` : "编辑容量"} onCancel={() => setEditing(null)} onOk={saveCapacity} okText="保存并记录审计" destroyOnHidden>
      <Form form={form} layout="vertical"><div className="nf-admin-form-grid"><Form.Item label="RPM" name="rpmLimit" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Form.Item label="TPM" name="tpmLimit" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Form.Item label="日请求上限" name="dailyLimit" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Form.Item label="并发上限" name="concurrentLimit" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Form.Item label="优先级" name="priority" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Form.Item label="确定性权重分" name="weight" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></div><Form.Item label="启用此路由" name="isEnabled" valuePropName="checked"><Switch /></Form.Item><Form.Item label="变更原因" name="reason" rules={[{ required: true, min: 3, message: "请填写至少 3 个字符" }]}><Input.TextArea rows={3} /></Form.Item></Form>
    </Modal>
  </>;
}
