"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import Link from "next/link";

const submit = `curl https://nexusflow.hk/v1/tasks \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wan2.6-t2i",
    "prompt": "Generate a tech product poster",
    "size": "1024x1024"
  }'`;

const poll = `curl https://nexusflow.hk/v1/tasks/task_xxx \\
  -H "Authorization: Bearer $API_KEY"`;

const params = [
  { name: "model", required: "Required", desc: "Image or video model ID, e.g. wan2.6-t2i, wan2.6-i2v, pixverse-v6, happyhorse-1.0-t2v." },
  { name: "prompt", required: "Required", desc: "Generation prompt. For video, describe the subject, action, camera, scene and lighting." },
  { name: "size", required: "Optional", desc: "Image or video dimensions, e.g. 1024x1024, 1280x720." },
  { name: "duration", required: "Optional (video)", desc: "Video duration; choose 5, 8, 10, 15, etc., based on model capability." },
  { name: "img_url", required: "Optional (i2v)", desc: "Reference image URL for i2v/r2v task types." },
  { name: "negative_prompt", required: "Optional", desc: "Elements, styles or actions you do not want to appear." },
  { name: "webhook_url", required: "Not yet supported", desc: "The current public task endpoint does not trigger webhooks; production systems should use GET /v1/tasks/{id} polling." },
];

export default function AsyncApiPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 940 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 600 }}>API Reference</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Async Tasks API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          High-latency models such as image and video generation use the unified task endpoint. After submission the task status is returned; video tasks require polling, while some image tasks return succeeded immediately.
        </p>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 38 }}>
        {[
          ["Submit", "POST /v1/tasks", "Create a task. Video returns running; some image tasks return succeeded directly."],
          ["Query", "GET /v1/tasks/{id}", "Read task status, progress, output and errors."],
          ["List", "GET /v1/tasks", "List recent tasks for the API key's user."],
        ].map(([title, endpoint, desc]) => (
          <div key={title} style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
            <div style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 700, marginBottom: 8 }}>{title}</div>
            <code style={{ fontSize: 12 }}>{endpoint}</code>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginTop: 8 }}>{desc}</div>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 38 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Request Parameters</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {params.map((param, index) => (
            <div key={param.name} style={{ display: "grid", gridTemplateColumns: "180px 160px 1fr", padding: "12px 16px", borderTop: index === 0 ? "none" : "1px solid var(--border)", background: index % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)", fontSize: 13 }}>
              <code>{param.name}</code>
              <span style={{ color: "var(--text-tertiary)" }}>{param.required}</span>
              <span style={{ color: "var(--text-secondary)" }}>{param.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, color: "var(--text-primary)", marginBottom: 10 }}>Submit Task</h2>
        <DocsCodeBlock code={submit} />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, color: "var(--text-primary)", marginBottom: 10 }}>Query Task</h2>
        <DocsCodeBlock code={poll} />
      </section>

      <Link href="/docs/api/tasks" className="btn-primary">
        View full Tasks documentation
      </Link>
    </div>
  );
}
