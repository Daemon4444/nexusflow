"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://nexusflow.hk";

type TabKey = "t2v" | "i2v" | "kf2v" | "r2v";

const tabs: { key: TabKey; label: string; desc: string }[] = [
  { key: "t2v", label: "Text-to-Video", desc: "Generate a video from a text prompt" },
  { key: "i2v", label: "Image-to-Video (first frame)", desc: "Generate a video from an input image and a text prompt" },
  { key: "kf2v", label: "Image-to-Video (first/last frame)", desc: "Generate a transition video from a first frame, last frame, and text prompt" },
  { key: "r2v", label: "Reference-to-Video", desc: "Generate a video from multiple reference images and a text prompt" },
];

const models: Record<TabKey, string> = {
  t2v: "pixverse-v6",
  i2v: "pixverse-v6",
  kf2v: "pixverse-v6",
  r2v: "pixverse-v6",
};

const curlExamples: Record<TabKey, string> = {
  t2v: `curl --location '${API_BASE}/v1/services/aigc/video-generation/video-synthesis' \\
  -H 'X-DashScope-Async: enable' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{
  "model": "pixverse-v6",
  "input": {
    "prompt": "A kitten running in the moonlight"
  },
  "parameters": {
    "size": "1280*720",
    "duration": 5,
    "audio": false,
    "watermark": false
  }
}'`,
  i2v: `curl --location '${API_BASE}/v1/services/aigc/video-generation/video-synthesis' \\
  -H 'X-DashScope-Async: enable' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{
  "model": "pixverse-v6",
  "input": {
    "media": [
      {
        "type": "image_url",
        "url": "https://example.com/your-image.jpg"
      }
    ],
    "prompt": "Bring the scene in the image to life"
  },
  "parameters": {
    "resolution": "720P",
    "duration": 5,
    "audio": false,
    "watermark": false
  }
}'`,
  kf2v: `curl --location '${API_BASE}/v1/services/aigc/video-generation/video-synthesis' \\
  -H 'X-DashScope-Async: enable' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{
  "model": "pixverse-v6",
  "input": {
    "media": [
      {
        "type": "first_frame",
        "url": "https://example.com/first-frame.png"
      },
      {
        "type": "last_frame",
        "url": "https://example.com/last-frame.png"
      }
    ],
    "prompt": "The kitten jumps off the windowsill, lands on the sofa, and curiously looks around"
  },
  "parameters": {
    "resolution": "720P",
    "duration": 5,
    "audio": false,
    "watermark": false
  }
}'`,
  r2v: `curl --location '${API_BASE}/v1/services/aigc/video-generation/video-synthesis' \\
  -H 'X-DashScope-Async: enable' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{
  "model": "pixverse-v6",
  "input": {
    "media": [
      { "type": "image_url", "url": "https://example.com/ref1.jpg" },
      { "type": "image_url", "url": "https://example.com/ref2.jpg" }
    ],
    "prompt": "A man sits on a chair by the window playing country folk on a guitar"
  },
  "parameters": {
    "size": "1280*720",
    "duration": 5,
    "audio": false,
    "watermark": false
  }
}'`,
};

