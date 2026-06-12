import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

const curlExample = `curl ${API_BASE}/v1/messages \\
  -H "x-api-key: $API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Explain what a model gateway is in three sentences"}
    ]
  }'`;

const streamExample = `curl ${API_BASE}/v1/messages \\
  -H "x-api-key: $API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Write a product launch announcement"}
    ]
  }'`;

const models = [
  ["claude-opus-4-7", "1M", "128K", "$5 / $25"],
  ["claude-sonnet-4-6", "1M", "64K", "$3 / $15"],
  ["claude-haiku-4-5", "200K", "64K", "$1 / $5"],
];

export default function ClaudeDocsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000 }}>
      <div style={{ marginBottom: 32 }}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 10px",
            borderRadius: 5,
            background: "#fffbeb",
            color: "#b45309",
            fontSize: 11,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Claude Messages API
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Claude API Integration
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 780, margin: 0 }}>
          NexusFlow's <code>/v1/messages</code> supports both native Anthropic Claude models and compatibility-layer models.
          When <code>model</code> matches <code>claude-*</code>, the request is forwarded directly to the Anthropic Messages API and the native response and SSE event format are preserved.
        </p>
      </div>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Endpoint</h2>
        <div
          style={{
            padding: "12px 18px",
            background: "var(--bg-elevated)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8" }}>POST</span>
          <code style={{ fontSize: 13, flex: 1 }}>{API_BASE}/v1/messages</code>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sync / Streaming</span>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Request Parameters</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Parameter</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 50 }}>Required</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["model", true, "Claude model ID, e.g. claude-sonnet-4-6, claude-opus-4-7"],
                ["messages", true, "Anthropic Messages format message array"],
                ["max_tokens", true, "Maximum number of output tokens"],
                ["stream", false, "Set to true to receive an Anthropic SSE event stream"],
                ["system", false, "System prompt; uses the Anthropic top-level system field"],
                ["tools", false, "Anthropic tool definitions; Claude models forward them as-is to the official API"],
              ].map(([name, required, desc], i) => (
                <tr key={String(name)} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code>{String(name)}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center", color: required ? "#dc2626" : "var(--text-tertiary)" }}>{required ? "Yes" : "No"}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{String(desc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Supported Models &amp; Official Pricing</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Model</th>
                <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>Context</th>
                <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>Max Output</th>
                <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>USD / MTok input/output</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model, i) => (
                <tr key={model[0]} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code>{model[0]}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>{model[1]}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>{model[2]}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>{model[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Examples</h2>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
            <DocsCodeBlock code={curlExample} />
          </div>
          <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
            <DocsCodeBlock code={streamExample} />
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Prompt Caching</h2>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)", marginBottom: 14 }}>
          Calls via <code>/v1/messages</code> support Prompt Caching. Add a <code>cache_control</code> annotation to a content block in the system or messages, and the repeated prefix will be cached. Subsequent requests benefit from a 90% discount on cache hits:
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", fontSize: 13, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "10px 14px", background: "var(--bg-elevated)", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
            <span>Token Type</span><span>Billing Multiplier</span><span>Description</span>
          </div>
          {[
            ["cache_creation_input_tokens", "1.25x", "First write to cache"],
            ["cache_read_input_tokens", "0.1x", "Cache hit, 90% discount"],
            ["input_tokens", "1x", "Non-cached portion, standard pricing"],
          ].map(([type, rate, desc], i) => (
            <div key={type} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "10px 14px", borderBottom: i < 2 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
              <code style={{ fontSize: 11 }}>{type}</code>
              <span style={{ color: "var(--success)", fontWeight: 500 }}>{rate}</span>
              <span style={{ color: "var(--text-tertiary)" }}>{desc}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
          Usage example: add <code>{`"cache_control": {"type": "ephemeral"}`}</code> on a system block. Suitable for repeated content such as long system prompts or document context. Supported by both Claude direct and Bailian models.
        </p>
      </section>

      <section style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Related Docs</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <Link href="/docs/models/claude" style={{ color: "#1d4ed8" }}>Claude Models</Link>
          <Link href="/docs/api/chat" style={{ color: "#1d4ed8" }}>OpenAI Chat Completions</Link>
          <Link href="/pricing" style={{ color: "#1d4ed8" }}>Full Pricing</Link>
        </div>
      </section>
    </div>
  );
}
