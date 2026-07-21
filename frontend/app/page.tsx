"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import Header from "@/components/Header";
import { useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { formatContextLength, formatModelPrice, getRecommendedModels, ModelSummary } from "@/lib/models";

const fallbackModelRows = [
  { model: "Kimi K3", provider: "Moonshot AI", context: "1M", price: "input ¥20 / output ¥100 per 1M" },
  { model: "Qwen3.7 Max", provider: "Tongyi Qianwen", context: "1M", price: "input ¥12 / output ¥36 per 1M" },
  { model: "GLM 5.2", provider: "Zhipu AI", context: "1M", price: "input ¥8 / output ¥28 per 1M" },
  { model: "DeepSeek V4 Pro", provider: "DeepSeek", context: "1M", price: "input ¥12 / output ¥24 per 1M" },
  { model: "Seedance 2.0", provider: "Volcengine Ark", context: "Async video", price: "from ¥0.44 / second" },
];

const capabilities = [
  {
    title: "Unified API",
    desc: "Use one OpenAI-compatible endpoint for chat, embeddings, image, video, Anthropic Messages and Responses API calls.",
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

const fallbackRoutes = [
  { id: "kimi/kimi-k3", name: "Kimi K3", provider: "Moonshot AI", category: "Reasoning", context: "1M context" },
  { id: "qwen3.7-max", name: "Qwen3.7 Max", provider: "Tongyi Qianwen", category: "General", context: "1M context" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "DeepSeek", category: "Code", context: "1M context" },
  { id: "seedance-2.0", name: "Seedance 2.0", provider: "Volcengine Ark", category: "Video", context: "4K HDR" },
];

function RoutingObservatory({ items }: { items: ModelSummary[] }) {
  const routes = items.length > 0
    ? items.slice(0, 4).map((item) => ({
        id: item.id,
        name: item.name,
        provider: item.provider,
        category: item.category.replace("模型", "") || "Model",
        context: item.pricingType === "per-second" ? "Async media" : `${formatContextLength(item.contextLength)} context`,
      }))
    : fallbackRoutes;

  return (
    <div className="nf-observatory" aria-label="NexusFlow routing observatory">
      <div className="nf-observatory-top">
        <div><i /><i /><i /></div>
        <span>ROUTING OBSERVATORY</span>
        <strong><b /> LIVE</strong>
      </div>
      <div className="nf-observatory-body">
        <div className="nf-endpoint-node">
          <span>YOUR APP</span>
          <code>POST /v1</code>
        </div>
        <div className="nf-route-bus" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
        <div className="nf-route-stack">
          {routes.map((route, index) => (
            <div className="nf-route-item" key={route.id} style={{ "--route-delay": `${index * 0.42}s` } as React.CSSProperties}>
              <div className="nf-route-index">0{index + 1}</div>
              <div>
                <strong>{route.name}</strong>
                <span>{route.provider}</span>
              </div>
              <div className="nf-route-meta">
                <span>{route.category}</span>
                <code>{route.context}</code>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="nf-observatory-footer">
        <span><b>OPENAI</b> compatible</span>
        <span><b>ANTHROPIC</b> native</span>
        <span><b>RESPONSES</b> ready</span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
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
  const routingModels = recommended.length > 0
    ? recommended.concat(models.filter((model) => !recommended.some((item) => item.id === model.id))).slice(0, 4)
    : [];
  const modelCount = models.length || 67;
  const availableCount = models.length > 0
    ? models.filter((model) => !model.availability || model.availability === "available").length
    : 61;

  return (
    <>
      <Header />
      <main id="main-content" className="nf-site nf-site-v2">

      <section className="nf-hero nf-hero-v2">
        <div className="nf-hero-copy">
          <Link href="/models/kimi/kimi-k3" className="nf-release-signal">
            <span>NEW ROUTE</span>
            Kimi K3 · 2.8T params · native vision
            <b aria-hidden>↗</b>
          </Link>
          <div className="nf-eyebrow">AI ROUTING FABRIC · PRODUCTION ONLINE</div>
          <h1>
            <span>One endpoint.</span>
            <em>Every intelligence.</em>
          </h1>
          <p className="nf-hero-lead">
            用一个生产级 API，连接文本、推理、视觉、图像与视频模型。NexusFlow 把模型选择、协议兼容、计费和观测收束到一条清晰路径。
          </p>
          <div className="nf-protocol-line" aria-label="Supported protocols">
            <span>OpenAI SDK</span><i />
            <span>Anthropic Messages</span><i />
            <span>Responses API</span>
          </div>
          <div className="nf-hero-actions">
            <Link href={user ? "/dashboard" : "/login?tab=register"} className="nf-btn nf-btn-primary nf-btn-lg">
              {user ? "进入控制台" : "免费开始构建"}<span aria-hidden>→</span>
            </Link>
            <Link href="/docs/quickstart" className="nf-btn nf-btn-secondary nf-btn-lg">
              查看快速接入
            </Link>
          </div>
          <div className="nf-hero-metrics">
            <div><strong>{modelCount}</strong><span>模型统一接入</span></div>
            <div><strong>{availableCount}</strong><span>当前可调用</span></div>
            <div><strong>3</strong><span>原生协议</span></div>
          </div>
        </div>

        <div className="nf-cylinder-shell" aria-label="Unified model gateway">
          <RoutingObservatory items={routingModels} />
        </div>
      </section>

      <div className="nf-signal-rail" aria-label="Platform capabilities">
        <span><b>67</b> MODEL ROUTES</span>
        <span><b>01</b> UNIFIED KEY</span>
        <span><b>¥</b> PRECISE BILLING</span>
        <span><b>↯</b> STREAMING TTFT</span>
        <span><b>24/7</b> HEALTH ROUTING</span>
      </div>

      {/* ═══ FLAGSHIP — Kimi K3（最新上线旗舰，醒目主推；上一任主推 Seedance 2.0 保留在 hero 指标） ═══ */}
      <section className="nf-flagship" style={{
        position: "relative",
        margin: "8px auto 0",
        maxWidth: 1180,
        padding: "48px clamp(24px, 5vw, 56px)",
        borderRadius: 28,
        overflow: "hidden",
        background: "linear-gradient(135deg, #04070d 0%, #0b1f24 48%, #114b4f 100%)",
        border: "1px solid rgba(45,212,191,0.28)",
        boxShadow: "0 36px 90px rgba(4,16,20,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
        <div style={{
          position: "absolute", top: "-28%", right: "-6%", width: 460, height: 460,
          borderRadius: "50%", background: "radial-gradient(circle, rgba(45,212,191,0.24), transparent 70%)",
          filter: "blur(70px)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "-30%", left: "0%", width: 380, height: 380,
          borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,0.18), transparent 70%)",
          filter: "blur(64px)", pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 40, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 440px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <span style={{
                padding: "6px 15px", borderRadius: 999, fontSize: 11, fontWeight: 800,
                letterSpacing: "0.16em", textTransform: "uppercase",
                background: "linear-gradient(135deg, rgba(45,212,191,0.3), rgba(34,211,238,0.22))",
                color: "#99f6e4", border: "1px solid rgba(45,212,191,0.38)",
              }}>
                Flagship LLM
              </span>
              <span style={{
                padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: "rgba(250,204,21,0.15)", color: "#fde68a", border: "1px solid rgba(250,204,21,0.3)",
              }}>
                最新上线
              </span>
              <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)" }}>by 月之暗面 Moonshot AI</span>
            </div>

            <h2 style={{
              fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.05, fontWeight: 800,
              letterSpacing: "-0.04em", margin: "0 0 16px",
              background: "linear-gradient(135deg, #f8fafc 0%, #99f6e4 48%, #2dd4bf 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>
              Kimi K3
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: "rgba(226,232,240,0.85)", margin: "0 0 14px", maxWidth: 560 }}>
              Kimi 迄今能力最强的旗舰模型：2.8 万亿参数，基于 KDA 混合线性注意力与注意力残差架构，原生视觉理解 + 深度思考，100 万 token 上下文。面向长程编程、知识工作与推理场景——OpenAI 与 Anthropic 协议均可直接调用 <code style={{ fontFamily: "var(--font-mono, monospace)", color: "#99f6e4" }}>kimi/kimi-k3</code>。
            </p>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "rgba(148,163,184,0.78)", margin: "0 0 28px", maxWidth: 540 }}>
              全球首个开源的 3 万亿级别模型。输入 ¥20/M、输出 ¥100/M、缓存命中低至 ¥2/M，与 Qwen、GLM、DeepSeek 共用同一个 API Key 与计费体系。
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/models/kimi/kimi-k3" style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "13px 28px", borderRadius: 12,
                background: "linear-gradient(135deg, #2dd4bf, #0d9488)",
                color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none",
                boxShadow: "0 6px 20px rgba(13,148,136,0.4)",
              }}>
                了解 Kimi K3
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
              <Link href="/docs/api/kimi" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "13px 24px", borderRadius: 12,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                color: "#e2e8f0", fontSize: 14, fontWeight: 500, textDecoration: "none",
              }}>
                API 文档
              </Link>
            </div>
          </div>

          <div style={{ flex: "0 0 auto", display: "grid", gridTemplateColumns: "repeat(2, minmax(96px, auto))", gap: "16px 32px" }}>
            {[
              { v: "2.8T", l: "万亿级参数" },
              { v: "1M", l: "Token 上下文窗口" },
              { v: "1M", l: "最大输出长度" },
              { v: "¥2/M", l: "缓存命中输入价" },
            ].map((s) => (
              <div key={s.l} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: "#99f6e4", letterSpacing: "-1px" }}>{s.v}</div>
                <div style={{ fontSize: 11.5, color: "rgba(226,232,240,0.58)", marginTop: 4 }}>{s.l}</div>
              </div>
            ))}
          </div>
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
    </>
  );
}
