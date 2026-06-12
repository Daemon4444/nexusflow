"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type TabKey = "image" | "video";

const tabs: { key: TabKey; label: string; model: string; type: string }[] = [
  { key: "image", label: "Image Generation", model: "wan2.6-t2i", type: "image" },
  { key: "video", label: "Video Generation", model: "happyhorse-1.0-t2v", type: "video" },
];

const requestParams: Record<TabKey, { name: string; type: string; required: boolean; desc: string }[]> = {
  image: [
    { name: "model", type: "string", required: true, desc: "Model ID, e.g. wan2.6-t2i. See model docs for the full list." },
    { name: "prompt", type: "string", required: true, desc: "Text prompt describing the desired image." },
    { name: "negative_prompt", type: "string", required: false, desc: "Negative prompt describing content you do not want to appear." },
    { name: "size", type: "string", required: false, desc: "Output image dimensions, e.g. 1024x1024 (default), 720x1280, 1280x720." },
    { name: "n", type: "integer", required: false, desc: "Number of images to generate, default 1, max 4." },
    { name: "seed", type: "integer", required: false, desc: "Random seed; a fixed seed improves reproducibility." },
  ],
  video: [
    { name: "model", type: "string", required: true, desc: "Model ID, e.g. happyhorse-1.0-t2v. See model docs for the full list." },
    { name: "prompt", type: "string", required: true, desc: "Text prompt describing the desired video. Supports English and Chinese." },
    { name: "resolution", type: "string", required: false, desc: "Resolution tier: 720P (default) or 1080P. Affects pricing." },
    { name: "ratio", type: "string", required: false, desc: "Aspect ratio, e.g. 16:9 (default), 9:16, 1:1, 4:3, 3:4." },
    { name: "duration", type: "integer", required: false, desc: "Video duration in seconds; range varies by model. Default 5." },
    { name: "img_url", type: "string", required: false, desc: "URL of the first-frame reference image (required for image-to-video models)." },
    { name: "watermark", type: "boolean", required: false, desc: "Whether to add a watermark, default true." },
    { name: "seed", type: "integer", required: false, desc: "Random seed in [0, 2147483647]." },
  ],
};

const curlExamples: Record<TabKey, string> = {
  image: `curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wan2.6-t2i",
    "prompt": "An orange cat standing on the surface of the moon with Earth in the background, cyberpunk style, 4K ultra HD",
    "size": "1024x1024",
    "n": 1
  }'`,
  video: `curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "happyhorse-1.0-t2v",
    "prompt": "A miniature city built from cardboard and bottle caps comes to life at night. A cardboard train slowly passes through.",
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 5
  }'`,
};

const pythonExamples: Record<TabKey, string> = {
  image: `import requests

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# wan2.6-t2i is a synchronous endpoint and returns the result directly
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "wan2.6-t2i",
        "prompt": "An orange cat standing on the surface of the moon with Earth in the background, cyberpunk style, 4K ultra HD",
        "size": "1024x1024",
        "n": 1,
    },
).json()

# Synchronous response, no polling required
if response["status"] == "succeeded":
    image_url = response["output"]["image_url"]
    print(f"Generation complete! Image URL: {image_url}")
else:
    print(f"Generation failed: {response.get('error')}")`,
  video: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# Step 1: Create a video generation task
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "happyhorse-1.0-t2v",
        "prompt": "A miniature city built from cardboard and bottle caps comes to life at night.",
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
};

