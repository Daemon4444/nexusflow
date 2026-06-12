"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type ExampleKey = "basic" | "batch" | "similarity";
type LangKey = "curl" | "python" | "nodejs";

const exampleTabs: { key: ExampleKey; label: string }[] = [
  { key: "basic", label: "Basic" },
  { key: "batch", label: "Batch" },
  { key: "similarity", label: "Similarity" },
];

const requestParams: { name: string; type: string; required: boolean; desc: string }[] = [
  { name: "model", type: "string", required: true, desc: "Embedding model ID. Fixed value: text-embedding-v4." },
  { name: "input", type: "string | string[]", required: true, desc: "Text to embed. Either a single string or an array of strings (batch processing)." },
  { name: "encoding_format", type: "string", required: false, desc: 'Encoding format of the returned vectors. Possible values: "float" (default) or "base64".' },
];

const codeExamples: Record<ExampleKey, Record<LangKey, string>> = {
  basic: {
    curl: `curl -X POST '${API_BASE}/v1/embeddings' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-v4",
    "input": "nexusflow is a unified large-model API platform"
  }'`,
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.embeddings.create(
    model="text-embedding-v4",
    input="nexusflow is a unified large-model API platform",
)

embedding = response.data[0].embedding
print(f"Vector dimension: {len(embedding)}")
print(f"First 5 values: {embedding[:5]}")`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.embeddings.create({
  model: "text-embedding-v4",
  input: "nexusflow is a unified large-model API platform",
});

const embedding = response.data[0].embedding;
console.log("Vector dimension:", embedding.length);
console.log("First 5 values:", embedding.slice(0, 5));`,
  },
  batch: {
    curl: `curl -X POST '${API_BASE}/v1/embeddings' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-v4",
    "input": [
      "What is machine learning?",
      "The difference between deep learning and machine learning",
      "How to get started with AI"
    ]
  }'`,
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

# Batch-embed multiple texts
texts = [
    "What is machine learning?",
    "The difference between deep learning and machine learning",
    "How to get started with AI",
]

response = client.embeddings.create(
    model="text-embedding-v4",
    input=texts,
)

for i, item in enumerate(response.data):
    print(f"Text {i}: dimension {len(item.embedding)}")

print(f"Total tokens: {response.usage.total_tokens}")`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const texts = [
  "What is machine learning?",
  "The difference between deep learning and machine learning",
  "How to get started with AI",
];

const response = await client.embeddings.create({
  model: "text-embedding-v4",
  input: texts,
});

response.data.forEach((item, i) => {
  console.log(\`Text \${i}: dimension \${item.embedding.length}\`);
});

console.log("Total tokens:", response.usage.total_tokens);`,
  },
  similarity: {
    curl: `# 1. Get embedding vectors
curl -X POST '${API_BASE}/v1/embeddings' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-v4",
    "input": ["I love eating apples", "Apples are my favorite fruit"]
  }'

# 2. Use the returned vectors to compute cosine similarity
# Vector arithmetic must be implemented in your application layer`,
    python: `import numpy as np
from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# Get embedding vectors for two texts
response = client.embeddings.create(
    model="text-embedding-v4",
    input=[
        "I love eating apples",
        "Apples are my favorite fruit",
    ],
)

vec1 = response.data[0].embedding
vec2 = response.data[1].embedding

similarity = cosine_similarity(vec1, vec2)
print(f"Similarity: {similarity:.4f}")  # Values close to 1 indicate high similarity`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
}

const response = await client.embeddings.create({
  model: "text-embedding-v4",
  input: ["I love eating apples", "Apples are my favorite fruit"],
});

const vec1 = response.data[0].embedding;
const vec2 = response.data[1].embedding;

const similarity = cosineSimilarity(vec1, vec2);
console.log(\`Similarity: \${similarity.toFixed(4)}\`);`,
  },
};

