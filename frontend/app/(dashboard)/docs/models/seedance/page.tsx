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
  { value: 4, suffix: "K", label: "最高分辨率 HDR 10bit" },
  { value: 15, suffix: "s", label: "最长时长" },
  { value: 9, suffix: "+", label: "参考图输入" },
  { value: 0, suffix: "Token", label: "按火山 token 用量计费" },
];

const capabilities = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    title: "多模态参考生视频",
    desc: "Seedance 2.0 独有能力。输入 0-9 张参考图 + 0-3 段参考视频 + 0-3 段参考音频 + 文本提示词（可选），生成 1 个目标视频。可生成全新视频、编辑视频、延长视频，实现跨模态创意融合。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    title: "首尾帧图生视频",
    desc: "指定首帧图片 + 尾帧图片 + 文本提示词（可选），模型智能生成两帧之间的过渡视频。精准控制起止画面，适合分镜衔接与叙事推进。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
      </svg>
    ),
    title: "有声视频自动生成",
    desc: "模型基于文本提示词与视觉内容，自动生成与之匹配的人声、音效及背景音乐。对话部分置于双引号内可优化音频对齐效果。有声视频均为单声道输出。",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    title: "4K HDR 10bit 输出",
    desc: "Seedance 2.0 独有。4K 视频采用 10bit 位深编码与 H.265 编码，完整保留色彩层次与平滑渐变，满足专业影视制作与 HDR 视频内容要求。",
  },
];

const techHighlights = [
  {
    title: "多模态融合引擎",
    desc: "业界领先的跨模态注意力机制，将图像、视频、音频、文本多源信号统一编码对齐，可在一次生成中融合多源创意素材，产出语境连贯的成片。",
  },
  {
    title: "电影级画质",
    desc: "采用高保真渲染管线，支持浅景深、体积光、动态模糊等专业视觉效果，画面质感可直接用于影视后期与商业宣传。",
  },
  {
    title: "超强时序一致性",
    desc: "突破传统视频生成模型的帧间闪烁难题，在时间维度上保持极高连贯性，面部、纹理、光影在整段视频中自然过渡。",
  },
  {
    title: "智能宽高比 adaptive",
    desc: "Seedance 2.0 / 1.5 Pro 支持 adaptive 模式，模型根据提示词意图与首帧画面智能选择最合适的宽高比，无需手动调参。",
  },
];

const modelVariants = [
  {
    name: "Seedance 2.0 旗舰版",
    id: "seedance-2.0",
    tag: "旗舰",
    tagColor: "#6d28d9",
    tagBg: "#ede9fe",
    desc: "Seedance 系列最厉害的模型。多模态参考生视频、4K HDR 10bit、有声视频、首尾帧、21:9 等全比例支持。时长 4-15 秒。",
    features: ["多模态参考", "4K HDR", "有声视频", "首尾帧", "全比例"],
    price: "¥0.44 / 秒起",
    featured: true,
  },
  {
    name: "Seedance 2.0 Fast",
    id: "seedance-2.0-fast",
    tag: "快速",
    tagColor: "#1d4ed8",
    tagBg: "#dbeafe",
    desc: "与 2.0 同代画质，生成速度更快、性价比更高。720P/480P 输出，4-15 秒时长，适合对延迟敏感的批量场景。",
    features: ["多模态参考", "有声视频", "720P", "高性价比"],
    price: "¥0.36 / 秒起",
    featured: false,
  },
  {
    name: "Seedance 2.0 Mini",
    id: "seedance-2.0-mini",
    tag: "轻量",
    tagColor: "#0891b2",
    tagBg: "#cffafe",
    desc: "Seedance 2.0 系列的轻量版本，体积更小、速度最快、价格最低。720P/480P 输出（不支持 1080P/4K），时长 4-15 秒。继承多模态参考与有声视频能力，适合大规模批量调用与成本敏感场景。",
    features: ["多模态参考", "有声视频", "720P", "最低价"],
    price: "¥0.22 / 秒起",
    featured: false,
  },
  {
    name: "Seedance 1.5 Pro",
    id: "seedance-1.5-pro",
    tag: "均衡",
    tagColor: "#059669",
    tagBg: "#d1fae5",
    desc: "支持样片模式（draft）快速验证创意、adaptive 智能宽高比、有声视频。4-12 秒时长，创意探索与批量生成首选。",
    features: ["样片模式", "adaptive", "有声视频", "首尾帧"],
    price: "¥0.17 / 秒起",
    featured: false,
  },
  {
    name: "Seedance 1.0 Pro",
    id: "seedance-1.0-pro",
    tag: "标准",
    tagColor: "#4b5563",
    tagBg: "#e5e7eb",
    desc: "Seedance 1.0 Pro 标准版本，1080P 默认输出。支持文生视频与图生视频（首帧/首尾帧），时长 2-12 秒。画质稳定，适合标准生产场景与批量生成。",
    features: ["1080P", "首尾帧", "稳定画质", "标准生产"],
    price: "¥0.14 / 秒起",
    featured: false,
  },
  {
    name: "Seedance 1.0 Pro Fast",
    id: "seedance-1.0-pro-fast",
    tag: "极速",
    tagColor: "#ea580c",
    tagBg: "#fed7aa",
    desc: "1080P 默认输出，生成速度极快。支持文生视频与图生视频（首帧），2-12 秒时长，适合快速迭代与原型验证。",
    features: ["1080P", "极速生成", "文生视频", "首帧驱动"],
    price: "¥0.04 / 秒起",
    featured: false,
  },
];

