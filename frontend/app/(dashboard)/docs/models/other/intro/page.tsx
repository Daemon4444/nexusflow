"use client";

import Link from "next/link";

const categories = [
  {
    name: "图像生成模型",
    color: "#db2777",
    bg: "#fdf2f8",
    border: "#fbcfe8",
    desc: "从文字描述到高质量图片，支持多种风格和分辨率。适合设计素材、营销图片和创意原型的快速生成。",
    models: [
      { name: "Wanx 2.1 Turbo", provider: "阿里云", highlight: "极速生成，批量友好" },
      { name: "Wanx 2.1 Plus", provider: "阿里云", highlight: "高质量细节，商业可用" },
      { name: "Flux Schnell", provider: "Black Forest", highlight: "超快原型，秒级出图" },
      { name: "Flux Pro", provider: "Black Forest", highlight: "专业级质量，顶尖画质" },
    ],
  },
  {
    name: "视频生成模型",
    color: "#f97316",
    bg: "#fff7ed",
    border: "#fed7aa",
    desc: "文生视频和图生视频能力，支持多种时长和分辨率选项。适合短视频制作、产品展示和创意内容生产。",
    models: [
      { name: "Wanx T2V Turbo", provider: "阿里云", highlight: "快速文生视频" },
      { name: "Wanx T2V Plus", provider: "阿里云", highlight: "高质量视频生成" },
      { name: "Kling V1", provider: "快手", highlight: "电影级画面质感" },
      { name: "Kling V1.5 Pro", provider: "快手", highlight: "专业级长视频" },
    ],
  },
  {
    name: "文本向量模型",
    color: "#0f766e",
    bg: "#f0fdfa",
    border: "#99f6e4",
    desc: "将文本转化为高维向量表示，是语义搜索、推荐系统和 RAG（检索增强生成）应用的基础组件。",
    models: [
      { name: "Text Embedding V3", provider: "阿里云", highlight: "中英文高质量向量" },
      { name: "Embedding 3 Small", provider: "OpenAI", highlight: "轻量高效，成本友好" },
      { name: "Embedding 3 Large", provider: "OpenAI", highlight: "高维度精准表示" },
    ],
  },
  {
    name: "其他语言模型",
    color: "#64748b",
    bg: "#f8fafc",
    border: "#cbd5e1",
    desc: "来自不同供应商的特色语言模型，各有独到优势。通过 nexusflow 统一接入，一个 API Key 即可切换使用。",
    models: [
      { name: "GLM-4 Plus", provider: "智谱 AI", highlight: "中文场景均衡通用" },
      { name: "Moonshot V1 128K", provider: "月之暗面", highlight: "超长上下文对话" },
      { name: "Yi Lightning", provider: "零一万物", highlight: "极速响应，性价比高" },
    ],
  },
];

const advantages = [
  {
    title: "统一接入，零切换成本",
    desc: "所有模型通过同一套 OpenAI 兼容接口调用，切换模型只需更改一个参数。无需对接多家 SDK，无需管理多套密钥。",
  },
  {
    title: "统一计费，透明定价",
    desc: "所有模型的用量、费用和账单统一在 nexusflow 平台管理。告别多供应商分别对账的混乱，一个面板看清全部开支。",
  },
  {
    title: "统一监控，全局视野",
    desc: "请求量、成功率、延迟、错误分布——所有模型的运行指标在同一个监控面板上一目了然，方便及时发现和定位问题。",
  },
  {
    title: "持续扩展，紧跟前沿",
    desc: "nexusflow 持续接入新的模型和供应商。无需修改代码，新模型上线后直接可用，始终保持对最新 AI 能力的访问。",
  },
];

export default function OtherModelsIntroPage() {
  return (
    <div className="hh-page" style={{ padding: "0 48px 64px", maxWidth: 1080, margin: "0 auto" }}>

      {/* HERO */}
      <section style={{
        position: "relative", padding: "56px 40px 48px", borderRadius: 24, overflow: "hidden", marginBottom: 32,
        background: "linear-gradient(135deg, #111318 0%, #1e293b 40%, #334155 100%)",
        border: "1px solid rgba(148,163,184,0.15)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}>
        <div style={{ position: "absolute", top: "-30%", right: "-10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(148,163,184,0.1), transparent 70%)", filter: "blur(60px)", animation: "glow-drift 18s ease-in-out infinite alternate" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <span style={{ padding: "5px 14px", borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", background: "rgba(148,163,184,0.15)", color: "#cbd5e1", border: "1px solid rgba(148,163,184,0.25)" }}>
              多模型生态
            </span>
            <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
              图像 / 视频 / 向量 / 对话
            </span>
          </div>
          <h1 style={{ fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 16px", background: "linear-gradient(135deg, #f8fafc 0%, #cbd5e1 50%, #94a3b8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            更多模型
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.75, margin: "0 0 10px", color: "rgba(226,232,240,0.8)", maxWidth: 640 }}>
            除了 Qwen、DeepSeek 和视频模型之外，nexusflow 还接入了图像生成、视频生成、文本向量和多家第三方语言模型——全部通过统一 API 调用。
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 28px", color: "rgba(148,163,184,0.7)", maxWidth: 600 }}>
            一个平台，一套接口，覆盖文本、图像、视频、向量的全场景 AI 能力。
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/models" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 12, background: "linear-gradient(135deg, #64748b, #475569)", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 4px 16px rgba(100,116,139,0.3)" }}>
              浏览全部模型 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/docs/models/other" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 24px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", fontSize: 14, fontWeight: 500, textDecoration: "none" }}>
              查看 API 文档
            </Link>
          </div>
        </div>
      </section>

      {/* 模型分类 */}
      {categories.map((cat) => (
        <section key={cat.name} style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{cat.name}</h2>
            <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>
              {cat.models.length} 个模型
            </span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.75, color: "var(--text-secondary)", margin: "0 0 16px", maxWidth: 700 }}>{cat.desc}</p>
          <div className="grid-2-responsive" style={{ display: "grid", gap: 12 }}>
            {cat.models.map((m) => (
              <div key={m.name} style={{ padding: 18, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg)" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{m.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>{m.provider}</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>{m.highlight}</div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* 平台优势 */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>统一接入的优势</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>为什么通过 nexusflow 使用这些模型更好。</p>
        <div className="grid-2-responsive" style={{ display: "grid", gap: 14 }}>
          {advantages.map((a) => (
            <div key={a.title} style={{ padding: 22, borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{a.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.75, color: "var(--text-secondary)" }}>{a.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 相关链接 */}
      <section>
        <div className="grid-3-responsive" style={{ display: "grid", gap: 14 }}>
          {[
            { href: "/docs/models/other", label: "模型 API 文档", desc: "查看完整的模型列表与定价" },
            { href: "/docs/quickstart", label: "快速开始", desc: "5 分钟完成首次 API 调用" },
            { href: "/playground", label: "在线体验", desc: "在 Playground 中试用全部模型" },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{ padding: 20, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-tertiary)" }}>{item.desc}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#64748b", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                查看详情 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
