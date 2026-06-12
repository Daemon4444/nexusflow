"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/* ─── Animated counter ─── */
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

/* ─── Data ─── */
const highlights = [
  { value: 15, suffix: "s", label: "Max duration" },
  { value: 1080, suffix: "p", label: "Max resolution" },
  { value: 3, suffix: "", label: "Aspect ratios" },
  { value: 0, suffix: "from $0.9", label: "per second" },
];

const capabilities = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    title: "Text-to-Video",
    desc: "Describe any scene in plain language—cinematic camera moves, dynamic dollies, atmospheric lighting—and get a high-quality clip in seconds. Handles complex narratives, turning a single sentence into a complete visual story.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    title: "Image-to-Video",
    desc: "Bring any still image to life. Upload a reference image and HappyHorse adds natural motion paths, physically grounded dynamics, and consistent lighting changes.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    title: "Video Editing",
    desc: "Edit existing videos with text instructions—swap backgrounds, adjust lighting, add or remove elements—while keeping temporal coherence intact. Editing becomes as easy as writing a sentence.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    title: "Fine-Grained Control",
    desc: "Customize duration (5–15s), resolution (720p/1080p), aspect ratio, negative prompts, and seed values for reproducible, deterministic outputs—a true production workflow.",
  },
];

const techHighlights = [
  {
    title: "Physics-Aware Motion Engine",
    desc: "HappyHorse ships with a deep physics simulation core, so motion paths, collisions, and fluid drift in generated video follow real-world physics—no more telltale AI stiffness.",
  },
  {
    title: "Cinematic Visual Quality",
    desc: "An industry-leading high-fidelity rendering pipeline supports shallow depth of field, volumetric lighting, motion blur, and other professional effects—output is ready for film post and commercial use.",
  },
  {
    title: "Strong Temporal Consistency",
    desc: "HappyHorse breaks past the inter-frame flicker problem of older video models, holding faces, textures, and lighting consistent across the entire clip.",
  },
  {
    title: "Deep Semantic Understanding",
    desc: "Accurately parses layered text descriptions—composition, camera moves, mood, and lighting style—so what you write is what you see.",
  },
];

const benchmarks = [
  { metric: "Overall Video Quality (VBench)", score: "#1", note: "First place on the VBench overall score" },
  { metric: "Motion Coherence", score: "96.2", note: "Industry-leading temporal consistency" },
  { metric: "Text Alignment", score: "94.8", note: "Precise prompt-to-frame mapping" },
  { metric: "Physical Realism", score: "93.1", note: "Natural motion paths and lighting" },
];

const useCases = [
  { title: "Short Video & Social", desc: "Produce high-quality short clips in seconds, fitting TikTok, Xiaohongshu, WeChat Channels, and more—dramatically lowering the creation bar." },
  { title: "E-commerce Showcases", desc: "Turn static product photos into dynamic videos, automatically generating rotations, close-ups, and scene changes that e-commerce loves." },
  { title: "Film Previs & Storyboards", desc: "Directors and writers can generate previs videos from text to validate creative ideas before committing real production resources." },
  { title: "Education & Training", desc: "Visualize abstract concepts—generate teaching animations, process demos, and explainer content that lands intuitively." },
  { title: "Games & Animation", desc: "Rapidly prototype cutscenes and character motion to support concept design and animation previews, accelerating creative iteration." },
  { title: "Ads & Marketing", desc: "Generate batches of ad creatives across styles and narratives for A/B testing and data-driven creative optimization." },
];

const publicUpdates = [
  {
    date: "2026-04-10",
    title: "Alibaba confirms HappyHorse attribution",
    desc: "Caixin reports that Alibaba has confirmed an in-house team is behind HappyHorse. The model is currently in closed beta, with API access rolling out in stages.",
    href: "https://www.caixinglobal.com/2026-04-10/alibaba-unveils-happyhorse-after-ai-model-tops-video-rankings-under-alias-102432775.html",
    source: "Caixin Global",
  },
  {
    date: "2026-03-23",
    title: "Alibaba Cloud publishes video generation capabilities",
    desc: "The official documentation lists the full set of generation paths—text-to-video, image-to-video, reference-to-video, and video editing—useful as a platform integration reference.",
    href: "https://www.alibabacloud.com/help/en/model-studio/use-video-generation",
    source: "Alibaba Cloud Docs",
  },
];

