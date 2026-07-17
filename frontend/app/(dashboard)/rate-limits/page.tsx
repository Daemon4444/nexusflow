"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { authHeaders, useAuth } from "@/lib/auth";
import UserLayout from "@/components/UserLayout";
import { useI18n } from "@/lib/i18n";

interface RateLimitsData {
  defaultQpm: number;
  defaultTpm: number;
  systemDefaultQpm?: number;
  systemDefaultTpm?: number;
  hasUserDefault?: boolean;
  customLimits: {
    id: string;
    user_id: string;
    model: string;
    qpm: number;
    tpm: number;
    source: string;
    created_at: string;
    updated_at: string;
  }[];
  requests?: {
    id: string;
    user_id: string;
    model: string;
    requested_qpm: number;
    requested_tpm: number;
    reason: string;
    status: string;
    admin_reply: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
  }[];
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  category: string;
}

export default function RateLimitsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [data, setData] = useState<RateLimitsData | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("*");
  const [requestedQpm, setRequestedQpm] = useState("");
  const [requestedTpm, setRequestedTpm] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modelSearch, setModelSearch] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);

  async function load(signal?: AbortSignal) {
    try {
      const [res, modelsRes] = await Promise.all([
        fetchAPI("/api/rate-limits", { headers: authHeaders(), signal }),
        fetchAPI("/api/models", { signal }),
      ]);
      if (res.success) setData(res.data);
      if (modelsRes.success) {
        setModels(((modelsRes.data || []) as ModelOption[]).map((item) => ({
          id: item.id,
          name: item.name,
          provider: item.provider,
          category: item.category,
        })));
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Failed to load rate limits");
    } finally {
      setLoading(false);
    }
  }

  async function submitRequest() {
    setSubmitting(true);
    try {
      const res = await fetchAPI("/api/rate-limits/request", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          model,
          requestedQpm: Number(requestedQpm),
          requestedTpm: Number(requestedTpm),
          reason,
        }),
      });
      if (res.success) {
        setRequestedQpm("");
        setRequestedTpm("");
        setReason("");
        const latest = await fetchAPI("/api/rate-limits", { headers: authHeaders() });
        if (latest.success) setData(latest.data);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function applyIncrease(modelId: string) {
    setModel(modelId);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const sysDefaultQpm = data?.systemDefaultQpm ?? data?.defaultQpm ?? 0;
  const sysDefaultTpm = data?.systemDefaultTpm ?? data?.defaultTpm ?? 0;
  const hasUserDefault = data?.hasUserDefault ?? false;

  type ModelRow = { id: string; name: string; qpm: number; tpm: number; source: "custom" | "user_default" | "system_default" };
  const modelRows: ModelRow[] = !data
    ? []
    : models
        .map((m): ModelRow => {
          const custom = data.customLimits.find((c) => c.model === m.id);
          if (custom) return { id: m.id, name: m.name, qpm: custom.qpm, tpm: custom.tpm, source: "custom" };
          if (hasUserDefault) return { id: m.id, name: m.name, qpm: data.defaultQpm, tpm: data.defaultTpm, source: "user_default" };
          return { id: m.id, name: m.name, qpm: sysDefaultQpm, tpm: sysDefaultTpm, source: "system_default" };
        })
        .filter((row) => {
          const q = modelSearch.trim().toLowerCase();
          if (!q) return true;
          return row.name.toLowerCase().includes(q) || row.id.toLowerCase().includes(q);
        })
        .sort((a, b) => {
          if (a.source === "custom" && b.source !== "custom") return -1;
          if (b.source === "custom" && a.source !== "custom") return 1;
          return a.name.localeCompare(b.name);
        });

  function sourceLabel(source: ModelRow["source"]) {
    if (source === "custom") return t("sourceCustom");
    if (source === "user_default") return t("sourceUserDefault");
    return t("sourceSystemDefault");
  }
  function sourceColor(source: ModelRow["source"]) {
    if (source === "custom") return "#7c3aed";
    if (source === "user_default") return "#0891b2";
    return "var(--text-tertiary)";
  }

  return (
    <UserLayout>
      <div className="usr-page-header">
        <h1>{t("rateLimitsTitle")}</h1>
        <p>{t("rateLimitsDesc")}</p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-tertiary)" }}>{t("loading")}</div>
      ) : !data ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-tertiary)" }}>{t("failedLoad")}</div>
      ) : (
        <>
          {user?.accountType === "sub" && (
            <div className="usr-section" style={{ marginBottom: 20 }}>
              <div className="usr-section-header">
                <h3>{t("myModels")}</h3>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 400 }}>{t("myModelsDesc")}</span>
              </div>
              <div className="usr-section-body" style={{ padding: "16px 20px" }}>
                {user.allowedModels == null ? (
                  <div style={{ fontSize: 13, color: "#059669", fontWeight: 600 }}>{t("allModelsGranted")}</div>
                ) : user.allowedModels.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--danger)" }}>{t("noModelsGranted")}</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {user.allowedModels.map((id) => {
                      const m = models.find((x) => x.id === id);
                      return (
                        <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 12.5 }}>
                          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{m ? m.name : id}</span>
                          <span style={{ color: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{id}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Default limits card */}
          <div className="usr-section" style={{ marginBottom: 20 }}>
            <div className="usr-section-header">
              <h3>{t("defaultLimits")}</h3>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 400 }}>
                直接申请新的 QPM / TPM 配额
              </span>
            </div>
            <div className="usr-section-body" style={{ padding: "16px 20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 4 }}>{t("qpm")}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {data.defaultQpm.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 4 }}>{t("tpm")}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {data.defaultTpm.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Per-model limits */}
          <div className="usr-section" style={{ marginBottom: 20 }}>
            <div className="usr-section-header">
              <h3>{t("allModelsLimits")}</h3>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 400 }}>
                {t("allModelsLimitsDesc")}
              </span>
            </div>
            <div className="usr-section-body" style={{ padding: "14px 20px" }}>
              <input
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder={t("searchModel")}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", fontSize: 13 }}
              />
            </div>
            {modelRows.length === 0 ? (
              <div className="usr-section-body" style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                {t("noModelsMatch")}
              </div>
            ) : (
              <div>
                <div className="table-row" style={{
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 0.9fr",
                  fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const,
                  color: "var(--text-tertiary)", background: "var(--bg-elevated)",
                }}>
                  <span>{t("modelSpecific")}</span>
                  <span style={{ textAlign: "right" }}>QPM</span>
                  <span style={{ textAlign: "right" }}>TPM</span>
                  <span>{t("colSource")}</span>
                  <span style={{ textAlign: "right" }}>{t("colAction")}</span>
                </div>
                {modelRows.map((row) => (
                  <div key={row.id} className="table-row" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 0.9fr", alignItems: "center" }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", color: "var(--text-primary)", fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>
                      <span style={{ display: "block", color: "var(--text-tertiary)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.id}</span>
                    </span>
                    <span style={{ textAlign: "right", color: "var(--text-secondary)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{row.qpm.toLocaleString()}</span>
                    <span style={{ textAlign: "right", color: "var(--text-secondary)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{row.tpm.toLocaleString()}</span>
                    <span>
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 600, color: sourceColor(row.source), background: `${sourceColor(row.source)}14`, border: `1px solid ${sourceColor(row.source)}2b` }}>
                        {sourceLabel(row.source)}
                      </span>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <button
                        onClick={() => applyIncrease(row.id)}
                        style={{ padding: "5px 12px", fontSize: 11.5, fontWeight: 600, borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                      >
                        {t("applyIncrease")}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div ref={formRef} className="usr-section" style={{
            background: "rgba(99, 102, 241, 0.04)",
            border: "1px solid rgba(99, 102, 241, 0.1)",
            marginBottom: 20,
          }}>
            <div className="usr-section-body" style={{
              display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 20, padding: "20px 24px",
            }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                  直接申请限额
                </h3>
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                  填写模型、QPM 和 TPM 后直接提交给后台审批，不再走工单流程。
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                  模型
                  <select value={model} onChange={(e) => setModel(e.target.value)} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)" }}>
                    <option value="*">全部模型（默认限额）</option>
                    {models.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                  QPM
                  <input value={requestedQpm} onChange={(e) => setRequestedQpm(e.target.value)} placeholder="1000" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                  TPM
                  <input value={requestedTpm} onChange={(e) => setRequestedTpm(e.target.value)} placeholder="1000000" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)" }} />
                </label>
                <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                  申请说明
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="说明用途、模型范围或申请原因" rows={3} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", resize: "vertical" }} />
                </label>
                <button
                  onClick={submitRequest}
                  disabled={submitting}
                  className="btn-primary"
                  style={{ fontSize: 13, padding: "9px 16px", alignSelf: "end", whiteSpace: "nowrap", opacity: submitting ? 0.7 : 1, gridColumn: "1 / -1" }}
                >
                  {submitting ? "提交中..." : "提交申请"}
                </button>
              </div>
            </div>
          </div>

          <div className="usr-section">
            <div className="usr-section-header">
              <h3>我的申请</h3>
            </div>
            <div className="usr-section-body" style={{ padding: 0 }}>
              {!data.requests || data.requests.length === 0 ? (
                <div style={{ padding: 20, color: "var(--text-tertiary)", textAlign: "center" }}>暂无申请记录</div>
              ) : (
                data.requests.map((request) => (
                  <div key={request.id} className="table-row" style={{ gridTemplateColumns: "1.1fr 0.7fr 0.7fr 0.8fr", alignItems: "start" }}>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{request.model}</div>
                      <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.6 }}>{request.reason || "无备注"}</div>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{request.requested_qpm.toLocaleString()}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{request.requested_tpm.toLocaleString()}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{request.status}</span>
                      {request.admin_reply ? <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{request.admin_reply}</span> : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </UserLayout>
  );
}
