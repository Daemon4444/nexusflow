import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "服务状态",
  description: "NexusFlow API、数据库与缓存服务状态。",
  alternates: { canonical: "/status" },
};

interface HealthPayload {
  status?: string;
  dependencies?: { postgres?: string; redis?: string };
  timestamp?: string;
}

interface VersionPayload {
  sha?: string;
  builtAt?: string;
}

async function loadStatus() {
  const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
  try {
    const [healthResponse, versionResponse] = await Promise.all([
      fetch(`${backend}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(5000) }),
      fetch(`${backend}/api/version`, { cache: "no-store", signal: AbortSignal.timeout(5000) }),
    ]);
    if (!healthResponse.ok) throw new Error("health check failed");
    return {
      reachable: true,
      health: await healthResponse.json() as HealthPayload,
      version: versionResponse.ok ? await versionResponse.json() as VersionPayload : null,
    };
  } catch {
    return { reachable: false, health: null, version: null };
  }
}

function stateLabel(ok: boolean) {
  return ok ? "运行正常" : "状态异常";
}

export default async function StatusPage() {
  const result = await loadStatus();
  const apiOk = result.reachable && result.health?.status === "ok";
  const postgresOk = apiOk && result.health?.dependencies?.postgres === "ok";
  const redisOk = apiOk && result.health?.dependencies?.redis === "ok";
  const allOk = apiOk && postgresOk && redisOk;

  const services = [
    { name: "Public API", desc: "模型目录、鉴权与协议入口", ok: apiOk },
    { name: "PostgreSQL", desc: "账户、账本与用量数据", ok: postgresOk },
    { name: "Redis", desc: "会话、限流与共享状态", ok: redisOk },
  ];

  return (
    <div className="nf-site">
      <Header />
      <main id="main-content" className="nf-status-page">
        <section className={`nf-status-hero ${allOk ? "healthy" : "degraded"}`}>
          <span className="nf-status-dot" aria-hidden="true" />
          <div>
            <p>NEXUSFLOW STATUS</p>
            <h1>{allOk ? "所有核心服务运行正常" : "部分服务当前不可用"}</h1>
            <span>{allOk ? "API、账本和共享状态均通过实时健康检查。" : "我们已检测到异常，请稍后重试；已发起的资金记录不会因页面状态丢失。"}</span>
          </div>
        </section>

        <section className="nf-status-list" aria-label="核心服务状态">
          {services.map((service) => (
            <article key={service.name}>
              <div><strong>{service.name}</strong><span>{service.desc}</span></div>
              <em className={service.ok ? "healthy" : "degraded"}><i />{stateLabel(service.ok)}</em>
            </article>
          ))}
        </section>

        <section className="nf-status-meta">
          <div><span>检测时间</span><strong>{result.health?.timestamp ? new Date(result.health.timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "暂不可用"}</strong></div>
          <div><span>当前版本</span><strong>{result.version?.sha ? result.version.sha.slice(0, 12) : "暂不可用"}</strong></div>
          <div><span>发布构建</span><strong>{result.version?.builtAt ? new Date(result.version.builtAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "暂不可用"}</strong></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
