"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://nexusflow.vip";

const errorCodes = [
  {
    code: 400,
    name: "Bad Request",
    causes: ["Request format error", "Required parameter missing", "Parameter type mismatch", "Parameter value outside valid range"],
    solution: "Check that the request JSON format is correct, confirm all required parameters are provided with correct types."
  },
  {
    code: 401,
    name: "Unauthorized",
    causes: ["API key invalid or expired", "Authorization header not provided", "Authentication format error"],
    solution: "Confirm you are using the correct API key, check that the Authorization header format is 'Bearer sk-air-xxx'."
  },
  {
    code: 403,
    name: "Forbidden",
    causes: ["Insufficient account balance", "Insufficient API key permissions", "Access to prohibited resource", "Account suspended"],
    solution: "Check account balance, confirm the API key has appropriate permissions, contact customer support for account issues."
  },
  {
    code: 404,
    name: "Not Found",
    causes: ["Requested model does not exist", "API endpoint path error", "Resource has been removed"],
    solution: "Confirm the model ID spelling is correct, check the API endpoint path, review documentation to verify resource availability."
  },
  {
    code: 413,
    name: "Payload Too Large",
    causes: ["Request body exceeds size limit", "Uploaded file too large", "Messages array too long"],
    solution: "Reduce request body size, compress or split large files, reduce conversation history length."
  },
  {
    code: 422,
    name: "Unprocessable Entity",
    causes: ["Parameter semantic error", "temperature exceeds 0-2 range", "max_tokens exceeds model limit"],
    solution: "Check that parameter values are within valid ranges, refer to documentation for each parameter's constraints."
  },
  {
    code: 429,
    name: "Too Many Requests",
    causes: ["Exceeded RPM (requests per minute) limit", "Exceeded TPM (tokens per minute) limit", "Too many concurrent requests"],
    solution: "Implement request retry mechanism (exponential backoff), upgrade plan for higher quota, optimize request frequency."
  },
  {
    code: 500,
    name: "Internal Server Error",
    causes: ["Server internal error", "Upstream model service abnormal", "System temporary fault"],
    solution: "Retry the request after a brief wait. If errors persist, contact technical support."
  },
  {
    code: 502,
    name: "Bad Gateway",
    causes: ["Gateway error", "Upstream service unreachable", "Network link issue"],
    solution: "Retry after a brief wait, check service status page; if errors persist, contact technical support."
  },
  {
    code: 503,
    name: "Service Unavailable",
    causes: ["Service temporarily unavailable", "Server overloaded", "Maintenance in progress"],
    solution: "Wait a few minutes and retry, follow official announcements for maintenance schedules."
  },
  {
    code: 504,
    name: "Gateway Timeout",
    causes: ["Request processing timeout", "Model response too slow", "Network latency too high"],
    solution: "Reduce max_tokens parameter, simplify input content, or retry after a brief wait."
  },
];

const businessErrors = [
  {
    code: "invalid_api_key",
    message: "Invalid API key provided",
    desc: "API key format incorrect or does not exist",
    solution: "Obtain a valid API key from the dashboard"
  },
  {
    code: "insufficient_quota",
    message: "You have exceeded your quota",
    desc: "Insufficient account balance or quota exhausted",
    solution: "Add balance to your account or wait for quota reset"
  },
  {
    code: "model_not_found",
    message: "The model does not exist",
    desc: "The specified model ID does not exist",
    solution: "Check the model ID spelling, refer to documentation for available model list"
  },
  {
    code: "context_length_exceeded",
    message: "Context length exceeds model limit",
    desc: "Input content exceeds the model's context length limit",
    solution: "Reduce input content length, or use a model that supports longer context"
  },
  {
    code: "content_filter",
    message: "Content was filtered due to policy",
    desc: "Content was filtered due to security policy",
    solution: "Modify input content, avoid sensitive or policy-violating content"
  },
  {
    code: "rate_limit_exceeded",
    message: "Rate limit exceeded",
    desc: "Request frequency exceeds the limit",
    solution: "Reduce request frequency, implement retry mechanism"
  },
  {
    code: "server_error",
    message: "Internal server error",
    desc: "Server internal processing error",
    solution: "Retry after a brief wait; if errors persist, contact support"
  },
];

const codeExamples: Record<string, string> = {
  python: `from openai import OpenAI
import time

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE_URL}/v1",
)

def call_with_retry(messages, max_retries=3):
    """API call with retry mechanism"""
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="qwen3.5-plus",
                messages=messages,
            )
            return response
        except Exception as e:
            error_code = getattr(e, 'status_code', None)
            
            # Retriable errors
            if error_code in [429, 500, 502, 503, 504]:
                wait_time = (2 ** attempt) + 1  # exponential backoff
                print(f"Error {error_code}, retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue
            
            # Non-retriable errors
            raise e
    
    raise Exception("Max retries exceeded")

# Usage example
try:
    response = call_with_retry([
        {"role": "user", "content": "Hello!"}
    ])
    print(response.choices[0].message.content)
except Exception as e:
    print(f"Failed: {e}")`,
  nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE_URL}/v1",
});

