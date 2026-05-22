"use client";

import { useEffect, useState } from "react";
import { useAuth, authHeaders } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import UserLayout from "@/components/UserLayout";
import { useI18n } from "@/lib/i18n";
import { ErrorState, LoadingState } from "@/components/AppState";
import { getFirstRunState } from "@/lib/firstRun";
import { getCurlExample, getJavascriptExample } from "@/components/FirstRunPanel";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string | null;
  usageCount: number;
  rateLimit: number;
}

// Helper to mask API key for display
function maskApiKey(key: string): string {
  if (key.length <= 20) return key;
  return `${key.slice(0, 12)}••••••••${key.slice(-8)}`;
}

export default function KeysPage() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyLimit, setNewKeyLimit] = useState(60);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    loadKeys(controller.signal);
    return () => controller.abort();
  }, [user]);

  async function loadKeys(signal?: AbortSignal) {
    setDataLoading(true);
    setError("");
    try {
      const res = await fetchAPI("/api/keys", { headers: authHeaders(), signal });
      if (res.success) {
        setKeys(res.data);
      } else {
        setError(res.message || "API Key 加载失败");
      }
    } catch {
      setError("无法连接 Key 服务，请稍后重试");
    } finally {
      setDataLoading(false);
    }
  }

  async function createKey() {
    if (!newKeyName.trim()) return;
    try {
      const res = await fetchAPI("/api/keys", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: newKeyName, rateLimit: newKeyLimit }),
      });
      if (res.success) {
        setCreatedKey(res.data);
        setNewKeyName("");
        setNewKeyLimit(60);
        setShowCreate(false);
        setError("");
        await loadKeys();
      } else {
        setError(res.message || "创建 API Key 失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建 API Key 失败");
    }
  }

  async function deleteKey(id: string) {
    try {
      const res = await fetchAPI(`/api/keys/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.success) {
        setDeleteTarget(null);
        await loadKeys();
      } else {
        setError(res.message || "删除 API Key 失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除 API Key 失败");
    }
  }

  function copyKey(key: string, id: string) {
    try {
      const ta = document.createElement("textarea");
      ta.value = key;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt(t("copyKeyPrompt"), key);
    }
  }

  function formatDate(dateStr: string) {
    const loc = locale === "zh" ? "zh-CN" : "en-US";
    return new Date(dateStr).toLocaleString(loc, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const firstRun = getFirstRunState({
    apiKeyCount: keys.length,
    balance: user?.balance || 0,
    recentUsageCount: keys.reduce((sum, item) => sum + (item.usageCount || 0), 0),
  });
  const exampleModel = "qwen-plus";

  return (
    <UserLayout>
      <div className="usr-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>{t("keysTitle")}</h1>
          <p>{t("keysDesc")}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t("createKey")}
        </button>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="usr-section animate-fadeIn" style={{ marginBottom: 20 }}>
          <div className="usr-section-header">
            <h3>{t("createNewKey")}</h3>
            <button
              onClick={() => setShowCreate(false)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-tertiary)", fontSize: 18, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <div className="usr-section-body">
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  {t("keyName")}
                </label>
                <input
                  className="input"
                  placeholder={t("keyNamePlaceholder")}
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createKey()}
                  style={{ fontSize: 13 }}
                />
              </div>
              <div style={{ width: 130 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  {t("rateLimit")}
                </label>
                <input
                  className="input"
                  type="number"
                  value={newKeyLimit}
                  onChange={(e) => setNewKeyLimit(Number(e.target.value))}
                  style={{ fontSize: 13 }}
                />
              </div>
              <button className="btn-primary" onClick={createKey} style={{ fontSize: 13, padding: "9px 20px" }}>
                {t("create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {createdKey && (
        <div className="usr-section animate-fadeIn" style={{ marginBottom: 20, borderColor: "rgba(16,185,129,0.3)" }}>
          <div className="usr-section-header">
            <h3>API Key 已创建</h3>
            <button
              onClick={() => setCreatedKey(null)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-tertiary)", fontSize: 18, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <div className="usr-section-body">
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)" }}>
              请立即复制保存。出于安全原因，关闭后将只显示脱敏 Key。
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 14px", background: "#1c1917", borderRadius: 8, border: "1px solid #30363d" }}>
              <code style={{ flex: 1, fontSize: 12.5, color: "#e7e5e4", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                {createdKey.key}
              </code>
              <button className="btn-secondary" style={{ padding: "5px 14px", flexShrink: 0, fontSize: 12 }} onClick={() => copyKey(createdKey.key, createdKey.id)}>
                {copiedId === createdKey.id ? t("copied") : t("copy")}
              </button>
            </div>
            <div className="key-next-call">
              <div className="key-next-call-head">
                <strong>下一步：复制请求并完成第一次调用</strong>
                <span>默认模型 {exampleModel}</span>
              </div>
              <pre>{getCurlExample(createdKey.key, exampleModel)}</pre>
              <details>
                <summary>JavaScript 示例</summary>
                <pre>{getJavascriptExample(createdKey.key, exampleModel)}</pre>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* Keys list */}
      {dataLoading ? (
        <LoadingState title={t("loading")} compact />
      ) : error ? (
        <ErrorState title="API Key 加载失败" message={error} onAction={loadKeys} compact />
      ) : keys.length === 0 ? (
        <div className="usr-section" style={{ textAlign: "center", padding: 60 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" style={{ marginBottom: 12 }}>
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
            {t("noKeys")}
          </p>
          <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ fontSize: 13 }}>
            {t("createFirstKey")}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {keys.map((key) => (
            <div key={key.id} className="usr-section animate-fadeIn">
              {/* Key header */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 20px 10px",
              }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                    {key.name}
                  </span>
                  <span style={{ marginLeft: 10, fontSize: 12, color: "var(--text-tertiary)" }}>
                    {t("created")} {formatDate(key.createdAt)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                    {key.usageCount.toLocaleString()} {t("calls")}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>|</span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {key.rateLimit} req/min
                  </span>
                  <button className="btn-danger" onClick={() => setDeleteTarget(key)} style={{ fontSize: 12 }}>
                    {t("delete")}
                  </button>
                </div>
              </div>

              {/* Key value */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                margin: "0 20px 14px",
                padding: "10px 14px",
                background: "#1c1917", borderRadius: 8,
                border: "1px solid #30363d",
              }}>
                <code style={{
                  flex: 1, fontSize: 12.5, color: "#e7e5e4",
                  fontFamily: "var(--font-mono)", wordBreak: "break-all",
                }}>
                  {maskApiKey(key.key)}
                </code>
                <span style={{ flexShrink: 0, fontSize: 12, color: "#a8a29e" }}>仅创建时可复制完整 Key</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!createdKey && keys.length > 0 && (
        <div className="usr-section">
          <div className="usr-section-header">
            <div>
              <h3>调用示例</h3>
              <p>Key 只在创建时完整显示；这里使用占位符展示生产请求结构。</p>
            </div>
            <span className="badge badge-info">{firstRun.completedSteps}/3</span>
          </div>
          <div className="usr-section-body">
            <div className="key-next-call" style={{ marginTop: 0 }}>
              <pre>{getCurlExample("sk-air-...", exampleModel)}</pre>
              <details>
                <summary>JavaScript 示例</summary>
                <pre>{getJavascriptExample("sk-air-...", exampleModel)}</pre>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* Security tip */}
      <div style={{
        marginTop: 20, padding: 14,
        background: "rgba(99, 102, 241, 0.04)",
        border: "1px solid rgba(99, 102, 241, 0.1)",
        borderRadius: 8, fontSize: 12.5,
        color: "var(--text-secondary)", lineHeight: 1.7,
      }}>
        <strong style={{ color: "#b5673c" }}>{t("securityTip")}:</strong> {t("securityTipText")}
      </div>

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-key-title">
            <h3 id="delete-key-title">删除 API Key</h3>
            <p>确定删除「{deleteTarget.name}」吗？删除后使用这个 Key 的请求会立即失败。</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="btn-danger" onClick={() => deleteKey(deleteTarget.id)}>删除</button>
            </div>
          </div>
        </div>
      )}
    </UserLayout>
  );
}
