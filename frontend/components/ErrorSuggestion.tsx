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
    title: "Invalid API Key",
    description: "Please check if your API Key was copied correctly, or create a new key.",
    action: { label: "Manage Keys", href: "/keys" },
  },
  "unauthorized": {
    title: "Unauthorized Access",
    description: "Please ensure your request header includes the correct Authorization: Bearer YOUR_API_KEY",
    action: { label: "View Docs", href: "/docs/quickstart" },
  },

  // Billing errors
  "insufficient_balance": {
    title: "Insufficient Balance",
    description: "Your account balance has been depleted. Please recharge to continue using the service.",
    action: { label: "Recharge Now", href: "/billing" },
  },
  "billing_error": {
    title: "Insufficient Account Balance",
    description: "API calls require balance. Please recharge to ensure normal service usage.",
    action: { label: "Recharge", href: "/billing" },
  },

  // Rate limit errors
  "rate_limit_exceeded": {
    title: "Too Many Requests",
    description: "You have exceeded the rate limit. Please wait a moment and retry, or apply for a higher limit.",
    action: { label: "Apply for Higher Limit", href: "/rate-limits" },
  },
  "429": {
    title: "Rate Limit Triggered",
    description: "Request rate is too fast, please retry later. You can check the Retry-After time in the response headers.",
  },

  // Model errors
  "model_not_found": {
    title: "Model Not Found",
    description: "Please check if the model ID is correct, or view the available model list.",
    action: { label: "View Models", href: "/models" },
  },
  "unsupported_model": {
    title: "Model Unsupported Operation",
    description: "This model does not support the current request type. Please select a suitable model.",
    action: { label: "Select Model", href: "/models" },
  },
  "provider_not_found": {
    title: "Provider Not Found",
    description: "This model is temporarily unavailable. Please select another model or retry later.",
    action: { label: "View Available Models", href: "/models" },
  },
  "provider_not_configured": {
    title: "Provider Configuration Error",
    description: "System configuration issue. Please contact the administrator or retry later.",
  },

  // Network errors
  "upstream_error": {
    title: "Upstream Service Error",
    description: "The AI model provider is temporarily experiencing issues. The system is automatically switching to a backup provider.",
  },
  "network_error": {
    title: "Network Connection Error",
    description: "Please check your network connection and confirm that the backend service is running normally.",
  },
  "timeout": {
    title: "Request Timeout",
    description: "The model response time is too long. Please try using shorter input or select a faster model.",
  },

  // Request errors
  "invalid_request": {
    title: "Invalid Request Parameters",
    description: "Please check the request parameter format and ensure the messages array is not empty.",
  },
  "context_length_exceeded": {
    title: "Context Length Exceeded",
    description: "The input content is too long. Please reduce the input or select a model that supports longer context.",
    action: { label: "Select Long Context Model", href: "/models" },
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
    if (lowerMsg.includes("balance") || lowerMsg.includes("insufficient")) return errorSolutions["insufficient_balance"];
    if (lowerMsg.includes("rate") || lowerMsg.includes("limit") || lowerMsg.includes("429")) return errorSolutions["rate_limit_exceeded"];
    if (lowerMsg.includes("model") || lowerMsg.includes("not found")) return errorSolutions["model_not_found"];
    if (lowerMsg.includes("network") || lowerMsg.includes("connection")) return errorSolutions["network_error"];
    if (lowerMsg.includes("timeout") || lowerMsg.includes("timed out")) return errorSolutions["timeout"];
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