const pythonExamples: Record<TabKey, string> = {
  t2v: `import time, requests

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# Step 1: Create the task
response = requests.post(
    f"{BASE}/v1/services/aigc/video-generation/video-synthesis",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable"
    },
    json={
        "model": "pixverse-v6",
        "input": {"prompt": "A kitten running in the moonlight"},
        "parameters": {"size": "1280*720", "duration": 5}
    }
)
task_id = response.json()["output"]["task_id"]
print(f"Task created: {task_id}")

# Step 2: Poll for the result
while True:
    result = requests.get(
        f"{BASE}/v1/video/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"}
    ).json()
    status = result["output"]["task_status"]
    print(f"Status: {status}")
    if status == "SUCCEEDED":
        print(f"Video URL: {result['output']['video_url']}")
        break
    elif status == "FAILED":
        print(f"Failed: {result['output'].get('message')}")
        break
    time.sleep(15)`,
  i2v: `import time, requests

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# Step 1: Create an image-to-video task
response = requests.post(
    f"{BASE}/v1/services/aigc/video-generation/video-synthesis",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable"
    },
    json={
        "model": "pixverse-v6",
        "input": {
            "media": [{"type": "image_url", "url": "https://example.com/image.jpg"}],
            "prompt": "Bring the scene in the image to life"
        },
        "parameters": {"resolution": "720P", "duration": 5}
    }
)
task_id = response.json()["output"]["task_id"]

# Step 2: Poll for the result
while True:
    result = requests.get(
        f"{BASE}/v1/video/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"}
    ).json()
    status = result["output"]["task_status"]
    if status == "SUCCEEDED":
        print(f"Video: {result['output']['video_url']}")
        break
    elif status == "FAILED":
        print(f"Failed: {result['output'].get('message')}")
        break
    time.sleep(15)`,
  kf2v: `import time, requests

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# Step 1: Create a first/last-frame video task
response = requests.post(
    f"{BASE}/v1/services/aigc/video-generation/video-synthesis",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable"
    },
    json={
        "model": "pixverse-v6",
        "input": {
            "media": [
                {"type": "first_frame", "url": "https://example.com/first.png"},
                {"type": "last_frame", "url": "https://example.com/last.png"}
            ],
            "prompt": "The kitten jumps from the windowsill onto the sofa"
        },
        "parameters": {"resolution": "720P", "duration": 5}
    }
)
task_id = response.json()["output"]["task_id"]

# Step 2: Poll for the result
while True:
    result = requests.get(
        f"{BASE}/v1/video/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"}
    ).json()
    status = result["output"]["task_status"]
    if status == "SUCCEEDED":
        print(f"Video: {result['output']['video_url']}")
        break
    elif status in ("FAILED", "UNKNOWN"):
        print(f"Failed: {result['output'].get('message', 'Unknown error')}")
        break
    time.sleep(15)`,
  r2v: `import time, requests

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# Step 1: Create a reference-to-video task (up to 7 reference images)
response = requests.post(
    f"{BASE}/v1/services/aigc/video-generation/video-synthesis",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable"
    },
    json={
        "model": "pixverse-v6",
        "input": {
            "media": [
                {"type": "image_url", "url": "https://example.com/ref1.jpg"},
                {"type": "image_url", "url": "https://example.com/ref2.jpg"}
            ],
            "prompt": "A man sits by the window playing the guitar"
        },
        "parameters": {"size": "1280*720", "duration": 5}
    }
)
task_id = response.json()["output"]["task_id"]

# Step 2: Poll for the result
while True:
    result = requests.get(
        f"{BASE}/v1/video/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"}
    ).json()
    status = result["output"]["task_status"]
    if status == "SUCCEEDED":
        print(f"Video: {result['output']['video_url']}")
        break
    elif status in ("FAILED", "UNKNOWN"):
        break
    time.sleep(15)`,
};

