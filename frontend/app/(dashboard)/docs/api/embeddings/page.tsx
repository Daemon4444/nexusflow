"use client";

import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type ExampleKey = "basic" | "batch" | "similarity";
type LangKey = "curl" | "python" | "nodejs";

const exampleTabs: { key: ExampleKey; label: string }[] = [
  { key: "basic", label: "基础调用" },
  { key: "batch", label: "批量嵌入" },
  { key: "similarity", label: "相似度计算" },
];

const requestParams: { name: string; type: string; required: boolean; desc: string }[] = [
  { name: "model", type: "string", required: true, desc: "嵌入模型 ID，固定值：text-embedding-v4。" },
  { name: "input", type: "string | string[]", required: true, desc: "要嵌入的文本。可以是单个字符串或字符串数组（批量处理）。" },
  { name: "encoding_format", type: "string", required: false, desc: '返回向量的编码格式，可选值："float"（默认）或 "base64"。' },
];

const codeExamples: Record<ExampleKey, Record<LangKey, string>> = {
  basic: {
    curl: `curl -X POST '${API_BASE}/v1/embeddings' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-v4",
    "input": "nexusflow 是一个统一的大模型 API 平台"
  }'`,
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.embeddings.create(
    model="text-embedding-v4",
    input="nexusflow 是一个统一的大模型 API 平台",
)

embedding = response.data[0].embedding
print(f"向量维度: {len(embedding)}")
print(f"前 5 个值: {embedding[:5]}")`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.embeddings.create({
  model: "text-embedding-v4",
  input: "nexusflow 是一个统一的大模型 API 平台",
});

const embedding = response.data[0].embedding;
console.log("向量维度:", embedding.length);
console.log("前 5 个值:", embedding.slice(0, 5));`,
  },
  batch: {
    curl: `curl -X POST '${API_BASE}/v1/embeddings' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-v4",
    "input": [
      "什么是机器学习？",
      "深度学习和机器学习的区别",
      "如何入门人工智能"
    ]
  }'`,
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

# 批量嵌入多个文本
texts = [
    "什么是机器学习？",
    "深度学习和机器学习的区别",
    "如何入门人工智能",
]

response = client.embeddings.create(
    model="text-embedding-v4",
    input=texts,
)

for i, item in enumerate(response.data):
    print(f"文本 {i}: 维度 {len(item.embedding)}")

print(f"总 Token: {response.usage.total_tokens}")`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const texts = [
  "什么是机器学习？",
  "深度学习和机器学习的区别",
  "如何入门人工智能",
];

const response = await client.embeddings.create({
  model: "text-embedding-v4",
  input: texts,
});

response.data.forEach((item, i) => {
  console.log(\`文本 \${i}: 维度 \${item.embedding.length}\`);
});

console.log("总 Token:", response.usage.total_tokens);`,
  },
  similarity: {
    curl: `# 1. 获取嵌入向量
curl -X POST '${API_BASE}/v1/embeddings' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-v4",
    "input": ["我喜欢吃苹果", "苹果是我最爱的水果"]
  }'

# 2. 使用返回的向量计算余弦相似度
# 需要在应用层实现向量运算`,
    python: `import numpy as np
from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# 获取两个文本的嵌入向量
response = client.embeddings.create(
    model="text-embedding-v4",
    input=[
        "我喜欢吃苹果",
        "苹果是我最爱的水果",
    ],
)

vec1 = response.data[0].embedding
vec2 = response.data[1].embedding

similarity = cosine_similarity(vec1, vec2)
print(f"相似度: {similarity:.4f}")  # 输出接近 1 表示高度相似`,
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
  input: ["我喜欢吃苹果", "苹果是我最爱的水果"],
});

const vec1 = response.data[0].embedding;
const vec2 = response.data[1].embedding;

const similarity = cosineSimilarity(vec1, vec2);
console.log(\`相似度: \${similarity.toFixed(4)}\`);`,
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
          Embeddings / 阿里云
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Text Embeddings API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          将文本转换为高维向量表示，用于语义搜索、文本聚类、推荐系统等场景。API 为同步调用，请求后立即返回嵌入向量结果，无需轮询。
        </p>
      </div>

      {/* Endpoint */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>请求端点</h2>
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>支持的模型</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型 ID</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>供应商</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>向量维度</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>价格</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--bg)" }}>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <code style={{ fontSize: 12 }}>text-embedding-v4</code>
                </td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>阿里云</td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>2048/1536/1024/768/512/256/128/64</td>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", color: "var(--accent)", fontWeight: 600 }}>¥0.5/百万 tokens</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Request params */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>请求参数</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>参数</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 100 }}>类型</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 50 }}>必选</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>代码示例</h2>

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
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
            {codeExamples[activeTab][codeLang]}
          </pre>
        </div>
      </section>

      {/* Response format */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>响应格式</h2>

        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
{`{
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
}`}
          </pre>
        </div>

        {/* Response fields table */}
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>响应字段</h3>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>字段</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 70 }}>类型</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["object", "string", '固定值 "list"，表示返回的是嵌入向量列表。'],
                ["data[].embedding", "array", "浮点数向量数组，维度取决于模型。"],
                ["data[].index", "integer", "对应输入文本的索引位置（从 0 开始）。"],
                ["model", "string", "本次请求使用的模型 ID。"],
                ["usage", "object", "Token 使用统计，包含 prompt_tokens 和 total_tokens。"],
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>应用场景</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {[
            { title: "语义搜索", desc: "将查询和文档转换为向量，通过向量相似度实现语义级别的搜索，比关键词匹配更精准。" },
            { title: "文本聚类", desc: "对大量文本进行聚类分析，自动发现隐含的主题和模式，适用于舆情分析、内容归类。" },
            { title: "推荐系统", desc: "基于内容向量相似度为用户推荐相关文章、商品或服务，提升个性化体验。" },
            { title: "异常检测", desc: "通过计算文本向量与正常样本的距离，识别偏离正常模式的异常内容或行为。" },
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
          { href: "/docs/api/chat", label: "对话补全 API", desc: "查看文本生成接口文档" },
          { href: "/docs/api/errors", label: "错误码参考", desc: "查看错误码与处理方式" },
          { href: "/pricing", label: "完整定价", desc: "查看所有模型定价" },
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
