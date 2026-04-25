"use client";

import { useState } from "react";
import Link from "next/link";

const requestParams = [
  { name: "model", type: "string", required: true, default: "-", desc: "图像生成模型 ID。例如 wanx2.1-t2i-turbo、flux-schnell 等。" },
  { name: "prompt", type: "string", required: true, default: "-", desc: "图像描述文本，支持中英文。描述越详细，生成效果越好。" },
  { name: "negative_prompt", type: "string", required: false, default: "-", desc: "负面提示词，描述不希望出现在图像中的元素。" },
  { name: "n", type: "integer", required: false, default: "1", desc: "生成图像数量，范围 1-4。" },
  { name: "size", type: "string", required: false, default: '"1024x1024"', desc: "图像尺寸。支持 1024x1024、1024x768、768x1024 等。" },
  { name: "style", type: "string", required: false, default: "-", desc: "图像风格，如 vivid（生动）、natural（自然）等。" },
  { name: "quality", type: "string", required: false, default: '"standard"', desc: "图像质量，standard 或 hd。hd 质量更高但耗时更长。" },
  { name: "response_format", type: "string", required: false, default: '"url"', desc: "返回格式，url 或 b64_json。" },
  { name: "user", type: "string", required: false, default: "-", desc: "终端用户标识符。" },
];

const models = [
  { id: "wanx2.1-t2i-turbo", provider: "阿里云", sizes: "1024x1024, 720x1280, 1280x720", speed: "快速", price: "¥0.14/张" },
  { id: "wanx2.1-t2i-plus", provider: "阿里云", sizes: "最高 2048x2048", speed: "标准", price: "¥0.20/张" },
  { id: "flux-schnell", provider: "Black Forest", sizes: "1024x1024", speed: "快速", price: "¥0.02/张" },
  { id: "flux-pro", provider: "Black Forest", sizes: "最高 2048x2048", speed: "高质量", price: "¥0.35/张" },
];

const codeExamples: Record<string, Record<string, string>> = {
  basic: {
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

response = client.images.generate(
    model="wanx2.1-t2i-turbo",
    prompt="一只可爱的橘猫在阳光下打盹，水彩画风格",
    size="1024x1024",
    n=1,
)

image_url = response.data[0].url
print(f"图片地址: {image_url}")`,
    curl: `curl https://nexusflow.hk/v1/images/generations \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wanx2.1-t2i-turbo",
    "prompt": "一只可爱的橘猫在阳光下打盹，水彩画风格",
    "size": "1024x1024",
    "n": 1
  }'`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "https://nexusflow.hk/v1",
});

const response = await client.images.generate({
  model: "wanx2.1-t2i-turbo",
  prompt: "一只可爱的橘猫在阳光下打盹，水彩画风格",
  size: "1024x1024",
  n: 1,
});

console.log("图片地址:", response.data[0].url);`,
  },
  advanced: {
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

response = client.images.generate(
    model="wanx2.1-t2i-plus",
    prompt="""
    一位身穿古装的中国女子，
    站在樱花树下，
    手持油纸伞，
    微风吹动发丝，
    精致的面部特写，
    电影级光影，8K 超高清
    """,
    negative_prompt="模糊, 变形, 低质量, 文字水印",
    size="1024x1024",
    quality="hd",
    n=1,
)

print(f"图片地址: {response.data[0].url}")`,
    curl: `curl https://nexusflow.hk/v1/images/generations \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wanx2.1-t2i-plus",
    "prompt": "一位身穿古装的中国女子，站在樱花树下，手持油纸伞，微风吹动发丝，精致的面部特写，电影级光影，8K 超高清",
    "negative_prompt": "模糊, 变形, 低质量, 文字水印",
    "size": "1024x1024",
    "quality": "hd",
    "n": 1
  }'`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "https://nexusflow.hk/v1",
});

const response = await client.images.generate({
  model: "wanx2.1-t2i-plus",
  prompt: \`
    一位身穿古装的中国女子，
    站在樱花树下，
    手持油纸伞，
    微风吹动发丝，
    精致的面部特写，
    电影级光影，8K 超高清
  \`,
  negative_prompt: "模糊, 变形, 低质量, 文字水印",
  size: "1024x1024",
  quality: "hd",
  n: 1,
});

console.log("图片地址:", response.data[0].url);`,
  },
  batch: {
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-air-your-key",
    base_url="https://nexusflow.hk/v1",
)

# 生成多张图片
response = client.images.generate(
    model="flux-schnell",
    prompt="未来科幻城市，霓虹灯，赛博朋克风格",
    size="1024x1024",
    n=4,  # 一次生成 4 张
)

for i, image in enumerate(response.data):
    print(f"图片 {i+1}: {image.url}")`,
    curl: `curl https://nexusflow.hk/v1/images/generations \\
  -H "Authorization: Bearer sk-air-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "flux-schnell",
    "prompt": "未来科幻城市，霓虹灯，赛博朋克风格",
    "size": "1024x1024",
    "n": 4
  }'`,
    nodejs: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-air-your-key",
  baseURL: "https://nexusflow.hk/v1",
});

