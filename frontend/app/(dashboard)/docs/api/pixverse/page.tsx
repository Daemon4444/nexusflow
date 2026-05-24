"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://nexusflow.hk";

type TabKey = "t2v" | "i2v" | "kf2v" | "r2v";

const tabs: { key: TabKey; label: string; desc: string }[] = [
  { key: "t2v", label: "文生视频", desc: "基于文本提示词生成视频" },
  { key: "i2v", label: "图生视频（首帧）", desc: "基于输入图像和文本提示词生成视频" },
  { key: "kf2v", label: "图生视频（首尾帧）", desc: "基于首帧、尾帧图像和文本提示词生成过渡视频" },
  { key: "r2v", label: "参考生视频", desc: "基于多张参考图片和文本提示词生成视频" },
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
    "prompt": "一只小猫在月光下奔跑"
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
    "prompt": "让图片中的场景动起来"
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
    "prompt": "小猫从窗台跳下，落在沙发上，好奇地环顾四周"
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
    "prompt": "男人坐在靠窗的椅子上，手持吉他演奏乡村民谣"
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

# 步骤1: 创建任务
response = requests.post(
    f"{BASE}/v1/services/aigc/video-generation/video-synthesis",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable"
    },
    json={
        "model": "pixverse-v6",
        "input": {"prompt": "一只小猫在月光下奔跑"},
        "parameters": {"size": "1280*720", "duration": 5}
    }
)
task_id = response.json()["output"]["task_id"]
print(f"任务已创建: {task_id}")

# 步骤2: 轮询查询结果
while True:
    result = requests.get(
        f"{BASE}/v1/video/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"}
    ).json()
    status = result["output"]["task_status"]
    print(f"状态: {status}")
    if status == "SUCCEEDED":
        print(f"视频URL: {result['output']['video_url']}")
        break
    elif status == "FAILED":
        print(f"失败: {result['output'].get('message')}")
        break
    time.sleep(15)`,
  i2v: `import time, requests

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 步骤1: 创建图生视频任务
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
            "prompt": "让画面中的场景动起来"
        },
        "parameters": {"resolution": "720P", "duration": 5}
    }
)
task_id = response.json()["output"]["task_id"]

# 步骤2: 轮询结果
while True:
    result = requests.get(
        f"{BASE}/v1/video/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"}
    ).json()
    status = result["output"]["task_status"]
    if status == "SUCCEEDED":
        print(f"视频: {result['output']['video_url']}")
        break
    elif status == "FAILED":
        print(f"失败: {result['output'].get('message')}")
        break
    time.sleep(15)`,
  kf2v: `import time, requests

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 步骤1: 创建首尾帧生视频任务
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
            "prompt": "小猫从窗台跳到沙发上"
        },
        "parameters": {"resolution": "720P", "duration": 5}
    }
)
task_id = response.json()["output"]["task_id"]

# 步骤2: 轮询结果
while True:
    result = requests.get(
        f"{BASE}/v1/video/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"}
    ).json()
    status = result["output"]["task_status"]
    if status == "SUCCEEDED":
        print(f"视频: {result['output']['video_url']}")
        break
    elif status in ("FAILED", "UNKNOWN"):
        print(f"失败: {result['output'].get('message', '未知错误')}")
        break
    time.sleep(15)`,
  r2v: `import time, requests

API_KEY = "sk-air-your-key"
BASE = "${API_BASE}"

# 步骤1: 创建参考生视频任务（最多7张参考图）
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
            "prompt": "男人坐在窗边弹吉他"
        },
        "parameters": {"size": "1280*720", "duration": 5}
    }
)
task_id = response.json()["output"]["task_id"]

