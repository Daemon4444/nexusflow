"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { NexusflowLogo } from "@/components/QuadrantLogo";
import { useEffect, useRef, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { formatContextLength, formatModelPrice, getRecommendedModels, ModelSummary } from "@/lib/models";
import Footer from "@/components/Footer";

const fallbackModelRows = [
  { model: "Claude Sonnet 5", provider: "Anthropic via HiModels", context: "1M", price: "input ¥13.6 / output ¥68 per 1M" },
  { model: "Qwen3.8 Max", provider: "Tongyi Qianwen", context: "1M", price: "input ¥12 / output ¥36 per 1M" },
  { model: "Kimi K3", provider: "Moonshot AI", context: "1M", price: "input ¥20 / output ¥100 per 1M" },
  { model: "Qwen3.7 Max", provider: "Tongyi Qianwen", context: "1M", price: "input ¥12 / output ¥36 per 1M" },
  { model: "GLM 5.3", provider: "Zhipu AI", context: "1M", price: "input ¥8 / output ¥28 per 1M" },
  { model: "DeepSeek V4 Flash", provider: "DeepSeek", context: "1M", price: "input ¥1 / output ¥2 per 1M" },
  { model: "DeepSeek V4 Flash 0731", provider: "DeepSeek", context: "1M", price: "input ¥1 / output ¥2 per 1M" },
  { model: "DeepSeek V4 Pro 0813", provider: "DeepSeek", context: "1M", price: "input ¥9 / output ¥27 per 1M" },
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

const fallbackCarouselModels = [
  { name: "Claude Sonnet 5", provider: "Anthropic via HiModels", ctx: "1M context", price: "In ¥13.6 · Out ¥68", badge: "Featured", tone: "orange" },
  { name: "Qwen3.8 Max", provider: "Tongyi Qianwen", ctx: "1M context", price: "In ¥12 · Out ¥36", badge: "New", tone: "blue" },
  { name: "Kimi K3", provider: "Moonshot AI", ctx: "1M context", price: "In ¥20 · Out ¥100", badge: "New", tone: "teal" },
  { name: "Qwen3.7 Max", provider: "Tongyi Qianwen", ctx: "1M context", price: "In ¥12 · Out ¥36", badge: "Flagship", tone: "blue" },
  { name: "Qwen3 Max", provider: "Tongyi Qianwen", ctx: "262K context", price: "In ¥2.5 · Out ¥10", badge: "Stable", tone: "blue" },
  { name: "Qwen Long", provider: "Tongyi Qianwen", ctx: "10M context", price: "In ¥0.5 · Out ¥2", badge: "Long", tone: "teal" },
  { name: "Qwen3.6 Plus", provider: "Tongyi Qianwen", ctx: "1M context", price: "In ¥2 · Out ¥12", badge: "Popular", tone: "blue" },
  { name: "Qwen3.5 Plus", provider: "Tongyi Qianwen", ctx: "1M context", price: "In ¥0.8 · Out ¥4.8", badge: "Balanced", tone: "blue" },
  { name: "Qwen3.5 Flash", provider: "Tongyi Qianwen", ctx: "1M context", price: "In ¥0.2 · Out ¥2", badge: "Fast", tone: "teal" },
  { name: "Qwen3.5 Omni Plus", provider: "Tongyi Qianwen", ctx: "262K omni", price: "In ¥7 · Out ¥40", badge: "Omni", tone: "violet" },
  { name: "Qwen3.5 Omni Flash", provider: "Tongyi Qianwen", ctx: "262K omni", price: "In ¥2.2 · Out ¥13.3", badge: "Omni", tone: "violet" },
  { name: "Qwen3 VL Flash", provider: "Tongyi Qianwen", ctx: "262K vision", price: "In ¥0.15 · Out ¥1.5", badge: "Vision", tone: "violet" },
  { name: "Qwen3 Coder Flash", provider: "Tongyi Qianwen", ctx: "1M code", price: "In ¥1 · Out ¥4", badge: "Code", tone: "slate" },
  { name: "DeepSeek V4 Flash", provider: "DeepSeek", ctx: "1M context", price: "In ¥1 · Out ¥2", badge: "Fast", tone: "red" },
  { name: "DeepSeek V4 Flash 0731", provider: "DeepSeek", ctx: "1M context", price: "In ¥1 · Out ¥2", badge: "Snapshot", tone: "red" },
  { name: "DeepSeek V4 Pro 0813", provider: "DeepSeek", ctx: "1M context", price: "In ¥9 · Out ¥27", badge: "Snapshot", tone: "red" },
  { name: "DeepSeek V4 Pro", provider: "DeepSeek", ctx: "1M context", price: "In ¥12 · Out ¥24", badge: "Reasoning", tone: "red" },
  { name: "DeepSeek V3.2", provider: "DeepSeek", ctx: "131K context", price: "In ¥2 · Out ¥3", badge: "General", tone: "red" },
  { name: "GLM 5.3", provider: "Zhipu AI", ctx: "1M context", price: "In ¥8 · Out ¥28", badge: "New", tone: "violet" },
  { name: "Text Embedding V4", provider: "Tongyi Qianwen", ctx: "8K vectors", price: "¥0.5 / 1M input", badge: "Vector", tone: "slate" },
  { name: "Qwen Image Max", provider: "Tongyi Qianwen", ctx: "Image", price: "per image", badge: "Image", tone: "orange" },
  { name: "PixVerse V6", provider: "PixVerse", ctx: "Async video", price: "from ¥0.15/s", badge: "Video", tone: "orange" },
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

interface FlagshipSlide {
  key: string;
  accent: string;
  border: string;
  gradient: string;
  glow: string;
  btnGradient: string;
  btnShadow: string;
  primaryBadge: string;
  secondaryBadge: string;
  byline: string;
  title: string;
  titleGradient: string;
  lead: string;
  modelCode?: string;
  sub: string;
  primaryHref: string;
  primaryLabel: string;
  docsHref: string;
  stats: { v: string; l: string }[];
}

const flagshipSlides: FlagshipSlide[] = [
  {
    key: "claude-sonnet-5",
    accent: "#fdba74",
    border: "rgba(251,146,60,0.3)",
    gradient: "linear-gradient(135deg, #0c0704 0%, #27160d 48%, #7c2d12 100%)",
    glow: "rgba(251,146,60,0.24)",
    btnGradient: "linear-gradient(135deg, #fb923c, #c2410c)",
    btnShadow: "0 6px 20px rgba(194,65,12,0.4)",
    primaryBadge: "Featured LLM",
    secondaryBadge: "首选",
    byline: "by Anthropic · HiModels",
    title: "Claude Sonnet 5",
    titleGradient: "linear-gradient(135deg, #fff7ed 0%, #fed7aa 48%, #fb923c 100%)",
    lead: "Claude Sonnet 5 是 NexusFlow 当前优先推荐的 Claude 模型，面向生产级对话、复杂分析与长上下文工作流——使用稳定公开 ID ",
    modelCode: "claude-sonnet-5",
    sub: "通过 HiModels 原生 Anthropic Messages 兼容上游接入。输入 ¥13.6/M、输出 ¥68/M；首页始终使用不带日期后缀的稳定模型 ID。",
    primaryHref: "/models/claude-sonnet-5",
    primaryLabel: "了解 Claude Sonnet 5",
    docsHref: "/docs/api/claude",
    stats: [
      { v: "1M", l: "Token 上下文窗口" },
      { v: "128K", l: "最大输出" },
      { v: "¥13.6/M", l: "输入价格" },
      { v: "¥68/M", l: "输出价格" },
    ],
  },
  {
    key: "qwen3.8-max",
    accent: "#a5b4fc",
    border: "rgba(129,140,248,0.32)",
    gradient: "linear-gradient(135deg, #05060f 0%, #131a3a 48%, #312e81 100%)",
    glow: "rgba(129,140,248,0.26)",
    btnGradient: "linear-gradient(135deg, #818cf8, #4338ca)",
    btnShadow: "0 6px 20px rgba(67,56,202,0.42)",
    primaryBadge: "Flagship LLM",
    secondaryBadge: "最新上线",
    byline: "by 通义千问 · 阿里云百炼",
    title: "Qwen3.8 Max",
    titleGradient: "linear-gradient(135deg, #f8fafc 0%, #c7d2fe 48%, #818cf8 100%)",
    lead: "通义千问 3.8 代旗舰：2.4 万亿参数 MoE，编程与办公能力全面跃升，可自主编程十数天交付完整项目。胜任法律、金融、设计等数百种专业任务，一次对话端到端交付生产级成果——直接调用 ",
    modelCode: "qwen3.8-max",
    sub: "原生视觉理解贯穿规划、执行与验证全流程，支持超长文档与长视频深度解析。输入 ¥12/M、输出 ¥36/M、显式缓存命中低至 ¥1/M。",
    primaryHref: "/models/qwen3.8-max",
    primaryLabel: "了解 Qwen3.8 Max",
    docsHref: "/docs/api/qwen",
    stats: [
      { v: "2.4T", l: "MoE 总参数" },
      { v: "1M", l: "Token 上下文窗口" },
      { v: "128K", l: "最大输出" },
      { v: "¥1/M", l: "显式缓存命中价" },
    ],
  },
  {
    key: "deepseek-v4-flash",
    accent: "#7dd3fc",
    border: "rgba(56,189,248,0.3)",
    gradient: "linear-gradient(135deg, #030712 0%, #071b2b 48%, #0c4a6e 100%)",
    glow: "rgba(56,189,248,0.24)",
    btnGradient: "linear-gradient(135deg, #38bdf8, #0284c7)",
    btnShadow: "0 6px 20px rgba(2,132,199,0.4)",
    primaryBadge: "Fast LLM",
    secondaryBadge: "最新上线",
    byline: "by DeepSeek · 阿里云百炼",
    title: "DeepSeek V4 Flash",
    titleGradient: "linear-gradient(135deg, #f8fafc 0%, #bae6fd 48%, #38bdf8 100%)",
    lead: "高效轻量化 MoE 模型：总参 284B、激活 13B，原生支持百万超长上下文。推理速度快、延迟低、成本低，面向高并发对话、内容创作、基础 RAG 与批量任务——直接调用 ",
    modelCode: "deepseek-v4-flash",
    sub: "支持混合思考、Function Calling、联网搜索与上下文缓存。输入 ¥1/M、输出 ¥2/M、缓存命中输入低至 ¥0.2/M。",
    primaryHref: "/models/deepseek-v4-flash",
    primaryLabel: "了解 DeepSeek V4 Flash",
    docsHref: "/docs/api/deepseek",
    stats: [
      { v: "284B", l: "MoE 总参数" },
      { v: "13B", l: "单次激活参数" },
      { v: "1M", l: "Token 上下文窗口" },
      { v: "¥0.2/M", l: "缓存命中输入价" },
    ],
  },
  {
    key: "kimi-k3",
    accent: "#99f6e4",
    border: "rgba(45,212,191,0.28)",
    gradient: "linear-gradient(135deg, #04070d 0%, #0b1f24 48%, #114b4f 100%)",
    glow: "rgba(45,212,191,0.24)",
    btnGradient: "linear-gradient(135deg, #2dd4bf, #0d9488)",
    btnShadow: "0 6px 20px rgba(13,148,136,0.4)",
    primaryBadge: "Flagship LLM",
    secondaryBadge: "最新上线",
    byline: "by 月之暗面 Moonshot AI",
    title: "Kimi K3",
    titleGradient: "linear-gradient(135deg, #f8fafc 0%, #99f6e4 48%, #2dd4bf 100%)",
    lead: "Kimi 迄今能力最强的旗舰模型：2.8 万亿参数，基于 KDA 混合线性注意力与注意力残差架构，原生视觉理解 + 深度思考，100 万 token 上下文。面向长程编程、知识工作与推理场景——OpenAI 与 Anthropic 协议均可直接调用 ",
    modelCode: "kimi-k3",
    sub: "全球首个开源的 3 万亿级别模型。输入 ¥20/M、输出 ¥100/M、缓存命中低至 ¥2/M，与 Qwen、GLM、DeepSeek 共用同一个 API Key 与计费体系。",
    primaryHref: "/models/kimi-k3",
    primaryLabel: "了解 Kimi K3",
    docsHref: "/docs/api/kimi",
    stats: [
      { v: "2.8T", l: "万亿级参数" },
      { v: "1M", l: "Token 上下文窗口" },
      { v: "1M", l: "最大输出长度" },
      { v: "¥2/M", l: "缓存命中输入价" },
    ],
  },
  {
    key: "glm-5.3",
    accent: "#c4b5fd",
    border: "rgba(167,139,250,0.3)",
    gradient: "linear-gradient(135deg, #07040d 0%, #170f2e 48%, #3b1d78 100%)",
    glow: "rgba(167,139,250,0.22)",
    btnGradient: "linear-gradient(135deg, #a78bfa, #7c3aed)",
    btnShadow: "0 6px 20px rgba(124,58,237,0.4)",
    primaryBadge: "Flagship LLM",
    secondaryBadge: "最新上线",
    byline: "by 智谱AI Zhipu AI",
    title: "GLM 5.3",
    titleGradient: "linear-gradient(135deg, #f8fafc 0%, #ddd6fe 48%, #a78bfa 100%)",
    lead: "智谱新一代旗舰：1M 无损超长上下文，三档深度思考调节，编程与复杂推理进一步增强，为长程智能体任务而生——直接调用 ",
    modelCode: "glm-5.3",
    sub: "输入 ¥8/M、输出 ¥28/M、缓存命中 ¥2/M，支持思考模式、函数调用与结构化输出。",
    primaryHref: "/models/glm-5.3",
    primaryLabel: "了解 GLM 5.3",
    docsHref: "/docs/api/glm",
    stats: [
      { v: "1M", l: "Token 上下文窗口" },
      { v: "3 档", l: "深度思考调节" },
      { v: "131K", l: "最大输出长度" },
      { v: "¥2/M", l: "缓存命中输入价" },
    ],
  },
  {
    key: "seedance-2.0",
    accent: "#fdba74",
    border: "rgba(251,146,60,0.3)",
    gradient: "linear-gradient(135deg, #0d0704 0%, #241209 48%, #6b2a10 100%)",
    glow: "rgba(251,146,60,0.2)",
    btnGradient: "linear-gradient(135deg, #fb923c, #ea580c)",
    btnShadow: "0 6px 20px rgba(234,88,12,0.4)",
    primaryBadge: "Video Gen",
    secondaryBadge: "4K HDR",
    byline: "by 火山方舟 Volcengine",
    title: "Seedance 2.0",
    titleGradient: "linear-gradient(135deg, #f8fafc 0%, #fed7aa 48%, #fb923c 100%)",
    lead: "火山引擎最新一代旗舰视频生成模型：多模态参考生视频（图 + 视频 + 音频），4K HDR 10bit 输出，有声视频自动生成，支持首尾帧图生视频与文生视频。",
    sub: "时长 4-15 秒，4K / 1080P / 720P 多档分辨率，按秒计费、异步任务制，与文本模型共用同一个 API Key 与余额。",
    primaryHref: "/models/seedance-2.0",
    primaryLabel: "了解 Seedance 2.0",
    docsHref: "/docs/api/seedance",
    stats: [
      { v: "4K", l: "HDR 10bit 输出" },
      { v: "15s", l: "单次最长时长" },
      { v: "9图", l: "多模态参考输入" },
      { v: "有声", l: "音画同步生成" },
    ],
  },
];

function FlagshipCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = flagshipSlides.length;

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(timer);
  }, [paused, count]);

  const go = (next: number) => setIndex(((next % count) + count) % count);
  const active = flagshipSlides[index];

  const arrowStyle: React.CSSProperties = {
    position: "absolute", top: "50%", transform: "translateY(-50%)", zIndex: 2,
    width: 38, height: 38, borderRadius: "50%", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.16)",
    color: "#e2e8f0",
  };

  return (
    <section
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        position: "relative",
        margin: "8px auto 0",
        maxWidth: 1180,
        borderRadius: 28,
        overflow: "hidden",
        background: active.gradient,
        border: `1px solid ${active.border}`,
        boxShadow: "0 36px 90px rgba(4,16,20,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
        transition: "background 600ms ease, border-color 600ms ease",
      }}
    >
      <div style={{
        display: "flex",
        width: `${count * 100}%`,
        transform: `translateX(-${index * (100 / count)}%)`,
        transition: "transform 600ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}>
        {flagshipSlides.map((slide) => (
          <div key={slide.key} style={{ width: `${100 / count}%`, flexShrink: 0, position: "relative", padding: "48px clamp(24px, 5vw, 56px) 64px" }}>
            <div style={{
              position: "absolute", top: "-28%", right: "-6%", width: 460, height: 460,
              borderRadius: "50%", background: `radial-gradient(circle, ${slide.glow}, transparent 70%)`,
              filter: "blur(70px)", pointerEvents: "none",
            }} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 40, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ flex: "1 1 440px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
                  <span style={{
                    padding: "6px 15px", borderRadius: 999, fontSize: 11, fontWeight: 800,
                    letterSpacing: "0.16em", textTransform: "uppercase",
                    background: "rgba(255,255,255,0.1)",
                    color: slide.accent, border: `1px solid ${slide.border}`,
                  }}>
                    {slide.primaryBadge}
                  </span>
                  <span style={{
                    padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                    background: "rgba(250,204,21,0.15)", color: "#fde68a", border: "1px solid rgba(250,204,21,0.3)",
                  }}>
                    {slide.secondaryBadge}
                  </span>
                  <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)" }}>{slide.byline}</span>
                </div>

                <h2 style={{
                  fontSize: "clamp(36px, 5vw, 52px)", lineHeight: 1.05, fontWeight: 800,
                  letterSpacing: "-0.04em", margin: "0 0 16px",
                  background: slide.titleGradient,
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>
                  {slide.title}
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: "rgba(226,232,240,0.85)", margin: "0 0 14px", maxWidth: 560 }}>
                  {slide.lead}
                  {slide.modelCode ? (
                    <code style={{ fontFamily: "var(--font-mono, monospace)", color: slide.accent }}>{slide.modelCode}</code>
                  ) : null}
                  {slide.modelCode ? "。" : null}
                </p>
                <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "rgba(148,163,184,0.78)", margin: "0 0 28px", maxWidth: 540 }}>
                  {slide.sub}
                </p>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Link href={slide.primaryHref} style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "13px 28px", borderRadius: 12,
                    background: slide.btnGradient,
                    color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none",
                    boxShadow: slide.btnShadow,
                  }}>
                    {slide.primaryLabel}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </Link>
                  <Link href={slide.docsHref} style={{
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
                {slide.stats.map((s) => (
                  <div key={s.l} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 30, fontWeight: 800, color: slide.accent, letterSpacing: "-1px" }}>{s.v}</div>
                    <div style={{ fontSize: 11.5, color: "rgba(226,232,240,0.58)", marginTop: 4 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" aria-label="上一个" onClick={() => go(index - 1)} style={{ ...arrowStyle, left: 14 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <button type="button" aria-label="下一个" onClick={() => go(index + 1)} style={{ ...arrowStyle, right: 14 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 6l6 6-6 6"/></svg>
      </button>

      <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 8, zIndex: 2 }}>
        {flagshipSlides.map((slide, i) => (
          <button
            key={slide.key}
            type="button"
            aria-label={`第 ${i + 1} 帧：${slide.title}`}
            onClick={() => go(i)}
            style={{
              width: i === index ? 22 : 8, height: 8, borderRadius: 999, border: "none", cursor: "pointer",
              background: i === index ? slide.accent : "rgba(255,255,255,0.25)",
              transition: "all 300ms ease", padding: 0,
            }}
          />
        ))}
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [catalogLive, setCatalogLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      try {
        const res = await fetchAPI("/api/models");
        if (!cancelled && res.success) { setModels(res.data || []); setCatalogLive(true); }
      } catch {
        if (!cancelled) { setModels([]); setCatalogLive(false); }
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
  const modelCount = models.length || 95;

  return (
    <>
    <main id="main-content" className="nf-site">
      <nav className="nf-nav">
        <Link href="/" className="nf-brand" aria-label="NexusFlow home">
          <NexusflowLogo size={15} color="var(--text-primary)" />
        </Link>
        <div className="nf-nav-links">
          <Link href="/models">Models</Link>
          <Link href="/playground">Playground</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/pricing">Pricing</Link>
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
          <Link href="/models/claude-sonnet-5" style={{
            display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14,
            padding: "6px 14px", borderRadius: 999, textDecoration: "none",
            background: "linear-gradient(135deg, rgba(251,146,60,0.16), rgba(194,65,12,0.1))",
            border: "1px solid rgba(251,146,60,0.38)", fontSize: 12.5, fontWeight: 600,
            color: "var(--text-primary)",
          }}>
            <span style={{
              padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 800,
              letterSpacing: "0.08em", background: "#c2410c", color: "#fff",
            }}>NEW</span>
            GPT-6 Astra is live — 1.05M context · Azure AI Foundry
            <span aria-hidden style={{ fontWeight: 700 }}>→</span>
          </Link>
          <div className="nf-eyebrow">One API, every leading AI model</div>
          <h1>NexusFlow</h1>
          <p className="nf-hero-lead">
            Between question and answer, there is always a path. NexusFlow turns that uncertainty into one deliberate API for text, vision, image and video intelligence.
          </p>
          <div className="nf-hero-actions">
            <Link href={user ? "/dashboard" : "/login?tab=register"} className="nf-btn nf-btn-primary nf-btn-lg">
              {user ? "Open Console" : "Start building"}
            </Link>
            <Link href="/docs/quickstart" className="nf-btn nf-btn-secondary nf-btn-lg">
              Read quickstart
            </Link>
          </div>
          <div className="nf-hero-metrics">
            <div><strong>{modelCount}+</strong><span>model options</span></div>
            <div><strong>1M</strong><span>Claude Sonnet 5 context</span></div>
            <div><strong>128K</strong><span>Claude Sonnet 5 max output</span></div>
          </div>
        </div>

        <div className="nf-cylinder-shell" aria-label="Unified model gateway">
          <CylinderCarousel items={carouselModels} />
        </div>
      </section>

      <FlagshipCarousel />


      <section className="nf-section nf-section-tight">
        <div className="nf-section-head">
          <span>Model access</span>
          <h2>Every request begins as a choice</h2>
          <p>Route requests across chat, reasoning, long-context, image and video models without multiplying accounts, keys and invoices. {catalogLive ? "The catalog below is loaded from the live model API." : "Live catalog data is temporarily unavailable; the preview below is clearly marked fallback content."}</p>
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
          {user ? "Create API key" : "Start building"}
        </Link>
      </section>
    </main>
    <Footer />
    </>
  );
}
