"use client";

import { useEffect, useState } from "react";
import { useAuth, authHeaders } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatUsd, formatCny, formatCnyPrecise, cnyToUsd, usdToCny } from "@/lib/money";
import UserLayout from "@/components/UserLayout";
import { BalanceWarning } from "@/components/BalanceWarning";
import OnboardingGuide, { useOnboarding } from "@/components/OnboardingGuide";
import SmartRecharge from "@/components/SmartRechargeRecommendation";
import { ErrorState, LoadingState } from "@/components/AppState";

const ENABLE_PAYMENTS = process.env.NEXT_PUBLIC_ENABLE_PAYMENTS !== "false";

interface BillingSummary { balance: number; totalRecharge: number; totalConsumption: number; totalCalls: number; }
interface Transaction { id: string; type: string; amount: number; balanceAfter: number; description: string; refId?: string | null; createdAt: string; discountRate?: number; discountAmountCny?: number; }
interface ApiKeyInfo { id: string; key: string; name: string; }
type PayMethod = "mock" | "alipay";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/proxy";

interface PaymentConfigStatus {
  configured: boolean;
  missing?: string[];
  gateway: string;
  appId: string;
  notifyUrl: string;
  returnUrl: string;
  mockEnabled?: boolean;
}

export default function BillingPage() {
  const { user, refreshUser } = useAuth();
  const { t, locale } = useI18n();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txOffset, setTxOffset] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [showRecharge, setShowRecharge] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("alipay");
  const [recharging, setRecharging] = useState(false);
  const [rechargeMsg, setRechargeMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pollOrderId, setPollOrderId] = useState<string | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigStatus | null>(null);
  const [paymentFormHtml, setPaymentFormHtml] = useState<string | null>(null);
  const [firstApiKey, setFirstApiKey] = useState<ApiKeyInfo | null>(null);
  const [exportStartDate, setExportStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [exportEndDate, setExportEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState("");
  const missingConfigKeys = Array.isArray(paymentConfig?.missing) ? paymentConfig!.missing : [];
  const { shouldShow: showOnboarding, markCompleted } = useOnboarding();

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [user]);

  useEffect(() => {
    if (!pollOrderId) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetchAPI(`/api/billing/order/status?orderNo=${pollOrderId}`, { headers: authHeaders() });
        if (res.success && res.data.status === "paid") {
          clearInterval(timer); setPollOrderId(null);
          setRechargeMsg({ type: "success", text: t("payConfirmed") });
          setRechargeAmount(""); await refreshUser(); await loadData();
          setTimeout(() => { setShowRecharge(false); setRechargeMsg(null); }, 2000);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(timer);
  }, [pollOrderId]);

  async function loadData(signal?: AbortSignal) {
    setDataLoading(true);
    setDataError("");
    try {
      const headers = authHeaders();
      const [sRes, tRes, cRes, kRes] = await Promise.all([
        fetchAPI("/api/billing/summary", { headers, signal }),
        fetchAPI(`/api/billing/transactions?limit=20&offset=${txOffset}`, { headers, signal }),
        fetchAPI("/api/billing/payment/config", { headers, signal }),
        fetchAPI("/api/keys", { headers, signal }),
      ]);
      if (sRes.success) setSummary(sRes.data);
      if (tRes.success) { setTransactions(tRes.data.rows); setTxTotal(tRes.data.total); }
      if (cRes.success) setPaymentConfig(cRes.data);
      if (kRes.success && kRes.data && kRes.data.length > 0) {
        setFirstApiKey(kRes.data[0]);
      }
      if (!sRes.success && !tRes.success) {
        setDataError(sRes.message || tRes.message || "Billing data load failed");
      }
    } catch {
      setDataError("Unable to connect to billing service, please try again later");
    } finally { setDataLoading(false); }
  }

  async function loadTransactions(offset: number) {
    try {
      const res = await fetchAPI(`/api/billing/transactions?limit=20&offset=${offset}`, { headers: authHeaders() });
      if (res.success) { setTransactions(res.data.rows); setTxTotal(res.data.total); setTxOffset(offset); }
    } catch {}
  }

  async function handleRecharge() {
    // The user enters/selects USD; the backend bills and charges Alipay in CNY.
    const usdAmount = parseFloat(rechargeAmount);
    if (!usdAmount || usdAmount <= 0) { setRechargeMsg({ type: "error", text: t("invalidAmount") }); return; }
    const cnyAmount = Math.round(usdToCny(usdAmount) * 100) / 100;
    if (cnyAmount > 10000) { setRechargeMsg({ type: "error", text: t("maxAmount") }); return; }
    setRecharging(true); setRechargeMsg(null); setPaymentFormHtml(null);
    try {
      const body: Record<string, unknown> = { amount: cnyAmount };
      if (payMethod === "alipay") body.method = "page";
      const res = await fetchAPI("/api/billing/recharge", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (res.success) {
        if (res.data?.qrCode) {
          const orderNo = res.data.orderNo || res.data.orderId;
          if (orderNo) setPollOrderId(orderNo);
          setRechargeMsg({ type: "success", text: "Payment order created. Please complete payment on the Alipay page" });
        } else if (res.data?.paymentForm || res.data?.payUrl) {
          const orderNo = res.data.orderNo || res.data.orderId;
          const paymentForm = res.data.paymentForm || res.data.payUrl;
          if (orderNo) setPollOrderId(orderNo);
          // Auto-render and submit the form to prevent blocked popups on mobile
          setPaymentFormHtml(paymentForm);
          setRechargeMsg({ type: "success", text: t("payPageOpened") });
        } else {
          setRechargeMsg({ type: "success", text: res.message || t("topUpSuccess") });
          setRechargeAmount(""); await refreshUser(); await loadData();
          setTimeout(() => { setShowRecharge(false); setRechargeMsg(null); }, 1500);
        }
      } else { setRechargeMsg({ type: "error", text: res.message || t("topUpFailed") }); }
    } catch { setRechargeMsg({ type: "error", text: t("networkError") }); }
    finally { setRecharging(false); }
  }

  async function handleExportCsv() {
    if (!exportStartDate || !exportEndDate) {
      setExportError("Please select a date range to export");
      return;
    }
    if (exportStartDate > exportEndDate) {
      setExportError("Start date cannot be later than end date");
      return;
    }

    setExportingCsv(true);
    setExportError("");
    try {
      const params = new URLSearchParams({ startDate: exportStartDate, endDate: exportEndDate });
      const res = await fetch(`${API_BASE}/api/billing/export.csv?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Billing export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nexusflow-billing-${exportStartDate}-to-${exportEndDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Billing export failed");
    } finally {
      setExportingCsv(false);
    }
  }

  // Payment redirect: backend returns URL, redirect directly
  useEffect(() => {
    if (!paymentFormHtml) return;
    window.location.href = paymentFormHtml;
  }, [paymentFormHtml]);

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }

  function typeLabel(type: string) {
    switch (type) { case "recharge": return t("txTopUp"); case "consumption": return t("txUsage"); case "refund": return t("txRefund"); default: return type; }
  }
  function typeColor(type: string) {
    switch (type) { case "recharge": return "#10b981"; case "consumption": return "#ef4444"; case "refund": return "#d97706"; default: return "#78716c"; }
  }
  function isPlaygroundTx(tx: Transaction) {
    return tx.refId?.startsWith("playground:") || tx.description?.startsWith("Playground");
  }

  const presetAmounts = [10, 50, 100, 500];

  return (
    <UserLayout>
      {/* Onboarding Guide */}
      {showOnboarding && user && (
        <OnboardingGuide
          hasApiKey={!!firstApiKey}
          onClose={markCompleted}
        />
      )}

      <div className="usr-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h1>{t("creditsTitle")}</h1><p>{t("creditsDesc")}</p></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn-secondary" onClick={handleExportCsv} disabled={exportingCsv} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
            {exportingCsv ? "Exporting..." : "Export CSV"}
          </button>
          {ENABLE_PAYMENTS && (
          <button className="btn-primary" onClick={() => setShowRecharge(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t("topUp")}
          </button>
          )}
        </div>
      </div>

      <div className="usr-hero-dark">
        <BalanceWarning
          balance={summary?.balance || user?.balance || 0}
          threshold={10}
          onRecharge={() => setShowRecharge(true)}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div className="usr-hero-label">{t("availableBalance")}</div>
            <div className="usr-hero-value">{formatCny(summary?.balance || user?.balance || 0)}</div>
          </div>
          <div className="usr-hero-stats">
            <div style={{ textAlign: "right" }}><div className="usr-hero-stat-label">{t("totalRecharged")}</div><div className="usr-hero-stat-value">{formatCny(summary?.totalRecharge || 0)}</div></div>
            <div style={{ textAlign: "right" }}><div className="usr-hero-stat-label">{t("totalSpent")}</div><div className="usr-hero-stat-value">{formatCny(summary?.totalConsumption || 0)}</div></div>
            <div style={{ textAlign: "right" }}><div className="usr-hero-stat-label">{t("apiCalls")}</div><div className="usr-hero-stat-value">{summary?.totalCalls || 0}</div></div>
          </div>
        </div>
      </div>

      <div className="usr-section" style={{ marginBottom: 20 }}>
        <div className="usr-section-header">
          <h3>Billing Export</h3>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Export model, tier, and unit price details by usage</span>
        </div>
        <div className="usr-section-body" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
            Start Date
            <input className="input" type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} style={{ width: 160, fontSize: 13 }} />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
            End Date
            <input className="input" type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} style={{ width: 160, fontSize: 13 }} />
          </label>
          <button className="btn-secondary" onClick={handleExportCsv} disabled={exportingCsv} style={{ padding: "9px 18px", fontSize: 13 }}>
            {exportingCsv ? "Generating" : "Download Billing CSV"}
          </button>
          {exportError && (
            <span style={{ fontSize: 12, color: "var(--danger)", lineHeight: "34px" }}>{exportError}</span>
          )}
        </div>
      </div>

      {showRecharge && ENABLE_PAYMENTS && (
      <div className="usr-section animate-fadeIn" style={{ marginBottom: 20 }}>
          <div className="usr-section-header">
            <h3>{t("topUp")}</h3>
            <button onClick={() => { setShowRecharge(false); setRechargeMsg(null); setPollOrderId(null); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-tertiary)", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div className="usr-section-body">
            {/* Smart recommendations */}
            {summary && (
              <SmartRecharge
                stats={{
                  monthlyCost: cnyToUsd(summary.totalConsumption),
                  avgDailyCost: cnyToUsd(summary.totalConsumption / 30),
                  balance: cnyToUsd(summary.balance),
                }}
                onSelect={(amount) => setRechargeAmount(String(amount))}
                selectedAmount={rechargeAmount}
              />
            )}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 10 }}>{t("selectAmount")}</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {presetAmounts.map((a) => {
                  const selected = rechargeAmount === String(a);
                  return (<button key={a} onClick={() => setRechargeAmount(String(a))} style={{ padding: "12px 0", borderRadius: 8, border: selected ? "2px solid #111" : "1px solid var(--border)", background: selected ? "rgba(0,0,0,0.03)" : "var(--bg-card)", cursor: "pointer", fontSize: 15, fontWeight: 700, color: selected ? "#111" : "var(--text-secondary)", transition: "all 0.15s", fontFamily: "inherit" }}>${a}</button>);
                })}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>{t("customAmount")}</label>
              <input className="input" type="number" placeholder={t("enterAmount")} step="0.01" min="0.01" max="10000" value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRecharge()} style={{ fontSize: 13 }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 10 }}>{t("paymentMethod")}</label>
              <div style={{ display: "flex", gap: 10 }}>
                {([
                  ...(paymentConfig?.mockEnabled ? [{ key: "mock" as PayMethod, label: t("testMode"), desc: t("testModeDesc"), icon: "⚡" }] : []),
                  { key: "alipay" as PayMethod, label: "Alipay", desc: t("alipayDesc"), icon: "💳" },
                ]).map((pm) => (
                  <button key={pm.key} onClick={() => setPayMethod(pm.key)} style={{ flex: 1, padding: "12px 14px", borderRadius: 8, cursor: "pointer", border: payMethod === pm.key ? "2px solid #111" : "1px solid var(--border)", background: payMethod === pm.key ? "rgba(0,0,0,0.02)" : "var(--bg-card)", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s" }}>
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{pm.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{pm.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{pm.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            {payMethod === "alipay" && paymentConfig && !paymentConfig.configured && (
              <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, fontSize: 12, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", color: "var(--warning)" }}>
                Alipay is not fully configured. Currently in mock payment mode. Please configure the following keys in backend `.env`: {missingConfigKeys.length > 0 ? missingConfigKeys.join(", ") : "ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY, ALIPAY_PUBLIC_KEY"}
              </div>
            )}
            {payMethod === "alipay" && (
              <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, fontSize: 12, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                💳 After clicking top up, you will be redirected to Alipay to complete payment
              </div>
            )}
            <button className="btn-primary" onClick={handleRecharge} disabled={recharging || !rechargeAmount || pollOrderId !== null} style={{ padding: "9px 24px", fontSize: 13 }}>
              {recharging ? t("processing") : pollOrderId ? t("waitingPayment") : `${t("topUp")} $${rechargeAmount || "0"}`}
            </button>
            {rechargeMsg && (
              <div style={{ marginTop: 14, padding: "9px 12px", borderRadius: 7, fontSize: 12.5, background: rechargeMsg.type === "success" ? "var(--success-bg)" : "var(--danger-bg)", border: `1px solid ${rechargeMsg.type === "success" ? "var(--success-border)" : "var(--danger-border)"}`, color: rechargeMsg.type === "success" ? "var(--success)" : "var(--danger)" }}>
                {rechargeMsg.text}
              </div>
            )}
            {payMethod === "mock" && (
              <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--text-tertiary)", padding: "8px 12px", background: "var(--bg-elevated)", borderRadius: 6 }}>{t("testModeNote")}</div>
            )}
          </div>
        </div>
      )}

      {dataLoading ? (
        <LoadingState title={t("loading")} />
      ) : dataError ? (
        <ErrorState title="Billing load failed" message={dataError} onAction={loadData} />
      ) : (
        <div className="usr-section">
          <div className="usr-section-header">
            <h3>{t("transactions")}</h3>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{txTotal} {t("records")}</span>
          </div>
          {transactions.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text-tertiary)", fontSize: 13 }}>{t("noTransactions")}</div>
          ) : (
            <>
              <div className="table-row" style={{ gridTemplateColumns: "80px 1fr 100px 100px 150px", fontWeight: 600, color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase" as const, background: "var(--bg-elevated)" }}>
                <span>{t("txType")}</span><span>{t("txDescription")}</span><span style={{ textAlign: "right" }}>{t("txAmount")}</span><span style={{ textAlign: "right" }}>{t("txBalance")}</span><span style={{ textAlign: "right" }}>{t("txTime")}</span>
              </div>
              {transactions.map((tx) => (
                <div key={tx.id} className="table-row" style={{ gridTemplateColumns: "80px 1fr 100px 100px 150px" }}>
                  <span><span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 500, background: `${typeColor(tx.type)}12`, color: typeColor(tx.type), border: `1px solid ${typeColor(tx.type)}25` }}>{typeLabel(tx.type)}</span></span>
                  <span style={{ color: "var(--text-primary)", fontSize: 12.5, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description || "-"}</span>
                    {isPlaygroundTx(tx) && (
                      <span style={{ flex: "0 0 auto", padding: "2px 7px", borderRadius: 9999, fontSize: 10.5, fontWeight: 600, color: "#2563eb", background: "rgba(37, 99, 235, 0.09)", border: "1px solid rgba(37, 99, 235, 0.18)" }}>
                        Playground
                      </span>
                    )}
                  </span>
                  <span style={{ textAlign: "right", color: tx.type === "recharge" ? "#10b981" : "#ef4444", fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: 12.5, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    {tx.type !== "recharge" && tx.discountRate !== undefined && tx.discountRate < 1 && tx.discountAmountCny !== undefined && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "var(--text-tertiary)", textDecoration: "line-through", fontSize: 10.5, fontWeight: 400 }}>{formatCnyPrecise(Number(tx.amount) + tx.discountAmountCny)}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 600, padding: "1px 4px", borderRadius: 3, background: "#fef3c7", color: "#b45309" }}>
                          {Math.round((1 - tx.discountRate) * 100)}% off
                        </span>
                      </span>
                    )}
                    <span>{tx.type === "recharge" ? "+" : "-"}{formatCnyPrecise(tx.amount)}</span>
                  </span>
                  <span style={{ textAlign: "right", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{formatCnyPrecise(tx.balanceAfter)}</span>
                  <span style={{ textAlign: "right", color: "var(--text-tertiary)", fontSize: 12 }}>{formatDate(tx.createdAt)}</span>
                </div>
              ))}
              {txTotal > 20 && (
                <div style={{ display: "flex", justifyContent: "center", gap: 12, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
                  <button className="btn-secondary" style={{ padding: "6px 16px", fontSize: 12 }} disabled={txOffset === 0} onClick={() => loadTransactions(Math.max(0, txOffset - 20))}>{t("previous")}</button>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: "32px" }}>{txOffset + 1}–{Math.min(txOffset + 20, txTotal)} / {txTotal}</span>
                  <button className="btn-secondary" style={{ padding: "6px 16px", fontSize: 12 }} disabled={txOffset + 20 >= txTotal} onClick={() => loadTransactions(txOffset + 20)}>{t("next")}</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {/* Alipay form auto-submit container */}
      {paymentFormHtml && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 9999, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", padding: 40, color: "#666" }}>
            <div style={{ marginBottom: 16 }}>Redirecting to Alipay...</div>
            <a
              href={paymentFormHtml}
              style={{ display: "inline-block", padding: "10px 24px", fontSize: 14, background: "#1677ff", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", textDecoration: "none" }}
            >
              If not auto-redirected, click here to proceed manually
            </a>
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setPaymentFormHtml("")} style={{ fontSize: 12, color: "#999", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </UserLayout>
  );
}
