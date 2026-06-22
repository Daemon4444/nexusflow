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
          {isCritical ? "Balance Depleted" : "Low Balance"}
        </div>
        <div style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          marginTop: 2,
        }}>
          {isCritical
            ? "API calls will be rejected. Please recharge immediately to continue using the service"
            : `Current balance $${numericBalance.toFixed(2)}, recharge recommended to ensure normal service usage`}
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
          Recharge Now
        </button>
      )}
    </div>
  );
}
