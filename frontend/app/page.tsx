"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useEffect, useRef, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { formatContextLength, formatModelPrice, getRecommendedModels, ModelSummary } from "@/lib/models";
import Footer from "@/components/Footer";
import "./home.css";
import Header from "@/components/Header";
import BaseUrlDiff from "@/components/BaseUrlDiff";

const fallbackModelRows = [
  { id: "claude-sonnet-5", model: "Claude Sonnet 5", provider: "Anthropic", context: "1M", price: "输入 ¥13.6 · 输出 ¥68 / M" },
  { id: "qwen3.8-max", model: "Qwen3.8 Max", provider: "通义千问", context: "1M", price: "输入 ¥12 · 输出 ¥36 / M" },
  { id: "deepseek-v4-flash", model: "DeepSeek V4 Flash", provider: "DeepSeek", context: "1M", price: "输入 ¥1 · 输出 ¥2 / M" },
  { id: "kimi-k3", model: "Kimi K3", provider: "月之暗面", context: "1M", price: "输入 ¥20 · 输出 ¥100 / M" },
  { id: "glm-5.3", model: "GLM 5.3", provider: "智谱AI", context: "1M", price: "输入 ¥8 · 输出 ¥28 / M" },
  { id: "seedance-2.0", model: "Seedance 2.0", provider: "火山方舟", context: "视频", price: "¥0.44 / 秒起" },
];

/** Providers on the marquee. `match` is the provider name in the model catalog. */
const providers = [
  { name: "通义千问", match: "通义千问", mark: "通", color: "#615ced" },
  { name: "DeepSeek", match: "DeepSeek", mark: "D", color: "#4d6bfe" },
  { name: "Anthropic", match: "Anthropic", mark: "A", color: "#d97757" },
  { name: "智谱 GLM", match: "智谱AI", mark: "智", color: "#2f54eb" },
  { name: "月之暗面 Kimi", match: "月之暗面", mark: "K", color: "#16181d" },
  { name: "MiniMax", match: "MiniMax", mark: "M", color: "#e5484d" },
  { name: "火山方舟", match: "火山方舟 (Volcengine)", mark: "火", color: "#1664ff" },
  { name: "阿里巴巴", match: "阿里巴巴 (Alibaba)", mark: "阿", color: "#ff6a00" },
  { name: "PixVerse", match: "拍我AI (PixVerse)", mark: "P", color: "#8b5cf6" },
];

function ProviderMarquee({ counts }: { counts: Map<string, number> }) {
  const items = providers.map((item) => ({ ...item, count: counts.get(item.match) || 0 }));
  // Rendered twice so the track can loop seamlessly at -50%.
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <li key={item.name}>
          <span className="nf-mark" style={{ background: item.color }}>{item.mark}</span>
          <strong>{item.name}</strong>
          {item.count > 0 && <em>{item.count} 个模型</em>}
        </li>
      ))}
    </ul>
  );
  return (
    <section className="nf-marquee" aria-label="已接入的模型厂商">
      <div className="nf-marquee-track">{row(false)}{row(true)}</div>
    </section>
  );
}

function brandOf(provider: string) {
  return providers.find((item) => item.match === provider || item.name === provider || provider.includes(item.match) || item.match.includes(provider));
}
const brandColor = (provider: string) => brandOf(provider)?.color || "#6b7280";
const brandMark = (provider: string) => brandOf(provider)?.mark || provider.slice(0, 1);
const displayProvider = (provider: string) => brandOf(provider)?.name || provider;

/** Fade sections up the first time they scroll into view. */
function useReveal() {
  useEffect(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    // Only hide sections once JS is running, so content never depends on it.
    document.documentElement.classList.add("nf-reveal-ready");
    if (!("IntersectionObserver" in window)) { nodes.forEach((n) => n.classList.add("is-in")); return; }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) { entry.target.classList.add("is-in"); observer.unobserve(entry.target); }
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);
}

