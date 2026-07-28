"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UserLayout from "@/components/UserLayout";
import { authHeaders } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";

interface DemoOverview {
  isDemoData: true;
  label: string;
  generatedAt: string;
  metrics: Array<{
    label: string;
    value: string;
    change: string;
    tone: "teal" | "blue" | "purple" | "amber";
  }>;
  traffic: Array<{ time: string; requests: number; tokens: number }>;
  models: Array<{
    model: string;
    requests: number;
    tokens: string;
    successRate: string;
    avgLatency: string;
  }>;
  users: Array<{
    account: string;
    plan: string;
    requests: number;
    status: "正常" | "观察";
  }>;
  events: Array<{
    time: string;
    type: string;
    message: string;
    status: "正常" | "提示";
  }>;
}

function formatRequests(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export default function DemoAdminPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<DemoOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetchAPI("/api/demo-admin/overview", {
          headers: authHeaders(),
          signal: controller.signal,
        });

        if (res.status === 401) {
          router.replace("/login?returnTo=/demo-admin");
          return;
        }
        if (!res.success || !res.data?.isDemoData) {
          setError(res.message || "当前账号未开通演示后台");
          return;
        }
        setOverview(res.data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("演示后台暂时无法加载，请稍后重试");
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [router]);

  const maxTraffic = useMemo(
    () => Math.max(...(overview?.traffic.map((point) => point.requests) || [1])),
    [overview]
  );

  return (
    <UserLayout wide>
      <div className="demo-admin-page">
        <header className="demo-admin-hero">
          <div>
            <div className="demo-admin-kicker">Operations preview</div>
            <h1>演示运营后台</h1>
            <p>用于产品体验与流程演示。这里的用户、费用、流量和日志均为合成数据。</p>
          </div>
          <div className="demo-admin-badge">
            <span />
            {overview?.label || "演示数据"}
          </div>
        </header>

        {loading && <div className="demo-admin-state">正在加载演示数据…</div>}
        {error && (
          <div className="demo-admin-state error">
            <strong>无法访问</strong>
            <span>{error}</span>
          </div>
        )}

        {overview && (
          <>
            <section className="demo-admin-metrics" aria-label="演示指标">
              {overview.metrics.map((metric) => (
                <article key={metric.label} className={`demo-admin-metric tone-${metric.tone}`}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.change} 较昨日</small>
                </article>
              ))}
            </section>

            <section className="demo-admin-grid">
              <article className="demo-admin-panel demo-admin-traffic">
                <div className="demo-admin-panel-title">
                  <div>
                    <span>流量趋势</span>
                    <small>合成请求量 · 4 小时间隔</small>
                  </div>
                  <b>24H</b>
                </div>
                <div className="demo-admin-bars">
                  {overview.traffic.map((point) => (
                    <div key={point.time} className="demo-admin-bar-column">
                      <div className="demo-admin-bar-track">
                        <div
                          className="demo-admin-bar"
                          style={{ height: `${Math.max(12, (point.requests / maxTraffic) * 100)}%` }}
                          title={`${formatRequests(point.requests)} 次请求`}
                        />
                      </div>
                      <span>{point.time}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="demo-admin-panel">
                <div className="demo-admin-panel-title">
                  <div>
                    <span>模拟事件</span>
                    <small>不连接生产告警系统</small>
                  </div>
                </div>
                <div className="demo-admin-events">
                  {overview.events.map((event) => (
                    <div key={`${event.time}-${event.message}`} className="demo-admin-event">
                      <time>{event.time}</time>
                      <div>
                        <strong>{event.type}</strong>
                        <span>{event.message}</span>
                      </div>
                      <em className={event.status === "正常" ? "ok" : "notice"}>{event.status}</em>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="demo-admin-grid lower">
              <article className="demo-admin-panel">
                <div className="demo-admin-panel-title">
                  <div>
                    <span>模型用量</span>
                    <small>示例模型分布</small>
                  </div>
                </div>
                <div className="demo-admin-table-wrap">
                  <table className="demo-admin-table">
                    <thead>
                      <tr>
                        <th>模型</th>
                        <th>请求</th>
                        <th>Tokens</th>
                        <th>成功率</th>
                        <th>平均延迟</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.models.map((model) => (
                        <tr key={model.model}>
                          <td><code>{model.model}</code></td>
                          <td>{formatRequests(model.requests)}</td>
                          <td>{model.tokens}</td>
                          <td>{model.successRate}</td>
                          <td>{model.avgLatency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="demo-admin-panel">
                <div className="demo-admin-panel-title">
                  <div>
                    <span>示例客户</span>
                    <small>全部使用保留的 .invalid 域名</small>
                  </div>
                </div>
                <div className="demo-admin-users">
                  {overview.users.map((user) => (
                    <div key={user.account} className="demo-admin-user">
                      <span className="demo-admin-avatar">{user.account.slice(5, 7).toUpperCase()}</span>
                      <div>
                        <strong>{user.account}</strong>
                        <small>{user.plan} · {formatRequests(user.requests)} 次请求</small>
                      </div>
                      <em className={user.status === "正常" ? "ok" : "notice"}>{user.status}</em>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <footer className="demo-admin-footer">
              数据生成时间：{new Date(overview.generatedAt).toLocaleString("zh-CN")}
              <span>·</span>
              不支持真实查询、导出或修改
            </footer>
          </>
        )}
      </div>
    </UserLayout>
  );
}
