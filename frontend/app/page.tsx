"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useEffect, useState, useRef } from "react";
import HappyHorsePlaque from "@/components/HappyHorsePlaque";

const providers = [
  { name: "Alibaba", model: "HappyHorse \u{1F434}" },
  { name: "Alibaba Cloud", model: "Qwen 3" },
  { name: "DeepSeek", model: "R1" },
  { name: "Zhipu AI", model: "GLM-4" },
  { name: "Moonshot", model: "Kimi" },
  { name: "MiniMax", model: "abab" },
];

const allModels = [
  { name: "HappyHorse 1.0", provider: "Alibaba", ctx: "15s", price: "¥0.12", badge: "Video #1" },
  { name: "Qwen3 Max", provider: "Alibaba", ctx: "262K", price: "¥2.5", badge: "Flagship" },
  { name: "Qwen3.5 Plus", provider: "Alibaba", ctx: "1M", price: "¥0.8", badge: "Popular" },
  { name: "DeepSeek V4 Pro", provider: "DeepSeek", ctx: "131K", price: "¥4.0", badge: "Reasoning" },
  { name: "GLM-4 Plus", provider: "Zhipu AI", ctx: "128K", price: "¥1.5", badge: "Chat" },
  { name: "Qwen3 Coder", provider: "Alibaba", ctx: "64K", price: "¥2.0", badge: "Code" },
  { name: "Kimi k2", provider: "Moonshot", ctx: "128K", price: "¥1.0", badge: "Fast" },
  { name: "Qwen3.5 Flash", provider: "Alibaba", ctx: "1M", price: "¥0.2", badge: "Fast" },
  { name: "Qwen3-Max", provider: "Alibaba", ctx: "262K", price: "¥2.5", badge: "New" },
  { name: "DeepSeek V4 Flash", provider: "DeepSeek", ctx: "131K", price: "¥1.0", badge: "Fast" },
  { name: "MiniMax abab7", provider: "MiniMax", ctx: "245K", price: "¥1.5", badge: "Long" },
  { name: "GLM-4-Flash", provider: "Zhipu AI", ctx: "128K", price: "¥0.0", badge: "Free" },
  { name: "Qwen3-Plus", provider: "Alibaba", ctx: "131K", price: "¥0.8", badge: "Balance" },
  { name: "DeepSeek R1", provider: "DeepSeek", ctx: "64K", price: "¥2.0", badge: "Lite" },
  { name: "Qwen-Turbo", provider: "Alibaba", ctx: "1M", price: "¥0.3", badge: "Turbo" },
  { name: "PixVerse v3.5", provider: "PixVerse", ctx: "-", price: "¥0.4", badge: "Video" },
];

const models = [
  { id: "happyhorse-1.0", name: "HappyHorse 1.0 🐴", provider: "Alibaba", ctx: "15s video", price: "¥0.12/s" },
  { id: "qwen3-max", name: "Qwen3 Max", provider: "Alibaba", ctx: "262K", price: "¥2.5" },
  { id: "qwen3.5-plus", name: "Qwen3.5 Plus", provider: "Alibaba", ctx: "1M", price: "¥0.8" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "DeepSeek", ctx: "131K", price: "¥4.0" },
  { id: "glm-5", name: "GLM 5", provider: "Zhipu AI", ctx: "131K", price: "¥2.0" },
  { id: "qwen3-coder-plus", name: "Qwen3 Coder", provider: "Alibaba", ctx: "1M", price: "¥4.0" },
];

const platformPillars = [
  {
    title: "模型服务",
    desc: "统一接入 Qwen、DeepSeek、GLM、Kimi、MiniMax、HappyHorse 等模型，保留同一套 API Key、账单和观测入口。",
  },
  {
    title: "应用构建",
    desc: "既可以直接用 OpenAI 兼容接口写代码，也可以用 Playground、任务接口和文档快速验证多模型工作流。",
  },
  {
    title: "监控与评测",
    desc: "提供请求监控、TTFT / TPOT、模型维度成功率、近期请求明细，帮助在上线前发现性能风险。",
  },
  {
    title: "计费与限流",
    desc: "按量使用、统一计费、模型级限额、任务状态追踪都放在同一个平台里，减少多供应商对账和风控成本。",
  },
];

