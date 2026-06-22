"use client";

import { useMemo } from "react";

interface UsageStats {
  monthlyCost: number;
  avgDailyCost: number;
  balance: number;
}

interface RechargeRecommendation {
  amount: number;
  reason: string;
  daysCovered: number;
}

function calculateRecommendation(stats: UsageStats): RechargeRecommendation[] {
  const recommendations: RechargeRecommendation[] = [];

  // Calculate average daily cost
  const avgDaily = stats.avgDailyCost || stats.monthlyCost / 30 || 0;

  // If user has no usage history, recommend based on common tiers
  if (avgDaily === 0) {
    recommendations.push({
      amount: 50,
      reason: "New User Recommendation",
      daysCovered: 30, // Assume light usage
    });
    return recommendations;
  }

  // Calculate different tiers based on usage
  const daysRemaining = stats.balance / avgDaily;

  // Tier 1: Cover 1 week (7 days)
  const weekAmount = Math.ceil(avgDaily * 7);
  if (weekAmount >= 10) {
    recommendations.push({
      amount: weekAmount,
      reason: `Covers 7 days of usage`,
      daysCovered: 7,
    });
  }

  // Tier 2: Cover 1 month (30 days)
  const monthAmount = Math.ceil(avgDaily * 30);
  if (monthAmount >= 50) {
    recommendations.push({
      amount: Math.min(monthAmount, 1000),
      reason: `Covers 30 days of usage`,
      daysCovered: 30,
    });
  }

  // Tier 3: Cover 3 months (90 days) for stable users
  const quarterAmount = Math.ceil(avgDaily * 90);
  if (quarterAmount >= 200 && quarterAmount <= 1000) {
    recommendations.push({
      amount: quarterAmount,
      reason: `Covers 90 days, fewer recharges needed`,
      daysCovered: 90,
    });
  }

  // Add urgency recommendation if balance is low
  if (daysRemaining < 3) {
    recommendations.unshift({
      amount: Math.max(Math.ceil(avgDaily * 7), 50),
      reason: `Balance only covers ${Math.floor(daysRemaining)} days, recharge recommended now`,
      daysCovered: 7,
    });
  }

  // Ensure at least 3 recommendations
  if (recommendations.length < 3) {
    const presets = [50, 100, 500];
    for (const p of presets) {
      if (!recommendations.find(r => r.amount === p)) {
        recommendations.push({
          amount: p,
          reason: `Common amount`,
          daysCovered: Math.floor(p / avgDaily),
        });
      }
    }
  }

  return recommendations.slice(0, 4);
}

interface SmartRechargeProps {
  stats: UsageStats;
  onSelect: (amount: number) => void;
  selectedAmount: string;
}

export default function SmartRecharge({ stats, onSelect, selectedAmount }: SmartRechargeProps) {
  const recommendations = useMemo(() => calculateRecommendation(stats), [stats]);

  if (recommendations.length === 0) return null;

  return (
    <div style={{
      padding: "14px 16px",
      borderRadius: 10,
      background: "var(--bg-elevated)",
      border: "1px solid var(--border)",
      marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-primary)",
        }}>
          Smart Recommendations
        </span>
        <span style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
        }}>
          Based on your usage patterns
        </span>
      </div>

      {/* Recommendations */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
      }}>
        {recommendations.map(rec => {
          const isSelected = selectedAmount === String(rec.amount);
          return (
            <button
              key={rec.amount}
              onClick={() => onSelect(rec.amount)}
              style={{
                padding: "12px 8px",
                borderRadius: 8,
                border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: isSelected ? "var(--accent-bg)" : "var(--bg)",
                cursor: "pointer",
                textAlign: "center",
                transition: "all 0.15s",
              }}
            >
              <div style={{
                fontSize: 16,
                fontWeight: 700,
                color: isSelected ? "var(--accent)" : "var(--text-primary)",
                marginBottom: 4,
              }}>
                ¥{rec.amount}
              </div>
              <div style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                lineHeight: 1.4,
              }}>
                {rec.reason}
              </div>
              {rec.daysCovered > 0 && (
                <div style={{
                  fontSize: 10,
                  color: "var(--text-secondary)",
                  marginTop: 4,
                  fontWeight: 500,
                }}>
                  ~{rec.daysCovered}d
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}