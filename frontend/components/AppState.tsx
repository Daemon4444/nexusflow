"use client";

interface AppStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function LoadingState({ title = "Loading", message = "Fetching the latest data...", compact = false }: AppStateProps) {
  return (
    <div className="app-state" style={{ padding: compact ? 24 : 56 }}>
      <div className="spinner" style={{ width: 18, height: 18, margin: "0 auto 14px" }} />
      <div className="app-state-title">{title}</div>
      <div className="app-state-message">{message}</div>
    </div>
  );
}

export function ErrorState({
  title = "Failed to load",
  message = "The service is temporarily unavailable. Please try again later.",
  actionLabel = "Retry",
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
  title = "No data",
  message = "Records will appear here once your first request runs.",
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
