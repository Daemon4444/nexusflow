"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { NexusflowLogo } from "@/components/QuadrantLogo";
import { useEffect, useRef, useState } from "react";

const modelRows = [
  { model: "Qwen3.6 Max Preview", provider: "Tongyi Qianwen", context: "262K", price: "input ¥9 / output ¥54 per 1M" },
  { model: "DeepSeek V4 Pro", provider: "DeepSeek", context: "131K", price: "input ¥4 / output ¥16 per 1M" },
  { model: "GLM 5", provider: "Zhipu AI", context: "131K", price: "input ¥2 / output ¥8 per 1M" },
  { model: "Kimi K2.6", provider: "Moonshot AI", context: "262K", price: "input ¥2 / output ¥8 per 1M" },
  { model: "PixVerse V6", provider: "PixVerse", context: "Async video", price: "from ¥0.15 / second" },
];

const capabilities = [
  {
    title: "Unified API",
    desc: "Use one OpenAI-compatible endpoint for chat, embeddings, image, video, Anthropic Messages and Gemini-compatible calls.",
  },
  {
    title: "Billing Control",
    desc: "Pre-call balance checks, precise micro-cost ledger entries, API key-level usage and account-level transaction history.",
  },
  {
    title: "Operational Guardrails",
    desc: "Rate limits, upload authorization, production-safe payment handling, provider routing and health monitoring foundations.",
  },
  {
    title: "Developer Console",
    desc: "Create keys, test prompts, inspect usage, monitor latency and manage tickets without switching provider dashboards.",
  },
];

const workflow = [
  "Create an account and generate a one-time API key",
  "Point your SDK to https://nexusflow.hk/v1",
  "Choose a model per request or test in Playground",
  "Track cost, latency, errors and rate limits in the console",
];

const carouselModels = [
  { name: "Qwen3.6 Max Preview", provider: "Tongyi Qianwen", ctx: "262K context", price: "In ¥9 · Out ¥54", badge: "Flagship", tone: "blue" },
  { name: "Qwen Long", provider: "Tongyi Qianwen", ctx: "10M context", price: "In ¥0.5 · Out ¥2", badge: "Long", tone: "teal" },
  { name: "Qwen3.6 Plus", provider: "Tongyi Qianwen", ctx: "1M context", price: "In ¥2 · Out ¥12", badge: "Popular", tone: "blue" },
  { name: "DeepSeek V4 Pro", provider: "DeepSeek", ctx: "131K context", price: "In ¥4 · Out ¥16", badge: "Reasoning", tone: "red" },
  { name: "DeepSeek V4 Flash", provider: "DeepSeek", ctx: "131K context", price: "In ¥1 · Out ¥4", badge: "Fast", tone: "red" },
  { name: "GLM 5", provider: "Zhipu AI", ctx: "131K context", price: "In ¥2 · Out ¥8", badge: "General", tone: "violet" },
  { name: "Kimi K2.6", provider: "Moonshot AI", ctx: "262K context", price: "In ¥2 · Out ¥8", badge: "Long", tone: "teal" },
  { name: "MiniMax M2.5", provider: "MiniMax", ctx: "131K context", price: "In ¥1.5 · Out ¥6", badge: "Text", tone: "slate" },
  { name: "PixVerse V6", provider: "PixVerse", ctx: "Async video", price: "from ¥0.15/s", badge: "Video", tone: "orange" },
  { name: "HappyHorse 1.0", provider: "Tongyi Qianwen", ctx: "Async video", price: "from ¥0.9/s", badge: "Video", tone: "orange" },
];

