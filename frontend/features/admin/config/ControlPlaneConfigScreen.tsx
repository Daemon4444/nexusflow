"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { EditOutlined, PlusOutlined, ReloadOutlined, RollbackOutlined } from "@ant-design/icons";
import { AdminMetric, AdminPageHeader, AdminState, StatusTag } from "../shared/AdminUI";
import { displayDate } from "../shared/format";
import { useAdminResource } from "../shared/useAdminResource";
import { useAdminSession } from "../gate/AdminGate";
import {
  configApi,
  type ChangeRequest,
  type ChangeStatus,
  type ConfigContent,
  type EntityDiff,
  type EntityKind,
  type ValidationIssue,
} from "./api";

const ENTITY_LABEL: Record<EntityKind, string> = {
  model: "模型",
  account: "上游账号",
  pool: "配额池",
  route: "路由",
  policy: "流量策略",
};

const COLLECTION: Record<EntityKind, keyof Omit<ConfigContent, "schema_version">> = {
  model: "models",
  account: "accounts",
  pool: "pools",
  route: "routes",
  policy: "policies",
};

const STATUS_LABEL: Record<ChangeStatus, string> = {
  draft: "草稿",
  validated: "已校验",
  approved: "已审批",
  published: "已发布",
  rejected: "已驳回",
};

