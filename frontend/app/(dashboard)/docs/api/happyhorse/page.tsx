"use client";

import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type TabKey = "t2v" | "i2v" | "r2v" | "edit";

const tabs: { key: TabKey; label: string; model: string }[] = [
  { key: "t2v", label: "文生视频", model: "happyhorse-1.0-t2v" },
  { key: "i2v", label: "图生视频", model: "happyhorse-1.0-i2v" },
  { key: "r2v", label: "参考生视频", model: "happyhorse-1.0-r2v" },
  { key: "edit", label: "视频编辑", model: "happyhorse-1.0-video-edit" },
];

const requestParams: Record<TabKey, { name: string; type: string; required: boolean; desc: string }[]> = {
  t2v: [
    { name: "model", type: "string", required: true, desc: "固定值：happyhorse-1.0-t2v" },
    { name: "prompt", type: "string", required: true, desc: "文本提示词，描述期望生成的视频内容。支持中英文，不超过 2500 个中文字符。" },
    { name: "resolution", type: "string", required: false, desc: "分辨率档位：720P（默认）或 1080P。影响计费：720P ¥0.9/秒，1080P ¥1.6/秒。" },
    { name: "ratio", type: "string", required: false, desc: "宽高比。可选值：16:9（默认）、9:16、1:1、4:3、3:4。" },
    { name: "duration", type: "integer", required: false, desc: "视频时长（秒），取值 [3, 15]，默认 5。" },
    { name: "watermark", type: "boolean", required: false, desc: "是否添加水印，默认 true。" },
    { name: "seed", type: "integer", required: false, desc: "随机种子 [0, 2147483647]，固定 seed 可提升可复现性。" },
  ],
  i2v: [
    { name: "model", type: "string", required: true, desc: "固定值：happyhorse-1.0-i2v" },
    { name: "img_url", type: "string", required: true, desc: "首帧参考图 URL（JPG/PNG/WEBP，≤10MB）。" },
    { name: "prompt", type: "string", required: false, desc: "文本提示词，描述视频动态效果。可选但建议填写。" },
    { name: "resolution", type: "string", required: false, desc: "分辨率档位：720P（默认）或 1080P。" },
    { name: "duration", type: "integer", required: false, desc: "视频时长（秒），取值 [3, 15]，默认 5。" },
    { name: "watermark", type: "boolean", required: false, desc: "是否添加水印，默认 true。" },
    { name: "seed", type: "integer", required: false, desc: "随机种子 [0, 2147483647]。" },
  ],
  r2v: [
    { name: "model", type: "string", required: true, desc: "固定值：happyhorse-1.0-r2v" },
    { name: "prompt", type: "string", required: true, desc: "文本提示词，描述视频内容。" },
    { name: "img_urls", type: "string[]", required: true, desc: "参考图片 URL 数组，1-9 张。" },
    { name: "resolution", type: "string", required: false, desc: "分辨率档位：720P（默认）或 1080P。" },
    { name: "ratio", type: "string", required: false, desc: "宽高比：16:9（默认）、9:16、1:1、4:3、3:4。" },
    { name: "duration", type: "integer", required: false, desc: "视频时长（秒），取值 [3, 15]，默认 5。" },
    { name: "watermark", type: "boolean", required: false, desc: "是否添加水印，默认 true。" },
    { name: "seed", type: "integer", required: false, desc: "随机种子 [0, 2147483647]。" },
  ],
  edit: [
    { name: "model", type: "string", required: true, desc: "固定值：happyhorse-1.0-video-edit" },
    { name: "prompt", type: "string", required: true, desc: "编辑指令，描述希望对视频做什么修改。" },
    { name: "video_url", type: "string", required: true, desc: "输入视频 URL（3-60秒，超15秒将截断）。" },
    { name: "img_urls", type: "string[]", required: false, desc: "辅助参考图片（0-5张）。" },
    { name: "resolution", type: "string", required: false, desc: "输出分辨率：720P（默认）或 1080P。" },
    { name: "watermark", type: "boolean", required: false, desc: "是否添加水印，默认 true。" },
    { name: "seed", type: "integer", required: false, desc: "随机种子 [0, 2147483647]。" },
  ],
};

const curlExamples: Record<TabKey, string> = {
  t2v: `curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "happyhorse-1.0-t2v",
    "prompt": "一座由硬纸板和瓶盖搭建的微型城市，在夜晚焕发出生机。一列硬纸板火车缓缓驶过，小灯点缀其间，照亮前路。",
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 5
  }'`,
  i2v: `curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "happyhorse-1.0-i2v",
    "img_url": "https://example.com/first-frame.jpg",
    "prompt": "人物缓慢回头，头发被海风吹动，镜头保持中近景",
    "resolution": "720P",
    "duration": 8
  }'`,
  r2v: `curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "happyhorse-1.0-r2v",
    "prompt": "男人坐在靠窗的椅子上，手持吉他演奏乡村民谣",
    "img_urls": [
      "https://example.com/ref-person.jpg",
      "https://example.com/ref-scene.jpg"
    ],
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 10
  }'`,
  edit: `curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "happyhorse-1.0-video-edit",
    "video_url": "https://example.com/input-video.mp4",
    "prompt": "将背景替换为雪山场景，保持人物动作不变",
    "resolution": "720P"
  }'`,
};

