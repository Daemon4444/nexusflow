"use client";

import { useState } from "react";
import Link from "next/link";

const requestParams = [
  { name: "model", type: "string", required: true, default: "-", desc: "嵌入模型 ID。例如 text-embedding-v3、text-embedding-3-small 等。" },
  { name: "input", type: "string | array", required: true, default: "-", desc: "要嵌入的文本。可以是单个字符串或字符串数组（批量处理）。" },
  { name: "encoding_format", type: "string", required: false, default: '"float"', desc: "返回向量的格式。支持 float 或 base64。" },
  { name: "dimensions", type: "integer", required: false, default: "模型默认", desc: "输出向量的维度。仅部分模型支持自定义维度。" },
  { name: "user", type: "string", required: false, default: "-", desc: "终端用户的唯一标识符，用于监控和滥用检测。" },
];

const responseFields = [
  { name: "object", type: "string", desc: '固定值 "list"' },
  { name: "data", type: "array", desc: "嵌入向量数组" },
  { name: "data[].object", type: "string", desc: '固定值 "embedding"' },
  { name: "data[].index", type: "integer", desc: "对应输入文本的索引" },
  { name: "data[].embedding", type: "array", desc: "浮点数向量，维度取决于模型" },
  { name: "model", type: "string", desc: "使用的模型 ID" },
  { name: "usage", type: "object", desc: "Token 使用统计" },
  { name: "usage.prompt_tokens", type: "integer", desc: "输入文本消耗的 Token 数" },
  { name: "usage.total_tokens", type: "integer", desc: "总 Token 数" },
];

const models = [
  { id: "text-embedding-v3", provider: "阿里云", dims: "1024/2048", maxInput: "8192", price: "¥0.5/百万" },
  { id: "text-embedding-3-small", provider: "OpenAI", dims: "512/1536", maxInput: "8191", price: "¥0.14/百万" },
  { id: "text-embedding-3-large", provider: "OpenAI", dims: "256-3072", maxInput: "8191", price: "¥0.91/百万" },
];

const codeExamples: Record<string, Record<string, string>> = {
  basic: {
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

response = client.embeddings.create(
    model="text-embedding-v3",
    input="nexusflow 是一个统一的大模型 API 平台",
)

embedding = response.data[0].embedding
print(f"向量维度: {len(embedding)}")
print(f"前 5 个值: {embedding[:5]}")`,
    curl: `curl https://nexusflow.hk/v1/embeddings \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-v3",
    "input": "nexusflow 是一个统一的大模型 API 平台"
  }'`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "https://nexusflow.hk/v1",
});

const response = await client.embeddings.create({
  model: "text-embedding-v3",
  input: "nexusflow 是一个统一的大模型 API 平台",
});

const embedding = response.data[0].embedding;
console.log("向量维度:", embedding.length);
console.log("前 5 个值:", embedding.slice(0, 5));`,
  },
  batch: {
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

# 批量嵌入多个文本
texts = [
    "什么是机器学习？",
    "深度学习和机器学习的区别",
    "如何入门人工智能",
]

response = client.embeddings.create(
    model="text-embedding-v3",
    input=texts,
)

for i, item in enumerate(response.data):
    print(f"文本 {i}: 维度 {len(item.embedding)}")

print(f"总 Token: {response.usage.total_tokens}")`,
    curl: `curl https://nexusflow.hk/v1/embeddings \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-v3",
    "input": [
      "什么是机器学习？",
      "深度学习和机器学习的区别",
      "如何入门人工智能"
    ]
  }'`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "https://nexusflow.hk/v1",
});

const texts = [
  "什么是机器学习？",
  "深度学习和机器学习的区别",
  "如何入门人工智能",
];

const response = await client.embeddings.create({
  model: "text-embedding-v3",
  input: texts,
});

response.data.forEach((item, i) => {
  console.log(\`文本 \${i}: 维度 \${item.embedding.length}\`);
});

console.log("总 Token:", response.usage.total_tokens);`,
  },
  similarity: {
    python: `import numpy as np
from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# 获取两个文本的嵌入向量
response = client.embeddings.create(
    model="text-embedding-v3",
    input=[
        "我喜欢吃苹果",
        "苹果是我最爱的水果",
    ],
)

vec1 = response.data[0].embedding
vec2 = response.data[1].embedding

similarity = cosine_similarity(vec1, vec2)
print(f"相似度: {similarity:.4f}")  # 输出接近 1 表示高度相似`,
    curl: `# 1. 获取嵌入向量
curl https://nexusflow.hk/v1/embeddings \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-v3",
    "input": ["我喜欢吃苹果", "苹果是我最爱的水果"]
  }'

# 2. 使用返回的向量计算余弦相似度
# 需要在应用层实现向量运算`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "https://nexusflow.hk/v1",
});

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
}

