"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, authHeaders } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import UserLayout from "@/components/UserLayout";
import { formatCny } from "@/lib/money";
import { ErrorState, LoadingState } from "@/components/AppState";

interface SubAccount {
  id: string;
  username: string | null;
  nickname: string;
  email: string | null;
  status: string;
  quota_limit: number | null;
  quota_used: number;
  quota_period: string | null;
  created_at: string;
  key_count: number;
  last_active: string | null;
  allowed_models: string | null; // JSON 数组；NULL=不限
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  category: string;
}

/** 解析 allowed_models 原始字符串：NULL→null（不限），否则 string[]（[]=全禁） */
function parseAllowed(raw: string | null): string[] | null {
  if (raw == null) return null;
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

interface BreakdownRow {
  account_id: string;
  username: string | null;
  nickname: string;
  is_owner: boolean;
  amount_cny: number;
  call_count: number;
  total_tokens: number;
}

function genPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const rand = new Uint32Array(14);
  crypto.getRandomValues(rand);
  for (let i = 0; i < 14; i++) out += chars[rand[i] % chars.length];
  return out;
}

const badgeStyle = (bg: string, color: string): React.CSSProperties => ({
  display: "inline-block", padding: "2px 8px", borderRadius: 5,
  fontSize: 11.5, fontWeight: 600, background: bg, color,
});

function ModelPicker({ options, value, onChange }: { options: ModelOption[]; value: string[]; onChange: (next: string[]) => void }) {
  const [q, setQ] = useState("");
  const filtered = options.filter((m) => {
    const kw = q.trim().toLowerCase();
    if (!kw) return true;
    return m.name.toLowerCase().includes(kw) || m.id.toLowerCase().includes(kw);
  });
  const groups = filtered.reduce<Record<string, ModelOption[]>>((acc, m) => {
    const cat = m.category || "其他";
    (acc[cat] = acc[cat] || []).push(m);
    return acc;
  }, {});
  const selected = new Set(value);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  };
  const filteredIds = filtered.map((m) => m.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 8, borderBottom: "1px solid var(--border)" }}>
        <input className="input" style={{ fontSize: 13, flex: 1 }} placeholder="搜索模型名称或 ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px", whiteSpace: "nowrap" }}
          onClick={() => {
            if (allFilteredSelected) onChange(value.filter((id) => !filteredIds.includes(id)));
            else onChange([...new Set([...value, ...filteredIds])]);
          }}>
          {allFilteredSelected ? "清空当前" : "全选当前"}
        </button>
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto", padding: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>没有匹配的模型</div>
        ) : (
          Object.entries(groups).map(([cat, list]) => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", margin: "4px 2px" }}>{cat}</div>
              {list.map((m) => (
                <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", fontSize: 12.5 }}>
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                  <span style={{ color: "var(--text-primary)" }}>{m.name}</span>
                  <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: "auto", fontFamily: "var(--font-mono)" }}>{m.id}</span>
                </label>
              ))}
            </div>
          ))
        )}
      </div>
      <div style={{ padding: "6px 10px", borderTop: "1px solid var(--border)", fontSize: 11.5, color: "var(--text-tertiary)" }}>
        已选 {value.length} 个模型{value.length === 0 ? "（子账号将无法调用任何模型）" : ""}
      </div>
    </div>
  );
}

