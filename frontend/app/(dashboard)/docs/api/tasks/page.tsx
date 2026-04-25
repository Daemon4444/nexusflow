"use client";

import Link from "next/link";

const examples = {
  submit: `curl https://nexusflow.hk/v1/tasks \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "happyhorse-1.0",
    "prompt": "黄昏下的城市海岸线，镜头慢慢推进，电影感自然光",
    "duration": 10,
    "size": "1280x720"
  }'`,
  poll: `curl https://nexusflow.hk/v1/tasks/task_xxx \\
  -H "Authorization: Bearer sk-air-your-key"`,
};

export default function TasksApiPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ padding: "4px 10px", borderRadius: 6, background: "#dbeafe", color: "#1d4ed8", fontSize: 11, fontWeight: 800, fontFamily: "var(--font-mono)" }}>
            POST
          </span>
          <code style={{ fontSize: 15, color: "var(--text-primary)" }}>/v1/tasks</code>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>
          异步任务 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
          图像与视频生成统一走异步任务接口。相比直接阻塞等待结果，任务模式更适合高延迟模型、批量生成和高并发流量整形。
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { title: "提交任务", desc: "使用 `/v1/tasks` 提交图像或视频生成请求。" },
            { title: "轮询状态", desc: "使用 `/v1/tasks/{id}` 查询 running / succeeded / failed 状态。" },
            { title: "适合生产", desc: "便于排队、重试、监控和与业务工作流集成。" },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>请求参数</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>参数</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>类型</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["model", "string", "模型 ID，例如 `wan2.6-t2i`、`happyhorse-1.0`。"],
                ["prompt", "string", "生成提示词。"],
                ["size", "string", "输出尺寸，例如 `1280x720`。"],
                ["duration", "integer", "视频任务时长。"],
                ["negative_prompt", "string", "负面提示词。"],
                ["img_url", "string", "图生视频 / 图像参考输入 URL。"],
              ].map(([name, type, desc], idx) => (
                <tr key={name} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}><code>{name}</code></td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>{type}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.7 }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>调用示例</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {Object.entries(examples).map(([key, code]) => (
            <div key={key} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #111827", background: "#0b1120" }}>
              <div style={{ padding: "10px 14px", color: "#cbd5e1", fontSize: 12, fontWeight: 700, borderBottom: "1px solid rgba(148,163,184,0.18)" }}>
                {key === "submit" ? "提交任务" : "轮询任务"}
              </div>
              <pre style={{ margin: 0, padding: 16, overflowX: "auto", fontSize: 12.5, lineHeight: 1.7, color: "#e2e8f0" }}>
                <code>{code}</code>
              </pre>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>高并发建议</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {[
            { title: "应用层做任务队列", desc: "对高峰流量先入队再分发，避免把所有视频任务直接打到上游模型。" },
            { title: "轮询做退避", desc: "任务查询使用指数退避或固定 3-5 秒轮询，不要亚秒级轮询。" },
            { title: "拆分同步与异步流量", desc: "聊天请求走 `/v1/chat/completions`，图像/视频走 `/v1/tasks`，减少互相干扰。" },
            { title: "结合限流与监控", desc: "上线前结合限流页和监控页观察 QPM、延迟和失败率，再决定是否提额。" },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/videos", label: "视频任务参数", desc: "查看视频生成参数与模型说明" },
          { href: "/docs/api/limits", label: "限流说明", desc: "查看高并发下的限制与优化建议" },
          { href: "/docs/api/errors", label: "错误处理", desc: "查看任务失败与上游错误排查方式" },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{ padding: 16, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-tertiary)" }}>{item.desc}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
