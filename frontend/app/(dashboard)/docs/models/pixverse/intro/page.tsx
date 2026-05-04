"use client";

import Link from "next/link";

const capabilities = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    title: "文本生成视频",
    desc: "用自然语言描述场景，PixVerse 自动生成高质量视频。支持详细的运镜、光影和动作指令，从一句话到一段完整的视觉故事。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    title: "图片生成视频",
    desc: "上传参考图片即可将静态画面转化为动态视频，支持自定义运动轨迹和镜头效果，保持画面风格与原图一致。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
    title: "参考图视频",
    desc: "提供风格参考图，PixVerse 会在保持参考风格的同时生成全新场景的视频，适合品牌风格一致性和系列内容创作。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    ),
    title: "首尾帧控制",
    desc: "指定视频的起始帧和结束帧，PixVerse 自动生成中间过渡动画。精准控制视频的开头与结尾，适合精确运镜和转场效果。",
  },
];

const versions = [
  { version: "v6", badge: "当前主推", desc: "最新版本，画面质感和运动流畅度大幅提升，支持文生视频和图生视频双模式，可在百炼渠道与 PixVerse 官方渠道之间灵活切换。" },
  { version: "v4.5", badge: "稳定版", desc: "经过大规模验证的稳定版本，在视频清晰度和生成速度之间取得良好平衡，适合对稳定性要求高的生产环境。" },
  { version: "v4", badge: "兼容版", desc: "经典版本，保持向下兼容。适合已有集成方案不便升级的用户，持续维护但不再更新新功能。" },
];

const techHighlights = [
  {
    title: "多渠道智能路由",
    desc: "平台后端支持在百炼渠道和 PixVerse 官方渠道之间智能切换，根据可用性、队列深度和响应速度自动选择最优路径。",
  },
  {
    title: "统一异步任务架构",
    desc: "视频生成统一走异步任务链路（/v1/tasks），提交后通过状态轮询获取结果。天然适合高时延模型、批量任务和后台工作流。",
  },
  {
    title: "多画面比例支持",
    desc: "支持横屏（16:9）、竖屏（9:16）和方形（1:1）三种主流画面比例，直接适配抖音、YouTube、Instagram 等不同平台的内容规格。",
  },
  {
    title: "灵活的质量控制",
    desc: "支持 540p、720p 和 1080p 三档清晰度选择，用户可以在生成速度和画面质量之间灵活权衡，满足从原型预览到成品交付的不同需求。",
  },
];

const useCases = [
  { title: "短视频批量生成", desc: "配合异步任务接口，可以批量提交视频生成任务，适合 MCN 机构和内容平台的大规模内容生产。" },
  { title: "电商产品动态展示", desc: "将静态产品图转化为动态展示视频，自动生成旋转、特写等电商常用运镜效果。" },
  { title: "社交媒体内容", desc: "支持 9:16 竖屏比例，直出适配抖音、小红书格式的短视频内容，大幅降低创作门槛。" },
  { title: "创意原型验证", desc: "快速生成视频原型，在正式投入制作资源前低成本验证创意方案的可行性。" },
  { title: "品牌视觉一致性", desc: "参考图模式确保系列视频保持统一的视觉风格，适合品牌营销和系列内容制作。" },
  { title: "广告素材测试", desc: "批量生成不同风格和叙事的广告视频，用于 A/B 测试和数据驱动的创意优化。" },
];

export default function PixVerseIntroPage() {
  return (
    <div className="hh-page" style={{ padding: "0 48px 64px", maxWidth: 1080, margin: "0 auto" }}>

      {/* HERO */}
      <section style={{
        position: "relative", padding: "56px 40px 48px", borderRadius: 24, overflow: "hidden", marginBottom: 32,
        background: "linear-gradient(135deg, #0f1419 0%, #1a2332 40%, #0d3b66 100%)",
        border: "1px solid rgba(14,165,233,0.15)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}>
        <div style={{ position: "absolute", top: "-30%", right: "-10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(14,165,233,0.15), transparent 70%)", filter: "blur(60px)", animation: "glow-drift 18s ease-in-out infinite alternate" }} />
        <div style={{ position: "absolute", bottom: "-20%", left: "10%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(56,189,248,0.1), transparent 70%)", filter: "blur(50px)", animation: "glow-drift 22s ease-in-out infinite alternate-reverse" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <span style={{ padding: "5px 14px", borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", background: "linear-gradient(135deg, rgba(14,165,233,0.25), rgba(56,189,248,0.2))", color: "#7dd3fc", border: "1px solid rgba(14,165,233,0.25)" }}>
              AI 视频生成
            </span>
            <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
              多版本可选
            </span>
            <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)" }}>by PixVerse AI</span>
          </div>
          <h1 style={{ fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 16px", background: "linear-gradient(135deg, #f8fafc 0%, #7dd3fc 50%, #38bdf8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            PixVerse
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.75, margin: "0 0 10px", color: "rgba(226,232,240,0.8)", maxWidth: 640 }}>
            专业级 AI 视频生成平台。支持文生视频、图生视频、参考图视频和首尾帧控制，覆盖从创意到成片的完整视频制作流程。
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 28px", color: "rgba(148,163,184,0.7)", maxWidth: 600 }}>
            多版本灵活选择，多渠道智能路由，统一异步任务架构。
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/playground" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 12, background: "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 4px 16px rgba(14,165,233,0.3)" }}>
              在 Playground 体验 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/docs/models/pixverse" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 24px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", fontSize: 14, fontWeight: 500, textDecoration: "none" }}>
              查看 API 文档
            </Link>
          </div>
        </div>
      </section>

      {/* 版本列表 */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>可用版本</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>根据需求选择合适的模型版本。</p>
        <div style={{ display: "grid", gap: 14 }}>
          {versions.map((v) => (
            <div key={v.version} style={{ padding: 22, borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>PixVerse {v.version}</div>
                <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#f0f9ff", color: "#0284c7", border: "1px solid #bae6fd" }}>{v.badge}</span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--text-secondary)" }}>{v.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 核心能力 */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>生成能力</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>PixVerse 支持多种视频生成模式，覆盖主流创作需求。</p>
        <div className="grid-2-responsive" style={{ display: "grid", gap: 14 }}>
          {capabilities.map((c) => (
            <div key={c.title} style={{ padding: 22, borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, marginBottom: 14, background: "linear-gradient(135deg, #f0f9ff, #e0f2fe)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0284c7" }}>{c.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 技术亮点 */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>平台特性</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>PixVerse 在 nexusflow 平台上的接入优势。</p>
        <div className="grid-2-responsive" style={{ display: "grid", gap: 14 }}>
          {techHighlights.map((t) => (
            <div key={t.title} style={{ padding: 22, borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{t.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.75, color: "var(--text-secondary)" }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 应用场景 */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>应用场景</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>PixVerse 适合这些内容创作和商业场景。</p>
        <div className="grid-3-responsive" style={{ display: "grid", gap: 14 }}>
          {useCases.map((u) => (
            <div key={u.title} style={{ padding: 20, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{u.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{u.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 相关链接 */}
      <section>
        <div className="grid-3-responsive" style={{ display: "grid", gap: 14 }}>
          {[
            { href: "/docs/models/pixverse", label: "PixVerse API 文档", desc: "查看完整的接入参数与能力说明" },
            { href: "/docs/api/tasks", label: "异步任务 API", desc: "任务提交与状态轮询指南" },
            { href: "/playground", label: "在线体验", desc: "在 Playground 中试用 PixVerse" },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{ padding: 20, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-tertiary)" }}>{item.desc}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#0ea5e9", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                查看详情 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
