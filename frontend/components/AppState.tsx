"use client";

interface AppStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function LoadingState({ title = "正在加载", message = "正在获取最新数据...", compact = false }: AppStateProps) {
  return (
    <div className="app-state" style={{ padding: compact ? 24 : 56 }}>
      <div className="spinner" style={{ width: 18, height: 18, margin: "0 auto 14px" }} />
      <div className="app-state-title">{title}</div>
      <div className="app-state-message">{message}</div>
    </div>
  );
}

export function ErrorState({
  title = "加载失败",
  message = "服务暂时不可用，请稍后重试。",
  actionLabel = "重试",
  onAction,
  compact = false,
}: AppStateProps) {
  return (
    <div className="app-state app-state-error" style={{ padding: compact ? 24 : 56 }}>
      <div className="app-state-icon">!</div>
      <div className="app-state-title">{title}</div>
      <div className="app-state-message">{message}</div>
      {onAction && (
        <button className="btn-secondary" onClick={onAction} style={{ marginTop: 14 }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title = "暂无数据",
  message = "完成第一次调用后，这里会出现对应记录。",
  actionLabel,
  onAction,
  compact = false,
}: AppStateProps) {
  return (
    <div className="app-state" style={{ padding: compact ? 24 : 56 }}>
      <div className="app-state-icon app-state-icon-muted">·</div>
      <div className="app-state-title">{title}</div>
      <div className="app-state-message">{message}</div>
      {onAction && actionLabel && (
        <button className="btn-primary" onClick={onAction} style={{ marginTop: 14 }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
