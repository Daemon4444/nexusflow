"use client";

import Link from "next/link";

const modelFamilies = [
  {
    name: "DeepSeek V4 系列",
    badge: "最新一代",
    desc: "2026 年最新发布的第四代模型。V4 Pro 在复杂推理、数学证明和代码 Agent 场景上达到新高度；V4 Flash 则以极低延迟满足高并发在线需求。",
    models: ["DeepSeek V4 Pro", "DeepSeek V4 Flash"],
  },
  {
    name: "DeepSeek R1",
    badge: "推理王者",
    desc: "专注于深度推理的模型，通过链式思考（Chain-of-Thought）机制拆解复杂问题。在数学竞赛、逻辑推理和多步骤规划任务上表现卓越。",
    models: ["DeepSeek R1"],
  },
  {
    name: "DeepSeek V3",
    badge: "性价比之王",
    desc: "采用创新的 MoE（混合专家）架构，在保持强大通用能力的同时实现极致性价比。代码、数学和多语言任务全面均衡。",
    models: ["DeepSeek V3"],
  },
];

const capabilities = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    ),
    title: "顶尖推理能力",
    desc: "DeepSeek 在复杂推理任务上持续突破。R1 模型通过深度思维链分析，在 AIME 数学竞赛、GPQA 科学推理等权威评测中接近甚至超越人类专家水平。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
    title: "代码能力一流",
    desc: "从 Python 脚本到分布式系统，DeepSeek 在代码理解和生成上表现出色，适合代码生成、补全、重构和调试任务。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
    ),
    title: "MoE 架构创新",
    desc: "DeepSeek V3/V4 采用混合专家（Mixture of Experts）架构，在推理时仅激活部分参数，以更低的计算成本实现与密集模型相当甚至更优的性能表现。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: "函数调用 & Agent",
    desc: "V4 系列原生支持函数调用和工具使用，可以自主规划执行步骤、调用外部 API 和处理多轮交互，是构建复杂 AI Agent 的理想底座。",
  },
];

const techHighlights = [
  {
    title: "链式思考（CoT）推理",
    desc: "R1 模型在回答前会展示完整的推理过程，将复杂问题分解为可验证的推理步骤。用户可以看到模型的思考链条，提升结果的可解释性和可信度。",
  },
  {
    title: "开源精神",
    desc: "DeepSeek 坚持开源路线，V3 模型完全开源权重和训练细节，推动了整个行业对大模型技术的理解深度。开放透明是 DeepSeek 的核心基因。",
  },
  {
    title: "极致性价比",
    desc: "通过 MoE 架构和高效训练策略，DeepSeek 在同等性能水平下保持较高性价比。V4 Flash 按输入 ¥1 / 输出 ¥2 每百万 Token 计费。",
  },
  {
    title: "长上下文理解",
    desc: "V4 系列支持 1M Token 上下文窗口，能够处理长文档、大型代码库和复杂的多轮对话，在长距离依赖理解上表现稳健。",
  },
];

const useCases = [
  { title: "数学与科学推理", desc: "R1 模型的深度推理能力使其成为数学证明、科学分析和复杂逻辑推导的首选工具。" },
  { title: "AI Agent 开发", desc: "V4 系列的函数调用和工具使用能力，让开发者可以构建能自主完成复杂任务的智能体。" },
  { title: "代码开发辅助", desc: "DeepSeek 模型深度理解代码语义，提供从代码补全、Bug 修复到架构重构的全方位编程支持。" },
  { title: "高并发在线服务", desc: "V4 Flash 的低延迟高吞吐特性，适合构建在线客服、实时问答等高并发应用场景。" },
  { title: "学术研究辅助", desc: "强大的推理和长文本处理能力，帮助研究者进行论文分析、文献综述和研究规划。" },
  { title: "数据分析 & 报告", desc: "擅长从大量数据中提取洞见、生成分析报告，是数据驱动决策的得力助手。" },
];

export default function DeepSeekIntroPage() {
  return (
    <div className="hh-page" style={{ padding: "0 48px 64px", maxWidth: 1080, margin: "0 auto" }}>

      {/* HERO */}
      <section style={{
        position: "relative", padding: "56px 40px 48px", borderRadius: 24, overflow: "hidden", marginBottom: 32,
        background: "linear-gradient(135deg, #0f0f1a 0%, #1a1033 40%, #2d1b69 100%)",
        border: "1px solid rgba(139,92,246,0.15)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}>
        <div style={{ position: "absolute", top: "-30%", right: "-10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.15), transparent 70%)", filter: "blur(60px)", animation: "glow-drift 18s ease-in-out infinite alternate" }} />
        <div style={{ position: "absolute", bottom: "-20%", left: "10%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(167,139,250,0.1), transparent 70%)", filter: "blur(50px)", animation: "glow-drift 22s ease-in-out infinite alternate-reverse" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <span style={{ padding: "5px 14px", borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", background: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(167,139,250,0.2))", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.25)" }}>
              推理 & 代码
            </span>
            <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
              开源领先
            </span>
            <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)" }}>by DeepSeek</span>
          </div>
          <h1 style={{ fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 16px", background: "linear-gradient(135deg, #f8fafc 0%, #c4b5fd 50%, #a78bfa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            DeepSeek
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.75, margin: "0 0 10px", color: "rgba(226,232,240,0.8)", maxWidth: 640 }}>
            以推理能力著称的开源大模型家族。从 R1 的深度思维链到 V4 的 MoE 架构创新，DeepSeek 持续重新定义 AI 推理的边界。
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 28px", color: "rgba(148,163,184,0.7)", maxWidth: 600 }}>
            数学推理接近人类专家，代码能力业界顶尖，MoE 架构实现极致性价比。
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/playground" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 12, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 4px 16px rgba(139,92,246,0.3)", transition: "all 0.2s" }}>
              在 Playground 体验 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/docs/models/deepseek" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 24px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", fontSize: 14, fontWeight: 500, textDecoration: "none" }}>
              查看 API 文档
            </Link>
          </div>
        </div>
      </section>

      {/* 模型家族 */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>模型家族</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>推理旗舰、高速推理、通用均衡、代码专精，各有所长。</p>
        <div style={{ display: "grid", gap: 14 }}>
          {modelFamilies.map((f) => (
            <div key={f.name} style={{ padding: 22, borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>{f.name}</div>
                <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe" }}>{f.badge}</span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--text-secondary)", marginBottom: 12 }}>{f.desc}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {f.models.map((m) => (
                  <span key={m} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>{m}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 核心能力 */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>核心能力</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>DeepSeek 系列模型的关键技术优势。</p>
        <div className="grid-2-responsive" style={{ display: "grid", gap: 14 }}>
          {capabilities.map((c) => (
            <div key={c.title} style={{ padding: 22, borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, marginBottom: 14, background: "linear-gradient(135deg, #f5f3ff, #ede9fe)", display: "flex", alignItems: "center", justifyContent: "center", color: "#7c3aed" }}>{c.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 技术亮点 */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>技术亮点</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>DeepSeek 在核心技术上的差异化创新。</p>
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
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>DeepSeek 正在这些领域发挥核心作用。</p>
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
            { href: "/docs/models/deepseek", label: "DeepSeek API 文档", desc: "查看完整的模型列表与接口参数" },
            { href: "/docs/quickstart", label: "快速开始", desc: "5 分钟完成首次 API 调用" },
            { href: "/playground", label: "在线体验", desc: "在 Playground 中试用 DeepSeek" },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{ padding: 20, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-tertiary)" }}>{item.desc}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#8b5cf6", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                查看详情 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
