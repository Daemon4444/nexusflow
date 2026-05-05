"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE = "https://nexusflow.hk";

const codeExamples: Record<string, string> = {
  python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="${API_BASE}/v1",
)

response = client.chat.completions.create(
    model="qwen3.5-plus",
    messages=[
        {"role": "system", "content": "你是一个有帮助的助手。"},
        {"role": "user", "content": "你好，请介绍一下你自己。"}
    ],
    temperature=0.7,
    max_tokens=1000
)

print(response.choices[0].message.content)`,
  nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "${API_BASE}/v1",
});

const response = await client.chat.completions.create({
  model: "qwen3.5-plus",
  messages: [
    { role: "system", content: "你是一个有帮助的助手。" },
    { role: "user", content: "你好，请介绍一下你自己。" }
  ],
  temperature: 0.7,
  max_tokens: 1000,
});

console.log(response.choices[0].message.content);`,
  curl: `curl -X POST ${API_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-plus",
    "messages": [
      {"role": "system", "content": "你是一个有帮助的助手。"},
      {"role": "user", "content": "你好，请介绍一下你自己。"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'`,
};

const asyncTaskExample = `curl -X POST ${API_BASE}/v1/tasks \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "happyhorse-1.0-t2v",
    "prompt": "黄昏城市海岸线，镜头缓慢推进，电影感自然光",
    "duration": 10,
    "resolution": "720P"
  }'

# 轮询任务状态
curl ${API_BASE}/v1/tasks/task_xxx \\
  -H "Authorization: Bearer sk-air-your-key"`;

const protocols = [
  {
    title: "OpenAI-compatible",
    endpoint: `${API_BASE}/v1/chat/completions`,
    href: "/docs/api/chat",
    desc: "默认推荐。适合 OpenAI SDK、Chat Completions、工具调用和流式输出。",
  },
  {
    title: "Anthropic Messages",
    endpoint: `${API_BASE}/v1/messages`,
    href: "/docs/api/anthropic",
    desc: "适合已有 Anthropic SDK、Messages 请求格式或 Claude Code 风格客户端。",
  },
  {
    title: "Gemini-compatible",
    endpoint: `${API_BASE}/v1beta/models/{model}:generateContent`,
    href: "/docs/api/gemini",
    desc: "适合沿用 Gemini GenerateContent 请求格式。模型名填写 NexusFlow 模型 ID。",
  },
];

