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
  { value: 1000000, suffix: "", label: "Max Context", display: "1M" },
  { value: 30, suffix: "+", label: "Available Models" },
  { value: 64000, suffix: "", label: "Max Output", display: "64K" },
  { value: 0, suffix: "Starting at ¥0.2", label: "Per Million Tokens" },
];

const modelFamilies = [
  {
    name: "Qwen3.7 Series",
    badge: "Latest Flagship",
    desc: "The top-tier flagship released in 2026, comprehensively upgraded for the AI agent era. Coding, office tasks, and long-cycle autonomous execution capabilities significantly improved. Supports thinking mode switching, function calling, and web search. Million-level context window.",
    models: ["Qwen3.7 Max"],
  },
  {
    name: "Qwen3.6 Series",
    badge: "Flagship Recommended",
    desc: "Flagship series released in 2026, achieving comprehensive leaps in reasoning depth, coding capability, and multimodal understanding. Max Preview is the current Qwen flagship, while Plus balances performance and cost.",
    models: ["Qwen3.6 Max Preview", "Qwen3.6 Plus"],
  },
  {
    name: "Qwen3.5 Series",
    badge: "Production Powerhouse",
    desc: "Production-grade series validated through large-scale online testing. Plus is the balanced mainstay with million-level context, while Flash delivers high-speed responses at extremely low cost, ideal for high-concurrency production scenarios.",
    models: ["Qwen3.5 Plus", "Qwen3.5 Flash"],
  },
  {
    name: "Qwen3 Coding Series",
    badge: "Code Specialized",
    desc: "Coding models optimized for software development, reaching top-tier performance in code completion, refactoring, debugging, and multi-file understanding. Coder Plus is suited for complex engineering tasks, while Coder Flash is ideal for real-time coding assistance.",
    models: ["Qwen3 Coder Plus", "Qwen3 Coder Flash"],
  },
  {
    name: "Multimodal Series",
    badge: "Visual Understanding",
    desc: "Multimodal models that understand both text and images simultaneously. Supports image analysis, OCR, chart interpretation, visual Q&A, and more. VL Plus is suited for high-precision tasks, while VL Flash handles real-time image processing.",
    models: ["Qwen3 VL Plus", "Qwen3 VL Flash", "Qwen3 Omni Flash"],
  },
];

const capabilities = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
    ),
    title: "Million-Level Context",
    desc: "Qwen3.5/3.6 series supports up to 1 million Token ultra-long context windows, capable of processing entire books, complete code repositories, or hours of conversation history in a single pass without segmentation.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
    title: "Superior Coding Capability",
    desc: "From simple scripts to complex system design, Qwen consistently leads in code generation, completion, refactoring, and debugging. The specialized Coder series ranks among the top in HumanEval, MBPP, and other coding benchmarks.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    ),
    title: "Function Calling & Tool Use",
    desc: "Native support for Function Calling and tool invocation protocols. Seamlessly integrate with external APIs, databases, search engines, and other services to easily build complex AI Agent workflows.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
      </svg>
    ),
    title: "Multimodal Understanding",
    desc: "VL series models handle both text and image inputs simultaneously, precisely completing image description, chart interpretation, document OCR, visual reasoning, and more — bridging the boundary between vision and language.",
  },
];

const techHighlights = [
  {
    title: "Top-Tier Chinese Capability",
    desc: "As Alibaba's self-developed large language model, Qwen has a natural advantage in Chinese understanding, generation, and dialogue. Whether it's long-form writing, professional translation, or cultural context comprehension, it consistently delivers outstanding performance.",
  },
  {
    title: "Thinking Mode",
    desc: "Qwen3.6 series introduces deep thinking mode. Before answering complex questions, the model first performs internal reasoning chain analysis, significantly improving accuracy in mathematical proofs, logical reasoning, and multi-step planning.",
  },
  {
    title: "Extreme Cost-Efficiency",
    desc: "From Flash series starting as low as ¥0.2/million Tokens, to the top-tier performance of the flagship Max series, Qwen offers a complete pricing gradient from budget to premium, satisfying diverse budget requirements.",
  },
  {
    title: "Multi-Protocol Compatible Integration",
    desc: "Through NexusFlow's unified integration, Qwen text models support three public protocols: OpenAI Chat, Anthropic Messages, and Gemini-compatible. Existing OpenAI, Anthropic, or Google GenAI clients can all migrate using their respective protocols.",
  },
];

