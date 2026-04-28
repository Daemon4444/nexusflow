"use client";

import { useEffect, useState } from "react";

export interface ApiError {
  code: string;
  message: string;
  status?: number;
}

interface ErrorSolution {
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

// Map error codes to helpful solutions
const errorSolutions: Record<string, ErrorSolution> = {
  // Authentication errors
  "invalid_api_key": {
    title: "API Key 无效",
    description: "请检查你的 API Key 是否正确复制，或创建一个新的密钥。",
    action: { label: "管理密钥", href: "/keys" },
  },
  "unauthorized": {
    title: "未授权访问",
    description: "请确保请求头中包含正确的 Authorization: Bearer YOUR_API_KEY",
    action: { label: "查看文档", href: "/docs/quickstart" },
  },

  // Billing errors
  "insufficient_balance": {
    title: "余额不足",
    description: "你的账户余额已耗尽，请充值后继续使用。",
    action: { label: "立即充值", href: "/billing" },
  },
  "billing_error": {
    title: "账户余额不足",
    description: "API 调用需要消耗余额，请充值以保证服务正常使用。",
    action: { label: "充值", href: "/billing" },
  },

  // Rate limit errors
  "rate_limit_exceeded": {
    title: "请求过于频繁",
    description: "你已超过速率限制，请等待片刻后重试，或申请更高的限制。",
    action: { label: "申请提高限制", href: "/rate-limits" },
  },
  "429": {
    title: "触发速率限制",
    description: "请求速度过快，请稍后重试。可在响应头中查看 Retry-After 时间。",
  },

  // Model errors
  "model_not_found": {
    title: "模型不存在",
    description: "请检查模型 ID 是否正确，或查看可用的模型列表。",
    action: { label: "查看模型", href: "/models" },
  },
  "unsupported_model": {
    title: "模型不支持此操作",
    description: "该模型不支持当前请求类型，请选择合适的模型。",
    action: { label: "选择模型", href: "/models" },
  },
  "provider_not_found": {
    title: "未找到供应商",
    description: "该模型暂时不可用，请选择其他模型或稍后重试。",
    action: { label: "查看可用模型", href: "/models" },
  },
  "provider_not_configured": {
    title: "供应商配置错误",
    description: "系统配置问题，请联系管理员或稍后重试。",
  },

  // Network errors
  "upstream_error": {
    title: "上游服务异常",
    description: "AI 模型供应商暂时响应异常，系统正在自动切换备用供应商。",
  },
  "network_error": {
    title: "网络连接错误",
    description: "请检查网络连接，确认后端服务是否正常运行。",
  },
  "timeout": {
    title: "请求超时",
    description: "模型响应时间过长，请尝试使用更短的输入或选择更快的模型。",
  },

  // Request errors
  "invalid_request": {
    title: "请求参数错误",
    description: "请检查请求参数格式，确保 messages 数组不为空。",
  },
  "context_length_exceeded": {
    title: "超出上下文长度",
    description: "输入内容过长，请减少输入或选择支持更长上下文的模型。",
    action: { label: "选择长上下文模型", href: "/models" },
  },
};

interface ErrorSuggestionProps {
  error: ApiError | string;
  onClose?: () => void;
}

export default function ErrorSuggestion({ error, onClose }: ErrorSuggestionProps) {
  const [solution, setSolution] = useState<ErrorSolution | null>(null);

  useEffect(() => {
    if (typeof error === "string") {
      // Try to match by error message
      const lowerMsg = error.toLowerCase();
      if (lowerMsg.includes("api key") || lowerMsg.includes("invalid")) {
        setSolution(errorSolutions["invalid_api_key"]);
      } else if (lowerMsg.includes("balance") || lowerMsg.includes("余额")) {
        setSolution(errorSolutions["insufficient_balance"]);
      } else if (lowerMsg.includes("rate") || lowerMsg.includes("limit") || lowerMsg.includes("429")) {
        setSolution(errorSolutions["rate_limit_exceeded"]);
      } else if (lowerMsg.includes("model") || lowerMsg.includes("not found")) {
        setSolution(errorSolutions["model_not_found"]);
      } else if (lowerMsg.includes("network") || lowerMsg.includes("网络")) {
        setSolution(errorSolutions["network_error"]);
      } else if (lowerMsg.includes("timeout") || lowerMsg.includes("超时")) {
        setSolution(errorSolutions["timeout"]);
      }
    } else {
      // Match by error code
      const code = error.code?.toLowerCase() || "";
      const status = error.status?.toString() || "";
      setSolution(errorSolutions[code] || errorSolutions[status] || null);
    }
  }, [error]);

  if (!solution) return null;

  return (
    <div
      className="animate-fadeIn"
      style={{
        padding: "14px 16px",
        borderRadius: 10,
        background: "rgba(239,68,68,0.06)",
        border: "1px solid rgba(239,68,68,0.2)",
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 10,
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: "rgba(239,68,68,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
        </div>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#ef4444",
        }}>
          {solution.title}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              marginLeft: "auto",
              padding: 4,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-tertiary)",
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Description */}
      <div style={{
        fontSize: 13,
        color: "var(--text-secondary)",
        lineHeight: 1.6,
        marginBottom: 10,
      }}>
        {solution.description}
      </div>

      {/* Action */}
      {solution.action && (
        <a
          href={solution.action.href || "#"}
          onClick={solution.action.onClick}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 6,
            background: "#ef4444",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            transition: "opacity 0.15s",
          }}
        >
          {solution.action.label}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
      )}
    </div>
  );
}