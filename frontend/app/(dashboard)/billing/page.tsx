"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import { useAuth, authHeaders } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatCny, formatCnyPrecise } from "@/lib/money";
import UserLayout from "@/components/UserLayout";
import { ErrorState, LoadingState } from "@/components/AppState";
import { PageHeader, Panel, Tag, formatConsoleTime, type TagTone } from "@/components/ConsoleUI";

interface BillingSummary { balance: number; creditBalance: number; availableBalance: number; totalRecharge: number; totalConsumption: number; totalCalls: number; }
interface Transaction { id: string; type: string; amount: number; balanceAfter: number; creditAmount: number; creditAfter: number; description: string; refId?: string | null; createdAt: string; discountRate?: number; discountAmountCny?: number; actorUserId?: string | null; actorName?: string | null; }
type PayMethod = "mock" | "alipay";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/proxy";
const PAGE_SIZE = 20;
const LOW_BALANCE = 10;

interface PaymentConfigStatus {
  configured: boolean;
  mockEnabled?: boolean;
}

const TX_TYPES: Record<string, { label: string; tone: TagTone }> = {
  recharge: { label: "充值", tone: "positive" },
  consumption: { label: "消费", tone: "neutral" },
  refund: { label: "退款", tone: "warning" },
  credit_adjustment: { label: "信控调整", tone: "accent" },
  admin_adjustment: { label: "余额调整", tone: "accent" },
};

/** "API 调用: qwen3.8-max (1234 tokens, 1000 缓存, stream)" → model + compact detail. */
function describeTransaction(tx: Transaction): { model?: string; detail: string } {
  const match = tx.description?.match(/^API 调用:\s*(\S+)\s*\((\d+) tokens(?:,\s*(\d+) 缓存)?(?:,\s*stream)?\)/);
  if (!match) return { detail: tx.description || "-" };
  const [, model, total, cached] = match;
  const tokens = Number(total).toLocaleString("zh-CN");
  return { model, detail: cached ? `${tokens} tokens · 缓存命中 ${Number(cached).toLocaleString("zh-CN")}` : `${tokens} tokens` };
}

function isIncoming(tx: Transaction) {
  return tx.type !== "consumption" && tx.amount > 0;
}

