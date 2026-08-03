"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const openaiExample = `curl https://nexusflow.hk/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-plus",
    "enable_context_caching": true,
    "messages": [
      {
        "role": "system",
        "content": [
          {
            "type": "text",
            "text": "你是一个金融分析助手。以下是公司年报全文（约 50,000 字）...",
            "cache_control": {"type": "ephemeral"}
          }
        ]
      },
      {"role": "user", "content": "总结这份年报的核心风险"}
    ]
  }'`;

const anthropicExample = `curl https://nexusflow.hk/v1/messages \\
  -H "x-api-key: $API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "system": [
      {
        "type": "text",
        "text": "你是一个代码审查专家。以下是完整代码库上下文...",
        "cache_control": {"type": "ephemeral"}
      }
    ],
    "messages": [
      {"role": "user", "content": "找出这段代码的安全漏洞"}
    ]
  }'`;

const pythonExample = `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-xxx",
    base_url="https://nexusflow.hk/v1"
)

# 长 system prompt 只在第一次请求时被缓存，后续请求自动命中
response = client.chat.completions.create(
    model="qwen3.5-plus",
    extra_body={"enable_context_caching": True},
    messages=[
        {
            "role": "system",
            "content": [
                {
                    "type": "text",
                    "text": long_document,  # 你的长文档
                    "cache_control": {"type": "ephemeral"}
                }
            ]
        },
        {"role": "user", "content": "请总结要点"}
    ]
)

# 查看缓存命中情况
details = response.usage.prompt_tokens_details
print(f"缓存命中: {details.cached_tokens} tokens")
print(f"缓存创建: {details.cache_creation_input_tokens} tokens")`;

const supportedModels = [
  { provider: "通义千问", models: "Qwen3.8 Max, Qwen3.7 Max, Qwen3.6 Max Preview, Qwen3.6 Plus/Flash, Qwen3.5 Plus/Flash, Qwen3 Max, Qwen Plus/Turbo, Qwen VL 系列, Qwen3 Coder 系列", min: "1024 (显式) / 256 (隐式)" },
  { provider: "DeepSeek", models: "DeepSeek V3.2", min: "1024 (显式)" },
  { provider: "智谱 GLM", models: "GLM 5.2, GLM 5.1, GLM 5, GLM 4.7", min: "512" },
  { provider: "Kimi", models: "Kimi K3, K2.6, K2.5", min: "1024 (显式)" },
  { provider: "Anthropic", models: "Claude Opus 4.7, Sonnet 4.6, Haiku 4.5", min: "1024" },
];

