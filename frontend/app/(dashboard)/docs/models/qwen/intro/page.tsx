"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function Counter({ end, suffix = "", duration = 1200 }: { end: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const ran = useRef(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !ran.current) {
        ran.current = true;
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - t0) / duration, 1);
          setVal(Math.round(end * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.4 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [end, duration]);
  return <span ref={ref}>{val}{suffix}</span>;
}

const highlights = [
  { value: 1000000, suffix: "", label: "最大上下文", display: "1M" },
  { value: 30, suffix: "+", label: "模型数量" },
  { value: 64000, suffix: "", label: "最大输出", display: "64K" },
  { value: 0, suffix: "¥0.2起", label: "每百万 Token" },
];

const modelFamilies = [
  {
    name: "Qwen3.8 系列",
    badge: "最新旗舰",
    desc: "2.4 万亿参数 MoE 旗舰，编程与办公能力全面跃升，可自主编程十数天交付完整项目。原生视觉理解贯穿规划、执行与验证全流程，支持超长文档与长视频深度语义解析，百万级上下文。",
    models: ["Qwen3.8 Max"],
  },
  {
    name: "Qwen3.7 系列",
    badge: "旗舰",
    desc: "2026 年最新发布的顶级旗舰，面向智能体时代全面升级。编程、办公、长周期自主执行能力大幅提升，支持思考模式切换、函数调用和联网搜索，百万级上下文窗口。",
    models: ["Qwen3.7 Max"],
  },
  {
    name: "Qwen3.6 系列",
    badge: "旗舰推荐",
    desc: "2026 年发布的旗舰系列，在推理深度、代码能力和多模态理解上实现全面跃升。Max Preview 版本是当前 Qwen 次旗舰，Plus 版本兼顾性能与成本。",
    models: ["Qwen3.6 Max Preview", "Qwen3.6 Plus"],
  },
  {
    name: "Qwen3.5 系列",
    badge: "生产主力",
    desc: "经过大规模线上验证的生产级系列。Plus 版本是百万级上下文的均衡主力，Flash 版本以极低成本提供高速响应，适合高并发在线场景。",
    models: ["Qwen3.5 Plus", "Qwen3.5 Flash"],
  },
  {
    name: "Qwen3 编程系列",
    badge: "代码专精",
    desc: "专为软件开发优化的编程模型，在代码补全、重构、调试和多文件理解上达到顶尖水平。Coder Plus 适合复杂工程任务，Coder Flash 适合实时编码辅助。",
    models: ["Qwen3 Coder Plus", "Qwen3 Coder Flash"],
  },
  {
    name: "多模态系列",
    badge: "视觉理解",
    desc: "同时理解文本和图像的多模态模型，支持图片分析、OCR、图表解读、视觉问答等场景。VL Plus 适合高精度任务，VL Flash 适合实时图像处理。",
    models: ["Qwen3.7 Plus", "Qwen3 VL Plus", "Qwen3 VL Flash"],
  },
  {
    name: "全模态系列",
    badge: "音视频理解",
    desc: "支持文本、图片、音频、视频任意组合输入，可输出文本与语音。Omni Plus 为旗舰级全模态能力，Omni Flash 为高性价比之选，支持113种输入语言和55种音色。",
    models: ["Qwen3.5 Omni Plus", "Qwen3.5 Omni Flash", "Qwen3 Omni Flash"],
  },
];

const capabilities = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
    ),
    title: "百万级上下文",
    desc: "Qwen3.5/3.6 系列支持最高 100 万 Token 的超长上下文窗口，可以一次性处理整本书籍、完整代码仓库或数小时的对话历史，无需分段截断。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
    title: "代码能力卓越",
    desc: "从简单脚本到复杂系统设计，Qwen 在代码生成、补全、重构和调试上持续领先。专精的 Coder 系列更是在 HumanEval、MBPP 等编程评测中名列前茅。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    ),
    title: "函数调用 & 工具使用",
    desc: "原生支持 Function Calling 和工具调用协议，可以无缝对接外部 API、数据库、搜索引擎等服务，轻松构建复杂的 AI Agent 工作流。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
      </svg>
    ),
    title: "多模态理解",
    desc: "VL 系列模型可以同时处理文本和图像输入，精准完成图片描述、图表解读、文档 OCR、视觉推理等任务，打通视觉与语言的边界。",
  },
];

const techHighlights = [
  {
    title: "中文能力顶尖",
    desc: "作为阿里巴巴自研的大语言模型，Qwen 在中文理解、生成和对话方面具备天然优势。无论是长文写作、专业翻译还是文化语境理解，都表现出色。",
  },
  {
    title: "思考模式（Thinking）",
    desc: "Qwen3.6 系列引入深度思考模式，模型在回答复杂问题前会先进行内部推理链条分析，显著提升数学证明、逻辑推理和多步骤规划的准确率。",
  },
  {
    title: "极致性价比",
    desc: "从 Flash 系列低至 ¥0.2/百万 Token 的入门价格，到旗舰 Max 系列的顶级性能，Qwen 提供从经济到高端的完整价格梯度，满足不同预算需求。",
  },
  {
    title: "多协议兼容接入",
    desc: "通过 nexusflow 统一接入，Qwen 文本类模型支持 OpenAI Chat、Anthropic Messages 和 Responses API 三种公共协议。已有 OpenAI 或 Anthropic 客户端都可以按对应协议迁移。",
  },
];

