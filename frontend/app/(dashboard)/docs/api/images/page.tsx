"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

const requestParams = [
  { name: "model", type: "string", required: true, desc: "Fixed value: wan2.6-t2i" },
  { name: "prompt", type: "string", required: true, desc: "Image description text, supports English and Chinese. More detailed descriptions yield better results. Up to 2500 Chinese characters." },
  { name: "size", type: "string", required: false, desc: "Image size. Options: 1024x1024 (default), 768x1024, 1024x768, 720x1280, 1280x720." },
  { name: "n", type: "integer", required: false, desc: "Number of images to generate, range 1-4, default 1." },
  { name: "negative_prompt", type: "string", required: false, desc: "Negative prompt describing elements you do not want in the image." },
  { name: "seed", type: "integer", required: false, desc: "Random seed [0, 2147483647]; fixing the seed improves reproducibility." },
];

const curlExample = `curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wan2.6-t2i",
    "prompt": "A cute orange cat napping in the sunlight, watercolor style, warm tones",
    "size": "1024x1024",
    "n": 1
  }'

# The response returns the result directly (no polling needed):
# {
#   "id": "4b0a0920-...",
#   "object": "task",
#   "status": "succeeded",
#   "model": "wan2.6-t2i",
#   "type": "image",
#   "output": {
#     "type": "image",
#     "image_url": "https://nexusflow.hk/storage/xxx.png",
#     "images": ["https://...png"]
#   },
#   "created_at": "2026-06-01T10:00:00.000Z",
#   "completed_at": "2026-06-01T10:00:10.000Z"
# }`;

const pythonExample = `import requests

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "wan2.6-t2i",
        "prompt": "A cute orange cat napping in the sunlight, watercolor style, warm tones",
        "size": "1024x1024",
        "n": 1,
    },
).json()

# wan2.6-t2i is a synchronous endpoint that returns results directly, no polling needed
if response["status"] == "succeeded":
    image_url = response["output"]["image_url"]
    print(f"Generation complete! Image URL: {image_url}")
else:
    print(f"Generation failed: {response.get('error')}")`;

export default function ImagesApiPage() {
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
          Wan 2.6 (Alibaba)
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Image Generation API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          The Wan 2.6 text-to-image model generates high-quality images from a text description. The API is a <strong>synchronous endpoint</strong>: it returns the result directly after the request, no polling needed. It typically takes 8-15 seconds.
        </p>
      </div>

      {/* HTTP Flow */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Endpoint Info</h2>
        <div style={{
          padding: 18, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{
              padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
              background: "#dbeafe", color: "#1d4ed8",
            }}>POST</span>
            <code style={{ fontSize: 13 }}>{API_BASE}/v1/tasks</code>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Synchronous call — the image URL is returned directly when the request completes, with no extra query. The <code>status</code> in the response is immediately <code>&quot;succeeded&quot;</code>.
          </div>
        </div>
        <div style={{ marginTop: 12, padding: 16, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{
              padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
              background: "#dbeafe", color: "#1d4ed8",
            }}>POST</span>
            <code style={{ fontSize: 13 }}>{API_BASE}/v1/images/generations</code>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            An OpenAI-style image generation endpoint is also supported, ideal for reusing the OpenAI SDK's <code>images.generate</code> call; for new integrations, prefer the unified task API <code>/v1/tasks</code>.
          </div>
        </div>
      </section>

      {/* Supported models */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Supported Models</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Model ID</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Name</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Supported Sizes</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Call Type</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Price</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--bg)" }}>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                  <code style={{ fontSize: 13, fontWeight: 600 }}>wan2.6-t2i</code>
                </td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>Wan 2.6 Text-to-Image</td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-secondary)" }}>1024x1024, 768x1024, 1024x768, 720x1280, 1280x720</td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "#dcfce7", color: "#16a34a" }}>Sync</span>
                </td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "right", color: "var(--accent)", fontWeight: 600 }}>$0.20 / image</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Important notes */}
      <section style={{ marginBottom: 36 }}>
        <div style={{
          padding: 16, background: "#f0fdf4", border: "1px solid #86efac",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#166534",
        }}>
          <strong>About the synchronous endpoint:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>wan2.6-t2i is synchronous: it <strong>returns the result directly</strong> after the request, no polling needed.</li>
            <li>Requests typically take 8-15 seconds, so make sure your client timeout is high enough (recommended &gt; 30 seconds).</li>
            <li>Image URLs are valid for 24 hours; download and save them immediately.</li>
            <li>Billed by the number of images generated (e.g. n=4 costs $0.80); only successful tasks are billed.</li>
          </ul>
        </div>
      </section>

      {/* Request params table */}
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

      {/* Code examples */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Full Usage Example</h2>
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
              {lang === "curl" ? "cURL" : "Python"}
            </button>
          ))}
        </div>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={codeLang === "curl" ? curlExample : pythonExample} />
        </div>
      </section>

      {/* Response */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Response Examples</h2>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Success Response</h3>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={`{
  "id": "4b0a0920-ce86-4fbe-81cc-55e3b89a6ed1",
  "object": "task",
  "status": "succeeded",
  "model": "wan2.6-t2i",
  "type": "image",
  "output": {
    "type": "image",
    "image_url": "https://nexusflow.hk/storage/xxx.png",
    "images": [
      "https://nexusflow.hk/storage/xxx.png"
    ]
  },
  "created_at": "2026-06-01T10:00:00.000Z",
  "completed_at": "2026-06-01T10:00:10.000Z"
}`} />
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Error Response</h3>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={`{
  "error": {
    "message": "InvalidParameter: prompt is empty",
    "type": "upstream_error",
    "code": "upstream_error"
  }
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
                ["status", "string", "The synchronous endpoint returns \"succeeded\" directly, or failure info via the error object."],
                ["output.image_url", "string", "Generated image URL (the first one). PNG format, link valid for 24 hours."],
                ["output.images", "array", "Array of all generated image URLs (multiple when n > 1)."],
                ["created_at", "string", "Task creation time (ISO 8601 format)."],
                ["completed_at", "string", "Task completion time."],
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

      {/* Pricing */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Billing</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Model</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Unit Price</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--bg)" }}>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>wan2.6-t2i</td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--accent)", fontWeight: 600 }}>$0.20 / image</td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>Billed by the number of images generated (e.g. n=4 costs $0.80). Only successful tasks are billed; failed tasks are not charged.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Links */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/videos", label: "Video Generation API", desc: "View the text-to-video API documentation" },
          { href: "/docs/api/tasks", label: "Async Tasks API", desc: "General async task API documentation" },
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
