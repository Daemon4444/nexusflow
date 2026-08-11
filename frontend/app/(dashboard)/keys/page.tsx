"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth, authHeaders } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import UserLayout from "@/components/UserLayout";
import { useI18n } from "@/lib/i18n";
import { ErrorState, LoadingState } from "@/components/AppState";
import { getFirstRunState } from "@/lib/firstRun";
import { getCurlExample, getJavascriptExample } from "@/components/FirstRunPanel";
import { KeyOutlined, PlusOutlined } from "@ant-design/icons";

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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    loadKeys(controller.signal);
    return () => controller.abort();
  }, [user]);

  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

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
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (res.success) {
        setCreatedKey(res.data);
        setNewKeyName("");
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

  function markCopied(id: string) {
    setCopiedId(id);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
  }

  function copyKey(key: string, id: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(key).then(() => markCopied(id)).catch(() => window.prompt(t("copyKeyPrompt"), key));
    } else {
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
    balance: (user?.balance || 0) + (user?.creditBalance || 0),
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
          <PlusOutlined />
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
                <p style={{ margin: "7px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>
                  {locale === "zh"
                    ? "速率额度由当前套餐统一管理；如需提升，请在速率限制页面提交申请。"
                    : "Rate limits are managed by your plan. Request an increase from the Rate Limits page."}
                </p>
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
        <div className="usr-section nf-empty-state">
          <span className="nf-empty-state-icon"><KeyOutlined /></span>
          <h2>{t("noKeys")}</h2>
          <p>
            {locale === "zh" ? "创建独立密钥，在不暴露主账户凭据的情况下调用模型。" : "Create a dedicated key to call models without exposing your account credentials."}
          </p>
          <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ fontSize: 13 }}>
            <PlusOutlined />
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
