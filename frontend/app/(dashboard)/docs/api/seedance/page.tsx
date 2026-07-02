"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

type TabKey = "t2v" | "i2v" | "firstlast" | "multimodal";

const tabs: { key: TabKey; label: string; desc: string }[] = [
  { key: "t2v", label: "文生视频", desc: "纯文本生成视频" },
  { key: "i2v", label: "图生视频（首帧）", desc: "首帧图片 + 文本" },
  { key: "firstlast", label: "图生视频（首尾帧）", desc: "首帧 + 尾帧 + 文本" },
  { key: "multimodal", label: "多模态参考生视频", desc: "图 + 视频 + 音频 + 文本（仅 2.0）" },
];

const supportedModels = [
  { id: "seedance-2.0", name: "豆包 Seedance 2.0 旗舰版", modes: "文生 / 首帧 / 首尾帧 / 多模态参考", audio: "✓", max4k: "✓", price: "¥0.44 起 / 秒", featured: true },
  { id: "seedance-2.0-fast", name: "豆包 Seedance 2.0 Fast", modes: "文生 / 首帧 / 多模态参考", audio: "✓", max4k: "—", price: "¥0.36 起 / 秒", featured: false },
  { id: "seedance-2.0-mini", name: "豆包 Seedance 2.0 Mini", modes: "文生 / 首帧 / 多模态参考", audio: "✓", max4k: "—", price: "¥0.22 起 / 秒", featured: false },
  { id: "seedance-1.5-pro", name: "豆包 Seedance 1.5 Pro", modes: "文生 / 首帧 / 首尾帧", audio: "✓", max4k: "—", price: "¥0.17 起 / 秒", featured: false },
  { id: "seedance-1.0-pro", name: "豆包 Seedance 1.0 Pro", modes: "文生 / 首帧 / 首尾帧", audio: "—", max4k: "—", price: "¥0.14 起 / 秒", featured: false },
  { id: "seedance-1.0-pro-fast", name: "豆包 Seedance 1.0 Pro Fast", modes: "文生 / 首帧", audio: "—", max4k: "—", price: "¥0.04 起 / 秒", featured: false },
];

const requestParams: { name: string; type: string; required: boolean; desc: string }[] = [
  { name: "model", type: "string", required: true, desc: "Seedance 模型 ID：seedance-2.0 / seedance-2.0-fast / seedance-2.0-mini / seedance-1.5-pro / seedance-1.0-pro / seedance-1.0-pro-fast。" },
  { name: "prompt", type: "string", required: false, desc: "文本提示词。建议写清主体、动作、镜头与风格。多模态参考生视频场景下可选。" },
  { name: "img_url", type: "string", required: false, desc: "首帧图片 URL（JPG/PNG/WEBP）。图生视频-首帧模式必填，图生视频-首尾帧模式作为首帧。" },
  { name: "img_end_url", type: "string", required: false, desc: "尾帧图片 URL。与 img_url 同时传入即启用首尾帧模式。" },
  { name: "img_urls", type: "string[]", required: false, desc: "参考图片 URL 数组（0-9 张）。仅 Seedance 2.0 系列多模态参考生视频场景。" },
  { name: "video_urls", type: "string[]", required: false, desc: "参考视频 URL 数组（0-3 段）。仅 Seedance 2.0 系列多模态参考生视频场景。" },
  { name: "audio_urls", type: "string[]", required: false, desc: "参考音频 URL 数组（0-3 段）。仅 Seedance 2.0 系列多模态参考生视频场景。" },
  { name: "resolution", type: "string", required: false, desc: "分辨率：480p / 720p（默认）/ 1080p / 4k（仅 2.0）。Seedance 2.0 Fast 不支持 1080p 与 4k。" },
  { name: "ratio", type: "string", required: false, desc: "宽高比：16:9（默认）/ 4:3 / 1:1 / 3:4 / 9:16 / 21:9 / adaptive（2.0、1.5 Pro 智能）。" },
  { name: "duration", type: "integer", required: false, desc: "视频时长（秒）。2.0 系列 [4, 15] 或 -1 智能指定；1.5 Pro [4, 12] 或 -1；1.0 Pro Fast [2, 12]。默认 5。" },
  { name: "generate_audio", type: "boolean", required: false, desc: "是否生成有声视频，默认 true。仅 2.0 系列、1.5 Pro 支持。对话建议置于双引号内优化音频效果。" },
  { name: "draft", type: "boolean", required: false, desc: "是否开启样片模式（480p 预览视频），默认 false。仅 1.5 Pro 支持。" },
  { name: "return_last_frame", type: "boolean", required: false, desc: "是否返回生成视频的尾帧图像（PNG），默认 false。可用于多段视频连续生成。" },
  { name: "watermark", type: "boolean", required: false, desc: "是否添加 AI 生成水印，默认 false。" },
  { name: "seed", type: "integer", required: false, desc: "随机种子 [-1, 2^32-1]。Seedance 2.0 系列暂不支持。" },
  { name: "camera_fixed", type: "boolean", required: false, desc: "是否固定摄像头，默认 false。参考图场景与 2.0 系列不支持。" },
  { name: "service_tier", type: "string", required: false, desc: "服务等级：default（在线推理，默认）/ flex（离线推理，价格为 50%）。仅 1.5 Pro 与 1.0 系列支持。" },
  { name: "callback_url", type: "string", required: false, desc: "任务结果回调通知地址。任务状态变化时方舟会向此地址 POST 任务详情。" },
  { name: "priority", type: "integer", required: false, desc: "队列优先级 [0, 9]，数值越大优先级越高。仅 Seedance 2.0 系列支持。" },
];

