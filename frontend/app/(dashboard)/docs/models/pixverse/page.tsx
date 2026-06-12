"use client";

import Link from "next/link";

const models = [
  ["pixverse-v6", "Currently featured", "Supports text-to-video and image-to-video. The backend can switch between the Bailian channel and the official PixVerse channel."],
];

export default function PixVerseModelPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 980 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 600 }}>Introduction</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          PixVerse Video Models
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          PixVerse models cover text-to-video, image-to-video, and reference-to-video. The platform handles submission, polling, rate limiting, and result tracking through a unified task interface.
        </p>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(1, minmax(0, 1fr))", gap: 14, marginBottom: 38 }}>
        {models.map(([id, title, desc]) => (
          <div key={id} style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
            <code style={{ fontSize: 13 }}>{id}</code>
            <div style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 700, marginTop: 10 }}>{title}</div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>{desc}</p>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Capabilities</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {[
            ["Text-to-Video", "prompt + model + duration + aspect_ratio + quality"],
            ["Image-to-Video", "prompt + image_url/img_url + model + duration"],
            ["First & Last Frame", "first_frame_url + last_frame_url + prompt"],
            ["Reference-to-Video", "reference_image_url + prompt + style controls"],
          ].map(([name, desc], index) => (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "180px 1fr", padding: "12px 16px", borderTop: index === 0 ? "none" : "1px solid var(--border)", background: index % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)", fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{name}</span>
              <span style={{ color: "var(--text-secondary)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/docs/api/pixverse" className="btn-primary">View PixVerse API</Link>
        <Link href="/docs/api/tasks" className="btn-secondary">View Unified Task API</Link>
      </div>
    </div>
  );
}
