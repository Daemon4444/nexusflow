"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type TabKey = "t2v" | "i2v";

const tabs: { key: TabKey; label: string }[] = [
  { key: "t2v", label: "文生视频" },
  { key: "i2v", label: "图生视频" },
];

const supportedModels = [
  { id: "wan2.6-t2v", provider: "Wan / Alibaba", mode: "文生视频", price720: "¥0.6 / 秒", price1080: "¥1 / 秒" },
  { id: "wan2.6-i2v", provider: "Wan / Alibaba", mode: "图生视频", price720: "¥0.6 / 秒", price1080: "¥1 / 秒" },
  { id: "happyhorse-1.0-t2v", provider: "HappyHorse / Alibaba", mode: "文生视频", price720: "¥0.9 / 秒", price1080: "¥1.6 / 秒" },
  { id: "happyhorse-1.0-i2v", provider: "HappyHorse / Alibaba", mode: "图生视频", price720: "¥0.9 / 秒", price1080: "¥1.6 / 秒" },
  { id: "pixverse-v6", provider: "PixVerse", mode: "文生视频", price720: "¥0.36 有声 / ¥0.27 无声", price1080: "¥0.68 有声 / ¥0.53 无声" },
];

const requestParams: { name: string; type: string; required: boolean; desc: string }[] = [
  { name: "model", type: "string", required: true, desc: "视频模型 ID，见上方「支持模型」表。例如 wan2.6-t2v、happyhorse-1.0-i2v、pixverse-v6。" },
  { name: "prompt", type: "string", required: true, desc: "文本提示词，描述期望生成的视频内容。支持中英文，建议写清主体、动作、镜头与风格。" },
  { name: "resolution", type: "string", required: false, desc: "分辨率档位：720P（默认）或 1080P。不同档位对应不同计费价格。" },
  { name: "ratio", type: "string", required: false, desc: "宽高比。可选值：16:9（默认）、9:16、1:1、4:3、3:4。部分模型可能仅支持子集。" },
  { name: "duration", type: "integer", required: false, desc: "视频时长（秒），取值 [3, 15]，默认 5。具体范围取决于模型。" },
  { name: "img_url", type: "string", required: false, desc: "首帧参考图 URL（JPG/PNG/WEBP，≤10MB）。图生视频模式下必填。" },
  { name: "watermark", type: "boolean", required: false, desc: "是否添加水印，默认 true。" },
  { name: "seed", type: "integer", required: false, desc: "随机种子 [0, 2147483647]，固定 seed 可提升可复现性。" },
];

const curlExamples: Record<TabKey, string> = {
  t2v: `# 步骤1：创建文生视频任务
curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wan2.6-t2v",
    "prompt": "黄昏城市海岸线，镜头缓慢推进，电影感自然光，细腻真实风格",
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 5
  }'

# 返回 → { "id": "task_abc123...", "status": "running", ... }

# 步骤2：轮询查询结果（建议间隔 10-15 秒）
curl ${API_BASE}/v1/tasks/task_abc123 \\
  -H "Authorization: Bearer $API_KEY"

# 返回 → { "status": "succeeded", "output": { "video_url": "https://..." }, ... }`,
  i2v: `# 步骤1：创建图生视频任务
curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wan2.6-i2v",
    "img_url": "https://example.com/first-frame.jpg",
    "prompt": "人物缓慢回头，头发被海风吹动，镜头保持中近景",
    "resolution": "720P",
    "duration": 8
  }'

# 返回 → { "id": "task_abc123...", "status": "running", ... }

# 步骤2：轮询查询结果（建议间隔 10-15 秒）
curl ${API_BASE}/v1/tasks/task_abc123 \\
  -H "Authorization: Bearer $API_KEY"

# 返回 → { "status": "succeeded", "output": { "video_url": "https://..." }, ... }`,
};

const pythonExamples: Record<TabKey, string> = {
  t2v: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 步骤1：创建文生视频任务
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "wan2.6-t2v",
        "prompt": "黄昏城市海岸线，镜头缓慢推进，电影感自然光，细腻真实风格",
        "resolution": "1080P",
        "ratio": "16:9",
        "duration": 5,
    },
).json()

task_id = response["id"]
print(f"任务已创建: {task_id}")  # → task_abc123xxx

