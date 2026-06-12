"use client";

import { useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import UserLayout from "@/components/UserLayout";
import { useI18n } from "@/lib/i18n";

interface RateLimitsData {
  defaultQpm: number;
  defaultTpm: number;
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
  const [data, setData] = useState<RateLimitsData | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("*");
  const [requestedQpm, setRequestedQpm] = useState("");
  const [requestedTpm, setRequestedTpm] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

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
          {/* Default limits card */}
          <div className="usr-section" style={{ marginBottom: 20 }}>
            <div className="usr-section-header">
              <h3>{t("defaultLimits")}</h3>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 400 }}>
                Apply directly for new QPM / TPM quotas
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

          {/* Custom limits */}
          <div className="usr-section" style={{ marginBottom: 20 }}>
            <div className="usr-section-header">
              <h3>{t("customLimits")}</h3>
            </div>
            {data.customLimits.length === 0 ? (
              <div className="usr-section-body" style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>
                {t("noCustomLimits")}
              </div>
            ) : (
              <div>
                <div className="table-row" style={{
                  gridTemplateColumns: "1.5fr 1fr 1fr 0.8fr",
                  fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const,
                  color: "var(--text-tertiary)", background: "var(--bg-elevated)",
                }}>
                  <span>{t("modelSpecific")}</span>
                  <span>QPM</span>
                  <span>TPM</span>
                  <span>{t("statusOpen")}</span>
                </div>
                {data.customLimits.map((limit) => (
                  <div key={limit.id} className="table-row" style={{ gridTemplateColumns: "1.5fr 1fr 1fr 0.8fr" }}>
                    <span style={{ color: "var(--text-primary)", fontSize: 12.5, fontWeight: 500 }}>{limit.model}</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{limit.qpm.toLocaleString()}</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{limit.tpm.toLocaleString()}</span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {limit.source === "admin" ? "Admin" : "Ticket"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="usr-section" style={{
            background: "rgba(99, 102, 241, 0.04)",
            border: "1px solid rgba(99, 102, 241, 0.1)",
            marginBottom: 20,
          }}>
            <div className="usr-section-body" style={{
              display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 20, padding: "20px 24px",
            }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                  Apply for higher limits
                </h3>
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                  Pick a model, fill in the QPM/TPM you need, and submit directly for admin review (no ticket required).
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                  Model
                  <select value={model} onChange={(e) => setModel(e.target.value)} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)" }}>
                    <option value="*">All models (default limit)</option>
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
                  Justification
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe the use case, model scope or reason for the request" rows={3} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", resize: "vertical" }} />
                </label>
                <button
                  onClick={submitRequest}
                  disabled={submitting}
                  className="btn-primary"
                  style={{ fontSize: 13, padding: "9px 16px", alignSelf: "end", whiteSpace: "nowrap", opacity: submitting ? 0.7 : 1, gridColumn: "1 / -1" }}
                >
                  {submitting ? "Submitting..." : "Submit request"}
                </button>
              </div>
            </div>
          </div>

          <div className="usr-section">
            <div className="usr-section-header">
              <h3>My requests</h3>
            </div>
            <div className="usr-section-body" style={{ padding: 0 }}>
              {!data.requests || data.requests.length === 0 ? (
                <div style={{ padding: 20, color: "var(--text-tertiary)", textAlign: "center" }}>No requests yet</div>
              ) : (
                data.requests.map((request) => (
                  <div key={request.id} className="table-row" style={{ gridTemplateColumns: "1.1fr 0.7fr 0.7fr 0.8fr", alignItems: "start" }}>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{request.model}</div>
                      <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.6 }}>{request.reason || "No notes"}</div>
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
