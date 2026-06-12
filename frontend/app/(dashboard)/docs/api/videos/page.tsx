"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type TabKey = "t2v" | "i2v";

const tabs: { key: TabKey; label: string }[] = [
  { key: "t2v", label: "Text-to-Video" },
  { key: "i2v", label: "Image-to-Video" },
];

const supportedModels = [
  { id: "wan2.6-t2v", provider: "Wan / Alibaba", mode: "Text-to-Video", price720: "$0.6 / sec", price1080: "$1 / sec" },
  { id: "wan2.6-i2v", provider: "Wan / Alibaba", mode: "Image-to-Video", price720: "$0.6 / sec", price1080: "$1 / sec" },
  { id: "happyhorse-1.0-t2v", provider: "HappyHorse / Alibaba", mode: "Text-to-Video", price720: "$0.9 / sec", price1080: "$1.6 / sec" },
  { id: "happyhorse-1.0-i2v", provider: "HappyHorse / Alibaba", mode: "Image-to-Video", price720: "$0.9 / sec", price1080: "$1.6 / sec" },
  { id: "pixverse-v6", provider: "PixVerse", mode: "Text-to-Video", price720: "$0.36 with audio / $0.27 muted", price1080: "$0.68 with audio / $0.53 muted" },
];

const requestParams: { name: string; type: string; required: boolean; desc: string }[] = [
  { name: "model", type: "string", required: true, desc: "Video model ID, see the Supported Models table above. Examples: wan2.6-t2v, happyhorse-1.0-i2v, pixverse-v6." },
  { name: "prompt", type: "string", required: true, desc: "Text prompt describing the desired video. Supports English and Chinese; describe the subject, action, camera motion and style clearly for best results." },
  { name: "resolution", type: "string", required: false, desc: "Resolution tier: 720P (default) or 1080P. Different tiers have different prices." },
  { name: "ratio", type: "string", required: false, desc: "Aspect ratio. Allowed values: 16:9 (default), 9:16, 1:1, 4:3, 3:4. Some models support only a subset." },
  { name: "duration", type: "integer", required: false, desc: "Video duration in seconds, range [3, 15], default 5. Exact range depends on the model." },
  { name: "img_url", type: "string", required: false, desc: "URL of the first-frame reference image (JPG/PNG/WEBP, ≤10MB). Required for image-to-video mode." },
  { name: "watermark", type: "boolean", required: false, desc: "Whether to add a watermark, default true." },
  { name: "seed", type: "integer", required: false, desc: "Random seed in [0, 2147483647]; a fixed seed improves reproducibility." },
];

const curlExamples: Record<TabKey, string> = {
  t2v: `# Step 1: Create a text-to-video task
curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wan2.6-t2v",
    "prompt": "A coastal city at dusk, slow camera push-in, cinematic natural light, refined realistic style",
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 5
  }'

# Returns → { "id": "task_abc123...", "status": "running", ... }

# Step 2: Poll for the result (recommended interval: 10-15 seconds)
curl ${API_BASE}/v1/tasks/task_abc123 \\
  -H "Authorization: Bearer $API_KEY"

# Returns → { "status": "succeeded", "output": { "video_url": "https://..." }, ... }`,
  i2v: `# Step 1: Create an image-to-video task
curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wan2.6-i2v",
    "img_url": "https://example.com/first-frame.jpg",
    "prompt": "The character slowly turns around, hair blowing in the sea breeze, camera held in medium close-up",
    "resolution": "720P",
    "duration": 8
  }'

# Returns → { "id": "task_abc123...", "status": "running", ... }

# Step 2: Poll for the result (recommended interval: 10-15 seconds)
curl ${API_BASE}/v1/tasks/task_abc123 \\
  -H "Authorization: Bearer $API_KEY"

# Returns → { "status": "succeeded", "output": { "video_url": "https://..." }, ... }`,
};

const pythonExamples: Record<TabKey, string> = {
  t2v: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# Step 1: Create a text-to-video task
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "wan2.6-t2v",
        "prompt": "A coastal city at dusk, slow camera push-in, cinematic natural light, refined realistic style",
        "resolution": "1080P",
        "ratio": "16:9",
        "duration": 5,
    },
).json()

task_id = response["id"]
print(f"Task created: {task_id}")  # → task_abc123xxx