const useCases = [
  { title: "影视预览 & 分镜", desc: "导演与编剧用文字快速生成分镜预览视频，多模态参考让角色、场景、镜头风格一次到位。" },
  { title: "广告 & 营销", desc: "批量生成多版本广告素材，A/B 测试不同视觉风格和叙事方式，4K HDR 输出直接用于商业投放。" },
  { title: "短视频 & 社交媒体", desc: "秒级生成高质量短视频内容，适配抖音、小红书、视频号等多平台比例，大幅降低内容创作门槛。" },
  { title: "电商产品展示", desc: "静态产品图一键转化为动态展示视频，自动生成旋转、特写、场景切换等电商常用运镜。" },
  { title: "游戏 & 动画", desc: "快速原型化游戏过场动画与角色动态，多模态参考让 IP 风格延续一致，加速创意迭代。" },
  { title: "教育 & 培训", desc: "将抽象概念可视化，自动生成教学动画、流程演示和科普内容，让知识传达更生动直观。" },
];

// Seedance 2.0 旗舰版价格：火山按 token 计费（音画同生内置，有声/无声同价），
// 下为按 16:9 @24fps 换算的每秒价（token 用量=宽×高×帧率×时长/1024）。
const pricing = [
  { tier: "480P", price: "¥0.44", unit: "/秒", featured: false },
  { tier: "720P", price: "¥0.99", unit: "/秒", featured: false },
  { tier: "1080P", price: "¥2.48", unit: "/秒", featured: true },
  { tier: "4K HDR", price: "¥5.05", unit: "/秒", featured: false },
];

const apiExample = `# 步骤1：创建 Seedance 文生视频任务
curl -X POST 'https://nexusflow.hk/v1/tasks' \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0",
    "prompt": "黄昏城市海岸线，镜头缓慢推进，电影感自然光，细腻真实风格",
    "resolution": "1080p",
    "ratio": "16:9",
    "duration": 10,
    "generate_audio": true
  }'

# 返回 → { "id": "task_abc123...", "status": "running", ... }

# 步骤2：轮询查询结果（建议间隔 10-15 秒）
curl https://nexusflow.hk/v1/tasks/task_abc123 \\
  -H "Authorization: Bearer $API_KEY"

# 返回 → { "status": "succeeded", "output": { "video_url": "https://..." }, ... }`;

