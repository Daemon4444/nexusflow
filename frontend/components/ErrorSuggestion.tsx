"use client";

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
    title: "Invalid API key",
    description: "Please check that your API key was copied correctly, or create a new one.",
    action: { label: "Manage keys", href: "/keys" },
  },
  "unauthorized": {
    title: "Unauthorized",
    description: "Make sure your request includes the header Authorization: Bearer YOUR_API_KEY",
    action: { label: "View docs", href: "/docs/quickstart" },
  },

  // Billing errors
  "insufficient_balance": {
    title: "Insufficient balance",
    description: "Your account balance is empty. Top up to continue using the service.",
    action: { label: "Top up now", href: "/billing" },
  },
  "billing_error": {
    title: "Insufficient balance",
    description: "API calls consume your balance — please top up to keep the service running.",
    action: { label: "Top up", href: "/billing" },
  },

  // Rate limit errors
  "rate_limit_exceeded": {
    title: "Too many requests",
    description: "You have exceeded the rate limit. Please retry shortly, or apply for a higher limit.",
    action: { label: "Apply for higher limits", href: "/rate-limits" },
  },
  "429": {
    title: "Rate limit hit",
    description: "Requests are too frequent. Please retry shortly. Check the Retry-After response header for the wait time.",
  },

  // Model errors
  "model_not_found": {
    title: "Model not found",
    description: "Please verify the model ID, or browse the list of available models.",
    action: { label: "View models", href: "/models" },
  },
  "unsupported_model": {
    title: "Model does not support this operation",
    description: "This model does not support the current request type. Pick a model that does.",
    action: { label: "Choose a model", href: "/models" },
  },
  "provider_not_found": {
    title: "Provider not found",
    description: "The model is temporarily unavailable. Try a different model or retry later.",
    action: { label: "View available models", href: "/models" },
  },
  "provider_not_configured": {
    title: "Provider misconfigured",
    description: "There is a configuration issue. Please contact the administrator or retry later.",
  },

  // Network errors
  "upstream_error": {
    title: "Upstream service error",
    description: "The AI provider is responding abnormally. The system is automatically failing over to a backup provider.",
  },
  "network_error": {
    title: "Network error",
    description: "Please check your network connection and confirm that the backend service is running.",
  },
  "timeout": {
    title: "Request timed out",
    description: "The model took too long to respond. Try a shorter input or pick a faster model.",
  },

  // Request errors
  "invalid_request": {
    title: "Invalid request parameters",
    description: "Please check the request format — make sure the messages array is not empty.",
  },
  "context_length_exceeded": {
    title: "Context length exceeded",
    description: "The input is too long. Reduce it or pick a model with a longer context window.",
    action: { label: "Pick a long-context model", href: "/models" },
  },
};

interface ErrorSuggestionProps {
  error: ApiError | string;
  onClose?: () => void;
}

function getErrorSolution(error: ApiError | string): ErrorSolution | null {
  if (typeof error === "string") {
    const lowerMsg = error.toLowerCase();
    if (lowerMsg.includes("api key") || lowerMsg.includes("invalid")) return errorSolutions["invalid_api_key"];
    if (lowerMsg.includes("balance") || lowerMsg.includes("余额")) return errorSolutions["insufficient_balance"];
    if (lowerMsg.includes("rate") || lowerMsg.includes("limit") || lowerMsg.includes("429")) return errorSolutions["rate_limit_exceeded"];
    if (lowerMsg.includes("model") || lowerMsg.includes("not found")) return errorSolutions["model_not_found"];
    if (lowerMsg.includes("network") || lowerMsg.includes("网络")) return errorSolutions["network_error"];
    if (lowerMsg.includes("timeout") || lowerMsg.includes("超时")) return errorSolutions["timeout"];
    return null;
  }

  const code = error.code?.toLowerCase() || "";
  const status = error.status?.toString() || "";
  return errorSolutions[code] || errorSolutions[status] || null;
}

export default function ErrorSuggestion({ error, onClose }: ErrorSuggestionProps) {
  const solution = getErrorSolution(error);

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