const curlExamples: Record<TabKey, string> = {
  t2v: `# 步骤1：创建文生视频任务（Seedance 2.0 旗舰版，4K HDR 有声）
curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0",
    "prompt": "黄昏城市海岸线，镜头缓慢推进，电影感自然光，细腻真实风格",
    "resolution": "1080p",
    "ratio": "16:9",
    "duration": 10,
    "generate_audio": true,
    "watermark": false
  }'

# 返回 → { "id": "task_abc123...", "status": "running", ... }

# 步骤2：轮询查询结果（建议间隔 10-15 秒）
curl ${API_BASE}/v1/tasks/task_abc123 \\
  -H "Authorization: Bearer $API_KEY"

# 返回 → { "status": "succeeded", "output": { "video_url": "https://...", "duration": 10, "resolution": "1080p" }, ... }`,
  i2v: `# 步骤1：创建图生视频任务（首帧驱动）
curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0",
    "prompt": "人物缓慢回头，头发被海风吹动，镜头保持中近景",
    "img_url": "https://example.com/first-frame.jpg",
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 8,
    "generate_audio": true
  }'

# 返回 → { "id": "task_abc123...", "status": "running", ... }

# 步骤2：轮询查询结果
curl ${API_BASE}/v1/tasks/task_abc123 \\
  -H "Authorization: Bearer $API_KEY"`,
  firstlast: `# 首尾帧图生视频：精准控制起止画面
curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0",
    "prompt": "镜头从城市日出缓缓过渡到夜景霓虹",
    "img_url": "https://example.com/sunrise.jpg",
    "img_end_url": "https://example.com/night-neon.jpg",
    "resolution": "1080p",
    "ratio": "21:9",
    "duration": 12,
    "generate_audio": true,
    "return_last_frame": false
  }'

# 返回 → { "id": "task_abc123...", "status": "running", ... }
# 轮询 GET /v1/tasks/{id} 获取结果`,
  multimodal: `# 多模态参考生视频（仅 Seedance 2.0 系列）
# 输入：2 张参考图 + 1 段参考视频 + 1 段参考音频 + 文本提示词
curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0",
    "prompt": "全程使用视频1的第一视角构图，全程使用音频1作为背景音乐。第一人称视角果茶宣传广告",
    "img_urls": [
      "https://example.com/ref-pic1.jpg",
      "https://example.com/ref-pic2.jpg"
    ],
    "video_urls": [
      "https://example.com/ref-video1.mp4"
    ],
    "audio_urls": [
      "https://example.com/ref-audio1.mp3"
    ],
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 11,
    "generate_audio": true,
    "watermark": true,
    "priority": 5
  }'

# 返回 → { "id": "task_abc123...", "status": "running", ... }
# 轮询 GET /v1/tasks/{id} 获取结果`,
};

const pythonExamples: Record<TabKey, string> = {
  t2v: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 步骤1：创建 Seedance 2.0 文生视频任务
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "seedance-2.0",
        "prompt": "黄昏城市海岸线，镜头缓慢推进，电影感自然光，细腻真实风格",
        "resolution": "1080p",
        "ratio": "16:9",
        "duration": 10,
        "generate_audio": True,
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
  i2v: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 图生视频（首帧驱动）
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "seedance-2.0",
        "prompt": "人物缓慢回头，头发被海风吹动",
        "img_url": "https://example.com/first-frame.jpg",
        "resolution": "720p",
        "duration": 8,
        "generate_audio": True,
    },
).json()

task_id = response["id"]

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
  firstlast: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 首尾帧图生视频：精准控制起止画面
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "seedance-2.0",
        "prompt": "镜头从城市日出缓缓过渡到夜景霓虹",
        "img_url": "https://example.com/sunrise.jpg",
        "img_end_url": "https://example.com/night-neon.jpg",
        "resolution": "1080p",
        "ratio": "21:9",
        "duration": 12,
    },
).json()

