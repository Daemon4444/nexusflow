"use client";

import { useState } from "react";
import Link from "next/link";

const requestParams = [
  { name: "model", type: "string", required: true, default: "-", desc: "视频模型 ID，例如 wanx2.1-t2v-plus、wanx2.1-t2v-turbo、happyhorse-1.0。" },
  { name: "prompt", type: "string", required: true, default: "-", desc: "视频描述文本，建议写清主体、动作、镜头、光线和风格。" },
  { name: "negative_prompt", type: "string", required: false, default: "-", desc: "不希望出现在画面中的元素或动作。" },
  { name: "img_url", type: "string", required: false, default: "-", desc: "图生视频参考图 URL。当前服务端使用 `img_url` 字段，不是 `image`。" },
  { name: "duration", type: "integer", required: false, default: "5", desc: "视频时长（秒），具体范围取决于模型。" },
  { name: "size", type: "string", required: false, default: "\"1280x720\"", desc: "输出尺寸，例如 1280x720、720x1280、1024x1024。" },
];

const models = [
  { id: "wanx2.1-t2v-turbo", provider: "Alibaba Cloud", mode: "文生视频", latency: "更快", desc: "适合短视频批量生产和高峰期快速回包。" },
  { id: "wanx2.1-t2v-plus", provider: "Alibaba Cloud", mode: "文生视频 / 图生视频", latency: "均衡", desc: "适合对画质和一致性要求更高的生产场景。" },
  { id: "happyhorse-1.0", provider: "Alibaba", mode: "专题跟踪", latency: "以开放状态为准", desc: "作为专题模型展示接入路径，具体供应可用性以平台状态为准。" },
  { id: "kling-v1", provider: "Kuaishou", mode: "文生视频", latency: "标准", desc: "适合通用视频生成能力对比与多供应商路由。" },
];

const codeExamples: Record<string, Record<string, string>> = {
  text2video: {
    python: `from openai import OpenAI
import time

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

task = client.post(
    "/tasks",
    body={
        "model": "wanx2.1-t2v-plus",
        "prompt": "黄昏城市海岸线，镜头缓慢推进，电影感自然光，细腻真实风格",
        "duration": 10,
        "size": "1280x720",
    },
)

task_id = task["id"]

while True:
    result = client.get(f"/tasks/{task_id}")
    print(result["status"])
    if result["status"] in ["succeeded", "failed"]:
        print(result)
        break
    time.sleep(5)`,
    curl: `# 1. 提交视频任务
curl https://nexusflow.hk/v1/tasks \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wanx2.1-t2v-plus",
    "prompt": "黄昏城市海岸线，镜头缓慢推进，电影感自然光，细腻真实风格",
    "duration": 10,
    "size": "1280x720"
  }'

# 2. 轮询任务状态
curl https://nexusflow.hk/v1/tasks/task_xxx \\
  -H "Authorization: Bearer sk-air-your-key"`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "https://nexusflow.hk/v1",
});

const task = await fetch("https://nexusflow.hk/v1/tasks", {
  method: "POST",
  headers: {
    Authorization: "Bearer sk-air-your-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "wanx2.1-t2v-plus",
    prompt: "黄昏城市海岸线，镜头缓慢推进，电影感自然光，细腻真实风格",
    duration: 10,
    size: "1280x720",
  }),
}).then((res) => res.json());

const taskId = task.id;

while (true) {
  const result = await fetch(\`https://nexusflow.hk/v1/tasks/\${taskId}\`, {
    headers: { Authorization: "Bearer sk-air-your-key" },
  }).then((res) => res.json());

  console.log(result.status);

  if (result.status === "succeeded" || result.status === "failed") {
    console.log(result);
    break;
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
}`,
  },
  image2video: {
    python: `import requests
import time

headers = {
    "Authorization": "Bearer sk-air-your-key",
    "Content-Type": "application/json",
}

task = requests.post(
    "https://nexusflow.hk/v1/tasks",
    headers=headers,
    json={
        "model": "wanx2.1-t2v-plus",
        "prompt": "人物缓慢回头，头发被海风吹动，镜头保持中近景",
        "img_url": "https://example.com/portrait.jpg",
        "duration": 5,
    },
).json()

task_id = task["id"]

while True:
    result = requests.get(
        f"https://nexusflow.hk/v1/tasks/{task_id}",
        headers={"Authorization": "Bearer sk-air-your-key"},
    ).json()
    if result["status"] in ["succeeded", "failed"]:
        print(result)
        break
    time.sleep(5)`,
    curl: `curl https://nexusflow.hk/v1/tasks \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wanx2.1-t2v-plus",
    "prompt": "人物缓慢回头，头发被海风吹动，镜头保持中近景",
    "img_url": "https://example.com/portrait.jpg",
    "duration": 5
  }'`,
    nodejs: `const task = await fetch("https://nexusflow.hk/v1/tasks", {
  method: "POST",
  headers: {
    Authorization: "Bearer sk-air-your-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "wanx2.1-t2v-plus",
    prompt: "人物缓慢回头，头发被海风吹动，镜头保持中近景",
    img_url: "https://example.com/portrait.jpg",
    duration: 5,
  }),
}).then((res) => res.json());

console.log(task.id);`,
  },
};