# 步骤2：轮询查询结果（建议间隔 10-15 秒）
while True:
    result = requests.get(
        f"{BASE}/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"},
    ).json()

    print(f"状态: {result['status']}, 进度: {result.get('progress', 0)}%")

    if result["status"] == "succeeded":
        video_url = result["output"]["video_url"]
        print(f"生成完成！视频URL: {video_url}")
        break
    elif result["status"] == "failed":
        print(f"生成失败: {result.get('error')}")
        break

    time.sleep(10)`,
  i2v: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 步骤1：创建图生视频任务
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "wan2.6-i2v",
        "img_url": "https://example.com/first-frame.jpg",
        "prompt": "人物缓慢回头，头发被海风吹动，镜头保持中近景",
        "resolution": "720P",
        "duration": 8,
    },
).json()

task_id = response["id"]
print(f"任务已创建: {task_id}")

# 步骤2：轮询查询结果（建议间隔 10-15 秒）
while True:
    result = requests.get(
        f"{BASE}/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"},
    ).json()

    print(f"状态: {result['status']}, 进度: {result.get('progress', 0)}%")

    if result["status"] == "succeeded":
        video_url = result["output"]["video_url"]
        print(f"生成完成！视频URL: {video_url}")
        break
    elif result["status"] == "failed":
        print(f"生成失败: {result.get('error')}")
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
          VIDEO / 视频生成
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          视频生成 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          统一视频生成接口，支持 Wan、HappyHorse、PixVerse 等多模型。API 采用异步调用方式：先创建任务获取 task_id，再轮询查询结果。视频生成通常需要 1-5 分钟。
        </p>
      </div>

      {/* HTTP Flow */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>HTTP 调用流程</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {[
            { step: "1", title: "创建任务获取 task_id", method: "POST", endpoint: "/v1/tasks" },
            { step: "2", title: "根据 task_id 轮询结果", method: "GET", endpoint: "/v1/tasks/{task_id}" },
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>支持模型</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型 ID</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>供应商</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模式</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>720P 单价</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>1080P 单价</th>
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
          按输出视频时长计费（如 720P 5 秒 = 单价 x 5）。仅对成功任务计费，失败任务不扣费。
        </p>
      </section>

      {/* Important Notes */}
      <section style={{ marginBottom: 36 }}>
        <div style={{
          padding: 16, background: "#fffbeb", border: "1px solid #fcd34d",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#92400e",
        }}>
          <strong>注意事项：</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>视频生成仅支持异步调用，不提供同步接口。创建任务后请使用 <code>id</code>（即 task_id）轮询结果，<strong>请勿重复创建任务</strong>。</li>
            <li>轮询建议间隔 <strong>10-15 秒</strong>，并对失败重试使用指数退避。</li>
            <li>task_id 查询有效期 <strong>24 小时</strong>，超时后无法查询。</li>
            <li>视频 URL 有效期 24 小时，获取后请立即下载保存。</li>
          </ul>
        </div>
      </section>

      {/* Request Params */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>请求参数</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>参数</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 70 }}>类型</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 50 }}>必选</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>代码示例</h2>

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
              {lang === "curl" ? "cURL" : "Python（完整流程）"}
            </button>
          ))}
        </div>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={codeLang === "curl" ? curlExamples[activeTab] : pythonExamples[activeTab]} />
        </div>
      </section>

      {/* Response: Step 1 */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>步骤1 响应：获取 task_id</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          创建成功后返回任务信息，<code>id</code> 即为 task_id，用于后续查询。
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
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>字段</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["id", "任务ID（task_id），用于查询结果。有效期 24 小时。"],
                ["object", "固定值 \"task\"。"],
                ["status", "初始状态为 running。"],
                ["model", "所使用的模型 ID。"],
                ["type", "任务类型，视频生成固定为 \"video\"。"],
                ["created_at", "任务创建时间（ISO 8601 格式）。"],
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>步骤2：根据 task_id 轮询结果</h2>

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

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>查询请求</h3>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <DocsCodeBlock code={`curl ${API_BASE}/v1/tasks/task_0385dc79-5ff8-4d82-xxxx \\
  -H "Authorization: Bearer $API_KEY"`} />
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>任务执行成功</h3>
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

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>任务执行失败</h3>
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
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>响应参数</h3>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>字段</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 70 }}>类型</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["id", "string", "任务 ID。"],
                ["status", "string", "任务状态：pending（排队中）→ running（处理中）→ succeeded（成功）/ failed（失败）。"],
                ["progress", "integer", "任务进度百分比 0-100。"],
                ["output.video_url", "string", "生成的视频 URL（仅 succeeded 时返回）。MP4 格式，链接有效期 24 小时。"],
                ["error", "string", "失败原因（仅 failed 时返回）。"],
                ["created_at", "string", "任务创建时间。"],
                ["completed_at", "string", "任务完成时间（仅终态时返回）。"],
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
          { href: "/docs/api/happyhorse", label: "HappyHorse API", desc: "查看 HappyHorse 模型专属接口文档" },
          { href: "/docs/api/tasks", label: "异步任务 API", desc: "查看通用异步任务接口文档" },
          { href: "/pricing", label: "完整定价", desc: "查看所有模型定价" },
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
