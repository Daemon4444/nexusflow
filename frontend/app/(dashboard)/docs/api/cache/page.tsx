"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";

const API_BASE = "https://nexusflow.hk";

const explicitModels = [
  { model: "qwen3.7-max", provider: "Qwen", minTokens: 1024 },
  { model: "qwen3.7-plus", provider: "Qwen", minTokens: 1024 },
  { model: "qwen3.6-max-preview", provider: "Qwen", minTokens: 1024 },
  { model: "qwen3.6-plus", provider: "Qwen", minTokens: 1024 },
  { model: "qwen3.6-flash", provider: "Qwen", minTokens: 1024 },
  { model: "qwen3.5-plus", provider: "Qwen", minTokens: 1024 },
  { model: "qwen3.5-flash", provider: "Qwen", minTokens: 1024 },
  { model: "qwen3-coder-plus", provider: "Qwen", minTokens: 1024 },
  { model: "qwen3-coder-flash", provider: "Qwen", minTokens: 1024 },
  { model: "qwen3-vl-plus", provider: "Qwen", minTokens: 1024 },
  { model: "qwen3-vl-flash", provider: "Qwen", minTokens: 1024 },
  { model: "deepseek-v4-pro", provider: "DeepSeek", minTokens: 1024 },
  { model: "deepseek-v4-flash", provider: "DeepSeek", minTokens: 1024 },
  { model: "deepseek-v3.2", provider: "DeepSeek", minTokens: 1024 },
  { model: "glm-5.2", provider: "Zhipu AI", minTokens: 1024 },
  { model: "glm-5.1", provider: "Zhipu AI", minTokens: 1024 },
  { model: "kimi-k2.6", provider: "Moonshot AI", minTokens: 1024 },
  { model: "kimi-k2.5", provider: "Moonshot AI", minTokens: 1024 },
  { model: "MiniMax-M2.5", provider: "MiniMax", minTokens: 1024 },
];

const implicitModels = [
  { model: "qwen3.7-max", provider: "Qwen", minTokens: "~1000" },
  { model: "qwen3.7-plus", provider: "Qwen", minTokens: "~256" },
  { model: "qwen3.6-max-preview", provider: "Qwen", minTokens: "~256" },
  { model: "qwen3.6-plus", provider: "Qwen", minTokens: "~256" },
  { model: "qwen3.6-flash", provider: "Qwen", minTokens: "~256" },
  { model: "qwen3.5-plus", provider: "Qwen", minTokens: "~256" },
  { model: "qwen3.5-flash", provider: "Qwen", minTokens: "~256" },
  { model: "qwen3-coder-plus", provider: "Qwen", minTokens: "~256" },
  { model: "qwen3-coder-flash", provider: "Qwen", minTokens: "~256" },
  { model: "qwen3-vl-plus", provider: "Qwen", minTokens: "~256" },
  { model: "qwen3-vl-flash", provider: "Qwen", minTokens: "~256" },
  { model: "qwen-plus", provider: "Qwen", minTokens: "~256" },
  { model: "qwen-turbo", provider: "Qwen", minTokens: "~256" },
  { model: "qwen-long", provider: "Qwen", minTokens: "~256" },
  { model: "deepseek-v4-pro", provider: "DeepSeek", minTokens: "~256" },
  { model: "deepseek-v4-flash", provider: "DeepSeek", minTokens: "~256" },
  { model: "deepseek-v3.2", provider: "DeepSeek", minTokens: "~256" },
  { model: "deepseek-r1", provider: "DeepSeek", minTokens: "~256" },
  { model: "glm-5.2", provider: "Zhipu AI", minTokens: "~512" },
  { model: "glm-5.1", provider: "Zhipu AI", minTokens: "~512" },
  { model: "glm-5", provider: "Zhipu AI", minTokens: "~512" },
  { model: "kimi-k2.6", provider: "Moonshot AI", minTokens: "~256" },
  { model: "kimi-k2.5", provider: "Moonshot AI", minTokens: "~256" },
  { model: "MiniMax-M2.5", provider: "MiniMax", minTokens: "~256" },
  { model: "MiniMax-M2.1", provider: "MiniMax", minTokens: "~256" },
];

