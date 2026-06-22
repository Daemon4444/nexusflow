"use client";

import Link from "next/link";

const modelFamilies = [
  {
    name: "DeepSeek V4 Series",
    badge: "Latest Generation",
    desc: "The fourth-generation model released in 2026. V4 Pro reaches new heights in complex reasoning, mathematical proofs, and Code Agent scenarios; V4 Flash meets extremely low latency needs for high-concurrency online requirements.",
    models: ["DeepSeek V4 Pro", "DeepSeek V4 Flash"],
  },
  {
    name: "DeepSeek R1",
    badge: "Reasoning Champion",
    desc: "A model focused on deep reasoning, decomposing complex problems through chain-of-thought (CoT) mechanism. Outstanding performance in math competitions, logical reasoning, and multi-step planning tasks.",
    models: ["DeepSeek R1"],
  },
  {
    name: "DeepSeek V3",
    badge: "Cost-Efficiency King",
    desc: "Uses an innovative MoE (Mixture of Experts) architecture, achieving ultimate cost-efficiency while maintaining strong general capabilities. Balanced across coding, math, and multilingual task.",
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
    title: "Top-Tier Reasoning Capability",
    desc: "DeepSeek continues to breakthrough in complex reasoning tasks. The R1 model, through deep chain-of-thought analysis, approaches or even surpasses human expert levels on AIME math competition, GPQA scientific reasoning, and other authoritative benchmarks.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
    title: "First-Class Coding Capability",
    desc: "From Python scripts to distributed systems, DeepSeek performs outstandingly in code understanding and generation, suited for code generation, completion, refactoring, and debugging tasks.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
    ),
    title: "MoE Architecture Innovation",
    desc: "DeepSeek V3/V4 uses the Mixture of Experts (MoE) architecture, activating only partial parameters during reasoning, achieving equivalent or better performance than dense models at lower computational cost.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: "Function Calling & Agent",
    desc: "V4 series natively supports function calling and tool use, capable of autonomously planning execution steps, calling external APIs, and handling multi-cycle interactions — the ideal foundation for building complex AI Agents.",
  },
];

const techHighlights = [
  {
    title: "Chain-of-Thought (CoT) Reasoning",
    desc: "The R1 model displays the complete reasoning process before answering, decomposing complex problems into verifiable reasoning steps. Users can see the model's chain of thought, improving result interpretability and trustworthiness.",
  },
  {
    title: "Open Source Spirit",
    desc: "DeepSeek adheres to the open-source path, fully open-sourcing V3 model weights and training details, driving the entire industry's deeper understanding of large model technology. Transparency is DeepSeek's core DNA.",
  },
  {
    title: "Extreme Cost-Efficiency",
    desc: "Through MoE architecture and efficient training strategies, DeepSeek maintains high cost-efficiency at equivalent performance levels. V4 Flash is billed at ¥1 input / ¥2 output per million Tokens.",
  },
  {
    title: "Long Context Understanding",
    desc: "V4 series supports a 131K Token context window, capable of processing long documents, large code repositories, and complex multi-turn conversations, maintaining robust performance on long-dependency understanding.",
  },
];

const useCases = [
  { title: "Math & Scientific Reasoning", desc: "R1's deep reasoning capability makes it the go-to tool for mathematical proofs, scientific analysis, and complex logical deduction." },
  { title: "AI Agent Development", desc: "V4 series' function calling and tool use capabilities enable developers to build autonomous agents that complete complex tasks." },
  { title: "Code Development Assistant", desc: "DeepSeek models deeply understand code semantics, providing comprehensive coding support from completion and bug fixing to architecture refactoring." },
  { title: "High-Concurrency Online Services", desc: "V4 Flash's low-latency, high-throughput characteristics are suited for building online customer service, real-time Q&A, and other high-concurrency applications." },
  { title: "Academic Research Assistance", desc: "Strong reasoning and long-text processing capabilities help researchers with paper analysis, literature review, and research planning." },
  { title: "Data Analysis & Reporting", desc: "Excels at extracting insights from large datasets and generating analysis reports — a capable assistant for data-driven decision-making." },
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
              Reasoning & Code
            </span>
            <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
              Open Source Leader
            </span>
            <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)" }}>by DeepSeek</span>
          </div>
          <h1 style={{ fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 16px", background: "linear-gradient(135deg, #f8fafc 0%, #c4b5fd 50%, #a78bfa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            DeepSeek
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.75, margin: "0 0 10px", color: "rgba(226,232,240,0.8)", maxWidth: 640 }}>
            An open-source large model family renowned for reasoning capability. From R1's deep chain-of-thought to V4's MoE architecture innovation, DeepSeek continues to redefine the boundaries of AI reasoning.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 28px", color: "rgba(148,163,184,0.7)", maxWidth: 600 }}>
            Mathematical reasoning approaching human expert level, industry-top coding capability, MoE architecture achieving extreme cost-efficiency.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/playground" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 12, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 4px 16px rgba(139,92,246,0.3)", transition: "all 0.2s" }}>
              Try in Playground <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/docs/models/deepseek" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 24px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", fontSize: 14, fontWeight: 500, textDecoration: "none" }}>
              View API Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* Model Families */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Model Families</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Reasoning flagship, high-speed reasoning, general balance, code specialization — each has its strengths.</p>
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

      {/* Core Capabilities */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Core Capabilities</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Key technical advantages of DeepSeek series models.</p>
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

      {/* Technical Highlights */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Technical Highlights</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>DeepSeek's differentiated innovation in core technology.</p>
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
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>DeepSeek is playing a core role in these fields.</p>
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
            { href: "/docs/models/deepseek", label: "DeepSeek API Documentation", desc: "View the complete model list and API parameters" },
            { href: "/docs/quickstart", label: "Quick Start", desc: "Complete your first API call in 5 minutes" },
            { href: "/playground", label: "Try Online", desc: "Try DeepSeek in Playground" },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{ padding: 20, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-tertiary)" }}>{item.desc}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#8b5cf6", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                View Details <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}