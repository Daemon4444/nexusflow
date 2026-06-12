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
  { value: 1000000, suffix: "", label: "Max context", display: "1M" },
  { value: 30, suffix: "+", label: "Models available" },
  { value: 64000, suffix: "", label: "Max output", display: "64K" },
  { value: 0, suffix: "from $0.2", label: "per million tokens" },
];

const modelFamilies = [
  {
    name: "Qwen3.7 Series",
    badge: "Latest Flagship",
    desc: "The newest top-tier flagship released in 2026, fully upgraded for the agent era. Major leaps in coding, productivity, and long-horizon autonomous execution, with thinking-mode toggling, function calling, and web search across a million-token context window.",
    models: ["Qwen3.7 Max"],
  },
  {
    name: "Qwen3.6 Series",
    badge: "Recommended Flagship",
    desc: "Released in 2026, this lineup brings major gains in reasoning depth, coding, and multimodal understanding. Max Preview is the current Qwen sub-flagship; Plus balances performance and cost.",
    models: ["Qwen3.6 Max Preview", "Qwen3.6 Plus"],
  },
  {
    name: "Qwen3.5 Series",
    badge: "Production Workhorse",
    desc: "A production-grade family validated at scale. Plus is the balanced workhorse with a million-token context, while Flash delivers ultra-low-cost, high-speed responses for high-concurrency online use cases.",
    models: ["Qwen3.5 Plus", "Qwen3.5 Flash"],
  },
  {
    name: "Qwen3 Coder Series",
    badge: "Code Specialist",
    desc: "Coding models tuned for software development—state-of-the-art on completion, refactoring, debugging, and multi-file understanding. Coder Plus is great for complex engineering tasks; Coder Flash is built for real-time pair programming.",
    models: ["Qwen3 Coder Plus", "Qwen3 Coder Flash"],
  },
  {
    name: "Multimodal Series",
    badge: "Visual Understanding",
    desc: "Multimodal models that handle text and images together—image analysis, OCR, chart reading, and visual question answering. VL Plus targets high-precision tasks; VL Flash is built for real-time image processing.",
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
    title: "Million-Token Context",
    desc: "The Qwen3.5 and 3.6 families support context windows up to one million tokens, letting you process entire books, full code repositories, or hours of conversation history in a single pass—no chunking required.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
    title: "Outstanding Coding Ability",
    desc: "From simple scripts to complex system design, Qwen leads on code generation, completion, refactoring, and debugging. The dedicated Coder family ranks among the top on benchmarks like HumanEval and MBPP.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    ),
    title: "Function Calling & Tools",
    desc: "Native support for function calling and tool-use protocols—seamlessly connect to external APIs, databases, and search engines to build complex AI agent workflows.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
      </svg>
    ),
    title: "Multimodal Understanding",
    desc: "VL models accept both text and images, accurately handling captioning, chart interpretation, document OCR, and visual reasoning—bridging vision and language.",
  },
];

const techHighlights = [
  {
    title: "Top-Tier Chinese Ability",
    desc: "Built in-house at Alibaba, Qwen has a natural edge in Chinese understanding, generation, and conversation—long-form writing, professional translation, and nuanced cultural context all benefit.",
  },
  {
    title: "Thinking Mode",
    desc: "The Qwen3.6 series introduces a deep thinking mode where the model performs internal reasoning before answering complex questions—markedly improving accuracy on math proofs, logic, and multi-step planning.",
  },
  {
    title: "Exceptional Value",
    desc: "From the Flash family starting at $0.2 per million tokens to the flagship Max series, Qwen offers a complete pricing ladder from economical to premium to fit any budget.",
  },
  {
    title: "Multi-Protocol Access",
    desc: "Through nexusflow, Qwen text models can be reached via OpenAI Chat, Anthropic Messages, and Gemini-compatible protocols. Existing OpenAI, Anthropic, or Google GenAI clients can be migrated by swapping protocols.",
  },
];

const useCases = [
  { title: "Customer Support & Chat", desc: "Million-token context plus low latency makes the Flash family ideal for high-concurrency online support and chatbots." },
  { title: "Coding Assistant", desc: "The Coder family deeply understands code—from completions to architecture, it accelerates development across the stack." },
  { title: "Long-Document Analysis", desc: "A million-token window lets you process an entire contract, research report, or technical doc in one go—no chunking needed." },
  { title: "Multimodal Apps", desc: "VL models accept mixed text and image input—great for e-commerce image understanding, document OCR, and medical imaging assistance." },
  { title: "AI Agent Building", desc: "Native function calling plus tool use makes it easy to build agents that autonomously call external services." },
  { title: "Content Creation", desc: "Excellent Chinese writing ability covers marketing copy, technical docs, creative writing, and more." },
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
              Large Language Model
            </span>
            <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
              30+ models available
            </span>
            <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)" }}>by Alibaba Cloud</span>
          </div>
          <h1 style={{ fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 16px", background: "linear-gradient(135deg, #f8fafc 0%, #93c5fd 50%, #60a5fa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Qwen
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.75, margin: "0 0 10px", color: "rgba(226,232,240,0.8)", maxWidth: 640 }}>
            Alibaba&apos;s in-house large language model family. From million-token flagships to ultra-fast Flash models, from general chat to coding specialists, from text-only to multimodal—covering every AI application need.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 28px", color: "rgba(148,163,184,0.7)", maxWidth: 600 }}>
            Industry-leading Chinese ability, OpenAI / Anthropic / Gemini-compatible access, starting at $0.2 per million tokens.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/playground" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 12, background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 4px 16px rgba(59,130,246,0.3)", transition: "all 0.2s" }}>
              Try in Playground
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/docs/models/qwen" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 24px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", fontSize: 14, fontWeight: 500, textDecoration: "none", transition: "all 0.2s" }}>
              View API Docs
            </Link>
          </div>
        </div>
      </section>

      {/* Key stats */}
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

      {/* Model families */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Model Families</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>From flagship to lightweight, from general-purpose to specialized—covering every workload.</p>
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

      {/* Core capabilities */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Core Capabilities</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>The key technical strengths of the Qwen series.</p>
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

      {/* Technical highlights */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Technical Highlights</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Where Qwen stands apart on core technology.</p>
        <div className="grid-2-responsive" style={{ display: "grid", gap: 14 }}>
          {techHighlights.map((t) => (
            <div key={t.title} style={{ padding: 22, borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{t.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.75, color: "var(--text-secondary)" }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Use Cases</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Where Qwen is driving smarter products today.</p>
        <div className="grid-3-responsive" style={{ display: "grid", gap: 14 }}>
          {useCases.map((u) => (
            <div key={u.title} style={{ padding: 20, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{u.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{u.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Related links */}
      <section>
        <div className="grid-3-responsive" style={{ display: "grid", gap: 14 }}>
          {[
            { href: "/docs/models/qwen", label: "Qwen API Docs", desc: "Browse the full model list and parameters" },
            { href: "/docs/quickstart", label: "Quick Start", desc: "Make your first API call in 5 minutes" },
            { href: "/playground", label: "Try Online", desc: "Use the full Qwen lineup in the Playground" },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{ padding: 20, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none", transition: "all 0.2s" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-tertiary)" }}>{item.desc}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#3b82f6", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                View details <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