const pythonExamples: Record<TabKey, string> = {
  t2v: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 步骤1：创建任务
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
        "model": "happyhorse-1.0-i2v",
        "img_url": "https://example.com/first-frame.jpg",
        "prompt": "人物缓慢回头，头发被海风吹动",
        "resolution": "720P",
        "duration": 8,
    },
).json()

task_id = response["id"]
print(f"任务已创建: {task_id}")

# 步骤2：轮询查询结果
while True:
    result = requests.get(
        f"{BASE}/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"},
    ).json()

    if result["status"] == "succeeded":
        print(f"视频URL: {result['output']['video_url']}")
        break
    elif result["status"] == "failed":
        print(f"失败: {result.get('error')}")
        break

    time.sleep(10)`,
  r2v: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 步骤1：创建参考生视频任务（1-9张参考图）
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "happyhorse-1.0-r2v",
        "prompt": "男人坐在靠窗的椅子上弹吉他",
        "img_urls": [
            "https://example.com/ref-person.jpg",
            "https://example.com/ref-scene.jpg",
        ],
        "resolution": "1080P",
        "ratio": "16:9",
        "duration": 10,
    },
).json()

task_id = response["id"]

# 步骤2：轮询
while True:
    result = requests.get(
        f"{BASE}/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"},
    ).json()

    if result["status"] == "succeeded":
        print(f"视频URL: {result['output']['video_url']}")
        break
    elif result["status"] == "failed":
        print(f"失败: {result.get('error')}")
        break

    time.sleep(10)`,
  edit: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 步骤1：创建视频编辑任务
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "happyhorse-1.0-video-edit",
        "video_url": "https://example.com/input-video.mp4",
        "prompt": "将背景替换为雪山场景，保持人物动作不变",
        "resolution": "720P",
    },
).json()

task_id = response["id"]

# 步骤2：轮询
while True:
    result = requests.get(
        f"{BASE}/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"},
    ).json()

    if result["status"] == "succeeded":
        print(f"视频URL: {result['output']['video_url']}")
        break
    elif result["status"] == "failed":
        print(f"失败: {result.get('error')}")
        break

    time.sleep(10)`,
};

export default function HappyHorseApiPage() {
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
          HappyHorse / Alibaba
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          HappyHorse 视频生成 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          HappyHorse 文生视频模型，输入文本提示词生成物理真实、运动流畅的视频内容。API 采用异步调用方式：先创建任务获取 task_id，再轮询查询结果。视频生成通常需要 1-5 分钟。
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
            <li>轮询建议间隔 <strong>10-15 秒</strong>。</li>
            <li>task_id 查询有效期 <strong>24 小时</strong>，超时后无法查询。</li>
            <li>视频 URL 有效期 24 小时，获取后请立即下载保存。</li>
          </ul>
        </div>
      </section>

      {/* Mode tabs */}
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
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600 }}>模型ID：</span>
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
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
            {codeLang === "curl" ? curlExamples[activeTab] : pythonExamples[activeTab]}
          </pre>
        </div>
      </section>

      {/* Step 2: Response */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>步骤1 响应：获取 task_id</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
          创建成功后返回任务信息，<code>id</code> 即为 task_id，用于后续查询。
        </p>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
{`{
  "id": "task_0385dc79-5ff8-4d82-xxxx",
  "object": "task",
  "status": "running",
  "model": "${tabs.find(t => t.key === activeTab)?.model}",
  "type": "video",
  "created_at": "2026-06-01T10:00:00.000Z"
}`}
          </pre>
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
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
{`curl ${API_BASE}/v1/tasks/task_0385dc79-5ff8-4d82-xxxx \\
  -H "Authorization: Bearer $API_KEY"`}
          </pre>
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>任务执行成功</h3>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
{`{
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
}`}
          </pre>
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>任务执行失败</h3>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
{`{
  "id": "task_0385dc79-5ff8-4d82-xxxx",
  "object": "task",
  "status": "failed",
  "model": "happyhorse-1.0-t2v",
  "type": "video",
  "error": "InvalidParameter: The parameter is invalid.",
  "created_at": "2026-06-01T10:00:00.000Z",
  "completed_at": "2026-06-01T10:00:05.000Z"
}`}
          </pre>
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

      {/* Pricing */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>计费说明</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>分辨率</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>单价</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--bg)" }}>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>720P</td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--accent)", fontWeight: 600 }}>¥0.9 / 秒</td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>按输出视频时长计费（如 5 秒 = ¥4.5）</td>
              </tr>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>1080P</td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--accent)", fontWeight: 600 }}>¥1.6 / 秒</td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>按输出视频时长计费（如 5 秒 = ¥8.0）</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 10, lineHeight: 1.6 }}>
          适用于所有 HappyHorse 模型（t2v / i2v / r2v / video-edit）。仅对成功任务计费，失败任务不扣费。
        </p>
      </section>

      {/* Links */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/models/happyhorse", label: "HappyHorse 专题", desc: "查看模型动态与能力说明" },
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
