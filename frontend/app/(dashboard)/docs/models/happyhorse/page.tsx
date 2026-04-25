"use client";

import Link from "next/link";

const capabilityCards = [
  {
    title: "专题入口",
    desc: "把公开动态、平台接入路径和模型能力边界收在一个页面里，方便销售、产品和开发统一查看。",
  },
  {
    title: "统一接入逻辑",
    desc: "接入层仍然沿用 nexusflow 的统一鉴权、统一计费与统一异步任务接口，不单独暴露供应商私有接口。",
  },
  {
    title: "并发友好",
    desc: "视频任务统一走异步提交和状态轮询，更适合高时延模型、批量任务和高峰流量控制。",
  },
  {
    title: "持续更新",
    desc: "官方规格和开放节奏可能持续变化，专题页负责承接公开信息与平台可用状态之间的同步。",
  },
];

const publicUpdates = [
  {
    date: "2026-04-10",
    title: "Alibaba 确认 HappyHorse 归属",
    desc: "Caixin 报道称 Alibaba 已确认其为 HappyHorse 背后团队，并提到模型处于 closed beta，API rollout 将逐步开放。",
    href: "https://www.caixinglobal.com/2026-04-10/alibaba-unveils-happyhorse-after-ai-model-tops-video-rankings-under-alias-102432775.html",
    source: "Caixin Global",
  },
  {
    date: "2026-03-23",
    title: "Alibaba Cloud 公布视频生成能力范围",
    desc: "官方文档列出 text-to-video、image-to-video、reference-to-video 与 editing 等视频生成路径，可作为平台接入逻辑设计参考。",
    href: "https://www.alibabacloud.com/help/en/model-studio/use-video-generation",
    source: "Alibaba Cloud Docs",
  },
];

const apiParams = [
  { name: "model", type: "string", required: "必填", desc: "模型标识，当前专题使用 `happyhorse-1.0` 作为统一接入名。" },
  { name: "prompt", type: "string", required: "必填", desc: "建议写清主体、动作、场景、镜头与光线。" },
  { name: "img_url", type: "string", required: "可选", desc: "图生视频时传入参考图 URL，服务端字段为 `img_url`。" },
  { name: "duration", type: "integer", required: "可选", desc: "视频秒数，建议根据模型开放状态控制在 5 到 15 秒内。" },
  { name: "size", type: "string", required: "可选", desc: "输出尺寸，如 `1280x720`、`720x1280`。" },
  { name: "negative_prompt", type: "string", required: "可选", desc: "不希望出现的元素、画风或动作。" },
];

const codeExamples = {
  curl: `# 1. 提交统一异步任务
curl https://nexusflow.hk/v1/tasks \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "happyhorse-1.0",
    "prompt": "黄昏海岸边，人物缓慢前行，镜头从近景拉到中景，电影感自然光",
    "duration": 10,
    "size": "1280x720"
  }'

# 2. 查询任务状态
curl https://nexusflow.hk/v1/tasks/task_xxx \\
  -H "Authorization: Bearer sk-air-your-key"`,
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
        "model": "happyhorse-1.0",
        "prompt": "黄昏海岸边，人物缓慢前行，镜头从近景拉到中景，电影感自然光",
        "duration": 10,
        "size": "1280x720",
    },
).json()

