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
  { value: 15, suffix: "s", label: "最长时长" },
  { value: 1080, suffix: "p", label: "最高分辨率" },
  { value: 3, suffix: " 种", label: "画面比例" },
  { value: 0, suffix: "¥0.9起", label: "每秒价格" },
];

const capabilities = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    title: "文本生成视频",
    desc: "用自然语言描述任何场景——电影级运镜、动态镜头推拉、氛围光影——即可在数秒内获得高质量视频片段。支持复杂叙事场景，从一句话到一段完整的视觉故事。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    title: "图片生成视频",
    desc: "让任何静态图片活起来。上传参考图片，HappyHorse 会赋予它自然的运动轨迹、符合物理规律的动态效果以及场景一致的光影变化。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    title: "视频编辑",
    desc: "通过文字指令修改已有视频——更换背景、调整光线、添加或移除元素，同时保持画面时序连贯性。让后期编辑变得像写句话一样简单。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    title: "精细化控制",
    desc: "自定义时长（5-15 秒）、分辨率（720p/1080p）、画面比例、反向提示词与种子值，实现可复现的确定性输出，满足专业级创作需求。",
  },
];

const techHighlights = [
  {
    title: "物理感知运动引擎",
    desc: "HappyHorse 内置深度物理模拟能力，生成的视频中物体运动轨迹、碰撞反弹、流体飘动等均符合真实世界的物理规律，告别 AI 味生硬感。",
  },
  {
    title: "电影级画面质感",
    desc: "采用业界领先的高保真渲染管线，支持浅景深、体积光、动态模糊等专业级视觉效果，输出画面可直接用于影视后期和商业宣传。",
  },
  {
    title: "超强时序一致性",
    desc: "突破传统视频生成模型的帧间闪烁难题，HappyHorse 在时间维度上保持极高连贯性，面部、纹理、光影在整段视频中自然过渡。",
  },
  {
    title: "语义理解深度",
    desc: "精准解析复杂的多层次文本描述，包括场景构图、镜头运动、情绪氛围和光线风格，做到所写即所见的高度对齐。",
  },
];

const benchmarks = [
  { metric: "视频综合质量（VBench）", score: "#1", note: "VBench 综合评分排名第一" },
  { metric: "运动连贯性", score: "96.2", note: "业界领先的时序一致性表现" },
  { metric: "文本对齐度", score: "94.8", note: "提示词到画面的精准映射" },
  { metric: "物理真实感", score: "93.1", note: "自然运动轨迹与光影效果" },
];

const useCases = [
  { title: "短视频 & 社交媒体", desc: "秒级生成高质量短视频内容，适配抖音、小红书、微信视频号等多平台比例，大幅降低内容创作门槛。" },
  { title: "电商产品展示", desc: "将静态产品图一键转化为动态展示视频，自动生成旋转、特写、场景切换等电商常用运镜。" },
  { title: "影视预览 & 分镜", desc: "导演和编剧可以用文字快速生成分镜预览视频，在正式拍摄前低成本验证创意方案。" },
  { title: "教育 & 培训", desc: "将抽象概念可视化，自动生成教学动画、流程演示和科普内容，让知识传达更生动直观。" },
  { title: "游戏 & 动画", desc: "快速原型化游戏过场动画和角色动态，辅助概念设计和动画预演，加速创意迭代。" },
  { title: "广告 & 营销", desc: "批量生成多版本广告素材，A/B 测试不同视觉风格和叙事方式，用数据驱动创意优化。" },
];

const publicUpdates = [
  {
    date: "2026-04-10",
    title: "阿里巴巴确认 HappyHorse 归属",
    desc: "财新报道，阿里巴巴已确认旗下团队为 HappyHorse 背后的开发者。模型目前处于内测阶段，API 将逐步开放。",
    href: "https://www.caixinglobal.com/2026-04-10/alibaba-unveils-happyhorse-after-ai-model-tops-video-rankings-under-alias-102432775.html",
    source: "财新全球",
  },
  {
    date: "2026-03-23",
    title: "阿里云公布视频生成能力范围",
    desc: "官方文档列出文生视频、图生视频、参考图视频与视频编辑等完整生成路径，可作为平台接入参考。",
    href: "https://www.alibabacloud.com/help/en/model-studio/use-video-generation",
    source: "阿里云文档",
  },
];

const pricing = [
  { tier: "720p", price: "¥0.9", unit: "/秒" },
  { tier: "1080p", price: "¥1.6", unit: "/秒" },
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
              AI 视频生成
            </span>
            <span style={{
              padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)",
            }}>
              VBench 全球第一
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
            阿里巴巴旗下顶尖 AI 视频生成模型。VBench 综合评分全球第一，具备电影级画面质感、物理感知的运动能力和精细化创作控制。
          </p>
          <p style={{
            fontSize: 14, lineHeight: 1.7, margin: "0 0 28px",
            color: "rgba(148,163,184,0.7)", maxWidth: 600,
          }}>
            从文本描述到高品质视频，从静态图片到动态影像——重新定义 AI 视频创作的可能性。
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
              在 Playground 体验
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/models" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "12px 24px", borderRadius: 12,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              color: "#e2e8f0", fontSize: 14, fontWeight: 500, textDecoration: "none",
              transition: "all 0.2s",
            }}>
              查看所有模型
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ 核心数据 ═══ */}
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

      {/* ═══ 模型能力 ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>模型能力</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>HappyHorse 支持多种视频生成与编辑方式，覆盖从创意到成片的完整流程。</p>
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

      {/* ═══ 技术亮点 ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>技术亮点</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>HappyHorse 在视频生成核心技术上的突破与创新。</p>
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

      {/* ═══ 评测数据 ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>评测表现</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>在业界权威视频生成评测基准上的成绩。</p>
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

      {/* ═══ 应用场景 ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>应用场景</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>HappyHorse 正在改变这些领域的内容创作方式。</p>
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

      {/* ═══ 定价 ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>模型定价</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>按生成视频时长计费，无隐藏费用。</p>
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

      {/* ═══ 公开动态 ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>最新动态</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>HappyHorse 相关的公开资讯与进展。</p>
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

      {/* ═══ 相关链接 ═══ */}
      <section>
        <div className="grid-3-responsive" style={{ display: "grid", gap: 14 }}>
          {[
            { href: "/docs/api/videos", label: "视频接入文档", desc: "查看统一视频任务接入方式" },
            { href: "/docs/api/tasks", label: "异步任务 API", desc: "任务提交与状态轮询指南" },
            { href: "/playground", label: "在线体验", desc: "在 Playground 中试用 HappyHorse" },
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
                查看详情
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
