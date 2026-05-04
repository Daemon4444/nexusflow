"use client";

import { useState } from "react";
import Link from "next/link";

const API_BASE = "https://nexusflow.hk";

const requestParams = [
  { name: "model", type: "string", required: true, desc: "固定值：wan2.6-t2i" },
  { name: "prompt", type: "string", required: true, desc: "图像描述文本，支持中英文。描述越详细，生成效果越好。不超过 2500 个中文字符。" },
  { name: "size", type: "string", required: false, desc: "图像尺寸。可选值：1024x1024（默认）、768x1024、1024x768、720x1280、1280x720。" },
  { name: "n", type: "integer", required: false, desc: "生成图像数量，范围 1-4，默认 1。" },
  { name: "negative_prompt", type: "string", required: false, desc: "负面提示词，描述不希望出现在图像中的元素。" },
  { name: "seed", type: "integer", required: false, desc: "随机种子 [0, 2147483647]，固定 seed 可提升可复现性。" },
];

const curlExample = `curl -X POST '${API_BASE}/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wan2.6-t2i",
    "prompt": "一只可爱的橘猫在阳光下打盹，水彩画风格，温暖色调",
    "size": "1024x1024",
    "n": 1
  }'

# 响应直接返回生成结果（无需轮询）：
# {
#   "id": "4b0a0920-...",
#   "object": "task",
#   "status": "succeeded",
#   "model": "wan2.6-t2i",
#   "type": "image",
#   "output": {
#     "type": "image",
#     "image_url": "https://dashscope-result.oss-cn-beijing.aliyuncs.com/xxx.png",
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
        "prompt": "一只可爱的橘猫在阳光下打盹，水彩画风格，温暖色调",
        "size": "1024x1024",
        "n": 1,
    },
).json()

# wan2.6-t2i 为同步接口，直接返回结果，无需轮询
if response["status"] == "succeeded":
    image_url = response["output"]["image_url"]
    print(f"生成完成！图片URL: {image_url}")
else:
    print(f"生成失败: {response.get('error')}")`;

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
          万相 2.6 / Alibaba
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          图像生成 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          万相 2.6 文生图模型，输入文本描述即可生成高质量图像。API 为<strong>同步接口</strong>，提交请求后直接返回生成结果，无需轮询。通常耗时 8-15 秒。
        </p>
      </div>

      {/* HTTP Flow */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>接口信息</h2>
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
            同步调用 — 请求完成后直接返回图片 URL，无需额外查询。响应中 <code>status</code> 直接为 <code>"succeeded"</code>。
          </div>
        </div>
      </section>

      {/* Supported models */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>支持的模型</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型 ID</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>名称</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>支持尺寸</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>调用方式</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>价格</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--bg)" }}>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                  <code style={{ fontSize: 13, fontWeight: 600 }}>wan2.6-t2i</code>
                </td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>万相 2.6 文生图</td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-secondary)" }}>1024x1024, 768x1024, 1024x768, 720x1280, 1280x720</td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "#dcfce7", color: "#16a34a" }}>同步</span>
                </td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "right", color: "var(--accent)", fontWeight: 600 }}>¥0.20 / 张</td>
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
          <strong>同步接口说明：</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>wan2.6-t2i 为同步接口，提交请求后<strong>直接返回生成结果</strong>，无需轮询。</li>
            <li>请求耗时通常 8-15 秒，请确保客户端超时设置足够（建议 &gt; 30 秒）。</li>
            <li>图片 URL 有效期 24 小时，获取后请立即下载保存。</li>
            <li>按生成图片数量计费（如 n=4 则 ¥0.80），仅对成功任务计费。</li>
          </ul>
        </div>
      </section>

      {/* Request params table */}
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

      {/* Code examples */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>完整调用示例</h2>
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
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
            {codeLang === "curl" ? curlExample : pythonExample}
          </pre>
        </div>
      </section>

      {/* Response */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>响应示例</h2>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>成功响应</h3>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
{`{
  "id": "4b0a0920-ce86-4fbe-81cc-55e3b89a6ed1",
  "object": "task",
  "status": "succeeded",
  "model": "wan2.6-t2i",
  "type": "image",
  "output": {
    "type": "image",
    "image_url": "https://dashscope-result.oss-cn-beijing.aliyuncs.com/xxx.png",
    "images": [
      "https://dashscope-result.oss-cn-beijing.aliyuncs.com/xxx.png"
    ]
  },
  "created_at": "2026-06-01T10:00:00.000Z",
  "completed_at": "2026-06-01T10:00:10.000Z"
}`}
          </pre>
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>失败响应</h3>
        <div style={{ background: "#111827", borderRadius: 8, padding: 18, overflow: "auto", marginBottom: 20 }}>
          <pre style={{ margin: 0, fontSize: 12.5, color: "#e5e7eb", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.65 }}>
{`{
  "error": {
    "message": "InvalidParameter: prompt is empty",
    "type": "upstream_error",
    "code": "upstream_error"
  }
}`}
          </pre>
        </div>

        {/* Response fields */}
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>响应字段</h3>
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
                ["status", "string", "同步接口直接返回 \"succeeded\" 或通过 error 对象返回失败信息。"],
                ["output.image_url", "string", "生成的图片 URL（首张）。PNG 格式，链接有效期 24 小时。"],
                ["output.images", "array", "所有生成图片的 URL 数组（n > 1 时返回多张）。"],
                ["created_at", "string", "任务创建时间（ISO 8601 格式）。"],
                ["completed_at", "string", "任务完成时间。"],
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
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>单价</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "var(--bg)" }}>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>wan2.6-t2i</td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--accent)", fontWeight: 600 }}>¥0.20 / 张</td>
                <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>按生成图片数量计费（如 n=4 则 ¥0.80）。仅对成功任务计费，失败任务不扣费。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Links */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { href: "/docs/api/videos", label: "视频生成 API", desc: "查看文生视频接口文档" },
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
