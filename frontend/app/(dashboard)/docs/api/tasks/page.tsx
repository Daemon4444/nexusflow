"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type TabKey = "image" | "video";

const tabs: { key: TabKey; label: string; model: string; type: string }[] = [
  { key: "image", label: "图像生成", model: "wan2.6-t2i", type: "image" },
  { key: "video", label: "视频生成", model: "happyhorse-1.0-t2v", type: "video" },
];

const requestParams: Record<TabKey, { name: string; type: string; required: boolean; desc: string }[]> = {
  image: [
    { name: "model", type: "string", required: true, desc: "模型 ID，例如 wan2.6-t2i。完整列表见模型文档。" },
    { name: "prompt", type: "string", required: true, desc: "文本提示词，描述期望生成的图像内容。" },
    { name: "negative_prompt", type: "string", required: false, desc: "负面提示词，描述不希望出现的内容。" },
    { name: "size", type: "string", required: false, desc: "输出图像尺寸，如 1024x1024（默认）、720x1280、1280x720 等。" },
    { name: "n", type: "integer", required: false, desc: "生成图片数量，默认 1，最多 4。" },
    { name: "seed", type: "integer", required: false, desc: "随机种子，固定 seed 可提升可复现性。" },
  ],
  video: [
    { name: "model", type: "string", required: true, desc: "模型 ID，例如 happyhorse-1.0-t2v。完整列表见模型文档。" },
    { name: "prompt", type: "string", required: true, desc: "文本提示词，描述期望生成的视频内容。支持中英文。" },
    { name: "resolution", type: "string", required: false, desc: "分辨率档位：720P（默认）或 1080P。影响计费。" },
    { name: "ratio", type: "string", required: false, desc: "宽高比，如 16:9（默认）、9:16、1:1、4:3、3:4。" },
    { name: "duration", type: "integer", required: false, desc: "视频时长（秒），不同模型取值范围不同，默认 5。" },
    { name: "img_url", type: "string", required: false, desc: "首帧参考图 URL（图生视频模型必填）。" },
    { name: "watermark", type: "boolean", required: false, desc: "是否添加水印，默认 true。" },
    { name: "seed", type: "integer", required: false, desc: "随机种子 [0, 2147483647]。" },
  ],
};

const curlExamples: Record<TabKey, string> = {
  image: `curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wan2.6-t2i",
    "prompt": "一只橘色的猫站在月球表面，背景是地球，赛博朋克风格，4K 超高清",
    "size": "1024x1024",
    "n": 1
  }'`,
  video: `curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "happyhorse-1.0-t2v",
    "prompt": "一座由硬纸板和瓶盖搭建的微型城市，在夜晚焕发出生机。一列硬纸板火车缓缓驶过。",
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 5
  }'`,
};

