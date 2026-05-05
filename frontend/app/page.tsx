"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import type { CSSProperties } from "react";

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

const orbitModels = [
  { name: "Qwen", meta: "up to 10M", angle: 0 },
  { name: "DeepSeek", meta: "reasoning", angle: 45 },
  { name: "GLM", meta: "131K context", angle: 90 },
  { name: "Kimi", meta: "262K context", angle: 135 },
  { name: "Messages", meta: "Anthropic API", angle: 180 },
  { name: "PixVerse", meta: "video", angle: 225 },
  { name: "MiniMax", meta: "text", angle: 270 },
  { name: "HappyHorse", meta: "async", angle: 315 },
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <main className="nf-site">
      <nav className="nf-nav">
        <Link href="/" className="nf-brand" aria-label="NexusFlow home">
          <span className="nf-brand-mark">N</span>
          <span>nexusflow</span>
        </Link>
        <div className="nf-nav-links">
          <Link href="/models">Models</Link>
          <Link href="/playground">Playground</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/pricing">Pricing</Link>
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

        <div className="nf-orbit-shell" aria-label="Unified model gateway">
          <div className="nf-orbit-stage">
            <div className="nf-orbit-ring nf-orbit-ring-outer" />
            <div className="nf-orbit-ring nf-orbit-ring-mid" />
            <div className="nf-orbit-ring nf-orbit-ring-inner" />
            <div className="nf-orbit-axis" />
            <div className="nf-orbit-core">
              <span>nexusflow</span>
              <strong>one gateway</strong>
              <small>chat · image · video · messages</small>
            </div>
            {orbitModels.map((item) => (
              <div
                className="nf-orbit-node"
                key={item.name}
                style={{ "--angle": `${item.angle}deg` } as CSSProperties}
              >
                <strong>{item.name}</strong>
                <span>{item.meta}</span>
              </div>
            ))}
          </div>
          <div className="nf-orbit-caption">
            <span className="nf-dot green" />
            <span>routing healthy</span>
            <strong>45 models</strong>
          </div>
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
          <h2>Start with the console, scale through the API.</h2>
          <p>Use Playground for validation, then move the same model names and credentials into your backend services.</p>
        </div>
        <Link href={user ? "/keys" : "/login"} className="nf-btn nf-btn-primary nf-btn-lg">
          {user ? "Create API key" : "Create account"}
        </Link>
      </section>
    </main>
  );
}