# Step 2: Poll for the result (recommended interval: 10-15 seconds)
while True:
    result = requests.get(
        f"{BASE}/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"},
    ).json()

    print(f"Status: {result['status']}, progress: {result.get('progress', 0)}%")

    if result["status"] == "succeeded":
        video_url = result["output"]["video_url"]
        print(f"Generation complete! Video URL: {video_url}")
        break
    elif result["status"] == "failed":
        print(f"Generation failed: {result.get('error')}")
        break

    time.sleep(10)`,
  i2v: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# Step 1: Create an image-to-video task
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "wan2.6-i2v",
        "img_url": "https://example.com/first-frame.jpg",
        "prompt": "The character slowly turns around, hair blowing in the sea breeze, camera held in medium close-up",
        "resolution": "720P",
        "duration": 8,
    },
).json()

task_id = response["id"]
print(f"Task created: {task_id}")

# Step 2: Poll for the result (recommended interval: 10-15 seconds)
while True:
    result = requests.get(
        f"{BASE}/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"},
    ).json()

    print(f"Status: {result['status']}, progress: {result.get('progress', 0)}%")

    if result["status"] == "succeeded":
        video_url = result["output"]["video_url"]
        print(f"Generation complete! Video URL: {video_url}")
        break
    elif result["status"] == "failed":
        print(f"Generation failed: {result.get('error')}")
        break

    time.sleep(10)`,
};

