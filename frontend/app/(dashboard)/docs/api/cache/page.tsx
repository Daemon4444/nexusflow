"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";

const API_BASE = "https://nexusflow.hk";

const explicitModels = [
  { model: "qwen3.7-max", provider: "通义千问", minTokens: 1024 },
  { model: "qwen3.6-max-preview", provider: "通义千问", minTokens: 1024 },
  { model: "qwen3.6-plus", provider: "通义千问", minTokens: 1024 },
  { model: "qwen3.6-flash", provider: "通义千问", minTokens: 1024 },
  { model: "qwen3.5-plus", provider: "通义千问", minTokens: 1024 },
  { model: "qwen3.5-flash", provider: "通义千问", minTokens: 1024 },
  { model: "qwen3-coder-plus", provider: "通义千问", minTokens: 1024 },
  { model: "qwen3-coder-flash", provider: "通义千问", minTokens: 1024 },
  { model: "qwen3-vl-plus", provider: "通义千问", minTokens: 1024 },
  { model: "qwen3-vl-flash", provider: "通义千问", minTokens: 1024 },
  { model: "deepseek-v4-pro", provider: "DeepSeek", minTokens: 1024 },
  { model: "deepseek-v4-flash", provider: "DeepSeek", minTokens: 1024 },
  { model: "deepseek-v3.2", provider: "DeepSeek", minTokens: 1024 },
  { model: "glm-5.1", provider: "智谱AI", minTokens: 1024 },
  { model: "kimi-k2.6", provider: "月之暗面", minTokens: 1024 },
  { model: "kimi-k2.5", provider: "月之暗面", minTokens: 1024 },
  { model: "MiniMax-M2.5", provider: "MiniMax", minTokens: 1024 },
];

const implicitModels = [
  { model: "qwen3.7-max", provider: "通义千问", minTokens: "~1000" },
  { model: "qwen3.6-max-preview", provider: "通义千问", minTokens: "~256" },
  { model: "qwen3.6-plus", provider: "通义千问", minTokens: "~256" },
  { model: "qwen3.6-flash", provider: "通义千问", minTokens: "~256" },
  { model: "qwen3.5-plus", provider: "通义千问", minTokens: "~256" },
  { model: "qwen3.5-flash", provider: "通义千问", minTokens: "~256" },
  { model: "qwen3-coder-plus", provider: "通义千问", minTokens: "~256" },
  { model: "qwen3-coder-flash", provider: "通义千问", minTokens: "~256" },
  { model: "qwen3-vl-plus", provider: "通义千问", minTokens: "~256" },
  { model: "qwen3-vl-flash", provider: "通义千问", minTokens: "~256" },
  { model: "qwen-plus", provider: "通义千问", minTokens: "~256" },
  { model: "qwen-turbo", provider: "通义千问", minTokens: "~256" },
  { model: "qwen-long", provider: "通义千问", minTokens: "~256" },
  { model: "deepseek-v4-pro", provider: "DeepSeek", minTokens: "~256" },
  { model: "deepseek-v4-flash", provider: "DeepSeek", minTokens: "~256" },
  { model: "deepseek-v3.2", provider: "DeepSeek", minTokens: "~256" },
  { model: "deepseek-r1", provider: "DeepSeek", minTokens: "~256" },
  { model: "glm-5.1", provider: "智谱AI", minTokens: "~512" },
  { model: "glm-5", provider: "智谱AI", minTokens: "~512" },
  { model: "kimi-k2.6", provider: "月之暗面", minTokens: "~256" },
  { model: "kimi-k2.5", provider: "月之暗面", minTokens: "~256" },
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
        上下文缓存（Context Cache）
      </h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.7 }}>
        上下文缓存通过复用重复的 prompt 前缀，大幅降低输入成本（最高节省 90%）。NexusFlow 同时支持显式缓存和隐式缓存，兼容 OpenAI 和 Anthropic 两种协议。
      </p>

      {/* Two modes comparison */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>两种缓存模式</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>特性</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>显式缓存</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>隐式缓存</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["激活方式", "在 content 中添加 cache_control 标记", "自动生效，无需任何参数"],
                ["命中保证", "确定性命中（前缀匹配即命中）", "概率性命中（系统自动决定）"],
                ["最低 Token 数", "1024", "~256（因模型而异）"],
                ["缓存有效期", "5 分钟（命中后刷新）", "不确定（系统自动清理）"],
                ["创建计费", "125% 输入价", "标准输入价"],
                ["命中计费", "10% 输入价", "~20% 输入价（10%~40%）"],
                ["适用协议", "OpenAI Chat / Anthropic Messages", "所有协议"],
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>显式缓存用法</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          在 <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>messages[].content[]</code> 的文本块中添加{" "}
          <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>{`"cache_control": {"type": "ephemeral"}`}</code>
          ，即可标记该内容块为缓存点。
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
          "text": "<超过1024 tokens的长文本...>",
          "cache_control": {"type": "ephemeral"}
        }
      ]
    },
    {"role": "user", "content": "基于上文回答问题"}
  ],
  "max_tokens": 200
}'`} />
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          <p style={{ marginBottom: 8 }}><strong>约束：</strong></p>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li>每个请求最多 4 个 <code>cache_control</code> 标记</li>
            <li>标记内容必须至少 1024 tokens</li>
            <li>缓存在首次请求完成后创建，第二次请求开始命中</li>
            <li>Function Calling 的 tools 定义不能直接加标记，需在最后一个 content 块上标记</li>
            <li>tools 数组的顺序和字段必须完全一致才能命中</li>
          </ul>
        </div>
      </section>

      {/* Implicit cache usage */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>隐式缓存</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          无需任何参数变更，系统会自动检测并缓存 messages 中的公共前缀。优化建议：
        </p>
        <ul style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 2, paddingLeft: 20 }}>
          <li>将静态/重复内容（system prompt、长文档）放在 messages 最前面</li>
          <li>动态内容（用户最新问题）放在最后</li>
          <li>多轮对话保持 system prompt 不变</li>
        </ul>
      </section>

      {/* How to check cache hit */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>如何确认缓存命中</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.7 }}>
          API 响应的 <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>usage.prompt_tokens_details</code> 中会包含缓存信息：
        </p>
        <DocsCodeBlock code={`"usage": {
  "prompt_tokens": 1584,
  "completion_tokens": 20,
  "total_tokens": 1604,
  "prompt_tokens_details": {
    "cached_tokens": 1568,           // 命中缓存的 token 数
    "cache_creation_input_tokens": 0  // 本次创建缓存的 token 数
  }
}`} />
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
          在控制台的<strong>使用记录</strong>页面，命中缓存的调用会显示蓝色「缓存N」标签。
        </p>
      </section>

      {/* Explicit cache supported models */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>显式缓存 — 支持模型</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>供应商</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>最低 Token</th>
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>隐式缓存 — 支持模型</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          以下模型自动启用隐式缓存，无需额外配置。命中后输入 token 自动享受折扣。
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>供应商</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>预估最低 Token</th>
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>计费说明</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>场景</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>计费倍率</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["显式缓存 — 创建", "1.25x", "首次写入缓存，按输入价的 125% 计费"],
                ["显式缓存 — 命中", "0.1x", "命中后仅按输入价的 10% 计费"],
                ["隐式缓存 — 命中", "~0.2x", "命中后约按输入价的 20% 计费（10%~40% 因模型而异）"],
                ["未命中", "1.0x", "标准输入价"],
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