const useCases = [
  { title: "智能客服 & 对话", desc: "百万上下文 + 极速响应，Flash 系列是高并发在线客服和对话机器人的理想选择。" },
  { title: "代码开发助手", desc: "Coder 系列深度理解代码逻辑，从代码补全到架构设计，全方位提升开发效率。" },
  { title: "长文档分析", desc: "百万 Token 上下文窗口可以一次处理整份合同、研报或技术文档，无需分段。" },
  { title: "多模态应用", desc: "VL 系列支持图文混合输入，适合电商图片理解、文档 OCR、医疗影像辅助等场景。" },
  { title: "AI Agent 构建", desc: "原生函数调用 + 工具使用能力，轻松构建能自主调用外部服务的智能体。" },
  { title: "内容创作", desc: "出色的中文写作能力，覆盖营销文案、技术文档、创意写作等各类内容生成需求。" },
];

export default function QwenIntroPage() {
  return (
    <div className="hh-page" style={{ padding: "0 48px 64px", maxWidth: 1080, margin: "0 auto" }}>

      {/* HERO */}
      <section style={{
        position: "relative", padding: "56px 40px 48px", borderRadius: 24, overflow: "hidden", marginBottom: 32,
        background: "linear-gradient(135deg, #0c1425 0%, #172554 40%, #1e3a5f 100%)",
        border: "1px solid rgba(59,130,246,0.15)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}>
        <div style={{ position: "absolute", top: "-30%", right: "-10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.15), transparent 70%)", filter: "blur(60px)", animation: "glow-drift 18s ease-in-out infinite alternate" }} />
        <div style={{ position: "absolute", bottom: "-20%", left: "10%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(96,165,250,0.1), transparent 70%)", filter: "blur(50px)", animation: "glow-drift 22s ease-in-out infinite alternate-reverse" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <span style={{ padding: "5px 14px", borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", background: "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(96,165,250,0.2))", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.25)" }}>
              大语言模型
            </span>
            <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
              30+ 模型可用
            </span>
            <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)" }}>by Alibaba Cloud</span>
          </div>
          <h1 style={{ fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 16px", background: "linear-gradient(135deg, #f8fafc 0%, #93c5fd 50%, #60a5fa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            通义千问 Qwen
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.75, margin: "0 0 10px", color: "rgba(226,232,240,0.8)", maxWidth: 640 }}>
            阿里巴巴自研的大语言模型家族。从百万上下文旗舰到极速 Flash，从通用对话到代码专精，从纯文本到多模态——覆盖 AI 应用的全场景需求。
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 28px", color: "rgba(148,163,184,0.7)", maxWidth: 600 }}>
            中文能力业界领先，OpenAI / Anthropic / Responses API 三协议接入，从 ¥0.2/百万 Token 起步。
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/playground" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 12, background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 4px 16px rgba(59,130,246,0.3)", transition: "all 0.2s" }}>
              在 Playground 体验
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/docs/models/qwen" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 24px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", fontSize: 14, fontWeight: 500, textDecoration: "none", transition: "all 0.2s" }}>
              查看 API 文档
            </Link>
          </div>
        </div>
      </section>

      {/* 核心数据 */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 40 }}>
        {highlights.map((h) => (
          <div key={h.label} style={{ textAlign: "center", padding: "22px 12px", borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg)" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-1px", marginBottom: 4 }}>
              {h.display ? h.display : h.value >= 1 ? <Counter end={h.value} suffix={h.suffix} /> : <span style={{ color: "#3b82f6" }}>{h.suffix}</span>}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.04em" }}>{h.label}</div>
          </div>
        ))}
      </section>

      {/* 模型家族 */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>模型家族</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>从旗舰到轻量，从通用到专精，满足各类场景需求。</p>
        <div style={{ display: "grid", gap: 14 }}>
          {modelFamilies.map((f) => (
            <div key={f.name} style={{ padding: 22, borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>{f.name}</div>
                <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe" }}>{f.badge}</span>
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
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Qwen 系列模型的关键技术优势。</p>
        <div className="grid-2-responsive" style={{ display: "grid", gap: 14 }}>
          {capabilities.map((c) => (
            <div key={c.title} style={{ padding: 22, borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, marginBottom: 14, background: "linear-gradient(135deg, #eff6ff, #dbeafe)", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb" }}>{c.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 技术亮点 */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>技术亮点</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Qwen 在核心技术上的差异化优势。</p>
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
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Qwen 正在驱动这些领域的智能化升级。</p>
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
            { href: "/docs/models/qwen", label: "Qwen API 文档", desc: "查看完整的模型列表与接口参数" },
            { href: "/docs/quickstart", label: "快速开始", desc: "5 分钟完成首次 API 调用" },
            { href: "/playground", label: "在线体验", desc: "在 Playground 中试用 Qwen 全系列" },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{ padding: 20, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none", transition: "all 0.2s" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-tertiary)" }}>{item.desc}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#3b82f6", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                查看详情 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
