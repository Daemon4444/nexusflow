"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { NexusflowLogo } from "@/components/QuadrantLogo";
import { useEffect, useRef, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { formatContextLength, formatModelPrice, getRecommendedModels, ModelSummary } from "@/lib/models";

const fallbackModelRows = [
  { model: "Qwen3.6 Max Preview", provider: "Tongyi Qianwen", context: "262K", price: "input ¥9 / output ¥54 per 1M" },
  { model: "DeepSeek V3.2", provider: "DeepSeek", context: "131K", price: "input ¥2 / output ¥3 per 1M" },
  { model: "GLM 5", provider: "Zhipu AI", context: "131K", price: "input ¥4 / output ¥18 per 1M" },
  { model: "Kimi K2.5", provider: "Moonshot AI", context: "131K", price: "input ¥4 / output ¥21 per 1M" },
  { model: "PixVerse V4.5", provider: "PixVerse", context: "Async video", price: "from ¥0.15 / second" },
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

const fallbackCarouselModels = [
  { name: "Qwen3.6 Max Preview", provider: "Tongyi Qianwen", ctx: "262K context", price: "In ¥9 · Out ¥54", badge: "Flagship", tone: "blue" },
  { name: "Qwen3 Max", provider: "Tongyi Qianwen", ctx: "262K context", price: "In ¥2.5 · Out ¥10", badge: "Stable", tone: "blue" },
  { name: "Qwen Long", provider: "Tongyi Qianwen", ctx: "10M context", price: "In ¥0.5 · Out ¥2", badge: "Long", tone: "teal" },
  { name: "Qwen3.6 Plus", provider: "Tongyi Qianwen", ctx: "1M context", price: "In ¥2 · Out ¥12", badge: "Popular", tone: "blue" },
  { name: "Qwen3.5 Plus", provider: "Tongyi Qianwen", ctx: "1M context", price: "In ¥0.8 · Out ¥4.8", badge: "Balanced", tone: "blue" },
  { name: "Qwen3.5 Flash", provider: "Tongyi Qianwen", ctx: "1M context", price: "In ¥0.2 · Out ¥2", badge: "Fast", tone: "teal" },
  { name: "Qwen VL Flash", provider: "Tongyi Qianwen", ctx: "262K vision", price: "In ¥0.15 · Out ¥1.5", badge: "Vision", tone: "violet" },
  { name: "Qwen Coder Flash", provider: "Tongyi Qianwen", ctx: "1M code", price: "In ¥1 · Out ¥4", badge: "Code", tone: "slate" },
  { name: "DeepSeek V3.2", provider: "DeepSeek", ctx: "131K context", price: "In ¥2 · Out ¥3", badge: "General", tone: "red" },
  { name: "DeepSeek R1", provider: "DeepSeek", ctx: "64K context", price: "In ¥4 · Out ¥16", badge: "Reasoning", tone: "red" },
  { name: "GLM 5", provider: "Zhipu AI", ctx: "131K context", price: "In ¥4 · Out ¥18", badge: "General", tone: "violet" },
  { name: "Kimi K2.5", provider: "Moonshot AI", ctx: "131K context", price: "In ¥4 · Out ¥21", badge: "Writing", tone: "teal" },
  { name: "Text Embedding V4", provider: "Tongyi Qianwen", ctx: "8K vectors", price: "¥0.5 / 1M input", badge: "Vector", tone: "slate" },
  { name: "Qwen Image Max", provider: "Tongyi Qianwen", ctx: "Image", price: "per image", badge: "Image", tone: "orange" },
  { name: "PixVerse V4.5", provider: "PixVerse", ctx: "Async video", price: "from ¥0.15/s", badge: "Video", tone: "orange" },
  { name: "HappyHorse 1.0", provider: "Tongyi Qianwen", ctx: "Async video", price: "from ¥0.9/s", badge: "Video", tone: "orange" },
];

type CarouselModel = typeof fallbackCarouselModels[number];

function toneForCategory(category: string): CarouselModel["tone"] {
  if (category.includes("推理") || category.includes("DeepSeek")) return "red";
  if (category.includes("多模态")) return "violet";
  if (category.includes("图像") || category.includes("视频")) return "orange";
  if (category.includes("编程") || category.includes("向量")) return "slate";
  return "blue";
}

function modelToCarousel(model: ModelSummary): CarouselModel {
  return {
    name: model.name,
    provider: model.provider,
    ctx: model.pricingType === "per-second" ? "Async video" : `${formatContextLength(model.contextLength)} context`,
    price: formatModelPrice(model),
    badge: model.category.replace("模型", "") || "Model",
    tone: toneForCategory(model.category),
  };
}

function CylinderCarousel({ items }: { items: CarouselModel[] }) {
  const [offset, setOffset] = useState(0);
  const animRef = useRef<number>(0);
  const itemAngle = 360 / items.length;

  useEffect(() => {
    let last = performance.now();
    const speed = 0.02;
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
  const radius = 330;
  const tiltAngle = 24 * deg;
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
          const visibility = Math.max(0, Math.min(1, (depth - 0.86) / 0.08));
          const scale = 0.32 + 0.58 * depth;
          const rearPresence = 0.28 + Math.min(depth, 0.72) * 0.22;
          const opacity = Math.max(rearPresence, visibility * (0.36 + 0.64 * depth));
          const blur = visibility > 0 ? 0 : Math.min(2.6, 0.7 + (0.8 - depth) * 2.4);
          const isRear = visibility === 0;

          return (
            <div
              key={item.name}
              className={`ld-cyl-item${isRear ? " is-rear" : ""}`}
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
  const [models, setModels] = useState<ModelSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      try {
        const res = await fetchAPI("/api/models");
        if (!cancelled && res.success) setModels(res.data || []);
      } catch {
        if (!cancelled) setModels([]);
      }
    }
    loadModels();
    return () => { cancelled = true; };
  }, []);

  const recommended = getRecommendedModels(models, 8);
  const modelRows = recommended.length > 0
    ? recommended.slice(0, 5).map((model) => ({
        model: model.name,
        provider: model.provider,
        context: model.pricingType === "per-second" ? "Async video" : formatContextLength(model.contextLength),
        price: formatModelPrice(model),
      }))
    : fallbackModelRows;
  const carouselModels = recommended.length > 0
    ? recommended.concat(models.filter((model) => !recommended.some((item) => item.id === model.id)).slice(0, 12)).map(modelToCarousel)
    : fallbackCarouselModels;
  const modelCount = models.length || 45;

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
            <Link href="/dashboard" className="nf-btn nf-btn-primary">Open Console</Link>
          ) : (
            <>
              <Link href="/login" className="nf-btn nf-btn-secondary">Log in</Link>
              <Link href="/login?tab=register" className="nf-btn nf-btn-primary">Start building</Link>
            </>
          )}
        </div>
      </nav>

      <section className="nf-hero">
        <div className="nf-hero-copy">
          <div className="nf-eyebrow">One API, every leading AI model</div>
          <h1>NexusFlow</h1>
          <p className="nf-hero-lead">
            Between question and answer, there is always a path. NexusFlow turns that uncertainty into one deliberate API for text, vision, image and video intelligence.
          </p>
          <div className="nf-hero-actions">
            <Link href={user ? "/dashboard" : "/login?tab=register"} className="nf-btn nf-btn-primary nf-btn-lg">
              {user ? "Open Console" : "免费开始"}
            </Link>
            <Link href="/docs/quickstart" className="nf-btn nf-btn-secondary nf-btn-lg">
              Read quickstart
            </Link>
          </div>
          <div className="nf-hero-metrics">
            <div><strong>{modelCount}+</strong><span>model options</span></div>
            <div><strong>¥0.15/s</strong><span>video from</span></div>
            <div><strong>VBench #1</strong><span>HappyHorse video</span></div>
          </div>
        </div>

        <div className="nf-cylinder-shell" aria-label="Unified model gateway">
          <CylinderCarousel items={carouselModels} />
        </div>
      </section>

      <section className="nf-section nf-section-tight">
        <div className="nf-section-head">
          <span>Model access</span>
          <h2>Every request begins as a choice</h2>
          <p>Route requests across chat, reasoning, long-context, image and video models without multiplying accounts, keys and invoices. The catalog below is loaded from the live model API.</p>
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
          <h2>Give the question a path to follow</h2>
        </div>
        <ol>
          {workflow.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>

      <section className="nf-final">
        <div>
          <h2 className="nf-final-slogan">
            <span>Not all answers are equal.</span>
            <span>Choose the route before the reply.</span>
          </h2>
          <p>Validate in Playground, then ship through the same model names, keys and billing path in production.</p>
        </div>
        <Link href={user ? "/keys" : "/login?tab=register"} className="nf-btn nf-btn-primary nf-btn-lg">
          {user ? "Create API key" : "免费开始"}
        </Link>
      </section>
    </main>
  );
}