export default function SeedanceModelPage() {
  return (
    <div className="sd-page" style={{ padding: "0 48px 64px", maxWidth: 1080, margin: "0 auto" }}>

      {/* ═══ HERO ═══ */}
      <section style={{
        position: "relative",
        padding: "64px 48px 56px",
        borderRadius: 24,
        overflow: "hidden",
        marginBottom: 32,
        background: "linear-gradient(135deg, #0a0e1a 0%, #1e1b4b 40%, #312e81 100%)",
        border: "1px solid rgba(129,140,248,0.18)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
        <div style={{
          position: "absolute", top: "-30%", right: "-10%", width: 480, height: 480,
          borderRadius: "50%", background: "radial-gradient(circle, rgba(167,139,250,0.2), transparent 70%)",
          filter: "blur(70px)", animation: "glow-drift 18s ease-in-out infinite alternate",
        }} />
        <div style={{
          position: "absolute", bottom: "-25%", left: "5%", width: 360, height: 360,
          borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.16), transparent 70%)",
          filter: "blur(60px)", animation: "glow-drift 22s ease-in-out infinite alternate-reverse",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
            <span style={{
              padding: "5px 14px", borderRadius: 999, fontSize: 11, fontWeight: 800,
              letterSpacing: "0.14em", textTransform: "uppercase",
              background: "linear-gradient(135deg, rgba(167,139,250,0.28), rgba(129,140,248,0.22))",
              color: "#c7d2fe", border: "1px solid rgba(167,139,250,0.3)",
            }}>
              旗舰视频生成
            </span>
            <span style={{
              padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: "rgba(250,204,21,0.14)", color: "#fde68a", border: "1px solid rgba(250,204,21,0.28)",
            }}>
              Seedance 系列最强
            </span>
            <span style={{ fontSize: 12, color: "rgba(226,232,240,0.55)" }}>by 火山方舟 Volcengine</span>
          </div>

          <h1 style={{
            fontSize: "clamp(40px, 5.5vw, 60px)", lineHeight: 1.05, fontWeight: 800,
            letterSpacing: "-0.04em", margin: "0 0 18px",
            background: "linear-gradient(135deg, #f8fafc 0%, #c7d2fe 50%, #a78bfa 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            Seedance
          </h1>
          <p style={{
            fontSize: 18, lineHeight: 1.75, margin: "0 0 12px",
            color: "rgba(226,232,240,0.85)", maxWidth: 660,
          }}>
            火山引擎豆包 Seedance 系列旗舰视频生成模型。系列最厉害的 Seedance 2.0 支持多模态参考生视频、4K HDR 10bit 输出、有声视频自动生成与首尾帧控制，业界顶尖水平。
          </p>
          <p style={{
            fontSize: 14, lineHeight: 1.7, margin: "0 0 32px",
            color: "rgba(148,163,184,0.72)", maxWidth: 620,
          }}>
            从文本到电影级视频，从静态图片到动态影像，从多模态素材到融合成片——重新定义 AI 视频创作的可能性。
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/playground" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "13px 30px", borderRadius: 12,
              background: "linear-gradient(135deg, #818cf8, #6366f1)",
              color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none",
              boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
              transition: "all 0.2s",
            }}>
              在 Playground 体验
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/docs/api/seedance" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "13px 26px", borderRadius: 12,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
              color: "#e2e8f0", fontSize: 14, fontWeight: 500, textDecoration: "none",
              transition: "all 0.2s",
            }}>
              查看 API 文档
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ 核心数据 ═══ */}
      <section style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 44,
      }}>
        {highlights.map((h) => (
          <div key={h.label} style={{
            textAlign: "center", padding: "24px 12px", borderRadius: 16,
            border: "1px solid var(--border)", background: "var(--bg)",
            transition: "all 0.2s",
          }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-1px", marginBottom: 4 }}>
              {h.value >= 1
                ? <Counter end={h.value} suffix={h.suffix} />
                : <span style={{ color: "#7c3aed" }}>{h.suffix}</span>
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
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Seedance 支持多种视频生成与编辑方式，覆盖从创意到成片的完整流程。</p>
        <div className="grid-2-responsive" style={{ display: "grid", gap: 14 }}>
          {capabilities.map((c) => (
            <div key={c.title} style={{
              padding: 22, borderRadius: 16,
              border: "1px solid var(--border)", background: "var(--bg)",
              transition: "all 0.2s",
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12, marginBottom: 14,
                background: "linear-gradient(135deg, #ede9fe, #e0e7ff)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#6d28d9",
              }}>
                {c.icon}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 系列变体 ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Seedance 系列模型</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>6 个版本覆盖从旗舰到极速、从轻量到标准的全场景需求。Seedance 2.0 旗舰版为系列最厉害的模型。</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {modelVariants.map((m) => (
            <div key={m.id} style={{
              padding: 24, borderRadius: 18,
              border: m.featured ? "1.5px solid #7c3aed" : "1px solid var(--border)",
              background: m.featured ? "linear-gradient(180deg, #faf5ff 0%, var(--bg) 100%)" : "var(--bg)",
              position: "relative",
              transition: "all 0.2s",
            }}>
              {m.featured && (
                <div style={{
                  position: "absolute", top: -10, left: 22,
                  padding: "3px 12px", borderRadius: 999,
                  background: "linear-gradient(135deg, #818cf8, #6366f1)",
                  color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                }}>
                  旗舰推荐
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>{m.name}</div>
                <span style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: m.tagBg, color: m.tagColor,
                }}>
                  {m.tag}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: 12 }}>
                ID: {m.id}
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)", margin: "0 0 14px" }}>
                {m.desc}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {m.features.map((f) => (
                  <span key={f} style={{
                    padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                    background: "var(--bg-elevated)", color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}>
                    {f}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#7c3aed", letterSpacing: "-0.5px" }}>{m.price.split(" ")[0]}</span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{m.price.split(" ").slice(1).join(" ")}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 技术亮点 ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>技术亮点</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Seedance 在视频生成核心技术上的突破与创新。</p>
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

      {/* ═══ 应用场景 ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>应用场景</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Seedance 正在改变这些领域的内容创作方式。</p>
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
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Seedance 2.0 旗舰版定价</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 8px" }}>火山方舟按 token 用量计费：<code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>token = 宽 × 高 × 帧率 × 时长 ÷ 1024</code>。2.0 系列音画同生内置，有声/无声同价，仅分辨率影响单价。下表为 16:9 @24fps 换算的每秒价。其他版本价格见模型列表。</p>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 20px", opacity: 0.8 }}>火山 token 单价（在线推理）：480/720P 46、1080P 51、4K 26 元/百万token；含输入视频时更低。仅对成功生成的视频计费。</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {pricing.map((p) => (
            <div key={p.tier} style={{
              padding: "22px 16px", borderRadius: 16,
              border: p.featured ? "1.5px solid #7c3aed" : "1px solid var(--border)",
              background: p.featured ? "linear-gradient(180deg, #faf5ff 0%, var(--bg) 100%)" : "var(--bg)",
              textAlign: "center",
            }}>
              <div style={{
                display: "inline-block", padding: "3px 12px", borderRadius: 6,
                fontSize: 11, fontWeight: 700, marginBottom: 12,
                background: p.featured ? "#ede9fe" : "var(--bg-elevated)",
                color: p.featured ? "#6d28d9" : "var(--text-secondary)",
                border: `1px solid ${p.featured ? "#c4b5fd" : "var(--border)"}`,
              }}>
                {p.tier}
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-1px" }}>
                {p.price}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{p.unit}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ API 示例 ═══ */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>快速接入</h2>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "0 0 20px" }}>通过 nexusflow 统一 /v1/tasks 异步任务接口接入，与现有 wan2.6、happyhorse、pixverse 等视频模型同协议。</p>
        <div style={{
          background: "#1a1a1a", borderRadius: 12, padding: 24, overflow: "auto",
        }}>
          <pre style={{
            margin: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5,
            color: "#e2e8f0", lineHeight: 1.65, whiteSpace: "pre",
          }}>{apiExample}</pre>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12 }}>
          使用标准 HTTP 调用，只需 Bearer API Key 即可接入。
          <Link href="/docs/api/seedance" style={{ color: "#7c3aed", marginLeft: 8 }}>
            查看完整 API 文档 →
          </Link>
        </p>
      </section>

      {/* ═══ 相关链接 ═══ */}
      <section>
        <div className="grid-3-responsive" style={{ display: "grid", gap: 14 }}>
          {[
            { href: "/docs/api/seedance", label: "Seedance API 文档", desc: "查看完整请求参数与多模态参考生视频示例" },
            { href: "/docs/api/videos", label: "视频接入文档", desc: "查看统一视频任务接入方式" },
            { href: "/docs/api/tasks", label: "异步任务 API", desc: "任务提交与状态轮询指南" },
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
              <div style={{ marginTop: 10, fontSize: 12, color: "#7c3aed", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
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
