"use client";

import { Alert, Button, Card, Empty, Result, Skeleton, Statistic, Tag, Tooltip } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { AdminApiError } from "../client";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="nf-admin-page-header">
      <div>
        {eyebrow ? <div className="nf-admin-eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="nf-admin-page-actions">{actions}</div> : null}
    </header>
  );
}

export function AdminMetric({
  label,
  value,
  suffix,
  description,
  unknown = false,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  description?: string | null;
  unknown?: boolean;
}) {
  return (
    <Card className={`nf-admin-metric${unknown ? " is-unknown" : ""}`} size="small">
      <Statistic title={label} value={value} suffix={suffix} />
      {description ? <div className="nf-admin-metric-note">{description}</div> : null}
    </Card>
  );
}

export function AdminState({
  loading,
  error,
  empty,
  emptyText = "暂无真实数据",
  onRetry,
  children,
}: {
  loading: boolean;
  error: Error | null;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  // Skeleton only for the first load. A reload after an edit or a filter
  // change keeps the current content (and tab/scroll state) visible.
  if (loading && empty !== false) {
    return (
      <Card className="nf-admin-state-card" aria-busy="true">
        <Skeleton active paragraph={{ rows: 7 }} />
      </Card>
    );
  }

  if (loading) {
    return <div className="nf-admin-refreshing" aria-busy="true">{children}</div>;
  }

  if (error) {
    const status = error instanceof AdminApiError ? error.status : 500;
    if (status === 403) {
      return <Result status="403" title="无权查看此模块" subTitle={error.message} />;
    }
    return (
      <Alert
        type="error"
        showIcon
        title="真实数据加载失败"
        description={error.message}
        action={onRetry ? <Button icon={<ReloadOutlined />} onClick={onRetry}>重试</Button> : undefined}
      />
    );
  }

  if (empty) {
    return (
      <Card className="nf-admin-state-card">
        <Empty description={emptyText} />
      </Card>
    );
  }

  return <>{children}</>;
}

const STATUS_COLOR: Record<string, string> = {
  active: "success",
  enabled: "success",
  healthy: "success",
  success: "success",
  completed: "success",
  succeeded: "success",
  resolved: "success",
  approved: "success",
  pending: "warning",
  open: "warning",
  warning: "warning",
  degraded: "warning",
  in_progress: "processing",
  running: "processing",
  started: "processing",
  deploying: "processing",
  draft: "default",
  unknown: "default",
  disabled: "error",
  suspended: "error",
  deleted: "error",
  revoked: "error",
  rolled_back: "error",
  failed: "error",
  error: "error",
  rejected: "error",
  down: "error",
  critical: "error",
};

// Chinese labels for the raw codes stored in the database. The raw code stays
// available as a tooltip so operators can still search logs and SQL for it.
const STATUS_LABEL: Record<string, string> = {
  active: "正常",
  enabled: "已启用",
  healthy: "健康",
  success: "成功",
  completed: "已完成",
  succeeded: "成功",
  resolved: "已解决",
  approved: "已批准",
  pending: "待处理",
  open: "待处理",
  warning: "警告",
  degraded: "降级",
  in_progress: "处理中",
  running: "运行中",
  started: "进行中",
  deploying: "发布中",
  draft: "草稿",
  unknown: "未知",
  disabled: "已停用",
  suspended: "已冻结",
  deleted: "已删除",
  revoked: "已撤销",
  rolled_back: "已回滚",
  failed: "失败",
  error: "错误",
  rejected: "已拒绝",
  down: "故障",
  critical: "严重",
  closed: "已关闭",
  main: "主账号",
  sub: "子账号",
  recharge: "充值",
  consumption: "消费",
  admin_adjustment: "余额调整",
  credit_adjustment: "信控调整",
  refund: "退款",
  available: "可用",
  no_active_route: "路由全部停用",
  no_route: "无托管路由",
};

STATUS_COLOR.available = "success";
STATUS_COLOR.no_active_route = "error";
STATUS_COLOR.no_route = "warning";
STATUS_COLOR.recharge = "success";
STATUS_COLOR.consumption = "default";
STATUS_COLOR.admin_adjustment = "processing";
STATUS_COLOR.credit_adjustment = "processing";
STATUS_COLOR.closed = "default";

export function statusLabel(status?: string | null): string {
  const normalized = status || "unknown";
  return STATUS_LABEL[normalized] || normalized;
}

export function StatusTag({ status, label }: { status?: string | null; label?: string }) {
  const normalized = status || "unknown";
  const text = label || statusLabel(normalized);
  const tag = <Tag color={STATUS_COLOR[normalized] || "default"}>{text}</Tag>;
  return text === normalized ? tag : <Tooltip title={normalized}>{tag}</Tooltip>;
}

export function TruthBar({ truth, generatedAt }: { truth?: Record<string, unknown>; generatedAt?: string | null }) {
  const facts = Object.entries(truth || {}).flatMap(([key, value]) => {
    if (["string", "number", "boolean"].includes(typeof value)) return [[key, String(value)]];
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      return [[key, value.join(", ")]];
    }
    return [];
  })
    .slice(0, 6);

  return (
    <div className="nf-admin-truth" role="note" aria-label="数据真实性说明">
      <span className="nf-admin-truth-dot" />
      <strong>Real data</strong>
      {generatedAt ? <span>生成时间 {new Date(generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span> : null}
      {facts.map(([key, value]) => (
        <Tooltip key={key} title={key}>
          <span>{value}</span>
        </Tooltip>
      ))}
    </div>
  );
}