const pricing = [
  { tier: "720p", price: "$0.9", unit: "/second" },
  { tier: "1080p", price: "$1.6", unit: "/second" },
];

export default function HappyHorseModelPage() {
  return (
    <div className="hh-page" style={{ padding: "0 48px 64px", maxWidth: 1080, margin: "0 auto" }}>

      {/* ═══ HERO ═══ */}
      <section style={{
        position: "relative",
        padding: "56px 40px 48px",
        borderRadius: 24,
        overflow: "hidden",
        marginBottom: 32,
        background: "linear-gradient(135deg, #0a0e1a 0%, #0f172a 40%, #1e1b4b 100%)",
        border: "1px solid rgba(99,102,241,0.15)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}>
        {/* Animated gradient orbs */}
        <div style={{
          position: "absolute", top: "-30%", right: "-10%", width: 400, height: 400,
          borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%)",
          filter: "blur(60px)", animation: "glow-drift 18s ease-in-out infinite alternate",
        }} />
        <div style={{
          position: "absolute", bottom: "-20%", left: "10%", width: 300, height: 300,
          borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.1), transparent 70%)",
          filter: "blur(50px)", animation: "glow-drift 22s ease-in-out infinite alternate-reverse",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <span style={{
              padding: "5px 14px", borderRadius: 999, fontSize: 11, fontWeight: 800,
              letterSpacing: "0.14em", textTransform: "uppercase",
              background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(59,130,246,0.2))",
              color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)",
            }}>
              AI Video Generation
            </span>
            <span style={{
              padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)",
            }}>
              #1 on VBench
            </span>
            <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)" }}>by Alibaba</span>
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.05, fontWeight: 800,
            letterSpacing: "-0.04em", margin: "0 0 16px",
            background: "linear-gradient(135deg, #f8fafc 0%, #cbd5e1 50%, #a5b4fc 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            HappyHorse
          </h1>
          <p style={{
            fontSize: 17, lineHeight: 1.75, margin: "0 0 10px",
            color: "rgba(226,232,240,0.8)", maxWidth: 640,
          }}>
            Alibaba&apos;s flagship AI video generation model. #1 on the VBench overall score, with cinematic image quality, physics-aware motion, and fine-grained creative control.
          </p>
          <p style={{
            fontSize: 14, lineHeight: 1.7, margin: "0 0 28px",
            color: "rgba(148,163,184,0.7)", maxWidth: 600,
          }}>
            From text prompts to high-quality video, from still images to cinematic motion—redefining what AI video can do.
          </p>

          {/* CTA */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/playground" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 28px", borderRadius: 12,
              background: "linear-gradient(135deg, #6366f1, #4f46e5)",
              color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none",
              boxShadow: "0 4px 16px rgba(99,102,241,0.3)",
              transition: "all 0.2s",
            }}>
              Try in Playground
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/models" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "12px 24px", borderRadius: 12,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              color: "#e2e8f0", fontSize: 14, fontWeight: 500, textDecoration: "none",
              transition: "all 0.2s",
            }}>
              View All Models
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ Key stats ═══ */}
      <section style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 40,
      }}>
        {highlights.map((h) => (
          <div key={h.label} style={{
            textAlign: "center", padding: "22px 12px", borderRadius: 16,
            border: "1px solid var(--border)", background: "var(--bg)",
            transition: "all 0.2s",
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-1px", marginBottom: 4 }}>
              {h.value >= 1
                ? <Counter end={h.value} suffix={h.suffix} />
                : <span style={{ color: "#6366f1" }}>{h.suffix}</span>
              }
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.04em" }}>
              {h.label}
            </div>
          </div>
        ))}
      </section>

      {/* ═══ Capabilities ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Capabilities</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>HappyHorse supports multiple video generation and editing modes—covering everything from idea to finished cut.</p>
        <div className="grid-2-responsive" style={{ display: "grid", gap: 14 }}>
          {capabilities.map((c) => (
            <div key={c.title} style={{
              padding: 22, borderRadius: 16,
              border: "1px solid var(--border)", background: "var(--bg)",
              transition: "all 0.2s",
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12, marginBottom: 14,
                background: "linear-gradient(135deg, #eff6ff, #e0e7ff)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#4f46e5",
              }}>
                {c.icon}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Technical highlights ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Technical Highlights</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Where HappyHorse pushes the frontier on core video generation technology.</p>
        <div className="grid-2-responsive" style={{ display: "grid", gap: 14 }}>
          {techHighlights.map((t) => (
            <div key={t.title} style={{
              padding: 22, borderRadius: 16,
              border: "1px solid var(--border)", background: "var(--bg-elevated)",
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{t.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.75, color: "var(--text-secondary)" }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Benchmarks ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Benchmark Performance</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Results on widely recognized video generation benchmarks.</p>
        <div style={{
          borderRadius: 16, overflow: "hidden",
          border: "1px solid var(--border)",
          background: "linear-gradient(180deg, var(--bg) 0%, var(--bg-elevated) 100%)",
        }}>
          {benchmarks.map((b, i) => (
            <div key={b.metric} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 22px",
              borderBottom: i < benchmarks.length - 1 ? "1px solid var(--border)" : "none",
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{b.metric}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{b.note}</div>
              </div>
              <div style={{
                fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px",
                color: b.score === "#1" ? "#6366f1" : "var(--text-primary)",
                fontVariantNumeric: "tabular-nums",
              }}>
                {b.score}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Use cases ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Use Cases</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>How HappyHorse is changing content creation across industries.</p>
        <div className="grid-3-responsive" style={{ display: "grid", gap: 14 }}>
          {useCases.map((u) => (
            <div key={u.title} style={{
              padding: 20, borderRadius: 14,
              border: "1px solid var(--border)", background: "var(--bg)",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{u.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{u.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Pricing ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Model Pricing</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Billed by generated video duration—no hidden fees.</p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {pricing.map((p) => (
            <div key={p.tier} style={{
              flex: 1, minWidth: 180, padding: "24px 22px", borderRadius: 16,
              border: "1px solid var(--border)", background: "var(--bg)",
              textAlign: "center",
            }}>
              <div style={{
                display: "inline-block", padding: "3px 12px", borderRadius: 6,
                fontSize: 12, fontWeight: 700, marginBottom: 12,
                background: p.tier === "1080p" ? "#eff6ff" : "var(--bg-elevated)",
                color: p.tier === "1080p" ? "#4f46e5" : "var(--text-secondary)",
                border: `1px solid ${p.tier === "1080p" ? "#c7d2fe" : "var(--border)"}`,
              }}>
                {p.tier}
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-1px" }}>
                {p.price}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{p.unit}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Public updates ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Latest Updates</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Public news and developments related to HappyHorse.</p>
        <div style={{ display: "grid", gap: 12 }}>
          {publicUpdates.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "block", padding: 20, borderRadius: 14,
                border: "1px solid var(--border)", textDecoration: "none",
                background: "var(--bg)", transition: "all 0.2s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{item.date}</div>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)", marginBottom: 8 }}>{item.desc}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6366f1", fontWeight: 500 }}>
                {item.source}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ═══ Related links ═══ */}
      <section>
        <div className="grid-3-responsive" style={{ display: "grid", gap: 14 }}>
          {[
            { href: "/docs/api/videos", label: "Video Integration Docs", desc: "Use the unified video task API" },
            { href: "/docs/api/tasks", label: "Async Tasks API", desc: "Guide to task submission and status polling" },
            { href: "/playground", label: "Try Online", desc: "Use HappyHorse in the Playground" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: 20, borderRadius: 14,
                border: "1px solid var(--border)", background: "var(--bg-elevated)",
                textDecoration: "none", transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-tertiary)" }}>{item.desc}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#6366f1", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                View details
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