export default function ContextCachePage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px", letterSpacing: "-0.5px" }}>
          上下文缓存（Context Cache）
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 760 }}>
          对于重复的 system prompt、长文档上下文或多轮对话的固定前缀，启用上下文缓存可节省高达 90% 的输入费用。
        </p>
      </div>

      {/* How it works */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>工作原理</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          {[
            { step: "1", title: "标记缓存", desc: "在 content block 上添加 cache_control 注解" },
            { step: "2", title: "首次请求", desc: "标记部分被缓存，按 1.25x 输入价计费" },
            { step: "3", title: "后续请求", desc: "命中缓存，按 0.1x 输入价计费（省 90%）" },
          ].map((item) => (
            <div key={item.step} style={{ padding: 16, background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)", marginBottom: 6 }}>{item.step}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>计费规则</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", fontSize: 13 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 2fr", padding: "12px 14px", background: "var(--bg-elevated)", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
            <span>Token 类型</span><span>计费倍率</span><span>响应字段</span><span>说明</span>
          </div>
          {[
            ["缓存创建", "1.25x", "cache_creation_input_tokens", "首次请求写入缓存，略高于正常输入"],
            ["缓存命中", "0.1x", "cached_tokens", "后续请求命中，节省 90%"],
            ["正常输入", "1x", "prompt_tokens - 缓存部分", "未被缓存标记的输入"],
            ["输出", "1x", "completion_tokens", "正常输出计费，不受缓存影响"],
          ].map(([type, rate, field, desc], i) => (
            <div key={type} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 2fr", padding: "12px 14px", borderBottom: i < 3 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
              <span style={{ fontWeight: 500 }}>{type}</span>
              <span style={{ color: rate === "0.1x" ? "var(--success)" : rate === "1.25x" ? "#b45309" : "var(--text-secondary)", fontWeight: 600 }}>{rate}</span>
              <code style={{ fontSize: 11, wordBreak: "break-all" }}>{field}</code>
              <span style={{ color: "var(--text-tertiary)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Cache conditions */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>缓存条件</h2>
        <div style={{ padding: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)" }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>最小 Token 数</strong>：显式缓存需要标记内容 ≥ 1024 tokens（部分模型 256/512）</li>
            <li><strong>缓存 TTL</strong>：ephemeral 类型缓存有效期约 5 分钟，期间相同前缀的请求自动命中</li>
            <li><strong>最多标记数</strong>：每个请求最多 4 个 <code>cache_control</code> 标记点</li>
            <li><strong>隐式 vs 显式</strong>：隐式缓存（不加标记）由系统自动判断，无需配置；显式缓存通过标记精确控制缓存边界</li>
            <li><strong>互斥</strong>：同一请求中显式和隐式缓存互斥，有标记时以显式为准</li>
          </ul>
        </div>
      </section>

      {/* Usage: OpenAI protocol */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>使用方式：OpenAI 协议</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          在 <code>/v1/chat/completions</code> 请求中，将 content 改为数组格式，在需要缓存的文本块上添加 <code>cache_control</code>：
        </p>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 14 }}>
          <DocsCodeBlock code={openaiExample} />
        </div>
      </section>

      {/* Usage: Anthropic protocol */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>使用方式：Anthropic 协议</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          在 <code>/v1/messages</code> 请求中，同样在 system 或 messages 的 content block 上添加标记：
        </p>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 14 }}>
          <DocsCodeBlock code={anthropicExample} />
        </div>
      </section>

      {/* Python SDK example */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>Python SDK 示例</h2>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={pythonExample} />
        </div>
      </section>

      {/* Supported models */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>支持的模型</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", fontSize: 13 }}>
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 150px", padding: "12px 14px", background: "var(--bg-elevated)", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
            <span>供应商</span><span>模型</span><span>最小缓存长度</span>
          </div>
          {supportedModels.map((row, i) => (
            <div key={row.provider} style={{ display: "grid", gridTemplateColumns: "150px 1fr 150px", padding: "12px 14px", borderBottom: i < supportedModels.length - 1 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
              <span style={{ fontWeight: 500 }}>{row.provider}</span>
              <span style={{ color: "var(--text-secondary)" }}>{row.models}</span>
              <span style={{ color: "var(--text-tertiary)" }}>{row.min}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Response format */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>响应格式</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          缓存命中信息通过 <code>usage</code> 字段返回，不同协议格式略有不同：
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ padding: 14, background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>OpenAI 协议响应</div>
            <pre style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0, whiteSpace: "pre-wrap" }}>{`usage.prompt_tokens_details:
  cached_tokens: 1804
  cache_creation_input_tokens: 0`}</pre>
          </div>
          <div style={{ padding: 14, background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Anthropic 协议响应</div>
            <pre style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0, whiteSpace: "pre-wrap" }}>{`usage:
  cache_read_input_tokens: 1804
  cache_creation_input_tokens: 0`}</pre>
          </div>
        </div>
      </section>

      {/* Best practices */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>最佳实践</h2>
        <div style={{ padding: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)" }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>将<strong>不变的长内容</strong>（system prompt、参考文档、代码上下文）放在 messages 最前面并标记缓存</li>
            <li><strong>用户消息放最后</strong> — 缓存从 messages 数组开头到标记位置，变化的内容放后面不影响缓存命中</li>
            <li>适合场景：RAG 文档注入、多轮对话固定 system prompt、Agent 的工具定义、代码仓库上下文</li>
            <li>不适合场景：每次请求内容完全不同、prompt 长度低于最小阈值</li>
          </ul>
        </div>
      </section>

      {/* Related */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/chat", label: "Chat Completions", desc: "OpenAI 格式完整参考" },
          { href: "/docs/api/anthropic", label: "Anthropic Messages", desc: "Anthropic 协议调用" },
          { href: "/pricing", label: "模型定价", desc: "查看完整阶梯价格" },
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
