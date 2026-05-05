"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

const modelRows = [
  { model: "Qwen3.6 Max Preview", provider: "Alibaba Cloud", context: "262K", use: "Reasoning, coding" },
  { model: "DeepSeek V4 Pro", provider: "DeepSeek", context: "131K", use: "Agent workflows" },
  { model: "GLM 5", provider: "Zhipu AI", context: "128K", use: "General production" },
  { model: "Kimi K2", provider: "Moonshot", context: "128K", use: "Long-form tasks" },
  { model: "PixVerse v6", provider: "PixVerse", context: "Async", use: "Video generation" },
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
            <div><strong>45+</strong><span>models</span></div>
            <div><strong>3</strong><span>protocols</span></div>
            <div><strong>60 QPM</strong><span>default guardrail</span></div>
          </div>
        </div>

        <div className="nf-console" aria-label="Gateway console preview">
          <div className="nf-console-top">
            <span className="nf-dot green" />
            <span>Gateway status</span>
            <strong>healthy</strong>
          </div>
          <div className="nf-console-grid">
            <div className="nf-console-card">
              <span>Balance</span>
              <strong>¥3.99</strong>
              <small>pre-call checks enabled</small>
            </div>
            <div className="nf-console-card">
              <span>Success rate</span>
              <strong>100%</strong>
              <small>last account calls</small>
            </div>
            <div className="nf-console-card">
              <span>Latency</span>
              <strong>0.8s</strong>
              <small>recent text calls</small>
            </div>
            <div className="nf-console-card">
              <span>Cost</span>
              <strong>¥0.000005</strong>
              <small>qwen-turbo test</small>
            </div>
          </div>
          <div className="nf-code-window">
            <div className="nf-code-line"><span>POST</span> /v1/chat/completions</div>
            <pre>{`{
  "model": "qwen-turbo",
  "messages": [{"role": "user", "content": "Ship it"}]
}`}</pre>
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
              <span>{row.use}</span>
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
