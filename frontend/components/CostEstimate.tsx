"use client";

import { useMemo } from "react";
import { cnyToUsd } from "@/lib/money";

interface ModelInfo {
  id: string;
  promptPrice: number;
  completionPrice: number;
  tokenPricingTiers?: Array<{
    label: string;
    maxTokens: number;
    promptPrice: number;
    completionPrice: number;
  }>;
}

interface CostEstimateProps {
  model: ModelInfo | null;
  inputText: string;
  estimatedOutputTokens?: number;
}

// Rough token estimation: ~4 chars per token for Chinese, ~1 token per word for English
function estimateTokens(text: string): number {
  if (!text) return 0;

  // Count Chinese characters
  const chineseChars = text.match(/[一-鿿]/g)?.length || 0;

  // Count words (English and other)
  const words = text.split(/\s+/).filter(w => w.length > 0).length;

  // Estimate: Chinese ~1.5 tokens per char, English ~1 token per word
  return Math.ceil(chineseChars * 1.5 + words);
}

export default function CostEstimate({
  model,
  inputText,
  estimatedOutputTokens = 500
}: CostEstimateProps) {
  const estimate = useMemo(() => {
    if (!model || !inputText) return null;

    const inputTokens = estimateTokens(inputText);
    const totalTokens = inputTokens + estimatedOutputTokens;
    const tier = model.tokenPricingTiers?.find((item) => inputTokens <= item.maxTokens)
      || model.tokenPricingTiers?.[model.tokenPricingTiers.length - 1];
    const promptPrice = tier?.promptPrice ?? model.promptPrice;
    const completionPrice = tier?.completionPrice ?? model.completionPrice;

    const inputCost = (inputTokens / 1_000_000) * promptPrice;
    const outputCost = (estimatedOutputTokens / 1_000_000) * completionPrice;
    const totalCost = inputCost + outputCost;

    return {
      inputTokens,
      outputTokens: estimatedOutputTokens,
      totalTokens,
      inputCost,
      outputCost,
      totalCost,
      tierLabel: tier?.label,
    };
  }, [model, inputText, estimatedOutputTokens]);

  if (!estimate || !inputText) return null;

  // Format cost with appropriate precision
  const formatCost = (cost: number) => {
    const usd = cnyToUsd(cost);
    if (usd < 0.0001) return "$0";
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    if (usd < 1) return `$${usd.toFixed(3)}`;
    return `$${usd.toFixed(2)}`;
  };

  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: 8,
      background: "var(--bg-elevated)",
      border: "1px solid var(--border)",
      marginBottom: 8,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 6,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-secondary)",
        }}>
          Cost Estimate
        </span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 12,
      }}>
        <div>
          <div style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginBottom: 2,
          }}>
            Input Tokens
          </div>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            fontVariantNumeric: "tabular-nums",
          }}>
            ~{estimate.inputTokens}
          </div>
        </div>
        {estimate.tierLabel && (
          <div>
            <div style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              marginBottom: 2,
            }}>
              Pricing Tier
            </div>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-secondary)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {estimate.tierLabel}
            </div>
          </div>
        )}

        <div>
          <div style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginBottom: 2,
          }}>
            Est. Output
          </div>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-secondary)",
            fontVariantNumeric: "tabular-nums",
          }}>
            ~{estimate.outputTokens}
          </div>
        </div>

        <div>
          <div style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginBottom: 2,
          }}>
            Est. Cost
          </div>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--success)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {formatCost(estimate.totalCost)}
          </div>
        </div>
      </div>

      {model?.promptPrice === 0 && model?.completionPrice === 0 && (
        <div style={{
          marginTop: 6,
          padding: "4px 8px",
          borderRadius: 4,
          background: "var(--success-bg)",
          fontSize: 11,
          color: "var(--success)",
          fontWeight: 600,
        }}>
          ✓ This model is free to use
        </div>
      )}
    </div>
  );
}
