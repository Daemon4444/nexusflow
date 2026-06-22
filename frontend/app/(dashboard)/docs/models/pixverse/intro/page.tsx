"use client";

import Link from "next/link";

const capabilities = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    title: "Text-to-Video",
    desc: "Describe scenes in natural language, and PixVerse automatically generates high-quality video. Supports detailed camera, lighting, and action instructions — from a single sentence to a complete visual story.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    title: "Image-to-Video",
    desc: "Upload a reference image and transform static visuals into dynamic video. Supports custom motion trajectories and camera effects while maintaining visual style consistency with the original image.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
    title: "Reference-to-Video",
    desc: "Provide a style reference image, and PixVerse maintains the reference style while generating video with entirely new scenes. Suited for brand style consistency and series content creation.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    ),
    title: "First & Last Frame Control",
    desc: "Define the start and end frames of your video, and PixVerse automatically generates the in-between transitions. Precisely control the opening and closing of your video, suited for exacting camera work and transition effects.",
  },
];

const versions = [
  { version: "v6", badge: "Current Recommended", desc: "Latest version with significantly improved visual quality and motion smoothness. Supports both Text-to-Video and Image-to-Video modes, flexibly switching between the Bailian channel and PixVerse official channel." },
  { version: "v4.5", badge: "Stable", desc: "Stable version verified through large-scale testing. Achieves a good balance between video clarity and generation speed, suited for production environments that demand stability." },
  { version: "v4", badge: "Compatible", desc: "Classic version, maintains backward compatibility. Suited for users with existing integration solutions that cannot easily upgrade. Still maintained but no longer receiving new features." },
];

const techHighlights = [
  {
    title: "Multi-Channel Smart Routing",
    desc: "The platform backend supports intelligent switching between the Bailian channel and PixVerse official channel, automatically selecting the optimal path based on availability, queue depth, and response speed.",
  },
  {
    title: "Unified Async Tasks Architecture",
    desc: "Video generation uses a unified async task pipeline (/v1/tasks). After submission, results are retrieved via status polling. Naturally suited for high-latency models, batch tasks, and backend workflows.",
  },
  {
    title: "Multiple Aspect Ratio Support",
    desc: "Supports landscape (16:9), portrait (9:16), and square (1:1) — three mainstream aspect ratios. Directly adapts to Douyin, YouTube, Instagram, and other platform content specifications.",
  },
  {
    title: "Flexible Quality Control",
    desc: "Supports 540p, 720p, and 1080p — three clarity levels. Users can flexibly trade off between generation speed and visual quality, satisfying different needs from prototype preview to final delivery.",
  },
];

const useCases = [
  { title: "Short Video Batch Generation", desc: "Combined with the async task interface, you can batch submit video generation tasks. Suited for MCN agencies and content platforms with large-scale content production." },
  { title: "E-commerce Product Dynamic Display", desc: "Transform static product images into dynamic display videos. Automatically generate rotation, close-up, and other common e-commerce camera effects." },
  { title: "Social Media Content", desc: "Supports 9:16 portrait ratio, directly outputting short video content in Douyin and Xiaohongshu formats, significantly lowering the creative barrier." },
  { title: "Creative Prototype Validation", desc: "Quickly generate video prototypes to validate creative ideas at low cost before committing formal production resources." },
  { title: "Brand Visual Consistency", desc: "Reference image mode ensures series videos maintain a unified visual style, suited for brand marketing and series content production." },
  { title: "Advertising Material Testing", desc: "Batch generate advertising videos in different styles and narratives, used for A/B testing and data-driven creative optimization." },
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
              AI Video Generation
            </span>
            <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
              Multiple Versions Available
            </span>
            <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)" }}>by PixVerse AI</span>
          </div>
          <h1 style={{ fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 16px", background: "linear-gradient(135deg, #f8fafc 0%, #7dd3fc 50%, #38bdf8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            PixVerse
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.75, margin: "0 0 10px", color: "rgba(226,232,240,0.8)", maxWidth: 640 }}>
            Professional-grade AI video generation platform. Supports Text-to-Video, Image-to-Video, Reference-to-Video, and First & Last Frame control — covering the complete video production workflow from creative concept to finished piece.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 28px", color: "rgba(148,163,184,0.7)", maxWidth: 600 }}>
            Multiple versions available, multi-channel smart routing, unified async task architecture.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/playground" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 12, background: "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 4px 16px rgba(14,165,233,0.3)" }}>
              Try in Playground <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/docs/models/pixverse" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 24px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0", fontSize: 14, fontWeight: 500, textDecoration: "none" }}>
              View API Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* Version List */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Available Versions</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Choose the model version that best fits your needs.</p>
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

      {/* Generation Capabilities */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Generation Capabilities</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>PixVerse supports multiple video generation modes, covering mainstream creative needs.</p>
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

      {/* Platform Features */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Platform Features</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>PixVerse integration advantages on the NexusFlow platform.</p>
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
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>PixVerse is well-suited for these content creation and commercial scenarios.</p>
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
            { href: "/docs/models/pixverse", label: "PixVerse API Documentation", desc: "View complete integration parameters and capability descriptions" },
            { href: "/docs/api/tasks", label: "Async Tasks API", desc: "Task submission and status polling guide" },
            { href: "/playground", label: "Try Online", desc: "Try PixVerse in Playground" },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{ padding: 20, borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-elevated)", textDecoration: "none" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-tertiary)" }}>{item.desc}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#0ea5e9", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                View Details <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}