# 步骤2: 轮询结果
while True:
    result = requests.get(
        f"{BASE}/v1/video/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"}
    ).json()
    status = result["output"]["task_status"]
    if status == "SUCCEEDED":
        print(f"视频: {result['output']['video_url']}")
        break
    elif status in ("FAILED", "UNKNOWN"):
        break
    time.sleep(15)`,
};

const requestParams: Record<TabKey, { name: string; type: string; required: boolean; desc: string }[]> = {
  t2v: [
    { name: "model", type: "string", required: true, desc: "固定值：pixverse-v6" },
    { name: "input.prompt", type: "string", required: true, desc: "文本提示词，支持中英文，不超过 5000 字符。支持多镜头描述（镜头1:... 镜头2:...）" },
    { name: "parameters.size", type: "string", required: true, desc: "视频分辨率（宽*高），如 1280*720、1920*1080" },
    { name: "parameters.duration", type: "integer", required: true, desc: "视频时长（秒）。v6 支持 1~15 秒" },
    { name: "parameters.audio", type: "boolean", required: false, desc: "是否生成有声视频（AI 配音/音效），默认 false" },
    { name: "parameters.watermark", type: "boolean", required: false, desc: "是否添加水印，默认 false" },
    { name: "parameters.seed", type: "integer", required: false, desc: "随机种子 [0, 2147483647]，固定可提高复现性" },
    { name: "parameters.shot_type", type: "string", required: false, desc: "镜头类型：single（默认）或 multi（多镜头）" },
  ],
  i2v: [
    { name: "model", type: "string", required: true, desc: "固定值：pixverse-v6" },
    { name: "input.media[0].type", type: "string", required: true, desc: '固定值："image_url"' },
    { name: "input.media[0].url", type: "string", required: true, desc: "图像 URL（JPG/PNG/WEBP，≤20MB，宽高≤10000px）" },
    { name: "input.prompt", type: "string", required: false, desc: "文本提示词，描述视频动态效果" },
    { name: "parameters.resolution", type: "string", required: true, desc: "分辨率档位：360P / 540P / 720P / 1080P" },
    { name: "parameters.duration", type: "integer", required: true, desc: "视频时长（秒）。360P~720P: 5/8/10；1080P: 5/8" },
    { name: "parameters.audio", type: "boolean", required: false, desc: "是否生成有声视频，默认 false" },
    { name: "parameters.watermark", type: "boolean", required: false, desc: "是否添加水印，默认 false" },
    { name: "parameters.seed", type: "integer", required: false, desc: "随机种子 [0, 2147483647]" },
  ],
  kf2v: [
    { name: "model", type: "string", required: true, desc: "固定值：pixverse-v6" },
    { name: "input.media", type: "array", required: true, desc: "包含 2 个元素：type=first_frame 和 type=last_frame" },
    { name: "input.media[].type", type: "string", required: true, desc: '"first_frame" 或 "last_frame"' },
    { name: "input.media[].url", type: "string", required: true, desc: "图像 URL（JPG/PNG/WEBP，≤20MB，宽高≤10000px）" },
    { name: "input.prompt", type: "string", required: true, desc: "描述首帧到尾帧的变化过程" },
    { name: "parameters.resolution", type: "string", required: true, desc: "分辨率档位：360P / 540P / 720P / 1080P" },
    { name: "parameters.duration", type: "integer", required: true, desc: "视频时长（秒）。360P~720P: 5/8/10；1080P: 5/8" },
    { name: "parameters.audio", type: "boolean", required: false, desc: "是否生成有声视频，默认 false" },
    { name: "parameters.watermark", type: "boolean", required: false, desc: "是否添加水印，默认 false" },
    { name: "parameters.seed", type: "integer", required: false, desc: "随机种子 [0, 2147483647]" },
  ],
  r2v: [
    { name: "model", type: "string", required: true, desc: "固定值：pixverse-v6" },
    { name: "input.media", type: "array", required: true, desc: "参考图片数组，最多 7 张" },
    { name: "input.media[].type", type: "string", required: true, desc: '固定值："image_url"' },
    { name: "input.media[].url", type: "string", required: true, desc: "图像 URL（JPG/PNG/WEBP，≤20MB）" },
    { name: "input.prompt", type: "string", required: true, desc: "描述视频内容和场景" },
    { name: "parameters.size", type: "string", required: true, desc: "视频分辨率（宽*高），如 1280*720" },
    { name: "parameters.duration", type: "integer", required: true, desc: "视频时长（秒）。360P~720P: 5/8/10；1080P: 5/8" },
    { name: "parameters.audio", type: "boolean", required: false, desc: "是否生成有声视频，默认 false" },
    { name: "parameters.watermark", type: "boolean", required: false, desc: "是否添加水印，默认 false" },
    { name: "parameters.seed", type: "integer", required: false, desc: "随机种子 [0, 2147483647]" },
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
          PixVerse / 爱诗科技
        </span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, letterSpacing: "-0.5px" }}>
        爱诗（PixVerse）视频生成 API
      </h1>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.6 }}>
        爱诗 PixVerse V6 系列模型支持文生视频、图生视频、首尾帧生视频、参考生视频四种模式。
        API 采用异步调用方式：先创建任务获取 task_id，再轮询查询结果。
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
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>接口信息</h2>
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
            <strong>模型：</strong><code style={{ background: "var(--bg)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>{models[activeTab]}</code>
            <span style={{ marginLeft: 16 }}>{tabs.find(t => t.key === activeTab)?.desc}</span>
          </div>
        </div>
      </section>

      {/* Headers */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>请求头</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Header</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>必选</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {[
                { h: "Content-Type", req: "是", d: "application/json" },
                { h: "Authorization", req: "是", d: "Bearer <API_KEY>" },
                { h: "X-DashScope-Async", req: "是", d: '必须设置为 "enable"' },
              ].map((row, i) => (
                <tr key={row.h} style={{ background: i % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{row.h}</code>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: row.req === "是" ? "#dc2626" : "var(--text-secondary)" }}>{row.req}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{row.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Request Params */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>请求参数</h2>
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
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>分辨率对照表</h2>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-elevated)" }}>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>档位</th>
                  {aspectLabels.map(a => (
                    <th key={a} style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{a}</th>
                  ))}
                  <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>可选时长</th>
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
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>请求示例</h2>
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
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>响应示例</h2>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>步骤1：创建任务响应</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 16, overflow: "auto", marginBottom: 16 }}>
          <DocsCodeBlock code={`{
  "output": {
    "task_status": "PENDING",
    "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx"
  },
  "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx"
}`} />
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>步骤2：查询结果响应（成功）</h3>
        <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 16, overflow: "auto" }}>
          <DocsCodeBlock code={`{
  "request_id": "19171ea5-9efb-4d35-93a1-xxxxxx",
  "output": {
    "task_id": "7ed706b7-a9a9-4319-820c-xxxxxx",
    "task_status": "SUCCEEDED",
    "submit_time": "2026-03-20 10:34:41.630",
    "scheduled_time": "2026-03-20 10:34:41.655",
    "end_time": "2026-03-20 10:35:12.725",
    "orig_prompt": "一只小猫在月光下奔跑",
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
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>响应参数</h2>
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
                { f: "output.task_id", t: "string", d: "任务ID，有效期24小时" },
                { f: "output.task_status", t: "string", d: "PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED / UNKNOWN" },
                { f: "output.video_url", t: "string", d: "生成的视频URL（仅 SUCCEEDED 时返回），MP4 格式" },
                { f: "output.orig_prompt", t: "string", d: "原始输入的 prompt" },
                { f: "output.submit_time", t: "string", d: "任务提交时间" },
                { f: "output.end_time", t: "string", d: "任务完成时间" },
                { f: "usage.duration", t: "integer", d: "视频时长（秒），用于计费" },
                { f: "usage.size", t: "string", d: "视频分辨率" },
                { f: "usage.fps", t: "integer", d: "视频帧率" },
                { f: "usage.audio", t: "boolean", d: "是否有声视频" },
                { f: "usage.video_count", t: "integer", d: "视频数量，固定为 1" },
                { f: "request_id", t: "string", d: "请求唯一标识" },
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
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>调用流程</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { step: "1", title: "创建任务", desc: "POST 请求创建视频生成任务，获取 task_id" },
            { step: "2", title: "轮询状态", desc: "GET 请求查询任务状态，建议间隔 15 秒" },
            { step: "3", title: "获取结果", desc: "状态变为 SUCCEEDED 时，从 video_url 下载视频" },
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
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#92400e", marginBottom: 8 }}>注意事项</h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: "#92400e" }}>
          <li>API 仅支持异步调用，请求头必须包含 <code>X-DashScope-Async: enable</code></li>
          <li>task_id 有效期 24 小时，超时后无法查询</li>
          <li>视频生成通常需要 1-5 分钟，轮询建议间隔 15 秒</li>
          <li>1080P 分辨率下不支持 10 秒时长</li>
          <li>video_url 请及时下载保存，不建议作为长期存储</li>
          <li>图片格式支持 JPG/PNG/WEBP，单张不超过 20MB，分辨率不超过 10000x10000</li>
          {activeTab === "r2v" && <li>参考生视频最多支持传入 7 张参考图片</li>}
          {activeTab === "kf2v" && <li>首帧和尾帧图像分辨率可以不同，输出以首帧为基准</li>}
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