const productionCards = [
  {
    title: "统一异步任务",
    desc: "图像和视频通过统一任务链路提交与轮询，适合排队、重试、状态追踪和后台批量处理。",
  },
  {
    title: "速率限制基础",
    desc: "平台内置 RPM / TPM 检查、任务记录和模型级限额页面，便于在业务增长时做请求整形。",
  },
  {
    title: "可观测性",
    desc: "监控页可查看 24 小时请求量、TTFT、TPOT、成功率和模型表现，用于评估高峰期稳定性。",
  },
  {
    title: "多供应商容量基础",
    desc: "后端已具备 provider capacity、健康记录与调度数据结构，适合作为后续弹性扩容和故障切换基础。",
  },
];

const buildModes = [
  { title: "OpenAI-Compatible API", desc: "最快迁移现有应用。替换 base_url、API Key 和 model 即可上线。", href: "/docs/quickstart" },
  { title: "Async Tasks", desc: "图像与视频统一走异步任务，适合高时延模型、批量生成和后台工作流。", href: "/docs/api/tasks" },
  { title: "Monitoring & Limits", desc: "上线后继续看吞吐、错误率、延迟和限流，避免在峰值时才暴露瓶颈。", href: "/docs/api/limits" },
];

function AnimatedCounter({ end, suffix = "", duration = 1500 }: { end: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(end * eased));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);

  return <span ref={ref}>{count}{suffix}</span>;
}