function CylinderCarousel({ items }: { items: typeof carouselModels }) {
  const [offset, setOffset] = useState(0);
  const animRef = useRef<number>(0);
  const itemAngle = 360 / items.length;

  useEffect(() => {
    let last = performance.now();
    const speed = 0.014;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setOffset((prev) => (prev + speed * dt) % 360);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const deg = Math.PI / 180;
  const radius = 230;
  const tiltAngle = 10 * deg;
  const sinTilt = Math.sin(tiltAngle);
  const cosTilt = Math.cos(tiltAngle);

  return (
    <div className="ld-cylinder-wrap">
      <div className="ld-cylinder">
        {items.map((item, i) => {
          const angle = i * itemAngle - offset;
          const norm = ((angle % 360) + 540) % 360 - 180;
          const sinA = Math.sin(norm * deg);
          const cosA = Math.cos(norm * deg);
          const y = sinA * radius;
          const x = -cosA * sinTilt * radius;
          const zFactor = cosA * cosTilt;
          const depth = (zFactor + 1) / 2;
          const scale = 0.46 + 0.5 * depth;
          const opacity = 0.16 + 0.84 * depth;
          const blur = depth < 0.32 ? (0.32 - depth) * 10 : 0;

          return (
            <div
              key={item.name}
              className="ld-cyl-item"
              style={{
                transform: `translate(${x}px, ${y}px) scale(${scale})`,
                opacity,
                zIndex: Math.round(depth * 100),
                filter: blur > 0 ? `blur(${blur}px)` : "none",
              }}
            >
              <div className={`ld-cyl-card tone-${item.tone}`}>
                <div className="ld-cyl-card-top">
                  <span className="ld-cyl-card-name">{item.name}</span>
                  <span className="ld-cyl-card-badge">{item.badge}</span>
                </div>
                <div className="ld-cyl-card-meta">
                  <span>{item.provider}</span>
                  <span className="ld-cyl-card-ctx">{item.ctx}</span>
                </div>
                <div className="ld-cyl-card-price">{item.price}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="ld-cylinder-mask-top" />
      <div className="ld-cylinder-mask-btm" />
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const { t } = useI18n();

  return (
    <main className="nf-site">
      <nav className="nf-nav">
        <Link href="/" className="nf-brand" aria-label="NexusFlow home">
          <NexusflowLogo size={15} color="var(--text-primary)" />
        </Link>
        <div className="nf-nav-links">
          <Link href="/models">{t("navModels")}</Link>
          <Link href="/playground">{t("navPlayground")}</Link>
          <Link href="/docs">{t("navDocs")}</Link>
          <Link href="/pricing">{t("navPricing")}</Link>
        </div>
        <div className="nf-nav-actions">
          {user ? (
            <Link href="/playground" className="nf-btn nf-btn-primary">Open Console</Link>
          ) : (
            <>
              <Link href="/login" className="nf-btn nf-btn-secondary">Log in</Link>
              <Link href="/login" className="nf-btn nf-btn-primary">Start building</Link>
            </>
          )}
        </div>
      </nav>

      <section className="nf-hero">
        <div className="nf-hero-copy">
          <div className="nf-eyebrow">Production AI infrastructure for builders</div>
          <h1>NexusFlow</h1>
          <p className="nf-hero-lead">
            A unified model gateway for teams that need multi-provider access, account billing, rate limits,
            observability and a developer console that is ready for real users.
          </p>
          <div className="nf-hero-actions">
            <Link href={user ? "/playground" : "/login"} className="nf-btn nf-btn-primary nf-btn-lg">
              {user ? "Open Playground" : "Get API access"}
            </Link>
            <Link href="/docs/quickstart" className="nf-btn nf-btn-secondary nf-btn-lg">
              Read quickstart
            </Link>
          </div>
          <div className="nf-hero-metrics">
            <div><strong>45</strong><span>catalog models</span></div>
            <div><strong>3</strong><span>protocols</span></div>
            <div><strong>60 QPM</strong><span>default guardrail</span></div>
          </div>
        </div>

        <div className="nf-cylinder-shell" aria-label="Unified model gateway">
          <CylinderCarousel items={carouselModels} />
        </div>
      </section>

      <section className="nf-section nf-section-tight">
        <div className="nf-section-head">
          <span>Model access</span>
          <h2>One account for the model stack</h2>
          <p>Route requests across chat, reasoning, long-context, image and video models without multiplying accounts, keys and invoices.</p>
        </div>
        <div className="nf-model-table">
          {modelRows.map((row) => (
            <div className="nf-model-row" key={row.model}>
              <strong>{row.model}</strong>
              <span>{row.provider}</span>
              <span>{row.context}</span>
              <span>{row.price}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="nf-section">
        <div className="nf-section-head">
          <span>Platform</span>
          <h2>Designed for teams, not demos</h2>
        </div>
        <div className="nf-cap-grid">
          {capabilities.map((item) => (
            <article className="nf-cap" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="nf-workflow">
        <div>
          <span className="nf-eyebrow">Developer workflow</span>
          <h2>From first key to production traffic</h2>
        </div>
        <ol>
          {workflow.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>

      <section className="nf-final">
        <div>
          <h2>Validate in Playground. Ship through the API.</h2>
          <p>Use the same model names, keys and billing from testing to production.</p>
        </div>
        <Link href={user ? "/keys" : "/login"} className="nf-btn nf-btn-primary nf-btn-lg">
          {user ? "Create API key" : "Create account"}
        </Link>
      </section>
    </main>
  );
}