while True:
    result = requests.get(
        f"https://nexusflow.hk/v1/tasks/{task['id']}",
        headers={"Authorization": "Bearer sk-air-your-key"},
    ).json()
    if result["status"] in ["succeeded", "failed"]:
        print(result)
        break
    time.sleep(5)`,
};

const concurrencyAdvice = [
  "将文本对话和视频任务拆到不同队列，避免长任务占住同步链路。",
  "任务轮询建议 3 到 5 秒一次，并在失败重试时增加退避。",
  "高峰期优先控制 duration、size 与批量提交速率，再决定是否切模型。",
  "持续看模型成功率、任务排队深度和端到端延迟，避免只盯请求量。",
];

export default function HappyHorseModelPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 1040 }}>
      <section
        style={{
          padding: 32,
          borderRadius: 20,
          border: "1px solid rgba(37,99,235,0.14)",
          background:
            "radial-gradient(circle at top right, rgba(59,130,246,0.16), transparent 28%), linear-gradient(135deg, #0f172a 0%, #101827 46%, #0b1220 100%)",
          color: "#e5eefc",
          marginBottom: 28,
          boxShadow: "0 24px 60px rgba(15,23,42,0.16)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", background: "rgba(96,165,250,0.18)", color: "#bfdbfe" }}>
            HAPPYHORSE
          </span>
          <span style={{ fontSize: 12, color: "rgba(226,232,240,0.72)" }}>
            by Alibaba
          </span>
        </div>
        <h1 style={{ fontSize: 34, lineHeight: 1.08, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 14px", color: "#f8fbff" }}>
          HappyHorse 专题
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.8, margin: "0 0 20px", color: "rgba(226,232,240,0.86)", maxWidth: 760 }}>
          这个页面用来承接公开动态、平台接入方式和生产接入建议。
          文档逻辑统一到 nexusflow 的异步任务链路，而模型的实际开放状态以平台当前可用性和上游供应情况为准。
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/docs/api/tasks" className="btn-primary">
            查看异步任务 API
          </Link>
          <Link href="/docs/api/videos" className="btn-secondary">
            查看视频接入说明
          </Link>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          {capabilityCards.map((item) => (
            <div
              key={item.title}
              style={{
                padding: 18,
                border: "1px solid var(--border)",
                borderRadius: 14,
                background: "var(--bg)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                {item.title}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)" }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 44 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>
            平台接入逻辑
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.75, margin: 0 }}>
            参考阿里云百炼“模型服务 + 应用构建 + 计费监控”的结构，这里的专题页不只展示模型本身，还说明它在平台中的接入方式、流量组织方式和上线边界。
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
          {[
            { title: "模型服务", desc: "统一模型名、统一鉴权与统一文档入口，减少跨供应商切换成本。" },
            { title: "应用构建", desc: "业务应用继续调用同一套异步任务接口，不额外感知供应商内部协议。" },
            { title: "计费与监控", desc: "继续沿用平台的限流、账单、监控和错误处理逻辑，而不是孤立维护单模型接入。" },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 44 }}>
        <div style={{ padding: 18, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-elevated)", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", marginBottom: 6 }}>平台文档口径</div>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)" }}>
            HappyHorse 在平台文档中通过统一的 <code>/v1/tasks</code> 异步任务链路承接。
            这部分说明的是接入方式与运行逻辑，不等同于对上游供应商开放状态做绝对承诺。
          </div>
        </div>
        <div style={{ padding: 18, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", marginBottom: 6 }}>公开资料口径</div>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)" }}>
            公开消息显示，Alibaba 已确认 HappyHorse 归属，且外部资料已出现视频生成相关能力范围。
            这些公开信息说明了产品方向，但实际供应、配额和地区开放节奏仍应以平台可用状态为准。
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px" }}>
          接口参数
        </h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
            <span style={{ padding: "4px 10px", borderRadius: 6, background: "#dbeafe", color: "#1d4ed8", fontSize: 11, fontWeight: 800, fontFamily: "var(--font-mono)" }}>POST</span>
            <code style={{ fontSize: 14, color: "var(--text-primary)" }}>/v1/tasks</code>
          </div>
          <div style={{ padding: 18, fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)" }}>
            专题模型继续使用平台统一的异步任务提交流程。提交成功后，使用 <code>/v1/tasks/{"{id}"}</code> 轮询状态。
          </div>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", marginBottom: 18 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>参数</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>类型</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>必填</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {apiParams.map((param, idx) => (
                <tr key={param.name} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}><code>{param.name}</code></td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>{param.type}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{param.required}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.7 }}>{param.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          {Object.entries(codeExamples).map(([lang, code]) => (
            <div key={lang} style={{ borderRadius: 14, overflow: "hidden", border: "1px solid #0f172a", background: "#0b1120" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(148,163,184,0.18)", color: "#cbd5e1", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em" }}>
                {lang.toUpperCase()}
              </div>
              <pre style={{ margin: 0, padding: 16, overflowX: "auto", fontSize: 12.5, lineHeight: 1.7, color: "#e2e8f0" }}>
                <code>{code}</code>
              </pre>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px" }}>
          高并发建议
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          {concurrencyAdvice.map((item) => (
            <div key={item} style={{ padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)", fontSize: 13, lineHeight: 1.75, color: "var(--text-secondary)" }}>
              {item}
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px" }}>
          公开动态
        </h2>
        <div style={{ display: "grid", gap: 14 }}>
          {publicUpdates.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "block",
                padding: 18,
                borderRadius: 14,
                border: "1px solid var(--border)",
                textDecoration: "none",
                background: "var(--bg)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{item.date}</div>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)", marginBottom: 8 }}>
                {item.desc}
              </div>
              <div style={{ fontSize: 12, color: "var(--accent)" }}>来源：{item.source}</div>
            </a>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
        {[
          { href: "/docs/api/videos", label: "视频文档", desc: "查看统一视频任务接入方式" },
          { href: "/docs/api/tasks", label: "异步任务", desc: "查看统一任务接口与状态查询" },
          { href: "/docs/api/limits", label: "限流与并发", desc: "查看流量治理、排队与监控建议" },
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
      </section>
    </div>
  );
}