export default function BillingPage() {
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
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
  const [exportStartDate, setExportStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [exportEndDate, setExportEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState("");
  // 子账号视角：无充值入口，余额卡替换为限额视图（docs/specs/sub-accounts-spec.md §4.3）
  const isSub = user?.accountType === "sub";
  const quota = user?.quota || null;

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [user]);

  useEffect(() => {
    if (!pollOrderId) return;
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        clearInterval(timer);
        setPollOrderId(null);
        setRechargeMsg({ type: "error", text: "支付状态确认超时。若已付款，请提交工单并附上订单号。" });
        return;
      }
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

  useEffect(() => {
    if (!showRecharge) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pollOrderId) closeRecharge();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showRecharge, pollOrderId]);

  // 支付跳转：后端返回 URL，直接跳转
  useEffect(() => {
    if (!paymentFormHtml) return;
    window.location.href = paymentFormHtml;
  }, [paymentFormHtml]);

  async function loadData(signal?: AbortSignal) {
    setDataLoading(true);
    setDataError("");
    try {
      const headers = authHeaders();
      const [sRes, tRes, cRes] = await Promise.all([
        fetchAPI("/api/billing/summary", { headers, signal }),
        fetchAPI(`/api/billing/transactions?limit=${PAGE_SIZE}&offset=${txOffset}`, { headers, signal }),
        fetchAPI("/api/billing/payment/config", { headers, signal }),
      ]);
      if (sRes.success) setSummary(sRes.data);
      if (tRes.success) { setTransactions(tRes.data.rows); setTxTotal(tRes.data.total); }
      if (cRes.success) setPaymentConfig(cRes.data);
      if (!sRes.success && !tRes.success) {
        setDataError(sRes.message || tRes.message || "账单数据加载失败");
      }
    } catch {
      if (signal?.aborted) return;
      setDataError("无法连接账单服务，请稍后重试");
    } finally { if (!signal?.aborted) setDataLoading(false); }
  }

  async function loadTransactions(offset: number) {
    try {
      const res = await fetchAPI(`/api/billing/transactions?limit=${PAGE_SIZE}&offset=${offset}`, { headers: authHeaders() });
      if (res.success) { setTransactions(res.data.rows); setTxTotal(res.data.total); setTxOffset(offset); }
    } catch {}
  }

  function closeRecharge() {
    setShowRecharge(false);
    setRechargeMsg(null);
    setPollOrderId(null);
  }

  async function handleRecharge() {
    const amount = parseFloat(rechargeAmount);
    if (!amount || amount <= 0) { setRechargeMsg({ type: "error", text: t("invalidAmount") }); return; }
    if (amount > 200000) { setRechargeMsg({ type: "error", text: t("maxAmount") }); return; }
    if (payMethod === "alipay" && paymentConfig && !paymentConfig.configured) {
      setRechargeMsg({ type: "error", text: "在线充值通道维护中，请稍后重试或提交工单联系支持。" });
      return;
    }
    setRecharging(true); setRechargeMsg(null); setPaymentFormHtml(null);
    try {
      const body: Record<string, unknown> = { amount };
      if (payMethod === "alipay") body.method = "page";
      const res = await fetchAPI("/api/billing/recharge", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (res.success) {
        if (res.data?.qrCode) {
          const orderNo = res.data.orderNo || res.data.orderId;
          if (orderNo) setPollOrderId(orderNo);
          setRechargeMsg({ type: "success", text: "支付订单已创建，请在支付宝页面完成支付" });
        } else if (res.data?.paymentForm || res.data?.payUrl) {
          const orderNo = res.data.orderNo || res.data.orderId;
          const paymentForm = res.data.paymentForm || res.data.payUrl;
          if (orderNo) setPollOrderId(orderNo);
          // 直接渲染表单并自动提交，解决手机端弹出窗口被阻止的问题
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
      setExportError("请选择导出日期范围");
      return;
    }
    if (exportStartDate > exportEndDate) {
      setExportError("开始日期不能晚于结束日期");
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
        throw new Error(text || "账单导出失败");
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
      setExportError(error instanceof Error ? error.message : "账单导出失败");
    } finally {
      setExportingCsv(false);
    }
  }

  const presetAmounts = [10000, 50000, 100000, 200000];
  const available = summary?.availableBalance ?? ((user?.balance || 0) + (user?.creditBalance || 0));
  const cashBalance = summary?.balance ?? user?.balance ?? 0;
  const creditBalance = summary?.creditBalance ?? user?.creditBalance ?? 0;
  // 仅主账号、且流水里确实有子账号发起的消费时，才显示“发起账号”列（普通用户零变化）
  const showActorColumn = !isSub && transactions.some((tx) => tx.actorUserId && tx.actorUserId !== user?.id);
  const showCreditColumn = transactions.some((tx) => Number(tx.creditAfter) !== 0 || Number(tx.creditAmount) !== 0);
  const rechargeBlocked = payMethod === "alipay" && paymentConfig?.configured === false;
  const payMethods: { key: PayMethod; label: string; desc: string }[] = [
    ...(process.env.NODE_ENV !== "production" && paymentConfig?.mockEnabled ? [{ key: "mock" as PayMethod, label: "开发测试", desc: "仅本地开发环境可用" }] : []),
    { key: "alipay", label: "支付宝", desc: t("alipayDesc") },
  ];

  return (
    <UserLayout>
      <PageHeader
        title={t("creditsTitle")}
        description="余额、充值与每一笔消费明细"
        actions={!isSub && (
          <button className="btn-primary" onClick={() => setShowRecharge(true)}>
            <PlusOutlined /> {t("topUp")}
          </button>
        )}
      />

      <section className="nfc-billing-balance">
        <div className="nfc-billing-main">
          {isSub ? (
            <>
              <span>{quota?.limit != null ? "剩余可用额度" : "子账号"}</span>
              <strong>{quota?.limit != null ? formatCny(Math.max(0, quota.limit - quota.used)) : "由主账号统一管理"}</strong>
              {quota?.limit != null && (
                <p>限额 {formatCny(quota.limit)}{quota.period === "monthly" ? " / 月" : "（累计）"} · 已用 {formatCny(quota.used)}</p>
              )}
            </>
          ) : (
            <>
              <span>可用余额</span>
              <strong className={available <= 0 ? "is-empty" : undefined}>{formatCny(available)}</strong>
              <p>
                现金余额 {formatCny(cashBalance)}
                {creditBalance !== 0 && <> · 信控额度 {formatCny(creditBalance)}</>}
              </p>
              {available < LOW_BALANCE && (
                <div className={`nfc-note ${available <= 0 ? "nfc-note-danger" : "nfc-note-warning"}`}>
                  {available <= 0 ? "余额已用完，API 请求会被拒绝。" : "余额较低，可能很快影响 API 调用。"}
                  <button className="nfc-link-button" onClick={() => setShowRecharge(true)}>立即充值</button>
                </div>
              )}
            </>
          )}
        </div>
        {!isSub && (
          <dl className="nfc-billing-stats">
            <div><dt>累计充值</dt><dd>{formatCny(summary?.totalRecharge || 0)}</dd></div>
            <div><dt>{t("totalSpent")}</dt><dd>{formatCny(summary?.totalConsumption || 0)}</dd></div>
            <div><dt>计费调用</dt><dd>{(summary?.totalCalls || 0).toLocaleString("zh-CN")} 次</dd></div>
          </dl>
        )}
      </section>

      {dataLoading ? (
        <LoadingState title={t("loading")} />
      ) : dataError ? (
        <ErrorState title="账单加载失败" message={dataError} onAction={() => loadData()} />
      ) : (
        <Panel title="收支明细" aside={<span>共 {txTotal.toLocaleString("zh-CN")} 条</span>} flush>
          {transactions.length === 0 ? (
            <div className="nfc-empty">{t("noTransactions")}</div>
          ) : (
            <>
              <div className="nfc-table-wrap">
                <table className="nfc-table nfc-tx-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>类型</th>
                      <th>说明</th>
                      {showActorColumn && <th>{t("txAccount")}</th>}
                      <th className="num">金额</th>
                      <th className="num">余额</th>
                      {showCreditColumn && <th className="num">信控</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => {
                      const kind = TX_TYPES[tx.type] || { label: tx.type, tone: "neutral" as TagTone };
                      const { model, detail } = describeTransaction(tx);
                      const incoming = isIncoming(tx);
                      const discounted = tx.type !== "recharge" && tx.discountRate !== undefined && tx.discountRate < 1 && tx.discountAmountCny !== undefined;
                      const fromPlayground = tx.refId?.startsWith("playground:") || tx.description?.startsWith("Playground");
                      return (
                        <tr key={tx.id}>
                          <td className="time">{formatConsoleTime(tx.createdAt)}</td>
                          <td><Tag tone={kind.tone}>{kind.label}</Tag></td>
                          <td>
                            <div className="nfc-tx-desc">
                              {model && <code className="nfc-code">{model}</code>}
                              <span>{detail}</span>
                              {fromPlayground && <Tag>网页试用</Tag>}
                            </div>
                          </td>
                          {showActorColumn && (
                            <td>{tx.actorUserId && tx.actorUserId !== user?.id ? <Tag tone="accent">{tx.actorName || tx.actorUserId}</Tag> : <span className="nfc-faint">{t("txSelf")}</span>}</td>
                          )}
                          <td className="num">
                            <span className={`nfc-amount ${incoming ? "nfc-amount-in" : "nfc-amount-out"}`}>
                              {incoming ? "+" : "−"}{formatCnyPrecise(Math.abs(tx.amount))}
                            </span>
                            {discounted && (
                              <small className="nfc-tx-discount">
                                <s>{formatCnyPrecise(Math.abs(Number(tx.amount)) + (tx.discountAmountCny || 0))}</s> {Math.round((tx.discountRate || 0) * 100) / 10} 折
                              </small>
                            )}
                          </td>
                          <td className="num nfc-muted">{formatCnyPrecise(tx.balanceAfter)}</td>
                          {showCreditColumn && <td className="num nfc-muted">{formatCnyPrecise(tx.creditAfter)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {txTotal > PAGE_SIZE && (
                <div className="nfc-table-foot">
                  <span>第 {txOffset + 1}–{Math.min(txOffset + PAGE_SIZE, txTotal)} 条，共 {txTotal} 条</span>
                  <div className="nfc-pager">
                    <button className="btn-secondary" disabled={txOffset === 0} onClick={() => loadTransactions(Math.max(0, txOffset - PAGE_SIZE))}>{t("previous")}</button>
                    <button className="btn-secondary" disabled={txOffset + PAGE_SIZE >= txTotal} onClick={() => loadTransactions(txOffset + PAGE_SIZE)}>{t("next")}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </Panel>
      )}

      <div className="nfc-grid-2">
        <Panel title="导出账单" aside="按模型、阶梯和单价展开每次调用">
          <div className="nfc-export-row">
            <label className="nfc-field">开始日期
              <input className="input" type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} />
            </label>
            <label className="nfc-field">结束日期
              <input className="input" type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} />
            </label>
            <button className="btn-secondary" onClick={handleExportCsv} disabled={exportingCsv}>
              <DownloadOutlined /> {exportingCsv ? "正在生成…" : "下载 CSV"}
            </button>
          </div>
          {exportError && <div className="nfc-note nfc-note-danger" style={{ marginTop: 12 }}>{exportError}</div>}
        </Panel>
        <Panel title="发票与对公采购">
          <p className="nfc-panel-text">需要合同、对公转账或发票时，提交工单并注明公司抬头、税号、消费月份与联系人。客服核对消费记录后会在工单里回复。</p>
          <Link className="btn-secondary" href="/tickets">提交工单</Link>
        </Panel>
      </div>

      {showRecharge && !isSub && (
        <div className="nfc-modal-backdrop" role="presentation" onClick={closeRecharge}>
          <div className="nfc-modal animate-fadeIn" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="recharge-dialog-title">
            <div className="nfc-modal-head">
              <div>
                <h3 id="recharge-dialog-title">{t("topUp")}</h3>
                <p>当前可用 {formatCny(available)}</p>
              </div>
              <button className="nfc-modal-close" aria-label="关闭充值窗口" onClick={closeRecharge}>×</button>
            </div>

            <div className="nfc-modal-body">
              <div className="nfc-field">
                {t("selectAmount")}
                <div className="nfc-choices">
                  {presetAmounts.map((a) => (
                    <button key={a} className="nfc-choice" aria-pressed={rechargeAmount === String(a)} onClick={() => setRechargeAmount(String(a))}>
                      <strong>¥{a / 10000} 万</strong>
                      <small>¥{a.toLocaleString("zh-CN")}</small>
                    </button>
                  ))}
                </div>
              </div>
              <label className="nfc-field">
                {t("customAmount")}
                <input className="input" type="number" placeholder={t("enterAmount")} step="0.01" min="0.01" max="200000" value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRecharge()} />
              </label>
              <div className="nfc-field">
                {t("paymentMethod")}
                <div className="nfc-choices" style={{ ["--nfc-choice-cols" as string]: String(payMethods.length) }}>
                  {payMethods.map((pm) => (
                    <button key={pm.key} className="nfc-choice" aria-pressed={payMethod === pm.key} onClick={() => setPayMethod(pm.key)}>
                      <strong style={{ fontSize: 13 }}>{pm.label}</strong>
                      <small>{pm.desc}</small>
                    </button>
                  ))}
                </div>
              </div>
              {payMethod === "alipay" && paymentConfig && !paymentConfig.configured && (
                <div className="nfc-note nfc-note-warning">在线充值通道维护中，暂时无法创建支付订单。请稍后重试，或通过工单联系支持。</div>
              )}
              {payMethod === "alipay" && paymentConfig?.configured && (
                <div className="nfc-note">点击充值后会跳转到支付宝安全页面完成支付，到账后余额自动更新。</div>
              )}
              {payMethod === "mock" && <div className="nfc-note">{t("testModeNote")}</div>}
              {rechargeMsg && (
                <div className={`nfc-note ${rechargeMsg.type === "success" ? "nfc-note-success" : "nfc-note-danger"}`}>{rechargeMsg.text}</div>
              )}
            </div>

            <div className="nfc-modal-foot">
              <button className="btn-primary" onClick={handleRecharge} disabled={recharging || !rechargeAmount || pollOrderId !== null || rechargeBlocked}>
                {rechargeBlocked ? "充值通道维护中" : recharging ? t("processing") : pollOrderId ? t("waitingPayment") : `${t("topUp")} ¥${Number(rechargeAmount || 0).toLocaleString("zh-CN")}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 支付宝跳转过渡页 */}
      {paymentFormHtml && (
        <div className="nfc-pay-redirect">
          <div>
            <p>正在跳转到支付宝…</p>
            <a className="btn-primary" href={paymentFormHtml}>如未自动跳转，点此前往</a>
            <button className="nfc-link-button" onClick={() => setPaymentFormHtml("")}>取消</button>
          </div>
        </div>
      )}
    </UserLayout>
  );
}