const fallbackCarouselModels = [
  { name: "Claude Sonnet 5", provider: "Anthropic", ctx: "1M 上下文", price: "输入 ¥13.6 · 输出 ¥68 / M", badge: "主推", tone: "orange" },
  { name: "Qwen3.8 Max", provider: "通义千问", ctx: "1M 上下文", price: "输入 ¥12 · 输出 ¥36 / M", badge: "新上线", tone: "blue" },
  { name: "Kimi K3", provider: "月之暗面", ctx: "1M 上下文", price: "输入 ¥20 · 输出 ¥100 / M", badge: "新上线", tone: "teal" },
  { name: "Qwen3.7 Max", provider: "通义千问", ctx: "1M 上下文", price: "输入 ¥12 · 输出 ¥36 / M", badge: "旗舰", tone: "blue" },
  { name: "Qwen3 Max", provider: "通义千问", ctx: "262K 上下文", price: "输入 ¥2.5 · 输出 ¥10 / M", badge: "稳定", tone: "blue" },
  { name: "Qwen Long", provider: "通义千问", ctx: "10M 上下文", price: "输入 ¥0.5 · 输出 ¥2 / M", badge: "长文本", tone: "teal" },
  { name: "Qwen3.6 Plus", provider: "通义千问", ctx: "1M 上下文", price: "输入 ¥2 · 输出 ¥12 / M", badge: "热门", tone: "blue" },
  { name: "Qwen3.5 Plus", provider: "通义千问", ctx: "1M 上下文", price: "输入 ¥0.8 · 输出 ¥4.8 / M", badge: "均衡", tone: "blue" },
  { name: "Qwen3.5 Flash", provider: "通义千问", ctx: "1M 上下文", price: "输入 ¥0.2 · 输出 ¥2 / M", badge: "高速", tone: "teal" },
  { name: "Qwen3.5 Omni Plus", provider: "通义千问", ctx: "262K 全模态", price: "输入 ¥7 · 输出 ¥40 / M", badge: "全模态", tone: "violet" },
  { name: "Qwen3.5 Omni Flash", provider: "通义千问", ctx: "262K 全模态", price: "输入 ¥2.2 · 输出 ¥13.3 / M", badge: "全模态", tone: "violet" },
  { name: "Qwen3 VL Flash", provider: "通义千问", ctx: "262K 视觉", price: "输入 ¥0.15 · 输出 ¥1.5 / M", badge: "视觉", tone: "violet" },
  { name: "Qwen3 Coder Flash", provider: "通义千问", ctx: "1M 编程", price: "输入 ¥1 · 输出 ¥4 / M", badge: "编程", tone: "slate" },
  { name: "DeepSeek V4 Flash", provider: "DeepSeek", ctx: "1M 上下文", price: "输入 ¥1 · 输出 ¥2 / M", badge: "高速", tone: "red" },
  { name: "DeepSeek V4 Flash 0731", provider: "DeepSeek", ctx: "1M 上下文", price: "输入 ¥1 · 输出 ¥2 / M", badge: "快照", tone: "red" },
  { name: "DeepSeek V4 Pro 0813", provider: "DeepSeek", ctx: "1M 上下文", price: "输入 ¥9 · 输出 ¥27 / M", badge: "快照", tone: "red" },
  { name: "DeepSeek V4 Pro", provider: "DeepSeek", ctx: "1M 上下文", price: "输入 ¥12 · 输出 ¥24 / M", badge: "推理", tone: "red" },
  { name: "DeepSeek V3.2", provider: "DeepSeek", ctx: "131K 上下文", price: "输入 ¥2 · 输出 ¥3 / M", badge: "通用", tone: "red" },
  { name: "GLM 5.3", provider: "智谱AI", ctx: "1M 上下文", price: "输入 ¥8 · 输出 ¥28 / M", badge: "新上线", tone: "violet" },
  { name: "Text Embedding V4", provider: "通义千问", ctx: "8K 向量", price: "输入 ¥0.5 / M", badge: "向量", tone: "slate" },
  { name: "Qwen Image Max", provider: "通义千问", ctx: "图像", price: "按张计费", badge: "图像", tone: "orange" },
  { name: "PixVerse V6", provider: "PixVerse", ctx: "视频生成", price: "¥0.15 / 秒起", badge: "视频", tone: "orange" },
  { name: "HappyHorse 1.0", provider: "通义千问", ctx: "视频生成", price: "¥0.9 / 秒起", badge: "视频", tone: "orange" },
];

type CarouselModel = typeof fallbackCarouselModels[number];

function toneForCategory(category: string): CarouselModel["tone"] {
  if (category.includes("推理") || category.includes("DeepSeek")) return "red";
  if (category.includes("多模态")) return "violet";
  if (category.includes("图像") || category.includes("视频")) return "orange";
  if (category.includes("编程") || category.includes("向量")) return "slate";
  return "blue";
}