export default function QuickstartPage() {
  const [lang, setLang] = useState("python");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          快速开始
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7 }}>
          从第一个请求开始，选择 OpenAI、Anthropic Messages 或 Gemini-compatible 协议，并理解什么时候切换到异步任务模式。
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { title: "三协议同步", desc: "OpenAI、Anthropic、Gemini 兼容入口共用同一套模型。" },
            { title: "异步任务", desc: "图像和视频统一走 `/v1/tasks` 提交与轮询。" },
            { title: "生产流量", desc: "上线前同时看限流说明、错误码和监控页。" },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          选择兼容协议
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {protocols.map((protocol) => (
            <Link key={protocol.title} href={protocol.href} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", textDecoration: "none" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{protocol.title}</div>
              <code style={{ display: "block", fontSize: 11.5, lineHeight: 1.5, color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>{protocol.endpoint}</code>
              <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>{protocol.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          前提条件
        </h2>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "var(--text-secondary)", lineHeight: 2.2 }}>
          <li>已 <Link href="/login" style={{ color: "var(--accent)" }}>注册并登录</Link> nexusflow 平台</li>
          <li>已在 <Link href="/keys" style={{ color: "var(--accent)" }}>API 密钥</Link> 页面创建至少一个 API Key</li>
          <li>已在 <Link href="/billing" style={{ color: "var(--accent)" }}>账单管理</Link> 页面充值余额</li>
        </ul>
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--text-primary)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>1</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>安装 SDK</h2>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          默认使用 OpenAI SDK。已有 Anthropic 或 Gemini 客户端时，可直接查看对应兼容协议文档。
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-tertiary)" }}>Python</div>
            <pre style={{ margin: 0, padding: "12px 16px", background: "#1a1a1a", fontSize: 13, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace" }}>pip install openai</pre>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-tertiary)" }}>Node.js</div>
            <pre style={{ margin: 0, padding: "12px 16px", background: "#1a1a1a", fontSize: 13, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace" }}>npm install openai</pre>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--text-primary)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>2</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>配置 API</h2>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          将 base_url 指向 nexusflow，使用统一 API Key 即可访问所有模型。
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-primary)", background: "var(--bg-elevated)", width: 120 }}>Base URL</td>
                <td style={{ padding: "12px 16px" }}><code style={{ color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>{API_BASE}/v1</code></td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-primary)", background: "var(--bg-elevated)" }}>API Key</td>
                <td style={{ padding: "12px 16px" }}>
                  <code style={{ color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>sk-air-xxxxxxxx</code>
                  <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-tertiary)" }}>(<Link href="/keys" style={{ color: "var(--accent)" }}>获取密钥</Link>)</span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-primary)", background: "var(--bg-elevated)" }}>认证方式</td>
                <td style={{ padding: "12px 16px" }}><code style={{ color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>Authorization: Bearer {"{API_KEY}"}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--text-primary)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>3</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>发起对话请求</h2>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          文本和推理模型优先走同步接口。以下示例使用 Qwen3.5 Plus。
        </p>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {(["python", "nodejs", "curl"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              style={{
                padding: "5px 14px",
                borderRadius: 4,
                border: "none",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                background: lang === l ? "#333" : "transparent",
                color: lang === l ? "#fff" : "var(--text-tertiary)",
              }}
            >
              {l === "python" ? "Python" : l === "nodejs" ? "Node.js" : "cURL"}
            </button>
          ))}
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace" }}>{codeExamples[lang]}</pre>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--text-primary)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>4</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>接入异步任务</h2>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
          当你开始接入图像或视频生成时，推荐统一使用 <code>/v1/tasks</code>。这套链路更适合高时延模型、后台批量任务和高并发排队。
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace" }}>{asyncTaskExample}</pre>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          高并发接入建议
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[
            "把聊天请求和多媒体任务拆到不同队列，避免互相争抢吞吐。",
            "同一个 API Key 可用于 OpenAI、Anthropic Messages、Gemini-compatible 三类协议。",
            "任务轮询建议 3-5 秒一次，并使用指数退避处理失败重试。",
            "压测前先确认限流页中的 RPM / TPM 与并发策略。",
          ].map((text) => (
            <div key={text} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>
              {text}
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ padding: 20, background: "var(--accent-bg)", border: "1px solid var(--accent-border)", borderRadius: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)", marginBottom: 8 }}>提示</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.9 }}>
            <li>将 <code>model</code> 参数替换为其他模型 ID 即可切换模型</li>
            <li>所有模型共用同一个 API Key，无需分别申请</li>
            <li>OpenAI、Anthropic Messages、Gemini-compatible 三种协议共用同一套余额与用量记录</li>
            <li>支持流式输出，设置 <code>stream: true</code> 即可</li>
            <li>图像与视频建议通过 <code>/v1/tasks</code> 接入，避免同步阻塞</li>
          </ul>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          下一步
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/models", label: "浏览模型", desc: "查看全部 45+ 可用模型" },
            { href: "/docs/multi-protocol", label: "三协议接入", desc: "OpenAI / Anthropic / Gemini 兼容说明" },
            { href: "/docs/api/tasks", label: "异步任务", desc: "图像 / 视频统一任务接口" },
            { href: "/docs/api/limits", label: "限流与并发", desc: "查看高并发下的限制与优化建议" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{ padding: "16px 20px", border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", background: "var(--bg)", transition: "all 0.15s" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