task_id = response["id"]

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
  multimodal: `import requests, time

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 多模态参考生视频（仅 Seedance 2.0 系列）
# 2 张参考图 + 1 段参考视频 + 1 段参考音频
response = requests.post(
    f"{BASE}/v1/tasks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "seedance-2.0",
        "prompt": "全程使用视频1的第一视角构图，全程使用音频1作为背景音乐",
        "img_urls": [
            "https://example.com/ref-pic1.jpg",
            "https://example.com/ref-pic2.jpg",
        ],
        "video_urls": ["https://example.com/ref-video1.mp4"],
        "audio_urls": ["https://example.com/ref-audio1.mp3"],
        "resolution": "720p",
        "ratio": "16:9",
        "duration": 11,
        "generate_audio": True,
        "priority": 5,
    },
).json()

task_id = response["id"]

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
    time.sleep(15)`,
};

const responseExample = `{
  "id": "task_abc123def456",
  "object": "task",
  "status": "succeeded",
  "model": "seedance-2.0",
  "type": "video",
  "progress": 100,
  "output": {
    "type": "video",
    "video_url": "https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/...",
    "duration": 10,
    "resolution": "1080p",
    "ratio": "16:9",
    "generate_audio": true,
    "seed": 33608,
    "framespersecond": 24
  },
  "created_at": "2026-06-30T10:00:00.000Z",
  "completed_at": "2026-06-30T10:02:30.000Z"
}`;