export default function SubAccountsPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<SubAccount[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{ username: string; password: string; nickname: string; quotaLimit: string; quotaPeriod: string; allowedModels: string[] }>({ username: "", password: genPassword(), nickname: "", quotaLimit: "", quotaPeriod: "total", allowedModels: [] });
  const [creating, setCreating] = useState(false);
  const [createdCred, setCreatedCred] = useState<{ username: string; password: string } | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [editQuota, setEditQuota] = useState<SubAccount | null>(null);
  const [quotaInput, setQuotaInput] = useState("");
  const [quotaPeriodInput, setQuotaPeriodInput] = useState("total");
  const [editModels, setEditModels] = useState<SubAccount | null>(null);
  const [editModelsValue, setEditModelsValue] = useState<string[]>([]);
  const [resetTarget, setResetTarget] = useState<SubAccount | null>(null);
  const [resetPassword, setResetPasswordValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SubAccount | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setDataLoading(true);
    setError("");
    try {
      const [listRes, bdRes, modelsRes] = await Promise.all([
        fetchAPI("/api/sub-accounts", { headers: authHeaders(), signal }),
        fetchAPI("/api/billing/sub-breakdown", { headers: authHeaders(), signal }),
        fetchAPI("/api/models", { signal }),
      ]);
      if (listRes.success) setRows(listRes.data);
      else setError(listRes.message || "加载失败");
      if (bdRes.success) setBreakdown(bdRes.data.rows);
      if (modelsRes.success) {
        setModels(((modelsRes.data || []) as ModelOption[]).map((m) => ({ id: m.id, name: m.name, provider: m.provider, category: m.category })));
      }
    } catch {
      setError("无法连接服务，请稍后重试");
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [user, load]);

  async function createSub() {
    if (!form.username.trim() || !form.password) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetchAPI("/api/sub-accounts", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password,
          nickname: form.nickname.trim() || undefined,
          quotaLimit: form.quotaLimit === "" ? null : Number(form.quotaLimit),
          quotaPeriod: form.quotaLimit === "" ? null : form.quotaPeriod,
          allowedModels: form.allowedModels,
        }),
      });
      if (res.success) {
        setCreatedCred({ username: res.data.username, password: form.password });
        setShowCreate(false);
        setForm({ username: "", password: genPassword(), nickname: "", quotaLimit: "", quotaPeriod: "total", allowedModels: [] });
        await load();
      } else {
        setError(res.message || "创建失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setCreating(false);
    }
  }

  async function patchSub(id: string, patch: Record<string, unknown>, okMsg: string) {
    setError("");
    try {
      const res = await fetchAPI(`/api/sub-accounts/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(patch),
      });
      if (res.success) {
        setActionMsg(okMsg);
        setTimeout(() => setActionMsg(""), 3000);
        await load();
      } else setError(res.message || "操作失败");
    } catch {
      setError("网络错误，请重试");
    }
  }

  async function doResetPassword() {
    if (!resetTarget || !resetPassword) return;
    setError("");
    try {
      const res = await fetchAPI(`/api/sub-accounts/${resetTarget.id}/reset-password`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ password: resetPassword }),
      });
      if (res.success) {
        setCreatedCred({ username: resetTarget.username || "", password: resetPassword });
        setResetTarget(null);
      } else setError(res.message || "重置失败");
    } catch {
      setError("网络错误，请重试");
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setError("");
    try {
      const res = await fetchAPI(`/api/sub-accounts/${deleteTarget.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.success) {
        setDeleteTarget(null);
        setActionMsg("子账号已删除（历史账单保留）");
        setTimeout(() => setActionMsg(""), 3000);
        await load();
      } else setError(res.message || "删除失败");
    } catch {
      setError("网络错误，请重试");
    }
  }

  if (loading) return <UserLayout><LoadingState /></UserLayout>;
  if (!user) return <UserLayout><ErrorState message="请先登录" /></UserLayout>;
  if (user.accountType === "sub") return <UserLayout><ErrorState message="子账号无权访问此页面" /></UserLayout>;

  const inputStyle: React.CSSProperties = { fontSize: 14 };
  const modalOverlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  };
  const modalBox: React.CSSProperties = {
    width: "100%", maxWidth: 440, background: "var(--bg-card)", borderRadius: 12,
    border: "1px solid var(--border)", padding: 24,
  };

  return (
    <UserLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>子账号</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            创建子账号分发给团队成员，消费从主账号余额实时扣除，可设消费限额
          </p>
        </div>
        <button className="btn-primary" style={{ padding: "9px 16px", fontSize: 13 }} onClick={() => setShowCreate(true)}>
          + 创建子账号
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: "9px 12px", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 7, color: "var(--danger)", fontSize: 13 }}>
          {error}
        </div>
      )}
      {actionMsg && (
        <div style={{ marginBottom: 14, padding: "9px 12px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 7, color: "#059669", fontSize: 13 }}>
          {actionMsg}
        </div>
      )}

      {dataLoading ? (
        <LoadingState />
      ) : (
        <>
          {/* 子账号列表 */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["用户名", "昵称", "状态", "限额", "已用", "密钥数", "可用模型", "最近活跃", "操作"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: "28px 14px", textAlign: "center", color: "var(--text-tertiary)" }}>还没有子账号，点右上角创建</td></tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)" }}>{r.username}</td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{r.nickname}</td>
                      <td style={{ padding: "10px 14px" }}>
                        {r.status === "active"
                          ? <span style={badgeStyle("rgba(16,185,129,0.1)", "#059669")}>正常</span>
                          : <span style={badgeStyle("rgba(239,68,68,0.08)", "var(--danger)")}>已停用</span>}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {r.quota_limit != null ? `${formatCny(r.quota_limit)}${r.quota_period === "monthly" ? "/月" : ""}` : "不限"}
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        {r.quota_limit != null ? (
                          <span style={{ color: r.quota_used >= r.quota_limit ? "var(--danger)" : "var(--text-secondary)" }}>
                            {formatCny(r.quota_used)}
                            <span style={{ color: "var(--text-tertiary)" }}> ({Math.min(100, Math.round((r.quota_used / Math.max(r.quota_limit, 0.000001)) * 100))}%)</span>
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-secondary)" }}>{formatCny(r.quota_used)}</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{r.key_count}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        {(() => {
                          const a = parseAllowed(r.allowed_models);
                          if (a == null) return <span style={badgeStyle("rgba(16,185,129,0.1)", "#059669")}>全部</span>;
                          if (a.length === 0) return <span style={badgeStyle("rgba(239,68,68,0.08)", "var(--danger)")}>无</span>;
                          return <span style={{ color: "var(--text-secondary)" }}>{a.length} 个</span>;
                        })()}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                        {r.last_active ? new Date(r.last_active).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }}
                            onClick={() => { setEditQuota(r); setQuotaInput(r.quota_limit == null ? "" : String(r.quota_limit)); setQuotaPeriodInput(r.quota_period || "total"); }}>
                            限额
                          </button>
                          <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }}
                            onClick={() => { setEditModels(r); setEditModelsValue(parseAllowed(r.allowed_models) ?? []); }}>
                            模型权限
                          </button>
                          <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }}
                            onClick={() => { setResetTarget(r); setResetPasswordValue(genPassword()); }}>
                            重置密码
                          </button>
                          {r.status === "active" ? (
                            <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px", color: "var(--danger)" }}
                              onClick={() => patchSub(r.id, { status: "suspended" }, `已停用 ${r.username}，其密钥立即失效`)}>
                              停用
                            </button>
                          ) : (
                            <>
                              <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px", color: "#059669" }}
                                onClick={() => patchSub(r.id, { status: "active" }, `已恢复 ${r.username}`)}>
                                恢复
                              </button>
                              <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px", color: "var(--danger)" }}
                                onClick={() => setDeleteTarget(r)}>
                                删除
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 本月分账 */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>本月消费分账</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>金额按交易流水统计；明细可在账单管理导出 CSV（含归属账号列）</div>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["账号", "消费金额", "调用次数", "Token 数"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((b) => (
                    <tr key={b.account_id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", color: "var(--text-primary)", fontWeight: b.is_owner ? 600 : 400 }}>
                        {b.is_owner ? `${b.nickname}（主账号）` : b.username || b.nickname}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--text-primary)" }}>{formatCny(b.amount_cny)}</td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{b.call_count}</td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{b.total_tokens.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 创建弹窗 */}
      {showCreate && (
        <div style={modalOverlay} onClick={() => setShowCreate(false)}>
          <div style={{ ...modalBox, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>创建子账号</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>用户名（3-32 位字母/数字/_-，用于登录）</label>
              <input className="input" style={inputStyle} value={form.username} placeholder="例如 team-dev1"
                onChange={(e) => setForm({ ...form, username: e.target.value.trim() })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>初始密码（已自动生成，可修改）</label>
              <input className="input" style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>昵称（可选）</label>
              <input className="input" style={inputStyle} value={form.nickname} placeholder="默认同用户名"
                onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
            </div>
            <div style={{ marginBottom: 20, display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>消费限额（元，留空=不限）</label>
                <input className="input" style={inputStyle} type="number" min="0" step="0.01" value={form.quotaLimit} placeholder="不限"
                  onChange={(e) => setForm({ ...form, quotaLimit: e.target.value })} />
              </div>
              <div style={{ width: 120 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>限额周期</label>
                <select className="input" style={inputStyle} value={form.quotaPeriod} disabled={form.quotaLimit === ""}
                  onChange={(e) => setForm({ ...form, quotaPeriod: e.target.value })}>
                  <option value="total">累计</option>
                  <option value="monthly">每月</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>可用模型（默认无，需勾选授权后子账号方可调用）</label>
              <ModelPicker options={models} value={form.allowedModels} onChange={(next) => setForm({ ...form, allowedModels: next })} />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-ghost" style={{ padding: "9px 16px", fontSize: 13 }} onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn-primary" style={{ padding: "9px 16px", fontSize: 13, opacity: creating ? 0.7 : 1 }} disabled={creating} onClick={createSub}>
                {creating ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 凭据展示（仅此一次） */}
      {createdCred && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>子账号凭据</h3>
            <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 16 }}>密码仅展示这一次，请立即复制发给使用者</p>
            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, fontFamily: "var(--font-mono)", fontSize: 13, marginBottom: 16, lineHeight: 1.9 }}>
              <div>用户名：{createdCred.username}</div>
              <div>密码：{createdCred.password}</div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>登录入口：{typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"}（选「子账号」tab）</div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-ghost" style={{ padding: "9px 16px", fontSize: 13 }}
                onClick={() => {
                  navigator.clipboard?.writeText(`nexusflow 子账号\n用户名：${createdCred.username}\n密码：${createdCred.password}\n登录：${window.location.origin}/login（子账号 tab）`);
                }}>
                复制凭据
              </button>
              <button className="btn-primary" style={{ padding: "9px 16px", fontSize: 13 }} onClick={() => setCreatedCred(null)}>我已保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 限额编辑 */}
      {editQuota && (
        <div style={modalOverlay} onClick={() => setEditQuota(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>设置限额 — {editQuota.username}</h3>
            <div style={{ marginBottom: 14, display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>限额（元，留空=不限）</label>
                <input className="input" style={inputStyle} type="number" min="0" step="0.01" value={quotaInput} placeholder="不限"
                  onChange={(e) => setQuotaInput(e.target.value)} />
              </div>
              <div style={{ width: 120 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>周期</label>
                <select className="input" style={inputStyle} value={quotaPeriodInput} disabled={quotaInput === ""}
                  onChange={(e) => setQuotaPeriodInput(e.target.value)}>
                  <option value="total">累计</option>
                  <option value="monthly">每月</option>
                </select>
              </div>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 18 }}>已用 {formatCny(editQuota.quota_used)}；改限额即时生效</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-ghost" style={{ padding: "9px 16px", fontSize: 13 }} onClick={() => setEditQuota(null)}>取消</button>
              <button className="btn-primary" style={{ padding: "9px 16px", fontSize: 13 }}
                onClick={async () => {
                  await patchSub(editQuota.id, {
                    quotaLimit: quotaInput === "" ? null : Number(quotaInput),
                    ...(quotaInput !== "" ? { quotaPeriod: quotaPeriodInput } : {}),
                  }, "限额已更新");
                  setEditQuota(null);
                }}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模型权限编辑 */}
      {editModels && (
        <div style={modalOverlay} onClick={() => setEditModels(null)}>
          <div style={{ ...modalBox, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>模型权限 — {editModels.username}</h3>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14 }}>勾选后该子账号方可调用对应模型；不勾选则无法调用。改动即时生效。</p>
            <ModelPicker options={models} value={editModelsValue} onChange={setEditModelsValue} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
              <button className="btn-ghost" style={{ padding: "9px 16px", fontSize: 13 }} onClick={() => setEditModels(null)}>取消</button>
              <button className="btn-primary" style={{ padding: "9px 16px", fontSize: 13 }}
                onClick={async () => {
                  await patchSub(editModels.id, { allowedModels: editModelsValue }, "模型权限已更新");
                  setEditModels(null);
                }}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重置密码 */}
      {resetTarget && (
        <div style={modalOverlay} onClick={() => setResetTarget(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>重置密码 — {resetTarget.username}</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>重置后该子账号将被登出，需用新密码重新登录</p>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>新密码（已自动生成，可修改）</label>
              <input className="input" style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} value={resetPassword}
                onChange={(e) => setResetPasswordValue(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-ghost" style={{ padding: "9px 16px", fontSize: 13 }} onClick={() => setResetTarget(null)}>取消</button>
              <button className="btn-primary" style={{ padding: "9px 16px", fontSize: 13 }} onClick={doResetPassword}>重置</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <div style={modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>删除子账号 — {deleteTarget.username}</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18, lineHeight: 1.7 }}>
              删除后该子账号的 API 密钥将被移除、无法再登录；历史用量与账单记录保留用于对账。此操作不可恢复。
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-ghost" style={{ padding: "9px 16px", fontSize: 13 }} onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="btn-primary" style={{ padding: "9px 16px", fontSize: 13, background: "var(--danger)" }} onClick={doDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </UserLayout>
  );
}