export default function TasksApiPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("image");
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
          Async Tasks
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Async Tasks API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          Image and video generation are unified under <code>/v1/tasks</code>. Video models are asynchronous (create the task to obtain task_id and then poll for the result), while image models (such as wan2.6-t2i) are synchronous and return the result directly without polling. Video generation typically takes 1-5 minutes.
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

        {/* Important notes */}
        <div style={{
          padding: 16, background: "#fffbeb", border: "1px solid #fcd34d",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#92400e",
        }}>
          <strong>Notes:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>After successful creation, query the result using the returned <code>id</code> (the task_id). <strong>Do not create duplicate tasks</strong>—just poll.</li>
            <li><strong>Image models</strong> (such as wan2.6-t2i) are synchronous: the create request returns the result directly with no polling required.</li>
            <li>For <strong>video models</strong>, recommended polling interval is <strong>10-15 seconds</strong>.</li>
            <li>task_id queries are valid for <strong>24 hours</strong>; queries are unavailable after that.</li>
            <li>Output file URLs are valid for 24 hours; download and persist them immediately after the task completes.</li>
            <li>Only image and video models support <code>/v1/tasks</code>; chat models should use <code>/v1/chat/completions</code>.</li>
          </ul>
        </div>
      </section>

      {/* Step 1: Create task */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Step 1: Create the Task</h2>
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

        {/* Model ID display */}
        <div style={{
          padding: "10px 16px", background: "var(--bg-elevated)", borderRadius: 8,
          border: "1px solid var(--border)", marginBottom: 20, display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600 }}>Example model:</span>
          <code style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            {tabs.find(t => t.key === activeTab)?.model}
          </code>
        </div>

        {/* Request params table */}
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Request Parameters</h3>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
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
              {requestParams[activeTab].map((p, i) => (
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

        {/* Code examples */}
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Request Example</h3>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {(["curl", "python"] as const).map(lang => (
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

      {/* Step 1 Response */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Step 1 Response: Receive task_id</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          On successful creation, the response (HTTP 202) includes the task information; <code>id</code> is the task_id used for subsequent polling.
        </p>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={`{
  "id": "task_0385dc79-5ff8-4d82-xxxx",
  "object": "task",
  "status": "running",
  "model": "${tabs.find(t => t.key === activeTab)?.model}",
  "type": "${tabs.find(t => t.key === activeTab)?.type}",
  "created_at": "2026-06-01T10:00:00.000Z"
}`} />
        </div>

        {/* Response params */}
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
                ["id", "Task ID (task_id). For video tasks, used to poll for the result; valid for 24 hours."],
                ["object", "Always \"task\"."],
                ["status", "Initial status is running for video models; image models (e.g. wan2.6-t2i) are synchronous and return succeeded directly."],
                ["model", "The model ID used."],
                ["type", "Task type: \"image\" (image generation) or \"video\" (video generation)."],
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

      {/* Step 2: Polling */}
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

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
          {activeTab === "image" ? "Image Task Succeeded" : "Video Task Succeeded"}
        </h3>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={activeTab === "image" ? `{
  "id": "task_0385dc79-5ff8-4d82-xxxx",
  "object": "task",
  "status": "succeeded",
  "model": "wan2.6-t2i",
  "type": "image",
  "progress": 100,
  "output": {
    "image_url": "https://dashscope-result.oss-cn-beijing.aliyuncs.com/xxx.png"
  },
  "created_at": "2026-06-01T10:00:00.000Z",
  "completed_at": "2026-06-01T10:00:22.000Z"
}` : `{
  "id": "task_0385dc79-5ff8-4d82-xxxx",
  "object": "task",
  "status": "succeeded",
  "model": "happyhorse-1.0-t2v",
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
  "model": "${tabs.find(t => t.key === activeTab)?.model}",
  "type": "${tabs.find(t => t.key === activeTab)?.type}",
  "error": "InvalidParameter: The parameter is invalid.",
  "created_at": "2026-06-01T10:00:00.000Z",
  "completed_at": "2026-06-01T10:00:05.000Z"
}`} />
        </div>

        {/* Response fields */}
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
                ["object", "string", "Always \"task\"."],
                ["status", "string", "Task status: pending (queued) → running (in progress) → succeeded / failed."],
                ["model", "string", "The model ID used."],
                ["type", "string", "Task type: \"image\" or \"video\"."],
                ["progress", "integer", "Task progress percentage 0-100."],
                ["output", "object", "Generated result (returned only when succeeded). Image tasks include image_url; video tasks include video_url. Links are valid for 24 hours."],
                ["error", "string", "Failure reason (returned only when failed)."],
                ["created_at", "string", "Task creation time (ISO 8601)."],
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

      {/* List tasks */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>List Tasks</h2>

        <div style={{
          padding: "10px 16px", background: "var(--bg-elevated)", borderRadius: 8,
          border: "1px solid var(--border)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: "#dcfce7", color: "#16a34a",
          }}>GET</span>
          <code style={{ fontSize: 13 }}>{API_BASE}/v1/tasks</code>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 8 }}>?limit=20</span>
        </div>

        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          Retrieve recent tasks for the current user. Use the <code>limit</code> parameter to control the number returned (default 20, max 100).
        </p>

        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 16 }}>
          <DocsCodeBlock code={`curl '${API_BASE}/v1/tasks?limit=5' \\
  -H "Authorization: Bearer $API_KEY"`} />
        </div>

        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={`{
  "object": "list",
  "data": [
    {
      "id": "task_0385dc79-5ff8-4d82-xxxx",
      "object": "task",
      "status": "succeeded",
      "model": "wan2.6-t2i",
      "type": "image",
      "progress": 100,
      "created_at": "2026-06-01T10:00:00.000Z",
      "completed_at": "2026-06-01T10:00:22.000Z"
    },
    {
      "id": "task_a1b2c3d4-e5f6-7890-yyyy",
      "object": "task",
      "status": "running",
      "model": "happyhorse-1.0-t2v",
      "type": "video",
      "progress": 45,
      "created_at": "2026-06-01T10:05:00.000Z",
      "completed_at": null
    }
  ]
}`} />
        </div>
      </section>

      {/* Best practices */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Best Practices</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {[
            { title: "Back off when polling", desc: "Poll image tasks every 5-10 seconds and video tasks every 10-15 seconds; avoid sub-second polling to reduce unnecessary requests." },
            { title: "Separate sync and async paths", desc: "Send chat requests to /v1/chat/completions and image/video requests to /v1/tasks to reduce cross-traffic interference." },
            { title: "Download results promptly", desc: "Output URLs are valid for 24 hours; download and persist files immediately after the task completes." },
            { title: "Handle failure retries", desc: "On failure, inspect the error field. Parameter errors must be fixed before retrying; upstream timeouts can be retried by creating a new task." },
          ].map((item) => (
            <div key={item.title} style={{ padding: 18, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Links */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/happyhorse", label: "HappyHorse API", desc: "HappyHorse video generation specific docs" },
          { href: "/docs/api/limits", label: "Rate Limits", desc: "Limits and tuning for high-concurrency scenarios" },
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
