"use client";

import { useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import UserLayout from "@/components/UserLayout";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

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
}

export default function RateLimitsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<RateLimitsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchAPI("/api/rate-limits", { headers: authHeaders() });
        if (res.success) setData(res.data);
      } catch {
        console.error("Failed to load rate limits");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
                {t("submitTicketDesc")}
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

          {/* Submit ticket CTA */}
          <div className="usr-section" style={{
            background: "rgba(99, 102, 241, 0.04)",
            border: "1px solid rgba(99, 102, 241, 0.1)",
          }}>
            <div className="usr-section-body" style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px",
            }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                  {t("submitTicket")}
                </h3>
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                  {t("submitTicketDesc")}
                </p>
              </div>
              <Link href="/tickets" className="btn-primary" style={{ fontSize: 13, padding: "9px 20px", whiteSpace: "nowrap" }}>
                {t("createTicket")}
              </Link>
            </div>
          </div>
        </>
      )}
    </UserLayout>
  );
}