const concurrencyCards = [
  {
    title: "统一走异步任务",
    desc: "视频任务全部通过 `/v1/tasks` 提交，把长时延请求从同步链路拆开，避免连接长时间占位。",
  },
  {
    title: "轮询要退避",
    desc: "建议 3 到 5 秒轮询一次，并对失败重试使用指数退避，避免状态查询本身放大并发压力。",
  },
  {
    title: "业务侧先排队",
    desc: "高峰期先在应用侧做队列与限速，再提交到平台，避免一次性把突发流量直接打到模型供应商。",
  },
  {
    title: "观察成功率与时延",
    desc: "上线后要持续看 TTFT、任务成功率、模型级延迟和排队深度，再决定是否扩容或降级。",
  },
];

export default function VideosPage() {
  const [activeTab, setActiveTab] = useState<"text2video" | "image2video">("text2video");
  const [codeLang, setCodeLang] = useState<"python" | "curl" | "nodejs">("python");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 1040 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <span
            style={{
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 4,
              background: "#dbeafe",
              color: "#1d4ed8",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            POST
          </span>
          <code style={{ fontSize: 15, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-primary)" }}>
            /v1/tasks
          </code>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          视频生成
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
          统一通过异步任务接口提交视频生成请求，再轮询任务状态。这样的接入方式更符合视频模型的高时延特征，也更适合生产环境中的突发并发。
        </p>
      </div>

      <div
        style={{
          padding: 18,
          background: "var(--warning-bg)",
          border: "1px solid var(--warning-border)",
          borderRadius: 12,
          marginBottom: 32,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--warning)", marginBottom: 6 }}>
          接入要点
        </div>
        <div style={{ fontSize: 13, color: "#92400e", lineHeight: 1.7 }}>
          文本、推理模型继续走 <code>/v1/chat/completions</code>。图像和视频生成统一走 <code>/v1/tasks</code>，
          再通过 <code>/v1/tasks/{"{id}"}</code> 查询状态。不要再按旧文档调用 <code>/v1/videos/generations</code>。
        </div>
      </div>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
          {concurrencyCards.map((item) => (
            <div key={item.title} style={{ padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          推荐模型
        </h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>模型 ID</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>供应商</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>模式</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>时延特征</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, idx) => (
                <tr key={m.id} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}><code>{m.id}</code></td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{m.provider}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{m.mode}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>{m.latency}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6 }}>{m.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          请求参数
        </h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>参数名</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>类型</th>
                <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>必填</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>默认值</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {requestParams.map((p, idx) => (
                <tr key={p.name} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}><code>{p.name}</code></td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12 }}>{p.type}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    {p.required ? <span style={{ color: "var(--danger)", fontWeight: 600 }}>*</span> : <span style={{ color: "var(--text-tertiary)" }}>-</span>}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}><code style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{p.default}</code></td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          代码示例
        </h2>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { key: "text2video", label: "文生视频" },
            { key: "image2video", label: "图生视频" },
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
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
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

        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 13, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.55 }}>
            {codeExamples[activeTab][codeLang]}
          </pre>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          继续阅读
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
          {[
            { href: "/docs/api/tasks", label: "异步任务 API", desc: "查看统一任务提交与状态查询接口" },
            { href: "/docs/api/limits", label: "限流与并发", desc: "查看高并发下的限流、排队和监控建议" },
            { href: "/docs/models/happyhorse", label: "HappyHorse 专题", desc: "查看模型动态、接入方式与说明边界" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: 16,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                textDecoration: "none",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-tertiary)" }}>{item.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