function short(value: unknown): string {
  if (value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function DiffTable({ diff }: { diff: EntityDiff[] | null | undefined }) {
  const rows = (diff || []).flatMap((item) =>
    item.change === "changed"
      ? (item.fields || []).map((field) => ({ key: `${item.entity}:${item.id}:${field.field}`, ...item, field: field.field, before: field.before, after: field.after }))
      : [{ key: `${item.entity}:${item.id}`, ...item, field: "", before: undefined, after: undefined }]
  );
  return (
    <Table
      size="small"
      rowKey="key"
      pagination={false}
      dataSource={rows}
      locale={{ emptyText: "没有差异" }}
      columns={[
        { title: "实体", dataIndex: "entity", width: 90, render: (value: EntityKind) => ENTITY_LABEL[value] || value },
        { title: "ID", dataIndex: "id", width: 220 },
        { title: "变化", dataIndex: "change", width: 80, render: (value: string) => <Tag color={value === "added" ? "green" : value === "removed" ? "red" : "blue"}>{value}</Tag> },
        { title: "字段", dataIndex: "field", width: 140 },
        { title: "之前", dataIndex: "before", render: (value: unknown) => <Typography.Text type="secondary" code>{short(value)}</Typography.Text> },
        { title: "之后", dataIndex: "after", render: (value: unknown) => <Typography.Text code>{short(value)}</Typography.Text> },
      ]}
    />
  );
}

function IssueList({ title, issues, type }: { title: string; issues: ValidationIssue[]; type: "error" | "warning" }) {
  if (!issues.length) return null;
  return (
    <Alert
      type={type}
      showIcon
      title={`${title}（${issues.length}）`}
      description={
        <ul className="nf-admin-issue-list">
          {issues.slice(0, 50).map((issue, index) => (
            <li key={`${issue.check}-${issue.id}-${index}`}>
              <Tag>{issue.check}</Tag>
              <b>{issue.id}</b>：{issue.message}
            </li>
          ))}
        </ul>
      }
    />
  );
}

/** JSON editor that turns one entity edit into a change request. */
function EditEntityDrawer({
  target,
  onClose,
  onCreated,
}: {
  target: { entity: EntityKind; id: string | null; value: Record<string, unknown> | null; remove?: boolean } | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { message } = App.useApp();
  const [text, setText] = useState("");
  const [entityId, setEntityId] = useState("");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastTarget, setLastTarget] = useState<typeof target>(null);
  if (target !== lastTarget) {
    setLastTarget(target);
    setText(target?.value ? JSON.stringify(target.value, null, 2) : "{\n}");
    setEntityId(target?.id || "");
    setTitle(target ? `${target.remove ? "删除" : target.id ? "修改" : "新增"}${ENTITY_LABEL[target.entity]} ${target.id || ""}`.trim() : "");
    setReason("");
  }
  if (!target) return null;

  const submit = async () => {
    let value: Record<string, unknown> | undefined;
    if (!target.remove) {
      try {
        value = JSON.parse(text);
      } catch {
        message.error("JSON 格式不正确");
        return;
      }
    }
    const id = entityId.trim();
    if (!id) {
      message.error("请填写 ID");
      return;
    }
    setSaving(true);
    try {
      const created = await configApi.create({
        title,
        reason,
        changes: [{ op: target.remove ? "delete" : "upsert", entity: target.entity, id, ...(value ? { value: { ...value, id } } : {}) }],
      });
      message.success("已创建变更单，需校验、审批后发布");
      onCreated(created.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open onClose={onClose} title={title} width={760} destroyOnHidden
      extra={<Button type="primary" loading={saving} onClick={submit}>生成变更单</Button>}>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Alert type="info" showIcon title="所有修改都生成变更单：校验 → 审批 → 发布，发布后生成新版本，可随时回滚。不会直接修改线上数据。" />
        <Input addonBefore="ID" value={entityId} disabled={!!target.id} onChange={(event) => setEntityId(event.target.value)} />
        <Input addonBefore="标题" value={title} onChange={(event) => setTitle(event.target.value)} />
        <Input.TextArea rows={2} value={reason} maxLength={500} showCount placeholder="变更原因（进入审计）" onChange={(event) => setReason(event.target.value)} />
        {target.remove ? (
          <Alert type="warning" showIcon title={`将删除${ENTITY_LABEL[target.entity]} ${target.id}`} />
        ) : (
          <Input.TextArea
            rows={24}
            value={text}
            spellCheck={false}
            className="nf-admin-json-editor"
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Space>
    </Drawer>
  );
}

function EntityTab({
  entity,
  content,
  canManage,
  onEdit,
}: {
  entity: EntityKind;
  content: ConfigContent;
  canManage: boolean;
  onEdit: (target: { entity: EntityKind; id: string | null; value: Record<string, unknown> | null; remove?: boolean }) => void;
}) {
  const [query, setQuery] = useState("");
  const items = (content[COLLECTION[entity]] as Array<Record<string, any>>).filter((item) =>
    !query || JSON.stringify(item).toLowerCase().includes(query.toLowerCase())
  );
  const specific: Record<EntityKind, ColumnsType<Record<string, any>>> = {
    model: [
      { title: "生命周期", dataIndex: "lifecycle", width: 110, render: (value) => <StatusTag status={value === "active" ? "active" : value === "retired" ? "disabled" : value === "deprecated" ? "warning" : "draft"} label={value} /> },
      { title: "名称", render: (_, row) => row.display?.name },
      { title: "协议", render: (_, row) => (row.protocols || []).map((item: string) => <Tag key={item}>{item}</Tag>) },
      { title: "能力", render: (_, row) => (row.display?.supported || []).join("、") },
    ],
    account: [
      { title: "状态", dataIndex: "status", width: 90, render: (value) => <StatusTag status={value} /> },
      { title: "厂商", dataIndex: "vendor" },
      { title: "适配器", dataIndex: "adapter" },
      { title: "中转", render: (_, row) => row.is_relay ? <Tag color="orange">{row.relay_operator || "中转"}</Tag> : "直连" },
      { title: "配额来源", dataIndex: "quota_source" },
    ],
    pool: [
      { title: "账号", dataIndex: "account_id" },
      { title: "RPM", dataIndex: "rpm" },
      { title: "TPM", dataIndex: "tpm" },
      { title: "并发", dataIndex: "concurrency" },
      { title: "来源", dataIndex: "source" },
    ],
    route: [
      { title: "状态", dataIndex: "status", width: 90, render: (value) => <StatusTag status={value} /> },
      { title: "模型", dataIndex: "model_id" },
      { title: "账号", dataIndex: "account_id" },
      { title: "上游模型", dataIndex: "upstream_model_id" },
      { title: "配额池", dataIndex: "quota_pool_id", render: (value) => value || "—" },
      { title: "RPM/TPM", render: (_, row) => `${row.rpm} / ${row.tpm}` },
      { title: "原生协议", render: (_, row) => (row.native_protocols || []).map((item: string) => <Tag key={item}>{item}</Tag>) },
    ],
    policy: [
      { title: "作用域", dataIndex: "scope" },
      { title: "公平份额", render: (_, row) => row.fair_share ? `${row.fair_share.max_share_per_user * 100}%` : "—" },
      { title: "对话超限", render: (_, row) => row.overflow?.chat ? `429，Retry-After ${row.overflow.chat.retry_after_s}s` : "—" },
      { title: "异步队列", render: (_, row) => row.overflow?.async ? `深度 ${row.overflow.async.max_queue_depth}，最长 ${row.overflow.async.max_wait_s}s` : "—" },
    ],
  };
  const columns: ColumnsType<Record<string, any>> = [
    { title: "ID", dataIndex: "id", width: 240, fixed: "left" },
    ...specific[entity],
    ...(canManage ? [{
      title: "操作",
      width: 150,
      render: (_: unknown, row: Record<string, any>) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => onEdit({ entity, id: row.id, value: row })}>编辑</Button>
          <Button size="small" danger onClick={() => onEdit({ entity, id: row.id, value: row, remove: true })}>删除</Button>
        </Space>
      ),
    }] : []),
  ];
  return (
    <Card size="small">
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search allowClear placeholder={`搜索${ENTITY_LABEL[entity]}`} onChange={(event) => setQuery(event.target.value)} style={{ width: 280 }} />
        {canManage ? <Button icon={<PlusOutlined />} onClick={() => onEdit({ entity, id: null, value: null })}>新增{ENTITY_LABEL[entity]}</Button> : null}
      </Space>
      <Table size="small" rowKey="id" dataSource={items} columns={columns} scroll={{ x: 1100 }} pagination={{ pageSize: 20, showSizeChanger: true }} />
    </Card>
  );
}

function ChangeRequestDrawer({ id, canManage, onClose, onChanged }: { id: string | null; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const resource = useAdminResource((signal) => id ? configApi.changeRequest(id, signal) : Promise.resolve(null), [id]);
  if (!id) return null;
  const record = resource.data as ChangeRequest | null;

  const act = async (action: "validate" | "approve" | "publish" | "reject" | "probe") => {
    setBusy(action);
    try {
      await configApi.action(id, action, action === "reject" ? rejectReason : undefined);
      message.success("操作完成");
      resource.reload();
      onChanged();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
      resource.reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer open onClose={onClose} title="变更单" width={980} destroyOnHidden>
      <AdminState loading={resource.loading && !record} error={resource.error} onRetry={resource.reload}>
        {record ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="标题" span={2}>{record.title}</Descriptions.Item>
              <Descriptions.Item label="状态"><StatusTag status={record.status === "published" ? "success" : record.status} label={STATUS_LABEL[record.status]} /></Descriptions.Item>
              <Descriptions.Item label="来源">{record.source}</Descriptions.Item>
              <Descriptions.Item label="发起人">{record.author}</Descriptions.Item>
              <Descriptions.Item label="审批人">{record.approver || "—"}</Descriptions.Item>
              <Descriptions.Item label="基于版本">{record.baseVersion ?? "—"}（当前 {record.currentVersion ?? "—"}）</Descriptions.Item>
              <Descriptions.Item label="发布版本">{record.publishedVersion ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="原因" span={2}>{record.reason || "—"}</Descriptions.Item>
              {record.rejectReason ? <Descriptions.Item label="驳回原因" span={2}>{record.rejectReason}</Descriptions.Item> : null}
            </Descriptions>
            {canManage && !["published", "rejected"].includes(record.status) ? (
              <Space wrap>
                <Button loading={busy === "validate"} onClick={() => act("validate")}>校验</Button>
                <Button loading={busy === "probe"} onClick={() => act("probe")}>真实探测</Button>
                <Button type="primary" ghost disabled={record.status !== "validated"} loading={busy === "approve"} onClick={() => act("approve")}>审批</Button>
                <Button type="primary" disabled={record.status !== "approved"} loading={busy === "publish"} onClick={() => act("publish")}>发布</Button>
                <Input style={{ width: 220 }} placeholder="驳回原因" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
                <Button danger disabled={rejectReason.trim().length < 3} loading={busy === "reject"} onClick={() => act("reject")}>驳回</Button>
              </Space>
            ) : null}
            {record.applyError ? <Alert type="error" showIcon title="无法应用到当前版本" description={record.applyError} /> : null}
            {record.validation ? (
              <>
                <IssueList title="阻止发布的问题" issues={record.validation.errors} type="error" />
                <IssueList title="告警" issues={record.validation.warnings} type="warning" />
              </>
            ) : <Alert type="info" showIcon title="尚未校验" />}
            <Card size="small" title="与当前版本的差异">
              <DiffTable diff={record.diff} />
            </Card>
          </Space>
        ) : null}
      </AdminState>
    </Drawer>
  );
}

function ChangeRequestsTab({ canManage, openId, setOpenId, refreshKey, onChanged }: {
  canManage: boolean;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<ChangeStatus | undefined>(undefined);
  const list = useAdminResource((signal) => configApi.changeRequests(status, signal), [status, refreshKey]);
  return (
    <Card size="small">
      <Space style={{ marginBottom: 12 }}>
        <Select allowClear placeholder="状态" style={{ width: 160 }} value={status} onChange={setStatus}
          options={(Object.keys(STATUS_LABEL) as ChangeStatus[]).map((value) => ({ value, label: STATUS_LABEL[value] }))} />
        <Button icon={<ReloadOutlined />} onClick={list.reload}>刷新</Button>
      </Space>
      <AdminState loading={list.loading && !list.data} error={list.error} onRetry={list.reload}>
        <Table
          size="small"
          rowKey="id"
          dataSource={list.data || []}
          onRow={(row) => ({ onClick: () => setOpenId(row.id), style: { cursor: "pointer" } })}
          columns={[
            { title: "标题", dataIndex: "title" },
            { title: "状态", dataIndex: "status", width: 100, render: (value: ChangeStatus) => <StatusTag status={value === "published" ? "success" : value} label={STATUS_LABEL[value]} /> },
            { title: "影响", render: (_, row) => [...(row.affected.models || []), ...(row.affected.routes || []), ...(row.affected.accounts || [])].slice(0, 4).join("、") },
            { title: "来源", dataIndex: "source", width: 150 },
            { title: "发起人", dataIndex: "author", width: 180 },
            { title: "更新时间", dataIndex: "updatedAt", width: 170, render: (value: string) => displayDate(value) },
          ]}
        />
      </AdminState>
      <ChangeRequestDrawer id={openId} canManage={canManage} onClose={() => setOpenId(null)} onChanged={() => { list.reload(); onChanged(); }} />
    </Card>
  );
}

function VersionsTab({ canManage, refreshKey, onChanged }: { canManage: boolean; refreshKey: number; onChanged: () => void }) {
  const { message } = App.useApp();
  const versions = useAdminResource((signal) => configApi.versions(signal), [refreshKey]);
  const [range, setRange] = useState<{ from?: number; to?: number }>({});
  const diff = useAdminResource(
    (signal) => range.from && range.to ? configApi.versionDiff(range.from, range.to, signal) : Promise.resolve(null),
    [range.from, range.to]
  );
  const [rollback, setRollback] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const options = (versions.data || []).map((item) => ({ value: item.version, label: `v${item.version}（${item.kind}）` }));
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card size="small" title="版本历史">
        <AdminState loading={versions.loading && !versions.data} error={versions.error} onRetry={versions.reload}>
          <Table
            size="small"
            rowKey="version"
            dataSource={versions.data || []}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: "版本", dataIndex: "version", width: 80, render: (value: number) => `v${value}` },
              { title: "类型", dataIndex: "kind", width: 100, render: (value: string) => <Tag color={value === "rollback" ? "orange" : value === "backfill" ? "purple" : "blue"}>{value}</Tag> },
              { title: "说明", dataIndex: "note" },
              { title: "发布人", dataIndex: "publishedBy", width: 180 },
              { title: "时间", dataIndex: "publishedAt", width: 170, render: (value: string) => displayDate(value) },
              ...(canManage ? [{
                title: "操作",
                width: 110,
                render: (_: unknown, row: { version: number }) => (
                  <Button size="small" icon={<RollbackOutlined />} disabled={row.version === versions.data?.[0]?.version} onClick={() => { setRollback(row.version); setReason(""); }}>回滚到此</Button>
                ),
              }] : []),
            ]}
          />
        </AdminState>
      </Card>
      <Card size="small" title="对比任意两个版本">
        <Space style={{ marginBottom: 12 }}>
          <Select placeholder="从" style={{ width: 160 }} options={options} value={range.from} onChange={(value) => setRange((current) => ({ ...current, from: value }))} />
          <Select placeholder="到" style={{ width: 160 }} options={options} value={range.to} onChange={(value) => setRange((current) => ({ ...current, to: value }))} />
        </Space>
        {range.from && range.to ? (
          <AdminState loading={diff.loading} error={diff.error} onRetry={diff.reload}>
            <DiffTable diff={diff.data} />
          </AdminState>
        ) : null}
      </Card>
      <Modal
        open={rollback !== null}
        title={`回滚到 v${rollback}`}
        okText="发布回滚版本"
        okButtonProps={{ danger: true, disabled: reason.trim().length < 3 }}
        onCancel={() => setRollback(null)}
        onOk={async () => {
          try {
            const result = await configApi.rollback(rollback!, reason);
            message.success(`已发布 v${result.version}（内容等于 v${rollback}）`);
            setRollback(null);
            versions.reload();
            onChanged();
          } catch (error) {
            message.error(error instanceof Error ? error.message : "回滚失败");
          }
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Alert type="warning" showIcon title="回滚会生成一个新版本，内容与所选版本相同；5 秒内所有节点生效。" />
          <Input.TextArea rows={3} maxLength={500} showCount placeholder="回滚原因（进入审计）" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Space>
      </Modal>
    </Space>
  );
}

function BailianTab() {
  const report = useAdminResource((signal) => configApi.bailianReport(signal), []);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const data = report.data?.report;
  const diffs = useMemo(() => ((data?.diffs || []) as Array<Record<string, any>>).filter((item) => !category || item.category === category), [data, category]);
  return (
    <AdminState loading={report.loading} error={report.error} empty={!report.data} emptyText="还没有百炼差异报告" onRetry={report.reload}>
      {data ? (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Alert type="info" showIcon title={`${report.data!.file}：抓取于 ${displayDate(data.snapshotFetchedAt)}，自检${data.selfCheck?.ok ? "通过" : "失败"}。报告只读，任何结果都不会自动写入配置。`} />
          <Space wrap>
            {Object.entries(data.counts || {}).map(([key, value]) => (
              <Tag key={key} color={category === key ? "blue" : undefined} style={{ cursor: "pointer" }} onClick={() => setCategory(category === key ? undefined : key)}>{key}：{String(value)}</Tag>
            ))}
          </Space>
          <Table size="small" rowKey={(row) => `${row.category}:${row.model}:${row.detail}`} dataSource={diffs} pagination={{ pageSize: 20 }}
            columns={[
              { title: "类别", dataIndex: "category", width: 170 },
              { title: "模型", dataIndex: "model", width: 200 },
              { title: "说明", dataIndex: "detail" },
              { title: "我们", dataIndex: "ours", render: (value: unknown) => <Typography.Text code>{short(value)}</Typography.Text> },
              { title: "上游", dataIndex: "upstream", render: (value: unknown) => <Typography.Text code>{short(value)}</Typography.Text> },
            ]}
          />
        </Space>
      ) : null}
    </AdminState>
  );
}

function ProbesTab() {
  const [route, setRoute] = useState<string | undefined>(undefined);
  const probes = useAdminResource((signal) => configApi.probeResults(route, signal), [route]);
  return (
    <Card size="small">
      <Input.Search allowClear placeholder="按路由 ID 过滤" style={{ width: 320, marginBottom: 12 }} onSearch={(value) => setRoute(value || undefined)} />
      <AdminState loading={probes.loading && !probes.data} error={probes.error} onRetry={probes.reload}>
        <Table size="small" rowKey="id" dataSource={probes.data || []} pagination={{ pageSize: 20 }}
          columns={[
            { title: "路由", dataIndex: "route_id" },
            { title: "协议", dataIndex: "protocol", width: 160 },
            { title: "能力", dataIndex: "capability", width: 120 },
            { title: "结果", dataIndex: "ok", width: 90, render: (value: boolean) => <StatusTag status={value ? "success" : "failed"} label={value ? "通过" : "失败"} /> },
            { title: "HTTP", dataIndex: "http_status", width: 80 },
            { title: "耗时", dataIndex: "latency_ms", width: 90, render: (value: number) => value === null || value === undefined ? "—" : `${value} ms` },
            { title: "错误", dataIndex: "error" },
            { title: "时间", dataIndex: "probed_at", width: 170, render: (value: string) => displayDate(value) },
          ]}
        />
      </AdminState>
    </Card>
  );
}

export default function ControlPlaneConfigScreen() {
  const { can } = useAdminSession();
  const canManage = can("traffic.manage");
  const [refreshKey, setRefreshKey] = useState(0);
  const [openChange, setOpenChange] = useState<string | null>(null);
  const [tab, setTab] = useState("models");
  const [editing, setEditing] = useState<{ entity: EntityKind; id: string | null; value: Record<string, unknown> | null; remove?: boolean } | null>(null);
  const state = useAdminResource((signal) => configApi.state(signal), [refreshKey]);
  const current = useAdminResource((signal) => configApi.current(signal), [refreshKey]);
  const content = current.data?.content || null;
  const flags = (state.data?.flags || {}) as Record<string, unknown>;

  return (
    <div className="nf-admin-page">
      <AdminPageHeader
        eyebrow="CONFIG CONTROL PLANE"
        title="配置控制面"
        description="模型、上游账号与配额池、路由、流量策略的唯一编辑入口。每次修改生成变更单，经校验和审批后发布为不可变版本，可回滚。"
        actions={<Button icon={<ReloadOutlined />} onClick={() => setRefreshKey((key) => key + 1)}>刷新</Button>}
      />
      <AdminState loading={state.loading && !state.data} error={state.error} onRetry={state.reload}>
        <div className="nf-admin-metric-grid">
          <AdminMetric label="当前版本" value={state.data?.currentVersion ? `v${state.data.currentVersion.version}` : "未发布"} description={state.data?.currentVersion ? `${state.data.currentVersion.publishedBy} · ${displayDate(state.data.currentVersion.publishedAt)}` : "先执行在线回填"} />
          <AdminMetric label="本节点已加载" value={state.data?.loadedVersion ? `v${state.data.loadedVersion}` : "—"} description="NF_CP_MODE 为 legacy 时不加载" />
          <AdminMetric label="模型 / 路由" value={`${state.data?.counts?.models ?? 0} / ${state.data?.counts?.routes ?? 0}`} />
          <AdminMetric label="开关" value={String(flags.NF_CP_MODE ?? "legacy")} description={Object.entries(flags).map(([key, value]) => `${key}=${String(value)}`).join(" · ")} />
        </div>
      </AdminState>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          ...(Object.keys(ENTITY_LABEL) as EntityKind[]).map((entity) => ({
            key: `${entity}s`,
            label: ENTITY_LABEL[entity],
            children: (
              <AdminState loading={current.loading && !current.data} error={current.error} empty={!content} emptyText="还没有已发布的配置版本" onRetry={current.reload}>
                {content ? <EntityTab entity={entity} content={content} canManage={canManage} onEdit={setEditing} /> : null}
              </AdminState>
            ),
          })),
          { key: "changes", label: "变更单", children: <ChangeRequestsTab canManage={canManage} openId={openChange} setOpenId={setOpenChange} refreshKey={refreshKey} onChanged={() => setRefreshKey((key) => key + 1)} /> },
          { key: "versions", label: "版本与回滚", children: <VersionsTab canManage={canManage} refreshKey={refreshKey} onChanged={() => setRefreshKey((key) => key + 1)} /> },
          { key: "bailian", label: "百炼差异报告", children: <BailianTab /> },
          { key: "probes", label: "探测结果", children: <ProbesTab /> },
        ]}
      />
      <EditEntityDrawer
        target={editing}
        onClose={() => setEditing(null)}
        onCreated={(id) => {
          setEditing(null);
          setTab("changes");
          setOpenChange(id);
          setRefreshKey((key) => key + 1);
        }}
      />
    </div>
  );
}