function CylinderCarousel({ items }: { items: typeof allModels }) {
  const [offset, setOffset] = useState(0);
  const animRef = useRef<number>(0);
  const ITEM_COUNT = items.length;
  const ITEM_ANGLE = 360 / ITEM_COUNT;

  useEffect(() => {
    let last = performance.now();
    const speed = 0.01; // degrees per ms
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setOffset(prev => (prev + speed * dt) % 360);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const DEG = Math.PI / 180;
  const RADIUS = 320;
  const TILT_ANGLE = 14 * DEG; // tilt 14 degrees for subtle side view
  const sinTilt = Math.sin(TILT_ANGLE);
  const cosTilt = Math.cos(TILT_ANGLE);

  return (
    <div className="ld-cylinder-wrap">
      <div className="ld-cylinder">
        {items.map((item, i) => {
          const angle = i * ITEM_ANGLE - offset;
          const norm = ((angle % 360) + 540) % 360 - 180;

          const sinA = Math.sin(norm * DEG);
          const cosA = Math.cos(norm * DEG);

          // 3D projection: tilted cylinder viewed from an angle
          const y = sinA * RADIUS;
          const x = -cosA * sinTilt * RADIUS;
          const zFactor = cosA * cosTilt; // -1 (back) to 1 (front)

          // Depth 0..1 (0=back, 1=front)
          const depth = (zFactor + 1) / 2;
          const scale = 0.3 + 0.7 * depth;
          const opacity = 0.08 + 0.92 * depth;
          const blur = depth < 0.22 ? (0.22 - depth) * 12 : 0;

          return (
            <div
              key={i}
              className="ld-cyl-item"
              style={{
                transform: `translate(${x}px, ${y}px) scale(${scale})`,
                opacity,
                zIndex: Math.round(depth * 100),
                filter: blur > 0 ? `blur(${blur}px)` : 'none',
              }}
            >
              <div className="ld-cyl-card">
                <div className="ld-cyl-card-top">
                  <span className="ld-cyl-card-name">{item.name}</span>
                  <span className="ld-cyl-card-badge">{item.badge}</span>
                </div>
                <div className="ld-cyl-card-meta">
                  <span>{item.provider}</span>
                  <span className="ld-cyl-card-ctx">{item.ctx}</span>
                  <span className="ld-cyl-card-price">{item.price}/1M</span>
                </div>
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

  return (
    <div className="ld-root">
      {/* NAV */}
      <nav className="ld-nav">
        <Link href="/" className="ld-logo">nexus<span>flow</span></Link>
        <div className="ld-nav-links">
          <Link href="/models">Models</Link>
          <Link href="/playground">Playground</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/pricing">Pricing</Link>
        </div>
        <div className="ld-nav-right">
          <HappyHorsePlaque />
          {user ? (
            <>
              <Link href="/models" className="ld-btn-p">Dashboard</Link>
            </>
          ) : (
            <>
              <Link href="/login" className="ld-btn-g">Log in</Link>
              <Link href="/login" className="ld-btn-p">Get Started</Link>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section className="ld-hero">
        <div className="ld-hero-left">
          <div className="ld-hero-chip au d1">
            <span className="ld-hero-chip-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </span>
            Unified AI Gateway
          </div>
          <h1 className="au d2">One API.<br /><span className="ld-highlight">Every model.</span></h1>
          <p className="ld-hero-sub au d3">
            Route to Qwen, DeepSeek, GLM, Kimi, MiniMax, HappyHorse and 40+ models through a single endpoint. OpenAI-compatible. Pay only for what you use.
          </p>
          <div className="ld-hero-cta au d4">
            <Link href="/login" className="ld-btn-p lg">Start Building &rarr;</Link>
            <Link href="/docs" className="ld-btn-o">View Documentation</Link>
          </div>
        </div>
        <div className="ld-hero-right au d5">
          <CylinderCarousel items={allModels} />
        </div>
      </section>

      {/* STATS */}
      <div className="ld-stats">
        <div className="ld-st">
          <div className="ld-st-v"><AnimatedCounter end={50} suffix="" /><span className="c">+</span></div>
          <div className="ld-st-l">Models</div>
        </div>
        <div className="ld-st">
          <div className="ld-st-v"><AnimatedCounter end={6} suffix="" /><span className="c">+</span></div>
          <div className="ld-st-l">Providers</div>
        </div>
        <div className="ld-st">
          <div className="ld-st-v">99.9<span className="c">%</span></div>
          <div className="ld-st-l">Uptime</div>
        </div>
        <div className="ld-st">
          <div className="ld-st-v">&lt;200<span className="c">ms</span></div>
          <div className="ld-st-l">Latency</div>
        </div>
      </div>

      <section className="ld-sec" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <div className="ld-sec-head" style={{ marginBottom: 36 }}>
          <div className="ld-sec-badge">Platform Logic</div>
          <h2 className="ld-sec-t">One platform, not just one endpoint</h2>
          <p className="ld-sec-s" style={{ maxWidth: 720 }}>
            nexusflow 不只是模型聚合层，还把模型服务、应用接入、监控与限流、计费和任务链路放到同一套产品结构里。
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
          {platformPillars.map((item) => (
            <div key={item.title} className="card" style={{ padding: 24 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>{item.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PROVIDERS */}
      <section className="ld-prov">
        <div className="ld-prov-label">Powering models from leading providers</div>
        <div className="ld-mq-wrap">
          <div className="ld-mq-track">
            {[...providers, ...providers].map((p, i) => (
              <div key={i} className="ld-prov-tag">
                <span className="pn">{p.name}</span>
                <span className="pdot" />
                <span className="pm">{p.model}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ld-sec" style={{ paddingTop: 96, paddingBottom: 96 }}>
        <div className="ld-sec-head" style={{ marginBottom: 36 }}>
          <div className="ld-sec-badge">Production Ready</div>
          <h2 className="ld-sec-t">Built for bursty traffic and long-running tasks</h2>
          <p className="ld-sec-s" style={{ maxWidth: 760 }}>
            参考 Model Studio 的产品结构，首页把“接得上”和“跑得稳”分开表达。高并发不是一句 SLA，而是限流、队列、异步任务、监控和容量控制的组合。
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
          {productionCards.map((item) => (
            <div key={item.title} className="card-static" style={{ padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{item.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 18, background: "var(--bg-elevated)", padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".12em", color: "#1d4ed8", marginBottom: 12 }}>REQUEST FLOW</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
            {["应用请求进入", "统一限流与鉴权", "模型 / 任务链路执行", "监控与成本回写"].map((step, idx) => (
              <div key={step} style={{ padding: 16, borderRadius: 12, background: "#fff", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#1d4ed8", marginBottom: 6 }}>0{idx + 1}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.5 }}>{step}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="ld-sec">
        <div className="ld-sec-head">
          <div className="ld-sec-badge">How it works</div>
          <h2 className="ld-sec-t">Replace many SDKs with <span className="u">one</span></h2>
          <p className="ld-sec-s">Drop-in replacement for OpenAI SDK. Switch models by changing a single parameter.</p>
        </div>
        <div className="ld-code-area">
          <div className="ld-code-box">
            <div className="ld-code-hdr">
              <div className="ld-cd"><span /><span /><span /></div>
              <span className="ld-cfn">request.sh</span>
            </div>
            <pre className="ld-code-body">
<span className="c">{`# OpenAI-compatible API`}</span>
{`\n`}<span className="k">curl</span>{` `}<span className="s">https://api.nexusflow.hk/v1/chat/completions</span>{` \\
  -H `}<span className="s">{`"Authorization: Bearer `}<span className="v">$API_KEY</span>{`"`}</span>{` \\
  -H `}<span className="s">{`"Content-Type: application/json"`}</span>{` \\
  -d `}<span className="s">{`'{
    "model": "`}<span className="v">qwen3.5-plus</span>{`",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`}</span>
            </pre>
          </div>
          <div className="ld-f-list">
            <div className="ld-f-card">
              <div className="ld-f-ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              </div>
              <div><h4>Instant switching</h4><p>Change models with one parameter. No code refactoring needed.</p></div>
            </div>
            <div className="ld-f-card">
              <div className="ld-f-ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div><h4>Built-in fallback</h4><p>Automatic failover ensures 99.9% availability across endpoints.</p></div>
            </div>
            <div className="ld-f-card">
              <div className="ld-f-ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              </div>
              <div><h4>Real-time analytics</h4><p>Monitor usage, costs, and latency from a single dashboard.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="ld-sec" style={{ paddingTop: 0 }}>
        <div className="ld-sec-head" style={{ marginBottom: 32 }}>
          <div className="ld-sec-badge">Build Modes</div>
          <h2 className="ld-sec-t">Choose the path that matches your workload</h2>
          <p className="ld-sec-s" style={{ maxWidth: 720 }}>
            文本对话、异步视频生成、上线后的监控限流，应该分别走对的入口，而不是全部塞进一个“万能 API”叙事里。
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
          {buildModes.map((item) => (
            <Link key={item.href} href={item.href} className="card" style={{ padding: 24, textDecoration: "none" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{item.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--text-secondary)" }}>{item.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* MODELS TABLE */}
      <section className="ld-sec ld-mod-bg">
        <div className="ld-sec-head">
          <div className="ld-sec-badge">Model catalog</div>
          <h2 className="ld-sec-t">50+ models, <span className="u">one interface</span></h2>
          <p className="ld-sec-s">From flagship reasoning models to fast inference endpoints.</p>
        </div>
        <div className="ld-mod-tbl">
          <div className="ld-mod-h"><span>Model</span><span>Provider</span><span>Context</span><span>Price / 1M tokens</span></div>
          {models.map((m) => (
            <Link href={`/models/${encodeURIComponent(m.id)}`} key={m.id} className="ld-mod-r">
              <span className="ld-mod-n">{m.name}</span>
              <span className="ld-mod-p">{m.provider}</span>
              <span className="ld-mod-c">{m.ctx}</span>
              <span className="ld-mod-pr">{m.price}</span>
            </Link>
          ))}
        </div>
        <div className="ld-mod-link">
          <Link href="/models">
            View all 50+ models
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="ld-final">
        <h2>Ready to <span className="u">build</span>?</h2>
        <p>Get your API key and start integrating in minutes.</p>
        <div className="ld-final-btns">
          <Link href="/login" className="ld-btn-p lg">Get Started Free &rarr;</Link>
          <Link href="/docs" className="ld-btn-g" style={{ fontSize: 16 }}>Read the docs</Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="ld-footer">
        <div className="ld-ft-g">
          <div>
            <Link href="/" className="ld-logo">nexus<span>flow</span></Link>
            <p className="ld-ft-bp">Unified AI model gateway for developers.</p>
          </div>
          <div className="ld-ft-c">
            <h4>Product</h4>
            <Link href="/models">Models</Link>
            <Link href="/playground">Playground</Link>
            <Link href="/docs">Documentation</Link>
            <Link href="/pricing">Pricing</Link>
          </div>
          <div className="ld-ft-c">
            <h4>Platform</h4>
            <Link href="/keys">API Keys</Link>
            <Link href="/activity">Usage</Link>
            <Link href="/docs/api">API Reference</Link>
          </div>
          <div className="ld-ft-c">
            <h4>Company</h4>
            <Link href="/login">Sign in</Link>
            <Link href="/login">Create account</Link>
          </div>
        </div>
        <div className="ld-ft-b">
          <span>&copy; 2026 nexusflow</span>
          <span>v1.0</span>
        </div>
      </footer>
    </div>
  );
}
