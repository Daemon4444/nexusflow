"use client";

import Link from "next/link";

const models = [
  ["pixverse-v4.5", "旗舰质量", "适合广告短片、产品视觉和高质量创意视频。"],
  ["pixverse-v4", "稳定通用", "适合日常文生视频和图生视频任务。"],
  ["pixverse-v3.5", "高性价比", "适合批量生成和快速草稿。"],
];

export default function PixVerseModelPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 980 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 600 }}>模型介绍</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          PixVerse 视频模型
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          PixVerse 模型用于文生视频、图生视频和参考生视频，平台侧通过统一任务接口管理提交、轮询、限流和结果记录。
        </p>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 38 }}>
        {models.map(([id, title, desc]) => (
          <div key={id} style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
            <code style={{ fontSize: 13 }}>{id}</code>
            <div style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 700, marginTop: 10 }}>{title}</div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>{desc}</p>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>能力范围</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {[
            ["文生视频", "prompt + model + duration + aspect_ratio + quality"],
            ["图生视频", "prompt + image_url/img_url + model + duration"],
            ["首尾帧", "first_frame_url + last_frame_url + prompt"],
            ["参考生视频", "reference_image_url + prompt + style 控制"],
          ].map(([name, desc], index) => (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "180px 1fr", padding: "12px 16px", borderTop: index === 0 ? "none" : "1px solid var(--border)", background: index % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)", fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{name}</span>
              <span style={{ color: "var(--text-secondary)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/docs/api/pixverse" className="btn-primary">查看 PixVerse API</Link>
        <Link href="/docs/api/tasks" className="btn-secondary">查看统一任务接口</Link>
      </div>
    </div>
  );
}