export default function VideosApiPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("t2v");
  const [codeLang, setCodeLang] = useState<"curl" | "python">("curl");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <span style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 5,
          background: "#eff6ff", color: "#1d4ed8", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.5px", marginBottom: 12,
        }}>
          VIDEO / Generation
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Video Generation API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          A unified video generation endpoint that supports multiple models including Wan, HappyHorse, and PixVerse. The API is asynchronous: first create a task to obtain a task_id, then poll for the result. Video generation typically takes 1-5 minutes.
        </p>
      </div>

      {/* HTTP Flow */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>HTTP Workflow</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {[
            { step: "1", title: "Create the task to obtain task_id", method: "POST", endpoint: "/v1/tasks" },
            { step: "2", title: "Poll for the result by task_id", method: "GET", endpoint: "/v1/tasks/{task_id}" },
          ].map((s) => (
            <div key={s.step} style={{
              flex: 1, minWidth: 280, padding: 18, border: "1px solid var(--border)",
              borderRadius: 10, background: "var(--bg-elevated)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", background: "var(--accent-bg)",
                  color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700,
                }}>{s.step}</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{s.title}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                  background: s.method === "POST" ? "#dbeafe" : "#dcfce7",
                  color: s.method === "POST" ? "#1d4ed8" : "#16a34a",
                }}>{s.method}</span>
                <code style={{ fontSize: 13 }}>{API_BASE}{s.endpoint}</code>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Supported Models */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Supported Models</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Model ID</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Provider</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Mode</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>720P Price</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>1080P Price</th>
              </tr>
            </thead>
            <tbody>
              {supportedModels.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 12 }}>{m.id}</code>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{m.provider}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{m.mode}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--accent)", fontWeight: 600 }}>{m.price720}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--accent)", fontWeight: 600 }}>{m.price1080}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 10, lineHeight: 1.6 }}>
          Pricing is per output-video duration (e.g. 720P × 5 seconds = unit price × 5). Only successful tasks are charged; failed tasks are free.
        </p>
      </section>

      {/* Important Notes */}
      <section style={{ marginBottom: 36 }}>
        <div style={{
          padding: 16, background: "#fffbeb", border: "1px solid #fcd34d",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#92400e",
        }}>
          <strong>Notes:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>Video generation is asynchronous only; no synchronous endpoint is provided. After creating a task, poll the result using <code>id</code> (the task_id); <strong>do not create duplicate tasks</strong>.</li>
            <li>Recommended polling interval is <strong>10-15 seconds</strong>, with exponential backoff on failures.</li>
            <li>task_id queries are valid for <strong>24 hours</strong>; queries are unavailable after that.</li>
            <li>Video URLs are valid for 24 hours; download and persist them immediately.</li>
          </ul>
        </div>
      </section>

      {/* Request Params */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Request Parameters</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Parameter</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 70 }}>Type</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 50 }}>Required</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {requestParams.map((p, i) => (
                <tr key={p.name} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 12 }}>{p.name}</code>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12 }}>{p.type}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    {p.required ? <span style={{ color: "#dc2626", fontWeight: 600 }}>*</span> : "-"}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Code Examples */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Code Examples</h2>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                border: activeTab === tab.key ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                background: activeTab === tab.key ? "var(--accent-bg)" : "var(--bg)",
                color: activeTab === tab.key ? "var(--accent)" : "var(--text-secondary)",
                transition: "all 0.15s", fontFamily: "inherit",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Language switcher */}
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {(["curl", "python"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setCodeLang(lang)}
              style={{
                padding: "5px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit",
                background: codeLang === lang ? "var(--text-primary)" : "var(--bg)",
                color: codeLang === lang ? "var(--bg)" : "var(--text-secondary)",
                transition: "all 0.15s",
              }}
            >
              {lang === "curl" ? "cURL" : "Python (full flow)"}
            </button>
          ))}
        </div>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={codeLang === "curl" ? curlExamples[activeTab] : pythonExamples[activeTab]} />
        </div>
      </section>

      {/* Response: Step 1 */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Step 1 Response: Receive task_id</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          On successful creation, the response includes the task information. <code>id</code> is the task_id used for subsequent queries.
        </p>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={`{
  "id": "task_0385dc79-5ff8-4d82-xxxx",
  "object": "task",
  "status": "running",
  "model": "wan2.6-t2v",
  "type": "video",
  "created_at": "2026-06-01T10:00:00.000Z"
}`} />
        </div>

        {/* Response fields */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Field</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["id", "Task ID (task_id), used to query the result. Valid for 24 hours."],
                ["object", "Always \"task\"."],
                ["status", "Initial status is running."],
                ["model", "The model ID used."],
                ["type", "Task type; for video generation, always \"video\"."],
                ["created_at", "Task creation time (ISO 8601)."],
              ].map(([field, desc], i) => (
                <tr key={field} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code style={{ fontSize: 12 }}>{field}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Response: Step 2 — Polling */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Step 2: Poll for the Result by task_id</h2>

        <div style={{
          padding: "10px 16px", background: "var(--bg-elevated)", borderRadius: 8,
          border: "1px solid var(--border)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: "#dcfce7", color: "#16a34a",
          }}>GET</span>
          <code style={{ fontSize: 13 }}>{API_BASE}/v1/tasks/{"{task_id}"}</code>
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Query Request</h3>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={`curl ${API_BASE}/v1/tasks/task_0385dc79-5ff8-4d82-xxxx \\
  -H "Authorization: Bearer $API_KEY"`} />
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Task Succeeded</h3>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={`{
  "id": "task_0385dc79-5ff8-4d82-xxxx",
  "object": "task",
  "status": "succeeded",
  "model": "wan2.6-t2v",
  "type": "video",
  "progress": 100,
  "output": {
    "video_url": "https://dashscope-result.oss-cn-beijing.aliyuncs.com/xxx.mp4"
  },
  "created_at": "2026-06-01T10:00:00.000Z",
  "completed_at": "2026-06-01T10:02:36.000Z"
}`} />
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Task Failed</h3>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={`{
  "id": "task_0385dc79-5ff8-4d82-xxxx",
  "object": "task",
  "status": "failed",
  "model": "wan2.6-t2v",
  "type": "video",
  "error": "InvalidParameter: The parameter is invalid.",
  "created_at": "2026-06-01T10:00:00.000Z",
  "completed_at": "2026-06-01T10:00:05.000Z"
}`} />
        </div>

        {/* Response fields table */}
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Response Fields</h3>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Field</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 70 }}>Type</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["id", "string", "Task ID."],
                ["status", "string", "Task status: pending (queued) → running (in progress) → succeeded / failed."],
                ["progress", "integer", "Task progress percentage 0-100."],
                ["output.video_url", "string", "URL of the generated video (returned only when succeeded). MP4, valid for 24 hours."],
                ["error", "string", "Failure reason (returned only when failed)."],
                ["created_at", "string", "Task creation time."],
                ["completed_at", "string", "Task completion time (returned only in terminal state)."],
              ].map(([field, type, desc], i) => (
                <tr key={field} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><code style={{ fontSize: 12 }}>{field}</code></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12 }}>{type}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Related Links */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/happyhorse", label: "HappyHorse API", desc: "HappyHorse model-specific API documentation" },
          { href: "/docs/api/tasks", label: "Async Tasks API", desc: "General async tasks API documentation" },
          { href: "/pricing", label: "Full Pricing", desc: "View pricing for all models" },
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
