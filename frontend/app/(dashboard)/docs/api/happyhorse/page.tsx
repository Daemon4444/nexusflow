"use client";

import Link from "next/link";

const code = `curl https://nexusflow.hk/v1/tasks \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "happyhorse-1.0",
    "prompt": "雨后城市街道，人物撑伞缓慢前行，镜头从远景推进到中景，电影感自然光",
    "duration": 10,
    "size": "1280x720",
    "negative_prompt": "画面抖动，低清晰度，文字水印"
  }'`;

export default function HappyHorseApiPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 940 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 600 }}>模型 API</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          HappyHorse API 用法
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          HappyHorse 在平台中按视频生成模型处理，统一走 <code>/v1/tasks</code> 异步任务接口。
        </p>
      </div>

      <section style={{ marginBottom: 34 }}>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {[
            ["model", "必填", "固定使用 happyhorse-1.0。"],
            ["prompt", "必填", "建议包含主体、动作、镜头、环境、光线和风格。"],
            ["img_url", "可选", "传入参考图时作为图生视频任务。"],
            ["duration", "可选", "建议 5 到 15 秒，具体以模型开放状态为准。"],
            ["size", "可选", "常用 1280x720、720x1280。"],
            ["negative_prompt", "可选", "控制不希望出现的内容。"],
          ].map(([name, required, desc], index) => (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "180px 120px 1fr", padding: "12px 16px", borderTop: index === 0 ? "none" : "1px solid var(--border)", background: index % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)", fontSize: 13 }}>
              <code>{name}</code>
              <span style={{ color: "var(--text-tertiary)" }}>{required}</span>
              <span style={{ color: "var(--text-secondary)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 34 }}>
        <h2 style={{ fontSize: 18, color: "var(--text-primary)", marginBottom: 10 }}>文生视频</h2>
        <pre style={{ margin: 0, padding: 18, background: "#111827", color: "#e5e7eb", borderRadius: 8, overflowX: "auto", fontSize: 12.5, lineHeight: 1.7 }}>
          <code>{code}</code>
        </pre>
      </section>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/docs/models/happyhorse" className="btn-primary">查看模型介绍</Link>
        <Link href="/docs/api/tasks" className="btn-secondary">查看异步任务 API</Link>
      </div>
    </div>
  );
}