const requestParams: Record<TabKey, { name: string; type: string; required: boolean; desc: string }[]> = {
  t2v: [
    { name: "model", type: "string", required: true, desc: "Fixed value: pixverse-v6" },
    { name: "input.prompt", type: "string", required: true, desc: "Text prompt; supports English and Chinese, up to 5000 characters. Multi-shot descriptions are supported (Shot 1: ... Shot 2: ...)." },
    { name: "parameters.size", type: "string", required: true, desc: "Video resolution (width*height), e.g. 1280*720, 1920*1080" },
    { name: "parameters.duration", type: "integer", required: true, desc: "Video duration (seconds). v6 supports 1-15 seconds." },
    { name: "parameters.audio", type: "boolean", required: false, desc: "Whether to generate a video with audio (AI dubbing/sound effects). Default false." },
    { name: "parameters.watermark", type: "boolean", required: false, desc: "Whether to add a watermark. Default false." },
    { name: "parameters.seed", type: "integer", required: false, desc: "Random seed in [0, 2147483647]; a fixed seed improves reproducibility." },
    { name: "parameters.shot_type", type: "string", required: false, desc: "Shot type: single (default) or multi." },
    { name: "parameters.style", type: "string", required: false, desc: "Visual style: anime / cyberpunk / comic / clay / 3d_animation" },
    { name: "parameters.camera_movement", type: "string", required: false, desc: "Camera motion: zoom_in / zoom_out / horizontal_left / horizontal_right / crane_up / crane_down, etc." },
  ],
  i2v: [
    { name: "model", type: "string", required: true, desc: "Fixed value: pixverse-v6" },
    { name: "input.media[0].type", type: "string", required: true, desc: 'Fixed value: "image_url"' },
    { name: "input.media[0].url", type: "string", required: true, desc: "Image URL (JPG/PNG/WEBP, ≤20MB, dimensions ≤10000px)" },
    { name: "input.prompt", type: "string", required: false, desc: "Text prompt describing the video motion" },
    { name: "parameters.resolution", type: "string", required: true, desc: "Resolution tier: 360P / 540P / 720P / 1080P" },
    { name: "parameters.duration", type: "integer", required: true, desc: "Video duration (seconds). 360P-720P: 5/8/10; 1080P: 5/8" },
    { name: "parameters.audio", type: "boolean", required: false, desc: "Whether to generate a video with audio. Default false." },
    { name: "parameters.watermark", type: "boolean", required: false, desc: "Whether to add a watermark. Default false." },
    { name: "parameters.seed", type: "integer", required: false, desc: "Random seed in [0, 2147483647]" },
  ],
  kf2v: [
    { name: "model", type: "string", required: true, desc: "Fixed value: pixverse-v6" },
    { name: "input.media", type: "array", required: true, desc: "Array of two elements: type=first_frame and type=last_frame" },
    { name: "input.media[].type", type: "string", required: true, desc: '"first_frame" or "last_frame"' },
    { name: "input.media[].url", type: "string", required: true, desc: "Image URL (JPG/PNG/WEBP, ≤20MB, dimensions ≤10000px)" },
    { name: "input.prompt", type: "string", required: true, desc: "Describe the transition from first frame to last frame" },
    { name: "parameters.resolution", type: "string", required: true, desc: "Resolution tier: 360P / 540P / 720P / 1080P" },
    { name: "parameters.duration", type: "integer", required: true, desc: "Video duration (seconds). 360P-720P: 5/8/10; 1080P: 5/8" },
    { name: "parameters.audio", type: "boolean", required: false, desc: "Whether to generate a video with audio. Default false." },
    { name: "parameters.watermark", type: "boolean", required: false, desc: "Whether to add a watermark. Default false." },
    { name: "parameters.seed", type: "integer", required: false, desc: "Random seed in [0, 2147483647]" },
  ],
  r2v: [
    { name: "model", type: "string", required: true, desc: "Fixed value: pixverse-v6" },
    { name: "input.media", type: "array", required: true, desc: "Array of reference images, up to 7" },
    { name: "input.media[].type", type: "string", required: true, desc: 'Fixed value: "image_url"' },
    { name: "input.media[].url", type: "string", required: true, desc: "Image URL (JPG/PNG/WEBP, ≤20MB)" },
    { name: "input.prompt", type: "string", required: true, desc: "Describe the video content and scene" },
    { name: "parameters.size", type: "string", required: true, desc: "Video resolution (width*height), e.g. 1280*720" },
    { name: "parameters.duration", type: "integer", required: true, desc: "Video duration (seconds). 360P-720P: 5/8/10; 1080P: 5/8" },
    { name: "parameters.audio", type: "boolean", required: false, desc: "Whether to generate a video with audio. Default false." },
    { name: "parameters.watermark", type: "boolean", required: false, desc: "Whether to add a watermark. Default false." },
    { name: "parameters.seed", type: "integer", required: false, desc: "Random seed in [0, 2147483647]" },
  ],
};

const sizeTable = [
  { tier: "360P", ratios: ["640*360", "640*480", "640*640", "480*640", "360*640"] },
  { tier: "540P", ratios: ["1024*576", "1024*768", "1024*1024", "768*1024", "576*1024"] },
  { tier: "720P", ratios: ["1280*720", "1280*960", "1280*1280", "960*1280", "720*1280"] },
  { tier: "1080P", ratios: ["1920*1080", "1920*1440", "1808*1808", "1440*1920", "1080*1920"] },
];