export default function CacheDocsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 5, background: "#dbeafe", color: "#1d4ed8", fontSize: 11, fontWeight: 600, letterSpacing: "0.5px", marginBottom: 12 }}>
          Context Cache
        </span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, letterSpacing: "-0.5px" }}>
        Context Cache
      </h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.7 }}>
        Context caching reuses repeated prompt prefixes to dramatically reduce input costs (up to 90% savings). NexusFlow supports both explicit and implicit caching, compatible with the OpenAI and Anthropic protocols.
      </p>

      {/* Two modes comparison */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Two Caching Modes</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Feature</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Explicit Cache</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Implicit Cache</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Activation", "Add a cache_control marker in content", "Automatic, no parameters needed"],
                ["Hit guarantee", "Deterministic (prefix match = hit)", "Probabilistic (decided automatically)"],
                ["Minimum tokens", "1024", "~256 (varies by model)"],
                ["Cache TTL", "5 minutes (refreshed on hit)", "Uncertain (cleared automatically)"],
                ["Creation billing", "125% of input price", "Standard input price"],
                ["Hit billing", "10% of input price", "~20% of input price (10%-40%)"],
                ["Supported protocols", "OpenAI Chat / Anthropic Messages", "All protocols"],
              ].map(([label, explicit, implicit], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td style={{ padding: "11px 16px", fontWeight: 500, color: "var(--text-primary)" }}>{label}</td>
                  <td style={{ padding: "11px 16px", color: "var(--text-secondary)" }}>{explicit}</td>
                  <td style={{ padding: "11px 16px", color: "var(--text-secondary)" }}>{implicit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Explicit cache usage */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Explicit Cache Usage</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          Add <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>messages[].content[]</code> a text block with{" "}
          <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>{`"cache_control": {"type": "ephemeral"}`}</code>
           to mark that content block as a cache point.
        </p>
        <DocsCodeBlock code={`curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
  "model": "qwen3.5-flash",
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "<long text over 1024 tokens...>",
          "cache_control": {"type": "ephemeral"}
        }
      ]
    },
    {"role": "user", "content": "Answer the question based on the text above"}
  ],
  "max_tokens": 200
}'`} />
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          <p style={{ marginBottom: 8 }}><strong>Constraints:</strong></p>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li>Up to 4 <code>cache_control</code> markers per request</li>
            <li>The marked content must be at least 1024 tokens</li>
            <li>The cache is created after the first request completes and is hit starting from the second request</li>
            <li>Function calling tool definitions cannot be marked directly; mark the last content block instead</li>
            <li>The order and fields of the tools array must match exactly for a cache hit</li>
          </ul>
        </div>
      </section>

      {/* Implicit cache usage */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Implicit Cache</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          No parameter changes are needed; the system automatically detects and caches common prefixes in messages. Optimization tips:
        </p>
        <ul style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 2, paddingLeft: 20 }}>
          <li>Place static/repeated content (system prompt, long documents) at the start of messages</li>
          <li>Place dynamic content (the user's latest question) at the end</li>
          <li>Keep the system prompt unchanged across multi-turn conversations</li>
        </ul>
      </section>

      {/* Request and response examples */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Request & Response Examples</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          Cache information is returned alongside the normal Chat Completions response. Your application still reads the model result from <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>choices[0].message.content</code>, and reads cache creation and hit details from <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>usage.prompt_tokens_details</code>.
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "20px 0 10px" }}>Explicit Cache: Request Input</h3>
        <DocsCodeBlock code={`curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
  "model": "qwen3.5-flash",
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "<stable common prefix, at least 1024 tokens, e.g. a codebase, product manual, or long document>",
          "cache_control": {"type": "ephemeral"}
        }
      ]
    },
    {
      "role": "user",
      "content": "Based on the document above, answer the first question"
    }
  ],
  "temperature": 0,
  "max_tokens": 200
}'`} />

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "20px 0 10px" }}>Explicit Cache: First Response (Cache Created)</h3>
        <DocsCodeBlock code={`{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "This is the model's normal answer"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 18628,
    "completion_tokens": 344,
    "total_tokens": 18972,
    "prompt_tokens_details": {
      "text_tokens": 18628,
      "cache_creation_input_tokens": 18613,
      "cache_type": "ephemeral",
      "cached_tokens": 0
    }
  }
}`} />

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "20px 0 10px" }}>Explicit Cache: Second Response (Cache Hit)</h3>
        <DocsCodeBlock code={`{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "This is the answer for the second request"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 18628,
    "completion_tokens": 445,
    "total_tokens": 19073,
    "prompt_tokens_details": {
      "text_tokens": 18628,
      "cache_creation_input_tokens": 0,
      "cache_type": "ephemeral",
      "cached_tokens": 18613
    }
  }
}`} />

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "20px 0 10px" }}>Implicit Cache: Request Input</h3>
        <DocsCodeBlock code={`curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
  "model": "qwen3.7-max",
  "messages": [
    {
      "role": "system",
      "content": "<stable common prefix, e.g. a long-lived knowledge base, product description, or code context>"
    },
    {
      "role": "user",
      "content": "Based on the content above, answer a new question"
    }
  ],
  "temperature": 0,
  "max_tokens": 200
}'`} />

        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "20px 0 10px" }}>Implicit Cache: Possible Cache Hit Response</h3>
        <DocsCodeBlock code={`{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "This is the model's normal answer"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 15365,
    "completion_tokens": 1,
    "total_tokens": 15366,
    "prompt_tokens_details": {
      "cached_tokens": 15232
    }
  }
}`} />

        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12, lineHeight: 1.8 }}>
          Implicit caching has no <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>cache_control</code> marker and does not return <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>cache_type</code>. If there is no hit, <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>prompt_tokens_details.cached_tokens</code> may be 0 or absent; whether a hit occurs is decided by the upstream automatic policy.
        </p>
      </section>

      {/* How to check cache hit */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>How to Confirm a Cache Hit</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.7 }}>
          The API response includes cache information in <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>usage.prompt_tokens_details</code>:
        </p>
        <DocsCodeBlock code={`"usage": {
  "prompt_tokens": 1584,
  "completion_tokens": 20,
  "total_tokens": 1604,
  "prompt_tokens_details": {
    "cached_tokens": 1568,           // Number of cached tokens hit
    "cache_creation_input_tokens": 0  // Number of tokens written to cache this time
  }
}`} />
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
          On the <strong>Usage</strong> page in the console, calls that hit the cache show a blue "Cache N" tag.
        </p>
      </section>

      {/* Explicit cache supported models */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Explicit Cache — Supported Models</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Model</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Provider</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Min Tokens</th>
              </tr>
            </thead>
            <tbody>
              {explicitModels.map((m, i) => (
                <tr key={m.model} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: i % 2 === 0 ? undefined : "var(--bg-elevated)" }}>
                  <td style={{ padding: "9px 16px" }}><code style={{ color: "#1d4ed8" }}>{m.model}</code></td>
                  <td style={{ padding: "9px 16px", color: "var(--text-secondary)" }}>{m.provider}</td>
                  <td style={{ padding: "9px 16px", color: "var(--text-secondary)" }}>{m.minTokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Implicit cache supported models */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Implicit Cache — Supported Models</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          The following models enable implicit caching automatically, with no extra configuration. On a hit, input tokens automatically receive a discount.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Model</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Provider</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Estimated Min Tokens</th>
              </tr>
            </thead>
            <tbody>
              {implicitModels.map((m, i) => (
                <tr key={m.model} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: i % 2 === 0 ? undefined : "var(--bg-elevated)" }}>
                  <td style={{ padding: "9px 16px" }}><code style={{ color: "#1d4ed8" }}>{m.model}</code></td>
                  <td style={{ padding: "9px 16px", color: "var(--text-secondary)" }}>{m.provider}</td>
                  <td style={{ padding: "9px 16px", color: "var(--text-secondary)" }}>{m.minTokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Billing */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Billing</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Scenario</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Billing Multiplier</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Explicit cache — create", "1.25x", "First write to cache, billed at 125% of the input price"],
                ["Explicit cache — hit", "0.1x", "On a hit, billed at only 10% of the input price"],
                ["Implicit cache — hit", "~0.2x", "On a hit, billed at about 20% of the input price (10%-40%, varies by model)"],
                ["No hit", "1.0x", "Standard input price"],
              ].map(([scenario, rate, desc], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td style={{ padding: "10px 16px", fontWeight: 500, color: "var(--text-primary)" }}>{scenario}</td>
                  <td style={{ padding: "10px 16px" }}><span style={{ fontWeight: 700, color: rate === "0.1x" ? "#10b981" : rate === "~0.2x" ? "#0d9488" : "var(--text-secondary)" }}>{rate}</span></td>
                  <td style={{ padding: "10px 16px", color: "var(--text-secondary)" }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
