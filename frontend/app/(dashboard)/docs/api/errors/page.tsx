"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";

const errorCodes = [
  {
    code: 400,
    name: "Bad Request",
    causes: ["Malformed request", "Required parameter missing", "Parameter type mismatch", "Parameter value out of range"],
    solution: "Check that the request JSON is valid and that all required parameters are present with the correct types."
  },
  {
    code: 401,
    name: "Unauthorized",
    causes: ["API key invalid or expired", "Missing Authorization header", "Bad authentication format"],
    solution: "Confirm that you are using the correct API key and that the Authorization header has the format 'Bearer sk-air-xxx'."
  },
  {
    code: 403,
    name: "Forbidden",
    causes: ["Insufficient account balance", "API key lacks permission", "Access to a forbidden resource", "Account banned"],
    solution: "Check your balance, ensure the API key has the necessary permissions, or contact support for account issues."
  },
  {
    code: 404,
    name: "Not Found",
    causes: ["Requested model does not exist", "Wrong API endpoint path", "Resource has been deleted"],
    solution: "Confirm the model ID is spelled correctly, check the endpoint path, and consult the docs to verify resource availability."
  },
  {
    code: 413,
    name: "Payload Too Large",
    causes: ["Request body exceeds size limit", "Uploaded file too large", "messages array too long"],
    solution: "Reduce the request body size, compress or split large files, and trim conversation history."
  },
  {
    code: 422,
    name: "Unprocessable Entity",
    causes: ["Semantic parameter error", "temperature outside the 0-2 range", "max_tokens exceeds the model's limit"],
    solution: "Check that parameter values are within the allowed ranges; consult the docs for each parameter's constraints."
  },
  {
    code: 429,
    name: "Too Many Requests",
    causes: ["RPM (requests per minute) limit exceeded", "TPM (tokens per minute) limit exceeded", "Too many concurrent requests"],
    solution: "Implement retry with exponential backoff, upgrade your plan to raise quotas, and tune your request rate."
  },
  {
    code: 500,
    name: "Internal Server Error",
    causes: ["Internal server error", "Upstream model service error", "Temporary system issue"],
    solution: "Retry later; if the issue persists, contact technical support."
  },
  {
    code: 502,
    name: "Bad Gateway",
    causes: ["Gateway error", "Upstream service unreachable", "Network path issues"],
    solution: "Retry later, check the service status page, and contact support if the issue persists."
  },
  {
    code: 503,
    name: "Service Unavailable",
    causes: ["Service temporarily unavailable", "Server overload", "Under maintenance"],
    solution: "Wait a few minutes before retrying; check official announcements for maintenance schedules."
  },
  {
    code: 504,
    name: "Gateway Timeout",
    causes: ["Request handling timed out", "Slow model response", "High network latency"],
    solution: "Reduce the max_tokens parameter, simplify the input, or retry later."
  },
];

const businessErrors = [
  {
    code: "invalid_api_key",
    message: "Invalid API key provided",
    desc: "API key format is incorrect or does not exist",
    solution: "Generate a fresh, valid API key in the console"
  },
  {
    code: "insufficient_quota",
    message: "You have exceeded your quota",
    desc: "Insufficient balance or quota exhausted",
    solution: "Top up your balance or wait for the quota to reset"
  },
  {
    code: "model_not_found",
    message: "The model does not exist",
    desc: "The specified model ID does not exist",
    solution: "Verify the model ID spelling; consult the docs for the available model list"
  },
  {
    code: "context_length_exceeded",
    message: "Context length exceeds model limit",
    desc: "Input length exceeds the model's context window",
    solution: "Shorten the input or use a model with a longer context window"
  },
  {
    code: "content_filter",
    message: "Content was filtered due to policy",
    desc: "The content was filtered for policy reasons",
    solution: "Modify the input to avoid sensitive or non-compliant content"
  },
  {
    code: "rate_limit_exceeded",
    message: "Rate limit exceeded",
    desc: "Request rate exceeded the limit",
    solution: "Reduce request frequency and implement retries"
  },
  {
    code: "server_error",
    message: "Internal server error",
    desc: "Internal server processing error",
    solution: "Retry later; contact support if the issue persists"
  },
];

const codeExamples: Record<string, string> = {
  python: `from openai import OpenAI
import time

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

def call_with_retry(messages, max_retries=3):
    """API call with retry logic"""
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="qwen3.5-plus",
                messages=messages,
            )
            return response
        except Exception as e:
            error_code = getattr(e, 'status_code', None)
            
            # Retryable errors
            if error_code in [429, 500, 502, 503, 504]:
                wait_time = (2 ** attempt) + 1  # Exponential backoff
                print(f"Error {error_code}, retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue
            
            # Non-retryable error
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
  baseURL: "https://nexusflow.hk/v1",
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
      
      // Retryable errors
      if ([429, 500, 502, 503, 504].includes(statusCode)) {
        const waitTime = Math.pow(2, attempt) + 1;
        console.log(\`Error \${statusCode}, retrying in \${waitTime}s...\`);
        await new Promise(r => setTimeout(r, waitTime * 1000));
        continue;
      }
      
      // Non-retryable error
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
        This document lists all the error codes the nexusflow API may return, along with recommended handling.
      </p>

      {/* HTTP status codes */}
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
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 80 }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 140 }}>Name</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Possible Causes</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 240 }}>Resolution</th>
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

      {/* Business error codes */}
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
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 200 }}>Resolution</th>
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

      {/* Error handling examples */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          Error Handling Best Practices
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
          For production, implement an exponential-backoff retry mechanism to gracefully handle transient errors:
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

      {/* Notes */}
      <section style={{
        padding: 20,
        background: "var(--warning-bg)",
        border: "1px solid var(--warning-border)",
        borderRadius: 10,
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--warning)", marginBottom: 12 }}>
          Notes
        </h3>
        <ul style={{ margin: 0, paddingLeft: 20, color: "#92400e", fontSize: 14, lineHeight: 1.8 }}>
          <li><strong>Retryable errors</strong>: 429, 500, 502, 503, 504 are usually transient—use exponential backoff retry.</li>
          <li><strong>Non-retryable errors</strong>: 400, 401, 403, 404, 422 typically require modifying the request to succeed.</li>
          <li><strong>Logging</strong>: log the request ID (the X-Request-ID response header) to aid in troubleshooting.</li>
          <li><strong>Monitoring &amp; alerts</strong>: set up alerts on 5xx errors so service issues are caught quickly.</li>
        </ul>
      </section>
    </div>
  );
}
