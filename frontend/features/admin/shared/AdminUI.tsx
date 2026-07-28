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
  if (loading) {
    return (
      <Card className="nf-admin-state-card" aria-busy="true">
        <Skeleton active paragraph={{ rows: 7 }} />
      </Card>
    );
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

export function StatusTag({ status, label }: { status?: string | null; label?: string }) {
  const normalized = status || "unknown";
  return <Tag color={STATUS_COLOR[normalized] || "default"}>{label || normalized}</Tag>;
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