const response = await client.embeddings.create({
  model: "text-embedding-v3",
  input: ["我喜欢吃苹果", "苹果是我最爱的水果"],
});

const vec1 = response.data[0].embedding;
const vec2 = response.data[1].embedding;

const similarity = cosineSimilarity(vec1, vec2);
console.log(\`相似度: \${similarity.toFixed(4)}\`);`,
  },
};

export default function EmbeddingsPage() {
  const [activeTab, setActiveTab] = useState<"basic" | "batch" | "similarity">("basic");
  const [codeLang, setCodeLang] = useState<"python" | "curl" | "nodejs">("python");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 4,
            background: "#dbeafe",
            color: "#1d4ed8",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            POST
          </span>
          <code style={{
            fontSize: 15,
            fontFamily: "'JetBrains Mono', monospace",
            color: "var(--text-primary)",
          }}>
            /v1/embeddings
          </code>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          文本向量 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          将文本转换为高维向量表示，用于语义搜索、文本分类、聚类分析等场景。
        </p>
      </div>

      {/* Supported models */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          支持的模型
        </h2>
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型 ID</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>供应商</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>向量维度</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>最大输入</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>价格</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, idx) => (
                <tr key={m.id} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{m.id}</code>
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{m.provider}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{m.dims}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{m.maxInput} tokens</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "right", color: "var(--success)" }}>{m.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Request params */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          请求参数
        </h2>
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>参数名</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 100 }}>类型</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 60 }}>必填</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 100 }}>默认值</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {requestParams.map((p, idx) => (
                <tr key={p.name} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>{p.name}</code>
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12 }}>{p.type}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    {p.required ? (
                      <span style={{ color: "var(--danger)", fontWeight: 600 }}>*</span>
                    ) : (
                      <span style={{ color: "var(--text-tertiary)" }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{p.default}</code>
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13 }}>{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Code examples */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          代码示例
        </h2>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { key: "basic", label: "基础调用" },
            { key: "batch", label: "批量处理" },
            { key: "similarity", label: "相似度计算" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: activeTab === tab.key ? "var(--text-primary)" : "var(--bg)",
                color: activeTab === tab.key ? "#fff" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Language tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {(["python", "curl", "nodejs"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setCodeLang(lang)}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 500,
                border: "none",
                borderRadius: 4,
                background: codeLang === lang ? "#333" : "transparent",
                color: codeLang === lang ? "#fff" : "var(--text-tertiary)",
                cursor: "pointer",
              }}
            >
              {lang === "python" ? "Python" : lang === "curl" ? "cURL" : "Node.js"}
            </button>
          ))}
        </div>

        <div style={{
          background: "#1a1a1a",
          borderRadius: 10,
          padding: 20,
          overflow: "auto",
        }}>
          <pre style={{ margin: 0, fontSize: 13, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
            {codeExamples[activeTab][codeLang]}
          </pre>
        </div>
      </section>

      {/* Response */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          响应结构
        </h2>
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>字段</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 100 }}>类型</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {responseFields.map((f, idx) => (
                <tr key={f.name} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{f.name}</code>
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12 }}>{f.type}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13 }}>{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Response example */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          响应示例
        </h2>
        <div style={{
          background: "#1a1a1a",
          borderRadius: 10,
          padding: 20,
          overflow: "auto",
        }}>
          <pre style={{ margin: 0, fontSize: 13, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
{`{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0023064255, -0.009327292, 0.015797347, ...]
    }
  ],
  "model": "text-embedding-v3",
  "usage": {
    "prompt_tokens": 12,
    "total_tokens": 12
  }
}`}
          </pre>
        </div>
      </section>

      {/* Use cases */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          应用场景
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {[
            { title: "语义搜索", desc: "将查询和文档转换为向量，通过向量相似度实现语义级别的搜索。" },
            { title: "文本分类", desc: "利用向量表示进行文本分类，无需大量标注数据。" },
            { title: "聚类分析", desc: "对大量文本进行聚类，发现隐含的主题和模式。" },
            { title: "推荐系统", desc: "基于内容相似度为用户推荐相关文章或产品。" },
          ].map((item) => (
            <div
              key={item.title}
              style={{
                padding: 20,
                background: "var(--bg-elevated)",
                borderRadius: 10,
                border: "1px solid var(--border)",
              }}
            >
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                {item.title}
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Related */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          相关文档
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/api/chat", label: "对话补全", desc: "文本生成 API" },
            { href: "/docs/api/errors", label: "错误码", desc: "错误处理参考" },
            { href: "/docs/api/limits", label: "限流说明", desc: "了解速率限制" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: 16,
                background: "var(--bg-elevated)",
                borderRadius: 8,
                border: "1px solid var(--border)",
                textDecoration: "none",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