export default function EmbeddingsApiPage() {
  const [activeTab, setActiveTab] = useState<ExampleKey>("basic");
  const [codeLang, setCodeLang] = useState<LangKey>("curl");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <span style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 5,
          background: "#eff6ff", color: "#1d4ed8", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.5px", marginBottom: 12,
        }}>
          Embeddings / Alibaba Cloud
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Text Embeddings API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          Convert text into high-dimensional vector representations for use cases like semantic search, text clustering, and recommendations. The API is synchronous and returns embedding vectors immediately—no polling required.
        </p>
      </div>

      {/* Endpoint */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Endpoint</h2>
        <div style={{
          padding: "10px 16px", background: "var(--bg-elevated)", borderRadius: 8,
          border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: "#dbeafe", color: "#1d4ed8",
          }}>POST</span>
          <code style={{ fontSize: 13 }}>{API_BASE}/v1/embeddings</code>
        </div>
      </section>

      {/* Supported models */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Supported Models</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Model ID</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Provider</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Vector Dimensions</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Price</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--bg)" }}>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <code style={{ fontSize: 12 }}>text-embedding-v4</code>
                </td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>Alibaba Cloud</td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>2048/1536/1024/768/512/256/128/64</td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", color: "var(--accent)", fontWeight: 600 }}>$0.5 / 1M tokens</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Request params */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Request Parameters</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Parameter</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 100 }}>Type</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 50 }}>Required</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {requestParams.map((p, i) => (
                <tr key={p.name} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 12 }}>{p.name}</code>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12 }}>{p.type}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    {p.required ? <span style={{ color: "#dc2626", fontWeight: 600 }}>*</span> : "-"}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Code examples */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Code Examples</h2>

        {/* Example type tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {exampleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                border: activeTab === tab.key ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                background: activeTab === tab.key ? "var(--accent-bg)" : "var(--bg)",
                color: activeTab === tab.key ? "var(--accent)" : "var(--text-secondary)",
                transition: "all 0.15s", fontFamily: "inherit",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Language tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {(["curl", "python", "nodejs"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setCodeLang(lang)}
              style={{
                padding: "5px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit",
                background: codeLang === lang ? "var(--text-primary)" : "var(--bg)",
                color: codeLang === lang ? "var(--bg)" : "var(--text-secondary)",
                transition: "all 0.15s",
              }}
            >
              {lang === "curl" ? "cURL" : lang === "python" ? "Python" : "Node.js"}
            </button>
          ))}
        </div>

        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={codeExamples[activeTab][codeLang]} />
        </div>
      </section>

      {/* Response format */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Response Format</h2>

        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={`{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0023064255, -0.009327292, 0.015797347, ...]
    }
  ],
  "model": "text-embedding-v4",
  "usage": {
    "prompt_tokens": 12,
    "total_tokens": 12
  }
}`} />
        </div>

        {/* Response fields table */}
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Response Fields</h3>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Field</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 70 }}>Type</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["object", "string", 'Always "list", indicating a list of embedding vectors.'],
                ["data[].embedding", "array", "Array of floating-point numbers; dimensions depend on the model."],
                ["data[].index", "integer", "Index position of the corresponding input text (starting from 0)."],
                ["model", "string", "Model ID used for this request."],
                ["usage", "object", "Token usage statistics, including prompt_tokens and total_tokens."],
              ].map(([field, type, desc], i) => (
                <tr key={field} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code style={{ fontSize: 12 }}>{field}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12 }}>{type}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Use cases */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Use Cases</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {[
            { title: "Semantic Search", desc: "Convert queries and documents into vectors and use vector similarity for semantic-level search—more accurate than keyword matching." },
            { title: "Text Clustering", desc: "Cluster large volumes of text to automatically discover hidden topics and patterns. Useful for sentiment analysis and content categorization." },
            { title: "Recommendation Systems", desc: "Recommend related articles, products or services to users based on content vector similarity, improving personalization." },
            { title: "Anomaly Detection", desc: "Identify content or behavior that deviates from the norm by computing distances between text vectors and normal samples." },
          ].map((item) => (
            <div key={item.title} style={{
              padding: 18, border: "1px solid var(--border)",
              borderRadius: 10, background: "var(--bg-elevated)",
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-tertiary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Related links */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/chat", label: "Chat Completions API", desc: "Text generation API documentation" },
          { href: "/docs/api/errors", label: "Error Codes", desc: "Error code reference and handling" },
          { href: "/pricing", label: "Full Pricing", desc: "View pricing for all models" },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-tertiary)" }}>{item.desc}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
