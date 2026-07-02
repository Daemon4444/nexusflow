"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { authHeaders } from "@/lib/auth";

interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  category: string;
  promptPrice: number;
  completionPrice: number;
  contextLength: number;
  maxOutput: number;
  _source?: "static" | "overridden" | "added";
  [k: string]: unknown;
}

interface OverrideRow {
  id: string;
  action: "upsert" | "disable";
  enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

const NEW_TEMPLATE = `{
  "id": "provider-model-id",
  "name": "显示名称",
  "provider": "通义千问",
  "description": "",
  "category": "大语言模型",
  "contextLength": 131072,
  "promptPrice": 0,
  "completionPrice": 0,
  "maxOutput": 8192,
  "tags": [],
  "supported": ["文本"]
}`;

const SOURCE_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  static: { label: "默认", bg: "rgba(148,163,184,0.15)", fg: "#94a3b8" },
  overridden: { label: "已覆盖", bg: "rgba(250,204,21,0.15)", fg: "#fde68a" },
  added: { label: "新增", bg: "rgba(52,211,153,0.15)", fg: "#6ee7b7" },
};

export default function ModelCatalogManager() {
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [disabledIds, setDisabledIds] = useState<string[]>([]);
  const [staticCount, setStaticCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTitle, setEditorTitle] = useState("");
  const [editorText, setEditorText] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAPI("/api/admin/models", { headers: authHeaders() });
      if (res.success) {
        setModels(res.data.models || []);
        setOverrides(res.data.overrides || []);
        setDisabledIds(res.data.disabledIds || []);
        setStaticCount(res.data.staticCount || 0);
      } else {
        setError(res.message || "加载失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3500); };

  const openNew = () => {
    setEditorTitle("新增模型");
    setEditorText(NEW_TEMPLATE);
    setEditorOpen(true);
  };

  const openEdit = (m: CatalogModel) => {
    setEditorTitle(`编辑：${m.id}`);
    const { _source, ...clean } = m;
    setEditorText(JSON.stringify(clean, null, 2));
    setEditorOpen(true);
  };

  const save = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(editorText);
    } catch (e) {
      setError("JSON 格式错误：" + (e as Error).message);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetchAPI("/api/admin/models", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (res.success) {
        flash(res.message || "已保存");
        setEditorOpen(false);
        await load();
      } else {
        setError(res.message || "保存失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  };

  const disableModel = async (id: string) => {
    if (!window.confirm(`确定从目录中下架「${id}」？用户将无法再看到/调用它。`)) return;
    setBusyId(id);
    try {
      const res = await fetchAPI(`/api/admin/models/${encodeURIComponent(id)}/disable`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.success) { flash(res.message); await load(); } else { setError(res.message); }
    } finally { setBusyId(""); }
  };

  const removeOverride = async (id: string) => {
    if (!window.confirm(`确定移除「${id}」的覆盖/自定义？默认模型会恢复为内置版本；新增的模型会被删除。`)) return;
    setBusyId(id);
    try {
      const res = await fetchAPI(`/api/admin/models/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.success) { flash(res.message); await load(); } else { setError(res.message); }
    } finally { setBusyId(""); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) =>
      m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q)
    );
  }, [models, search]);

  const overrideIds = new Set(overrides.filter((o) => o.action === "upsert" && o.enabled).map((o) => o.id));

  return (
    <div style={{ color: "#e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>模型目录</h2>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "4px 0 0" }}>
            对外服务与计费共用的真实目录。内置 {staticCount} 个模型，当前 {models.length} 个生效，
            {overrideIds.size} 个自定义/覆盖，{disabledIds.length} 个已下架。改动即时生效（各节点 10 秒内同步）。
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 id / 名称 / 供应商"
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, minWidth: 200 }}
          />
          <button onClick={load} style={btn("#334155")}>刷新</button>
          <button onClick={openNew} style={btn("#2563eb")}>+ 新增模型</button>
        </div>
      </div>

      {msg && <div style={banner("rgba(52,211,153,0.12)", "#6ee7b7")}>{msg}</div>}
      {error && <div style={banner("rgba(248,113,113,0.12)", "#fca5a5")}>{error}</div>}

      {disabledIds.length > 0 && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, fontSize: 13 }}>
          已下架：{disabledIds.map((id) => (
            <span key={id} style={{ marginRight: 10 }}>
              {id} <button onClick={() => removeOverride(id)} style={{ ...linkBtn, color: "#6ee7b7" }} disabled={busyId === id}>恢复</button>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>加载中…</div>
      ) : (
        <div style={{ border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1.4fr 1fr 1.2fr 0.9fr 1.6fr", padding: "10px 14px", background: "#0f172a", fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
            <span>模型</span><span>供应商</span><span>类别</span><span style={{ textAlign: "right" }}>输入/输出(¥/M)</span><span style={{ textAlign: "center" }}>来源</span><span style={{ textAlign: "right" }}>操作</span>
          </div>
          {filtered.map((m) => {
            const badge = SOURCE_BADGE[m._source || "static"];
            const canRevert = m._source === "overridden" || m._source === "added";
            return (
              <div key={m.id} style={{ display: "grid", gridTemplateColumns: "2.2fr 1.4fr 1fr 1.2fr 0.9fr 1.6fr", padding: "12px 14px", borderTop: "1px solid #1e293b", fontSize: 13, alignItems: "center" }}>
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "#fff" }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>{m.id}</div>
                </span>
                <span style={{ color: "#cbd5e1" }}>{m.provider}</span>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>{m.category}</span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.promptPrice} / {m.completionPrice}</span>
                <span style={{ textAlign: "center" }}>
                  <span style={{ padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.fg }}>{badge.label}</span>
                </span>
                <span style={{ textAlign: "right", display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => openEdit(m)} style={linkBtn} disabled={busyId === m.id}>编辑</button>
                  {canRevert && <button onClick={() => removeOverride(m.id)} style={{ ...linkBtn, color: "#fbbf24" }} disabled={busyId === m.id}>{m._source === "added" ? "删除" : "恢复默认"}</button>}
                  <button onClick={() => disableModel(m.id)} style={{ ...linkBtn, color: "#fca5a5" }} disabled={busyId === m.id}>下架</button>
                </span>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>无匹配模型</div>}
        </div>
      )}

      {editorOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={() => !saving && setEditorOpen(false)}>
          <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, width: "min(720px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, color: "#fff" }}>{editorTitle}</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#94a3b8" }}>
              直接编辑模型 JSON。必填：id / name / provider；价格字段必须为 ≥0 的数字。保存后即时生效，出问题可用「恢复默认/删除」撤销。
            </p>
            <textarea
              value={editorText}
              onChange={(e) => setEditorText(e.target.value)}
              spellCheck={false}
              style={{ flex: 1, minHeight: 320, fontFamily: "monospace", fontSize: 13, lineHeight: 1.5, padding: 12, borderRadius: 8, border: "1px solid #334155", background: "#020617", color: "#e2e8f0", resize: "vertical" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button onClick={() => setEditorOpen(false)} disabled={saving} style={btn("#334155")}>取消</button>
              <button onClick={save} disabled={saving} style={btn("#2563eb")}>{saving ? "保存中…" : "保存并生效"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { padding: "8px 16px", borderRadius: 8, border: "none", background: bg, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
}
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#60a5fa", fontSize: 13, cursor: "pointer", padding: 0 };
function banner(bg: string, fg: string): React.CSSProperties {
  return { padding: "10px 14px", borderRadius: 8, background: bg, color: fg, fontSize: 13, marginBottom: 12 };
}