const response = await client.images.generate({
  model: "flux-schnell",
  prompt: "未来科幻城市，霓虹灯，赛博朋克风格",
  size: "1024x1024",
  n: 4,
});

response.data.forEach((image, i) => {
  console.log(\`图片 \${i + 1}:\`, image.url);
});`,
  },
};

export default function ImagesPage() {
  const [activeTab, setActiveTab] = useState<"basic" | "advanced" | "batch">("basic");
  const [codeLang, setCodeLang] = useState<"python" | "curl" | "nodejs">("python");

  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 4,
            background: "#dbeafe",
            color: "#1d4ed8",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            POST
          </span>
          <code style={{ fontSize: 15, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-primary)" }}>
            /v1/images/generations
          </code>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          图像生成 API
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          根据文本描述生成高质量图像。支持多种风格、尺寸和质量选项。
        </p>
      </div>

      {/* Models */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          支持的模型
        </h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型 ID</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>供应商</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>支持尺寸</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>特点</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>价格</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, idx) => (
                <tr key={m.id} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{m.id}</code>
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{m.provider}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>{m.sizes}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: m.speed === "快速" ? "var(--success-bg)" : m.speed === "高质量" ? "var(--accent-bg)" : "var(--bg-elevated)",
                      color: m.speed === "快速" ? "var(--success)" : m.speed === "高质量" ? "var(--accent)" : "var(--text-secondary)",
                    }}>
                      {m.speed}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "right", color: "var(--success)" }}>{m.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Request params */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          请求参数
        </h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>参数名</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 80 }}>类型</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 50 }}>必填</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", width: 100 }}>默认值</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {requestParams.map((p, idx) => (
                <tr key={p.name} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>{p.name}</code>
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontSize: 12 }}>{p.type}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    {p.required ? <span style={{ color: "var(--danger)", fontWeight: 600 }}>*</span> : <span style={{ color: "var(--text-tertiary)" }}>-</span>}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{p.default}</code>
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13 }}>{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Code examples */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          代码示例
        </h2>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { key: "basic", label: "基础调用" },
            { key: "advanced", label: "高级参数" },
            { key: "batch", label: "批量生成" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: activeTab === tab.key ? "var(--text-primary)" : "var(--bg)",
                color: activeTab === tab.key ? "#fff" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {(["python", "curl", "nodejs"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setCodeLang(lang)}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 500,
                border: "none",
                borderRadius: 4,
                background: codeLang === lang ? "#333" : "transparent",
                color: codeLang === lang ? "#fff" : "var(--text-tertiary)",
                cursor: "pointer",
              }}
            >
              {lang === "python" ? "Python" : lang === "curl" ? "cURL" : "Node.js"}
            </button>
          ))}
        </div>

        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 13, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
            {codeExamples[activeTab][codeLang]}
          </pre>
        </div>
      </section>

      {/* Response */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          响应示例
        </h2>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 20, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 13, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
{`{
  "created": 1711234567,
  "data": [
    {
      "url": "https://cdn.nexusflow.io/images/xxx.png",
      "revised_prompt": "一只可爱的橘色猫咪..."
    }
  ]
}`}
          </pre>
        </div>
      </section>

      {/* Prompt tips */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          Prompt 技巧
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {[
            { title: "具体描述", desc: "描述越具体越好：主体、动作、环境、光线、风格等。" },
            { title: "使用风格词", desc: "添加艺术风格：水彩、油画、赛博朋克、吉卜力等。" },
            { title: "负面提示", desc: "用 negative_prompt 排除不想要的元素。" },
            { title: "参考格式", desc: "[主体] + [动作/状态] + [环境] + [风格] + [质量词]" },
          ].map((item) => (
            <div key={item.title} style={{ padding: 20, background: "var(--bg-elevated)", borderRadius: 10, border: "1px solid var(--border)" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>{item.title}</h3>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Related */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          相关文档
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/api/videos", label: "视频生成", desc: "文生视频 API" },
            { href: "/docs/api/tasks", label: "异步任务", desc: "长时任务处理" },
            { href: "/docs/api/errors", label: "错误码", desc: "错误处理参考" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{ padding: 16, background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border)", textDecoration: "none" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