const aspectLabels = ["16:9", "4:3", "1:1", "3:4", "9:16"];

function PixVerseDocsInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const validTabs: TabKey[] = ["t2v", "i2v", "kf2v", "r2v"];
  const initialTab = validTabs.includes(tabParam as TabKey) ? (tabParam as TabKey) : "t2v";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [codeLang, setCodeLang] = useState<"curl" | "python">("curl");

  useEffect(() => {
    if (validTabs.includes(tabParam as TabKey)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(tabParam as TabKey);
    }
  }, [tabParam]);

  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <span style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 5,
          background: "#f0fdf4", color: "#16a34a", fontSize: 11, fontWeight: 600,
          letterSpacing: "0.5px", marginBottom: 12,
        }}>
          PixVerse / Aishi Technology
        </span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, letterSpacing: "-0.5px" }}>
        PixVerse Video Generation API
      </h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.6 }}>
        The PixVerse V6 series of models supports four modes: text-to-video, image-to-video, first/last-frame video, and reference-to-video.
        The API is asynchronous: first create a task to obtain a task_id, then poll for the result.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 32, flexWrap: "wrap" }}>
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

      {/* Endpoint */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Endpoints</h2>
        <div style={{
          background: "var(--bg-elevated)", borderRadius: 8, padding: "14px 18px",
          border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{
              padding: "2px 8px", background: "#dbeafe", color: "#1d4ed8",
              borderRadius: 4, fontSize: 11, fontWeight: 700,
            }}>POST</span>
            <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
              {API_BASE}/v1/services/aigc/video-generation/video-synthesis
            </code>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{
              padding: "2px 8px", background: "#dcfce7", color: "#16a34a",
              borderRadius: 4, fontSize: 11, fontWeight: 700,
            }}>GET</span>
            <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
              {API_BASE}/v1/video/tasks/{"{task_id}"}
            </code>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
            <strong>Model:</strong> <code style={{ background: "var(--bg)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>{models[activeTab]}</code>
            <span style={{ marginLeft: 16 }}>{tabs.find(t => t.key === activeTab)?.desc}</span>
          </div>
        </div>
      </section>

      {/* Headers */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Request Headers</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Header</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Required</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                { h: "Content-Type", req: "Yes", d: "application/json" },
                { h: "Authorization", req: "Yes", d: "Bearer <API_KEY>" },
                { h: "X-DashScope-Async", req: "Yes", d: 'Must be set to "enable"' },
              ].map((row, i) => (
                <tr key={row.h} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{row.h}</code>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: row.req === "Yes" ? "#dc2626" : "var(--text-secondary)" }}>{row.req}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Request Params */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Request Parameters</h2>
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
              {requestParams[activeTab].map((p, i) => (
                <tr key={p.name} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{p.name}</code>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{p.type}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    {p.required ? <span style={{ color: "#dc2626", fontWeight: 600 }}>*</span> : "-"}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Size reference table (for t2v and r2v) */}
      {(activeTab === "t2v" || activeTab === "r2v") && (
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Resolution Reference</h2>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-elevated)" }}>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Tier</th>
                  {aspectLabels.map(a => (
                    <th key={a} style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{a}</th>
                  ))}
                  <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Available Durations</th>
                </tr>
              </thead>
              <tbody>
                {sizeTable.map((row, i) => (
                  <tr key={row.tier} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{row.tier}</td>
                    {row.ratios.map(r => (
                      <td key={r} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                        <code style={{ fontSize: 11 }}>{r}</code>
                      </td>
                    ))}
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center", color: "var(--text-secondary)" }}>
                      {row.tier === "1080P" ? "5, 8" : "5, 8, 10"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Code Examples */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Request Example</h2>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
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
        <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 16, overflow: "auto" }}>
          <DocsCodeBlock code={codeLang === "curl" ? curlExamples[activeTab] : pythonExamples[activeTab]} />
        </div>
      </section>

      {/* Response */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Response Examples</h2>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Step 1: Create-task response</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 16, overflow: "auto", marginBottom: 16 }}>
          <DocsCodeBlock code={`{
  "output": {
    "task_status": "PENDING",
    "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx"
  },
  "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx"
}`} />
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Step 2: Query-result response (success)</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 16, overflow: "auto" }}>
          <DocsCodeBlock code={`{
  "request_id": "19171ea5-9efb-4d35-93a1-xxxxxx",
  "output": {
    "task_id": "7ed706b7-a9a9-4319-820c-xxxxxx",
    "task_status": "SUCCEEDED",
    "submit_time": "2026-03-20 10:34:41.630",
    "scheduled_time": "2026-03-20 10:34:41.655",
    "end_time": "2026-03-20 10:35:12.725",
    "orig_prompt": "A kitten running in the moonlight",
    "video_url": "https://media.pixverseai.cn/xxxx.mp4"
  },
  "usage": {
    "duration": 5,
    "size": "1280*720",
    "fps": 24,
    "video_count": 1,
    "audio": false,
    "SR": "720"
  }
}`} />
        </div>
      </section>

      {/* Response Params */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Response Fields</h2>
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
                { f: "output.task_id", t: "string", d: "Task ID, valid for 24 hours" },
                { f: "output.task_status", t: "string", d: "PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED / UNKNOWN" },
                { f: "output.video_url", t: "string", d: "Generated video URL (returned only when SUCCEEDED), MP4 format" },
                { f: "output.orig_prompt", t: "string", d: "Original input prompt" },
                { f: "output.submit_time", t: "string", d: "Task submission time" },
                { f: "output.end_time", t: "string", d: "Task completion time" },
                { f: "usage.duration", t: "integer", d: "Video duration (seconds), used for billing" },
                { f: "usage.size", t: "string", d: "Video resolution" },
                { f: "usage.fps", t: "integer", d: "Video frame rate" },
                { f: "usage.audio", t: "boolean", d: "Whether the video has audio" },
                { f: "usage.video_count", t: "integer", d: "Number of videos, always 1" },
                { f: "request_id", t: "string", d: "Unique request identifier" },
              ].map((row, i) => (
                <tr key={row.f} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{row.f}</code>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.t}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Workflow */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Workflow</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { step: "1", title: "Create the task", desc: "POST request to create the video generation task; receive a task_id" },
            { step: "2", title: "Poll the status", desc: "GET request to query task status; recommended interval 15 seconds" },
            { step: "3", title: "Fetch the result", desc: "When the status changes to SUCCEEDED, download the video from video_url" },
          ].map(s => (
            <div key={s.step} style={{
              flex: 1, minWidth: 200, padding: 16, border: "1px solid var(--border)",
              borderRadius: 8, background: "var(--bg-elevated)",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", background: "var(--accent-bg)",
                color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, marginBottom: 10,
              }}>{s.step}</div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{s.title}</h3>
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Notes */}
      <section style={{
        padding: 18, background: "#fffbeb", border: "1px solid #fcd34d",
        borderRadius: 8, fontSize: 13, lineHeight: 1.7,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#92400e", marginBottom: 8 }}>Notes</h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: "#92400e" }}>
          <li>The API only supports asynchronous calls; the request headers must include <code>X-DashScope-Async: enable</code></li>
          <li>task_id is valid for 24 hours; queries are unavailable after that</li>
          <li>Video generation typically takes 1-5 minutes; recommended polling interval is 15 seconds</li>
          <li>10-second duration is not supported at 1080P</li>
          <li>Download and persist video_url promptly; do not rely on it for long-term storage</li>
          <li>Image formats supported: JPG/PNG/WEBP, up to 20MB each, dimensions up to 10000x10000</li>
          {activeTab === "r2v" && <li>Reference-to-video supports up to 7 reference images</li>}
          {activeTab === "kf2v" && <li>The first and last frame images may have different resolutions; output is based on the first frame</li>}
        </ul>
      </section>
    </div>
  );
}

export default function PixVerseDocsPage() {
  return (
    <Suspense fallback={null}>
      <PixVerseDocsInner />
    </Suspense>
  );
}
