"use client";

import Link from "next/link";

const otherModels = [
  {
    category: "图像生成",
    models: [
      { id: "wanx2.1-t2i-turbo", name: "Wanx 2.1 Turbo", provider: "阿里云", desc: "快速文生图，适合批量生成", price: "¥0.14/张" },
      { id: "wanx2.1-t2i-plus", name: "Wanx 2.1 Plus", provider: "阿里云", desc: "高质量文生图，细节丰富", price: "¥0.20/张" },
      { id: "flux-schnell", name: "Flux Schnell", provider: "Black Forest", desc: "超快生成，适合原型设计", price: "¥0.02/张" },
      { id: "flux-pro", name: "Flux Pro", provider: "Black Forest", desc: "专业级质量，商业可用", price: "¥0.35/张" },
    ],
  },
  {
    category: "视频生成",
    models: [
      { id: "wanx2.1-t2v-turbo", name: "Wanx T2V Turbo", provider: "阿里云", desc: "快速文生视频", price: "¥0.24/秒" },
      { id: "wanx2.1-t2v-plus", name: "Wanx T2V Plus", provider: "阿里云", desc: "高质量文生视频", price: "¥0.40/秒" },
      { id: "kling-v1", name: "Kling V1", provider: "快手", desc: "电影级视频生成", price: "¥0.30/秒" },
      { id: "kling-v1.5-pro", name: "Kling V1.5 Pro", provider: "快手", desc: "专业级长视频", price: "¥0.50/秒" },
    ],
  },
  {
    category: "文本向量",
    models: [
      { id: "text-embedding-v3", name: "Text Embedding V3", provider: "阿里云", desc: "高质量中英文向量", price: "¥0.5/百万" },
      { id: "text-embedding-3-small", name: "Embedding 3 Small", provider: "OpenAI", desc: "轻量高效", price: "¥0.14/百万" },
      { id: "text-embedding-3-large", name: "Embedding 3 Large", provider: "OpenAI", desc: "高维度精准", price: "¥0.91/百万" },
    ],
  },
  {
    category: "其他语言模型",
    models: [
      { id: "glm-4-plus", name: "GLM-4 Plus", provider: "智谱 AI", desc: "通用对话模型", price: "¥50/M" },
      { id: "moonshot-v1-128k", name: "Moonshot V1 128K", provider: "月之暗面", desc: "超长上下文", price: "¥60/M" },
      { id: "yi-lightning", name: "Yi Lightning", provider: "零一万物", desc: "快速响应", price: "¥6/M" },
    ],
  },
];

export default function OtherModelsPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "linear-gradient(135deg, #64748b 0%, #94a3b8 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="1"/>
              <circle cx="19" cy="12" r="1"/>
              <circle cx="5" cy="12" r="1"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              其他模型
            </h1>
            <div style={{ fontSize: 14, color: "var(--text-tertiary)", marginTop: 4 }}>
              多家供应商
            </div>
          </div>
        </div>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 700 }}>
          除了主流大语言模型外，nexusflow 还整合了图像生成、视频生成、文本向量等多种模型，
          满足不同场景的 AI 需求。
        </p>
      </div>

      {/* Models by category */}
      {otherModels.map((category) => (
        <section key={category.category} style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
            {category.category}
          </h2>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "var(--bg-elevated)" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>模型 ID</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>名称</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>供应商</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>说明</th>
                  <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>价格</th>
                </tr>
              </thead>
              <tbody>
                {category.models.map((model, idx) => (
                  <tr key={model.id} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                      <code style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{model.id}</code>
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{model.name}</td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{model.provider}</td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13 }}>{model.desc}</td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "right", color: "var(--success)" }}>{model.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {/* Related docs */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          相关文档
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { href: "/docs/api/images", label: "图像生成 API", desc: "文生图接口" },
            { href: "/docs/api/videos", label: "视频生成 API", desc: "文生视频接口" },
            { href: "/docs/api/embeddings", label: "向量 API", desc: "文本向量接口" },
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