export default function SeedanceApiPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("t2v");
  const [codeLang, setCodeLang] = useState<"curl" | "python">("curl");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <span style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 5,
          background: "#ede9fe", color: "#6d28d9", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.5px", marginBottom: 12,
        }}>
          SEEDANCE / 旗舰视频生成
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Seedance API 用法
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          火山方舟豆包 Seedance 系列旗舰视频生成模型。通过 nexusflow 统一 <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>/v1/tasks</code> 异步任务接口调用，与现有 wan2.6、happyhorse、pixverse 等视频模型同协议。Seedance 2.0 旗舰版为系列最厉害的模型，支持多模态参考生视频、4K HDR 10bit、有声视频与首尾帧控制。
        </p>
      </div>

      {/* 旗舰提示 */}
      <div style={{
        padding: 16, marginBottom: 28, borderRadius: 10,
        background: "linear-gradient(135deg, #faf5ff, #f5f3ff)",
        border: "1px solid #c4b5fd",
      }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#6d28d9", marginBottom: 4 }}>
              Seedance 2.0 旗舰版 · 系列最强
            </div>
            <div style={{ fontSize: 13, color: "#5b21b6", lineHeight: 1.6 }}>
              支持 <b>4K HDR 10bit</b> 输出、<b>多模态参考生视频</b>（0-9 图 + 0-3 视频 + 0-3 音频）、<b>有声视频自动生成</b>、<b>首尾帧控制</b>、<b>21:9 全比例</b>、<b>队列优先级</b>等独有能力。详见{" "}
              <Link href="/docs/models/seedance" style={{ color: "#6d28d9", fontWeight: 600 }}>模型介绍 →</Link>
            </div>
          </div>
        </div>
      </div>

      {/* 支持模型 */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>支持的模型</h2>
        <div style={{
          border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden",
        }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1.4fr 2fr 0.6fr 0.6fr 1fr",
            padding: "10px 14px", background: "var(--bg-elevated)",
            fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)",
          }}>
            <div>模型 ID</div>
            <div>名称 / 模式</div>
            <div style={{ textAlign: "center" }}>有声</div>
            <div style={{ textAlign: "center" }}>4K</div>
            <div style={{ textAlign: "right" }}>起步价</div>
          </div>
          {supportedModels.map((m, i) => (
            <div
              key={m.id}
              style={{
                display: "grid", gridTemplateColumns: "1.4fr 2fr 0.6fr 0.6fr 1fr",
                padding: "14px", borderBottom: i < supportedModels.length - 1 ? "1px solid var(--border)" : "none",
                background: m.featured ? "#faf5ff" : "var(--bg)",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{m.id}</code>
                {m.featured && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                    background: "#7c3aed", color: "#fff",
                  }}>旗舰</span>
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{m.modes}</div>
              </div>
              <div style={{ textAlign: "center", fontSize: 13, color: m.audio === "✓" ? "#059669" : "var(--text-tertiary)" }}>{m.audio}</div>
              <div style={{ textAlign: "center", fontSize: 13, color: m.max4k === "✓" ? "#7c3aed" : "var(--text-tertiary)" }}>{m.max4k}</div>
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{m.price}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HTTP Flow */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>HTTP 调用流程</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
                  width: 28, height: 28, borderRadius: 999,
                  background: "#7c3aed", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700,
                }}>{s.step}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{s.title}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                <span style={{ color: "#7c3aed", fontWeight: 700 }}>{s.method}</span> {s.endpoint}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 请求参数 */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>请求参数</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.6fr 3fr",
            padding: "10px 14px", background: "var(--bg-elevated)",
            fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)",
          }}>
            <div>参数</div>
            <div>类型</div>
            <div>必填</div>
            <div>说明</div>
          </div>
          {requestParams.map((p, i) => (
            <div
              key={p.name}
              style={{
                display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.6fr 3fr",
                padding: "12px 14px",
                borderBottom: i < requestParams.length - 1 ? "1px solid var(--border)" : "none",
                fontSize: 13, alignItems: "flex-start",
                background: "var(--bg)",
              }}
            >
              <code style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 600 }}>{p.name}</code>
              <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{p.type}</div>
              <div style={{ color: p.required ? "#dc2626" : "var(--text-tertiary)", fontSize: 12, fontWeight: p.required ? 700 : 400 }}>
                {p.required ? "必填" : "可选"}
              </div>
              <div style={{ color: "var(--text-secondary)", lineHeight: 1.6, fontSize: 12.5 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 示例代码 */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>调用示例</h2>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "8px 16px", borderRadius: 8,
                background: activeTab === t.key ? "#7c3aed" : "var(--bg-elevated)",
                color: activeTab === t.key ? "#fff" : "var(--text-secondary)",
                border: "1px solid var(--border)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 16px" }}>
          {tabs.find((t) => t.key === activeTab)?.desc}
        </p>

        {/* Code language toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {(["curl", "python"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setCodeLang(lang)}
              style={{
                padding: "4px 12px", borderRadius: 6,
                background: codeLang === lang ? "var(--bg-elevated)" : "transparent",
                color: codeLang === lang ? "var(--text-primary)" : "var(--text-tertiary)",
                border: "1px solid var(--border)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              {lang === "curl" ? "cURL" : "Python"}
            </button>
          ))}
        </div>

        <DocsCodeBlock code={codeLang === "curl" ? curlExamples[activeTab] : pythonExamples[activeTab]} />
      </section>

      {/* 响应示例 */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>响应示例</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 12px" }}>
          任务成功后返回 <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>output.video_url</code>，URL 默认 24 小时有效。任务记录保留 7 天。
        </p>
        <DocsCodeBlock code={responseExample} />
      </section>

      {/* 注意事项 */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>使用注意</h2>
        <div style={{
          padding: 20, borderRadius: 12,
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          fontSize: 13.5, lineHeight: 1.75, color: "var(--text-secondary)",
        }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li style={{ marginBottom: 8 }}>
              <b>真人肖像限制</b>：Seedance 2.0 系列不支持直接上传含真人人脸的参考图/视频。可使用预置虚拟人像、已授权真人素材或部分模型的含人脸原始产物作为输入。
            </li>
            <li style={{ marginBottom: 8 }}>
              <b>多模态参考约束</b>：参考生视频场景下不可单独输入音频，至少包含 1 张参考图或 1 段参考视频。
            </li>
            <li style={{ marginBottom: 8 }}>
              <b>4K 播放兼容性</b>：4K 视频采用 H.265 编码，少数播放环境可能不兼容。建议使用 VLC、MPV、QuickTime Player 等播放器查看。
            </li>
            <li style={{ marginBottom: 8 }}>
              <b>时长与计费</b>：duration 设为 <code>-1</code> 表示由模型智能选择时长（2.0 / 1.5 Pro 支持），实际时长会影响计费，请谨慎设置。
            </li>
            <li style={{ marginBottom: 0 }}>
              <b>种子复现</b>：相同请求 + 相同 seed 会生成类似结果，但不保证完全一致。Seedance 2.0 系列暂不支持 seed 参数。
            </li>
          </ul>
        </div>
      </section>

      {/* 相关链接 */}
      <section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { href: "/docs/models/seedance", label: "Seedance 模型介绍", desc: "查看模型能力、技术亮点与应用场景" },
            { href: "/docs/api/videos", label: "视频接入文档", desc: "查看统一视频任务接入方式" },
            { href: "/docs/api/tasks", label: "异步任务 API", desc: "任务提交与状态轮询指南" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: 18, borderRadius: 12,
                border: "1px solid var(--border)", background: "var(--bg-elevated)",
                textDecoration: "none", transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-tertiary)" }}>{item.desc}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: "#7c3aed", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                查看详情
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