/** formatModelPrice is shared with English pages; localise it for the Chinese landing page. */
function chinesePrice(price: string) {
  return price
    .replace(/^In ¥([\d.]+) · Out ¥([\d.]+)\/M$/, "输入 ¥$1 · 输出 ¥$2 / M")
    .replace(/^from ¥([\d.]+)\/s$/, "¥$1 / 秒起")
    .replace(/\/image$/, " / 张")
    .replace(/\/10k chars$/, " / 万字符")
    .replace("Pricing pending", "价格待公布");
}

function modelToCarousel(model: ModelSummary): CarouselModel {
  return {
    name: model.name,
    provider: model.provider,
    ctx: model.pricingType === "per-second" ? "视频生成" : `${formatContextLength(model.contextLength)} 上下文`,
    price: chinesePrice(formatModelPrice(model)),
    badge: model.category.replace("模型", "") || "模型",
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
    primaryBadge: "主推模型",
    secondaryBadge: "首选",
    byline: "Anthropic",
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
    primaryBadge: "旗舰模型",
    secondaryBadge: "最新上线",
    byline: "通义千问",
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
    primaryBadge: "高速模型",
    secondaryBadge: "最新上线",
    byline: "DeepSeek",
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
    primaryBadge: "旗舰模型",
    secondaryBadge: "最新上线",
    byline: "月之暗面",
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
    primaryBadge: "旗舰模型",
    secondaryBadge: "最新上线",
    byline: "智谱AI",
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
    primaryBadge: "视频生成",
    secondaryBadge: "4K HDR",
    byline: "火山方舟",
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
                    letterSpacing: "0.04em",
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
    ? recommended.slice(0, 6).map((model) => ({
        id: model.id,
        model: model.name,
        provider: model.provider,
        context: model.pricingType === "per-second" ? "视频" : formatContextLength(model.contextLength),
        price: chinesePrice(formatModelPrice(model)),
      }))
    : fallbackModelRows;
  const carouselModels = recommended.length > 0
    ? recommended.concat(models.filter((model) => !recommended.some((item) => item.id === model.id)).slice(0, 12)).map(modelToCarousel)
    : fallbackCarouselModels;
  const modelCount = models.length || 90;
  const startHref = user ? "/dashboard" : "/login?tab=register";
  const providerCounts = new Map<string, number>();
  for (const model of models) providerCounts.set(model.provider, (providerCounts.get(model.provider) || 0) + 1);
  useReveal();

  return (
    <>
    <Header />
    <main id="main-content" className="nf-site">
      <section className="nf-hero">
        <div className="nf-hero-copy">
          <div className="nf-eyebrow"><i />统一模型网关 · 按量计费</div>
          <h1>NexusFlow</h1>
          <p className="nf-hero-tagline">一个 Key，调用所有主流模型。</p>
          <p className="nf-hero-lead">
            千问、DeepSeek、Claude、GLM、Kimi、Seedance 等 {modelCount} 个模型，兼容 OpenAI 与 Anthropic 协议。按量计费，一张账单，余额不过期。
          </p>
          <div className="nf-hero-actions">
            <Link href={startHref} className="nf-btn nf-btn-primary nf-btn-lg">{user ? "进入控制台" : "免费开始"}</Link>
            <Link href="/docs/quickstart" className="nf-btn nf-btn-secondary nf-btn-lg">5 分钟快速开始</Link>
          </div>
          <div className="nf-hero-metrics">
            <div><strong>{modelCount}+</strong><span>可调用模型</span></div>
            <div><strong>3</strong><span>种兼容协议</span></div>
            <div><strong>1</strong><span>个 Key，一张账单</span></div>
          </div>
        </div>

        <div className="nf-cylinder-shell" aria-label="可调用的模型">
          <CylinderCarousel items={carouselModels} />
        </div>
      </section>

      <ProviderMarquee counts={providerCounts} />

      <FlagshipCarousel />

      <section className="nf-section" data-reveal>
        <div className="nf-section-head">
          <h2>精选模型</h2>
          <p>{catalogLive ? "价格实时取自模型目录，" : ""}所有模型共用同一个 Key 和余额，按请求单独选择。</p>
        </div>
        <div className="nf-model-table">
          {modelRows.map((row) => (
            <Link className="nf-model-row" key={row.id} href={`/models/${encodeURIComponent(row.id)}`}>
              <strong>{row.model}</strong>
              <span className="nf-model-provider">
                <span className="nf-mark nf-mark-sm" style={{ background: brandColor(row.provider) }}>{brandMark(row.provider)}</span>
                {displayProvider(row.provider)}
              </span>
              <span>{row.context === "视频" ? "视频生成" : `${row.context} 上下文`}</span>
              <span className="nf-model-price">{row.price}</span>
            </Link>
          ))}
        </div>
        <Link href="/models" className="nf-more-link">查看全部 {modelCount} 个模型 →</Link>
      </section>

      <section className="nf-section nf-switch" data-reveal>
        <div className="nf-switch-copy">
          <h2>换一个地址，<br />现有代码直接能用。</h2>
          <p>不用换 SDK，不用改提示词和工具调用。把 base_url 指向 NexusFlow，换上控制台里的 Key，就能在所有模型之间切换。</p>
          <ul>
            <li>OpenAI SDK、LangChain、Dify 等直接兼容</li>
            <li>Anthropic SDK 与 Claude Code 走 /v1/messages</li>
            <li>流式输出、函数调用、上下文缓存全部支持</li>
          </ul>
        </div>
        <BaseUrlDiff />
      </section>

      <section className="nf-section" data-reveal>
        <div className="nf-section-head">
          <h2>为生产环境准备</h2>
          <p>不只是能调通，账、权限和问题排查都替你想好了。</p>
        </div>
        <div className="nf-feature-grid">
          <article className="nf-feature">
            <div className="nf-feature-demo nf-demo-ledger">
              <div><code>glm-5.2</code><span>90,499 tokens · 缓存 81,558</span><b>−¥0.477324</b></div>
              <div><code>qwen3.8-max</code><span>29,630 tokens</span><b>−¥1.178346</b></div>
              <div><code>deepseek-v4-flash</code><span>28,046 tokens · 缓存 21,483</span><b>−¥0.034544</b></div>
            </div>
            <h3>每一笔都算得清</h3>
            <p>按请求实时结算，流水精确到 6 位小数，缓存命中与折扣单独列出，可导出对账。</p>
          </article>
          <article className="nf-feature">
            <div className="nf-feature-demo nf-demo-quota">
              <div><span>研发团队</span><em><i style={{ width: "62%" }} /></em><b>¥620 / ¥1,000</b></div>
              <div><span>CI 测试</span><em><i style={{ width: "18%" }} /></em><b>¥36 / ¥200</b></div>
              <div><span>外包同学</span><em><i style={{ width: "91%" }} className="is-high" /></em><b>¥455 / ¥500</b></div>
            </div>
            <h3>子账号与额度</h3>
            <p>给团队成员和项目分发子账号，按月或累计设消费上限，限定可用模型，钱只在主账号。</p>
          </article>
          <article className="nf-feature">
            <div className="nf-feature-demo nf-demo-log">
              <div><span className="is-ok">200</span><code>req_9c4f…e31a</code><span>首字 312ms</span></div>
              <div><span className="is-ok">200</span><code>req_7b10…a9d2</code><span>首字 288ms</span></div>
              <div><span className="is-err">429</span><code>req_5e2c…04bf</code><span>限流，已重试</span></div>
            </div>
            <h3>每次请求可追溯</h3>
            <p>按 Request ID 查请求与响应，首字延迟、吞吐和错误码一目了然，排查问题不用找上游。</p>
          </article>
          <article className="nf-feature">
            <div className="nf-feature-demo nf-demo-proto">
              <div><b>POST</b><code>/v1/chat/completions</code></div>
              <div><b>POST</b><code>/v1/messages</code></div>
              <div><b>POST</b><code>/v1/responses</code></div>
            </div>
            <h3>三种协议同一个 Key</h3>
            <p>OpenAI、Anthropic、Responses 三套接口并行可用，图像和视频走统一的异步任务接口。</p>
          </article>
        </div>
      </section>

      <section className="nf-final" data-reveal>
        <div>
          <h2>5 分钟，完成第一次调用。</h2>
          <p>注册后创建 Key，复制示例代码就能跑。不用订阅，不设最低充值。</p>
        </div>
        <div className="nf-final-actions">
          <Link href={user ? "/keys" : "/login?tab=register"} className="nf-btn nf-btn-primary nf-btn-lg">{user ? "创建 API Key" : "免费注册"}</Link>
          <Link href="/status" className="nf-final-status"><i />服务状态</Link>
        </div>
      </section>
    </main>
    <Footer />
    </>
  );
}
