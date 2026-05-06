"use client";

interface BalanceWarningProps {
  balance: number;
  threshold?: number;
  onRecharge?: () => void;
}

export function BalanceWarning({ balance, threshold = 10, onRecharge }: BalanceWarningProps) {
  const numericBalance = Number(balance || 0);
  if (numericBalance >= threshold) return null;

  const isCritical = numericBalance <= 0;
  const isLow = numericBalance < threshold && numericBalance > 0;

  return (
    <div
      className="animate-fadeIn"
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: isCritical
          ? "rgba(239,68,68,0.08)"
          : "rgba(251,146,60,0.08)",
        border: isCritical
          ? "1px solid rgba(239,68,68,0.3)"
          : "1px solid rgba(251,146,60,0.3)",
      }}
    >
      {/* Icon */}
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isCritical
          ? "rgba(239,68,68,0.15)"
          : "rgba(251,146,60,0.15)",
      }}>
        <span style={{ fontSize: 18 }}>
          {isCritical ? "🚫" : "⚠️"}
        </span>
      </div>

      {/* Message */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: isCritical ? "#ef4444" : "#f97316",
        }}>
          {isCritical ? "余额已耗尽" : "余额不足"}
        </div>
        <div style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          marginTop: 2,
        }}>
          {isCritical
            ? "API 调用将被拒绝，请立即充值以继续使用服务"
            : `当前余额 ¥${numericBalance.toFixed(2)}，建议充值以保证服务正常使用`}
        </div>
      </div>

      {/* Action */}
      {onRecharge && (
        <button
          className="btn-primary"
          onClick={onRecharge}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            background: isCritical ? "#ef4444" : undefined,
          }}
        >
          立即充值
        </button>
      )}
    </div>
  );
}