const useCases = [
  { title: "Intelligent Customer Service & Chat", desc: "Million-level context + ultra-fast response. The Flash series is the ideal choice for high-concurrency online customer service chatbots." },
  { title: "Code Development Assistant", desc: "The Coder series deeply understands code logic, from code completion to architecture design, comprehensively boosting development efficiency." },
  { title: "Long Document Analysis", desc: "The million-Token context window can process entire contracts, research reports, or technical documents in a single pass without segmentation." },
  { title: "Multimodal Applications", desc: "VL series supports mixed text-image input, suited for e-commerce image understanding, document OCR, medical imaging assistance, and more." },
  { title: "AI Agent Development", desc: "Native function calling + tool use capabilities make it easy to build autonomous agents that call external services." },
  { title: "Content Creation", desc: "Outstanding Chinese writing capabilities, covering marketing copy, technical documentation, creative writing, and all kinds of content generation needs." },
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
              Large Language Models
            </span>
            <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
              30+ Models Available
            </span>
            <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)" }}>by Alibaba Cloud</span>
          </div>
          <h1 style={{ fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 16px", background: "linear-gradient(135deg, #f8fafc 0%, #93c5fd 50%, #60a5fa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Qwen (Tongyi Qwen)
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.75, margin: "0 0 10px", color: "rgba(226,232,240,0.8)", maxWidth: 640 }}>
            Alibaba's self-developed large language model family. From million-context flagships to ultra-fast Flash, from general chat to code-specialized, from pure text to multimodal — covering all AI application scenarios.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 28px", color: "rgba(148,163,184,0.7)", maxWidth: 600 }}>
            Industry-leading Chinese capability, OpenAI / Anthropic / Gemini three-protocol compatible integration, starting from ¥0.2/million Tokens.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/playground" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 12, background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 4px 16px rgba(59,130,246,0.3)", transition: "all 0.2s" }}>
              Try in Playground
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/docs/models/qwen" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 24px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", fontSize: 14, fontWeight: 500, textDecoration: "none", transition: "all 0.2s" }}>
              View API Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* Core Data */}
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

      {/* Model Families */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Model Families</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>From flagships to lightweight, from general to specialized — meeting every scenario's needs.</p>
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

      {/* Core Capabilities */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Core Capabilities</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Key technical advantages of Qwen series models.</p>
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

      {/* Technical Highlights */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Technical Highlights</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Qwen's differentiated advantages in core technology.</p>
        <div className="grid-2-responsive" style={{ display: "grid", gap: 14 }}>
          {techHighlights.map((t) => (
            <div key={t.title} style={{ padding: 22, borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{t.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.75, color: "var(--text-secondary)" }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Use Cases</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Qwen is driving the intelligent transformation of these fields.</p>
        <div className="grid-3-responsive" style={{ display: "grid", gap: 14 }}>
          {useCases.map((u) => (
            <div key={u.title} style={{ padding: 20, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{u.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{u.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Related Links */}
      <section>
        <div className="grid-3-responsive" style={{ display: "grid", gap: 14 }}>
          {[
            { href: "/docs/models/qwen", label: "Qwen API Documentation", desc: "View the complete model list and API parameters" },
            { href: "/docs/quickstart", label: "Quick Start", desc: "Complete your first API call in 5 minutes" },
            { href: "/playground", label: "Try Online", desc: "Try the entire Qwen series in Playground" },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{ padding: 20, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none", transition: "all 0.2s" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-tertiary)" }}>{item.desc}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#3b82f6", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                View Details <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}