const pythonExamples: Record<TabKey, string> = {
  image: `import requests

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# wan2.6-t2i 为同步接口，直接返回结果
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "wan2.6-t2i",
        "prompt": "一只橘色的猫站在月球表面，背景是地球，赛博朋克风格，4K 超高清",
        "size": "1024x1024",
        "n": 1,
    },
).json()

# 同步返回，无需轮询
if response["status"] == "succeeded":
    image_url = response["output"]["image_url"]
    print(f"生成完成！图像URL: {image_url}")
else:
    print(f"生成失败: {response.get('error')}")`,
  video: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 步骤1：创建视频生成任务
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "happyhorse-1.0-t2v",
        "prompt": "一座由硬纸板和瓶盖搭建的微型城市，在夜晚焕发出生机。",
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
          异步任务 / Async Tasks
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          异步任务 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          图像与视频生成统一走 <code>/v1/tasks</code> 接口。视频模型为异步调用（先创建任务获取 task_id，再轮询查询结果），图像模型（如 wan2.6-t2i）为同步调用，直接返回结果无需轮询。视频生成通常需要 1-5 分钟。
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

        {/* Important notes */}
        <div style={{
          padding: 16, background: "#fffbeb", border: "1px solid #fcd34d",
          borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#92400e",
        }}>
          <strong>注意：</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>创建成功后，使用返回的 <code>id</code>（即 task_id）查询结果。<strong>请勿重复创建任务</strong>，轮询获取即可。</li>
            <li><strong>图像模型</strong>（如 wan2.6-t2i）为同步接口，创建请求直接返回结果，无需轮询。</li>
            <li><strong>视频模型</strong>轮询建议间隔 <strong>10-15 秒</strong>。</li>
            <li>task_id 查询有效期 <strong>24 小时</strong>，超时后无法查询。</li>
            <li>输出文件 URL 有效期 24 小时，获取后请立即下载保存。</li>
            <li>仅图像和视频模型支持 <code>/v1/tasks</code> 接口，聊天模型请使用 <code>/v1/chat/completions</code>。</li>
          </ul>
        </div>
      </section>

      {/* Step 1: Create task */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>步骤1：创建任务</h2>
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
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600 }}>示例模型：</span>
          <code style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            {tabs.find(t => t.key === activeTab)?.model}
          </code>
        </div>

        {/* Request params table */}
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>请求参数</h3>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
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
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>请求示例</h3>
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
              {lang === "curl" ? "cURL" : "Python（完整流程）"}
            </button>
          ))}
        </div>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto" }}>
          <DocsCodeBlock code={codeLang === "curl" ? curlExamples[activeTab] : pythonExamples[activeTab]} />
        </div>
      </section>

      {/* Step 1 Response */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>步骤1 响应：获取 task_id</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          创建成功后返回任务信息（HTTP 202），<code>id</code> 即为 task_id，用于后续轮询查询。
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
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>字段</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["id", "任务 ID（task_id）。视频任务用于轮询查询结果，有效期 24 小时。"],
                ["object", "固定值 \"task\"。"],
                ["status", "视频模型初始状态为 running；图像模型（如 wan2.6-t2i）为同步接口，直接返回 succeeded。"],
                ["model", "所使用的模型 ID。"],
                ["type", "任务类型：\"image\"（图像生成）或 \"video\"（视频生成）。"],
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

      {/* Step 2: Polling */}
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

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
          {activeTab === "image" ? "图像任务执行成功" : "视频任务执行成功"}
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

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>任务执行失败</h3>
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
                ["object", "string", "固定值 \"task\"。"],
                ["status", "string", "任务状态：pending（排队中）→ running（处理中）→ succeeded（成功）/ failed（失败）。"],
                ["model", "string", "所使用的模型 ID。"],
                ["type", "string", "任务类型：\"image\" 或 \"video\"。"],
                ["progress", "integer", "任务进度百分比 0-100。"],
                ["output", "object", "生成结果（仅 succeeded 时返回）。图像任务包含 image_url，视频任务包含 video_url。链接有效期 24 小时。"],
                ["error", "string", "失败原因（仅 failed 时返回）。"],
                ["created_at", "string", "任务创建时间（ISO 8601 格式）。"],
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

      {/* List tasks */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>查询任务列表</h2>

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
          获取当前用户的近期任务列表。可通过 <code>limit</code> 参数控制返回数量（默认 20，最大 100）。
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
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>最佳实践</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {[
            { title: "轮询做退避", desc: "图像任务 5-10 秒轮询，视频任务 10-15 秒轮询，避免亚秒级轮询以减少不必要的请求。" },
            { title: "拆分同步与异步", desc: "聊天请求走 /v1/chat/completions，图像/视频走 /v1/tasks，减少互相干扰。" },
            { title: "及时下载结果", desc: "输出 URL 有效期 24 小时，任务完成后应立即下载保存文件。" },
            { title: "处理失败重试", desc: "任务失败时根据 error 字段判断原因。参数错误需修正后重试，上游超时可直接重新创建任务。" },
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
          { href: "/docs/api/happyhorse", label: "HappyHorse API", desc: "查看 HappyHorse 视频生成专用文档" },
          { href: "/docs/api/limits", label: "限流说明", desc: "查看高并发下的限制与优化建议" },
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