async function callWithRetry(messages, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: "qwen3.5-plus",
        messages,
      });
      return response;
    } catch (error) {
      const statusCode = error.status;
      
      // Retriable errors
      if ([429, 500, 502, 503, 504].includes(statusCode)) {
        const waitTime = Math.pow(2, attempt) + 1;
        console.log(\`Error \${statusCode}, retrying in \${waitTime}s...\`);
        await new Promise(r => setTimeout(r, waitTime * 1000));
        continue;
      }
      
      // Non-retriable errors
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

// Usage example
try {
  const response = await callWithRetry([
    { role: "user", content: "Hello!" }
  ]);
  console.log(response.choices[0].message.content);
} catch (error) {
  console.error("Failed:", error.message);
}`,
};

export default function ErrorsPage() {
  const [codeLang, setCodeLang] = useState<"python" | "nodejs">("python");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, letterSpacing: "-0.5px" }}>
        Error Code Reference
      </h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 40, lineHeight: 1.6 }}>
        This document lists all error codes that the NexusFlow API may return, along with recommended handling approaches.
      </p>

      {/* HTTP Status Codes */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          HTTP Status Codes
        </h2>
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 80 }}>Status Code</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 140 }}>Name</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Possible Causes</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 240 }}>Solution</th>
              </tr>
            </thead>
            <tbody>
              {errorCodes.map((err, idx) => (
                <tr key={err.code} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                    <code style={{
                      background: err.code >= 500 ? "#fef2f2" : err.code >= 400 ? "#fffbeb" : "#f0fdf4",
                      color: err.code >= 500 ? "#dc2626" : err.code >= 400 ? "#d97706" : "#16a34a",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 13,
                      fontWeight: 600,
                    }}>
                      {err.code}
                    </code>
                  </td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", fontWeight: 500, verticalAlign: "top" }}>
                    {err.name}
                  </td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", verticalAlign: "top" }}>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {err.causes.map((c, i) => <li key={i} style={{ marginBottom: 4 }}>{c}</li>)}
                    </ul>
                  </td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13, verticalAlign: "top" }}>
                    {err.solution}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Business Error Codes */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          Business Error Codes
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
          When a request fails, the response body includes detailed error information:
        </p>
        <div style={{
          background: "#1a1a1a",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          overflow: "auto",
        }}>
          <DocsCodeBlock code={`{
  "error": {
    "code": "insufficient_quota",
    "message": "You have exceeded your quota. Please check your plan and billing details.",
    "type": "invalid_request_error"
  }
}`} />
        </div>

        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 180 }}>Error Code</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 200 }}>Solution</th>
              </tr>
            </thead>
            <tbody>
              {businessErrors.map((err, idx) => (
                <tr key={err.code} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                    <code style={{
                      background: "var(--bg-elevated)",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {err.code}
                    </code>
                  </td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", verticalAlign: "top" }}>
                    {err.desc}
                  </td>
                  <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13, verticalAlign: "top" }}>
                    {err.solution}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Error Handling Example */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          Error Handling Best Practices
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
          It is recommended to implement exponential backoff retry mechanisms in production environments to gracefully handle temporary errors:
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["python", "nodejs"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setCodeLang(lang)}
              style={{
                padding: "6px 16px",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: codeLang === lang ? "var(--text-primary)" : "var(--bg)",
                color: codeLang === lang ? "var(--bg)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {lang === "python" ? "Python" : "Node.js"}
            </button>
          ))}
        </div>

        <div style={{
          background: "#1a1a1a",
          borderRadius: 8,
          padding: 16,
          overflow: "auto",
        }}>
          <DocsCodeBlock code={codeExamples[codeLang]} />
        </div>
      </section>

      {/* Important Notes */}
      <section style={{
        padding: 20,
        background: "var(--warning-bg)",
        border: "1px solid var(--warning-border)",
        borderRadius: 10,
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--warning)", marginBottom: 12 }}>
          Important Notes
        </h3>
        <ul style={{ margin: 0, paddingLeft: 20, color: "#92400e", fontSize: 14, lineHeight: 1.8 }}>
          <li><strong>Retriable errors</strong>: 429, 500, 502, 503, 504 are typically temporary issues; it is recommended to use exponential backoff retry</li>
          <li><strong>Non-retriable errors</strong>: 400, 401, 403, 404, 422 typically require modifying the request before it can succeed</li>
          <li><strong>Log recording</strong>: It is recommended to log the request ID (from the X-Request-ID response header) for troubleshooting</li>
          <li><strong>Monitoring alerts</strong>: It is recommended to set up monitoring alerts for 5xx errors to promptly detect service anomalies</li>
        </ul>
      </section>
    </div>
  );
}