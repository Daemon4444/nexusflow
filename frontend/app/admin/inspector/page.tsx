"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, authHeaders } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import UserLayout from "@/components/UserLayout";

interface AdminUser {
  id: string;
  email: string | null;
  nickname: string;
  phone?: string | null;
}

interface CatalogModel {
  id: string;
  name: string;
  category?: string;
  provider?: string;
}

interface LogRow {
  log_id: string;
  user_id: string;
  model: string;
  status: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  latency_ms: number;
  cached_tokens: number;
  cache_creation_tokens: number;
  user_email: string | null;
  user_nickname: string | null;
  time: string;
}

interface LogDetail {
  request: string | null;
  response: string | null;
}

type RangeKey = "1h" | "24h" | "7d" | "30d";

const RANGE_OPTIONS: { key: RangeKey; label: string; ms: number }[] = [
  { key: "1h", label: "近 1 小时", ms: 60 * 60 * 1000 },
  { key: "24h", label: "近 24 小时", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "近 7 天", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "近 30 天", ms: 30 * 24 * 60 * 60 * 1000 },
];

function parseSSE(s: string): string {
  if (!s) return "";
  let out = "";
  for (const line of s.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const body = t.slice(5).trim();
    if (!body || body === "[DONE]") continue;
    try {
      const j = JSON.parse(body);
      const d = j.choices?.[0]?.delta?.content;
      if (typeof d === "string") out += d;
    } catch {
      /* skip malformed chunk */
    }
  }
  return out;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function InspectorPage() {
  const { user, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [models, setModels] = useState<CatalogModel[]>([]);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [range, setRange] = useState<RangeKey>("7d");

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [detailNote, setDetailNote] = useState("");

  useEffect(() => {
    if (!user) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const [uRes, mRes] = await Promise.all([
          fetchAPI("/api/admin/users", { headers: authHeaders(), signal: ctrl.signal }),
          fetchAPI("/api/models", { headers: authHeaders(), signal: ctrl.signal }),
        ]);
        if (uRes.success && Array.isArray(uRes.data)) {
          const list = (uRes.data as AdminUser[]).slice().sort((a, b) => {
            const aKey = a.email || a.nickname || a.id;
            const bKey = b.email || b.nickname || b.id;
            return aKey.localeCompare(bKey);
          });
          setUsers(list);
        }
        if (mRes.success && Array.isArray(mRes.data)) {
          setModels((mRes.data as CatalogModel[]).slice().sort((a, b) => a.id.localeCompare(b.id)));
        }
      } catch {
        /* ignore on abort */
      }
    })();
    return () => ctrl.abort();
  }, [user]);

  const runSearch = useCallback(async () => {
    if (!selectedUserId) {
      setSearchErr("请先选择用户");
      return;
    }
    setSearching(true);
    setSearchErr("");
    setHasSearched(true);
    setExpandedId(null);
    setDetail(null);
    try {
      const rangeMs = RANGE_OPTIONS.find((r) => r.key === range)?.ms ?? 7 * 24 * 60 * 60 * 1000;
      const from = new Date(Date.now() - rangeMs).toISOString();
      const params = new URLSearchParams({
        user_id: selectedUserId,
        from,
        limit: "200",
      });
      if (selectedModel) params.set("model", selectedModel);
      const res = await fetchAPI(`/api/admin/logs/search?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (res.success) {
        setLogs((res.data as LogRow[]) || []);
      } else {
        setLogs([]);
        setSearchErr(res.message || "查询失败");
      }
    } catch (e: any) {
      setSearchErr(e?.message || "网络错误");
    } finally {
      setSearching(false);
    }
  }, [selectedUserId, selectedModel, range]);

  const toggleRow = useCallback(
    async (row: LogRow) => {
      if (expandedId === row.log_id) {
        setExpandedId(null);
        setDetail(null);
        setDetailNote("");
        return;
      }
      setExpandedId(row.log_id);
      setDetail(null);
      setDetailLoading(true);
      setDetailErr("");
      setDetailNote("");
      try {
        const res = await fetchAPI(`/api/admin/logs/${encodeURIComponent(row.log_id)}/detail`, {
          headers: authHeaders(),
        });
        if (res.success) {
          setDetail((res.data as LogDetail) || { request: null, response: null });
          if (res.note) setDetailNote(res.note);
        } else {
          setDetailErr(res.message || "加载失败");
        }
      } catch (e: any) {
        setDetailErr(e?.message || "网络错误");
      } finally {
        setDetailLoading(false);
      }
    },
    [expandedId]
  );

  const stats = useMemo(() => {
    if (logs.length === 0) return null;
    const success = logs.filter((l) => l.status === "success").length;
    const tokens = logs.reduce((s, l) => s + (l.total_tokens || 0), 0);
    const cost = logs.reduce((s, l) => s + Number(l.cost || 0), 0);
    const cached = logs.reduce((s, l) => s + (l.cached_tokens || 0), 0);
    return { count: logs.length, success, tokens, cost, cached };
  }, [logs]);

  if (authLoading) {
    return (
      <UserLayout>
        <div style={{ padding: 40, color: "var(--text-tertiary)" }}>加载中…</div>
      </UserLayout>
    );
  }
  if (!user) return null;

  return (
    <UserLayout>
      <div style={{ padding: "28px 32px 80px", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.3px", margin: 0 }}>
            请求查看
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 6 }}>
            按用户 + 模型筛选历史调用,点击行展开查看 request / response 原文(来自 SLS)。
          </p>
        </div>

        {/* 筛选栏 */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
            background: "var(--bg-elevated, var(--bg-card, #fff))",
            marginBottom: 18,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>用户</label>
            <select
              className="select"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={{ minWidth: 260, padding: "8px 10px" }}
            >
              <option value="">— 请选择 —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email || u.nickname || u.id}
                  {u.nickname && u.email ? `  ·  ${u.nickname}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>模型</label>
            <select
              className="select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{ minWidth: 220, padding: "8px 10px" }}
            >
              <option value="">全部模型</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>时间范围</label>
            <div style={{ display: "flex", gap: 4 }}>
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={range === r.key ? "btn-primary" : "btn-secondary"}
                  style={{
                    padding: "7px 12px",
                    fontSize: 12,
                    fontWeight: range === r.key ? 600 : 500,
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={runSearch}
            disabled={searching || !selectedUserId}
            className="btn-primary"
            style={{ padding: "9px 22px", fontSize: 13, fontWeight: 600 }}
          >
            {searching ? "查询中…" : "查询"}
          </button>
        </div>

        {searchErr && (
          <div
            style={{
              marginBottom: 12,
              padding: "8px 12px",
              border: "1px solid var(--danger-border)",
              background: "var(--danger-bg)",
              color: "var(--danger)",
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            {searchErr}
          </div>
        )}

        {/* 统计 */}
        {stats && (
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <Stat label="调用次数" value={`${stats.count}`} />
            <Stat label="成功" value={`${stats.success}`} />
            <Stat label="总 Tokens" value={stats.tokens.toLocaleString()} />
            <Stat label="Cache Tokens" value={stats.cached.toLocaleString()} />
            <Stat label="消费 $" value={stats.cost.toFixed(4)} />
          </div>
        )}

        {/* 列表 */}
        {hasSearched && !searching && logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            无匹配记录
          </div>
        ) : (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
              background: "var(--bg-elevated, var(--bg-card, #fff))",
            }}
          >
            {logs.map((row, idx) => {
              const isOpen = expandedId === row.log_id;
              return (
                <div key={row.log_id}>
                  <div
                    onClick={() => toggleRow(row)}
                    className="table-row"
                    style={{
                      padding: "11px 14px",
                      display: "grid",
                      gridTemplateColumns: "150px minmax(140px, 1fr) 120px 80px 90px 80px 90px 30px",
                      gap: 10,
                      alignItems: "center",
                      fontSize: 12.5,
                      cursor: "pointer",
                      borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{row.time}</span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{row.model}</span>
                    <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.user_email || row.user_nickname || row.user_id.slice(0, 8)}
                    </span>
                    <span>
                      <StatusBadge status={row.status} />
                    </span>
                    <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                      {row.total_tokens.toLocaleString()} tok
                    </span>
                    <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                      {row.cached_tokens > 0 ? `${row.cached_tokens.toLocaleString()} cache` : "—"}
                    </span>
                    <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                      ${Number(row.cost || 0).toFixed(4)}
                    </span>
                    <span style={{ color: "var(--text-tertiary)", textAlign: "right" }}>{isOpen ? "▾" : "▸"}</span>
                  </div>
                  {isOpen && (
                    <div
                      style={{
                        borderTop: "1px solid var(--border)",
                        background: "var(--bg-secondary, #f8fafc)",
                        padding: 14,
                      }}
                    >
                      <DetailPanel
                        loading={detailLoading}
                        error={detailErr}
                        note={detailNote}
                        detail={detail}
                        latencyMs={row.latency_ms}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </UserLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 14px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-elevated, var(--bg-card, #fff))",
        minWidth: 100,
      }}
    >
      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontWeight: 600, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return <span className="badge badge-success">success</span>;
  if (status === "error") return <span className="badge badge-danger">error</span>;
  return <span className="badge badge-warning">{status}</span>;
}

function DetailPanel({
  loading,
  error,
  note,
  detail,
  latencyMs,
}: {
  loading: boolean;
  error: string;
  note: string;
  detail: LogDetail | null;
  latencyMs: number;
}) {
  if (loading) {
    return <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>加载原文中…</div>;
  }
  if (error) {
    return <div style={{ fontSize: 12, color: "var(--danger)" }}>加载失败:{error}</div>;
  }
  if (!detail) {
    return <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>无数据</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {note && (
        <div
          style={{
            fontSize: 11.5,
            padding: "6px 10px",
            background: "var(--warning-bg)",
            color: "var(--warning)",
            border: "1px solid var(--warning-border)",
            borderRadius: 6,
          }}
        >
          {note}
        </div>
      )}

      {latencyMs > 0 && (
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>延迟: {latencyMs} ms</div>
      )}

      <RequestView raw={detail.request} />
      <ResponseView raw={detail.response} />
    </div>
  );
}

function RequestView({ raw }: { raw: string | null }) {
  let parsed: any = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* keep null */
    }
  }

  return (
    <div>
      <SectionHeader label="Request" />
      {!raw && <Empty text="(无 request)" />}
      {raw && !parsed && <Pre text={raw} />}
      {parsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <KeyValue k="model" v={parsed.model} />
          {Array.isArray(parsed.messages) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {parsed.messages.map((m: any, i: number) => (
                <MessageBlock key={i} index={i} role={m.role} content={m.content} />
              ))}
            </div>
          )}
          {parsed.stream !== undefined && <KeyValue k="stream" v={String(parsed.stream)} />}
          {parsed.temperature !== undefined && <KeyValue k="temperature" v={String(parsed.temperature)} />}
        </div>
      )}
    </div>
  );
}

function ResponseView({ raw }: { raw: string | null }) {
  if (!raw) {
    return (
      <div>
        <SectionHeader label="Response" />
        <Empty text="(无 response)" />
      </div>
    );
  }

  const sseParsed = parseSSE(raw);
  let asJson: any = null;
  if (!sseParsed) {
    try {
      asJson = JSON.parse(raw);
    } catch {
      /* keep null, show raw */
    }
  }

  return (
    <div>
      <SectionHeader label="Response" />
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>
        {sseParsed ? `(SSE 解析 {sseParsed.length} 字符)` : asJson ? `(JSON)` : `(原文 ${raw.length} 字符)`}
      </div>
      {sseParsed ? (
        <Pre text={sseParsed} />
      ) : asJson ? (
        <Pre text={JSON.stringify(asJson, null, 2)} />
      ) : (
        <Pre text={raw} />
      )}
    </div>
  );
}

function MessageBlock({ index, role, content }: { index: number; role: string; content: any }) {
  if (typeof content === "string") {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10, background: "var(--bg-card, #fff)" }}>
        <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 4 }}>
          msg[{index}] · {role}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {content}
        </div>
      </div>
    );
  }

  if (Array.isArray(content)) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10, background: "var(--bg-card, #fff)" }}>
        <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 6 }}>
          msg[{index}] · {role} · {content.length} parts
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {content.map((part: any, p: number) => {
            if (part?.type === "text") {
              return (
                <div key={p} style={{ fontSize: 12.5, color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  <Tag color="info">text</Tag> {part.text}
                </div>
              );
            }
            if (part?.type === "image_url") {
              const size = part.image_url?.url?.length || 0;
              return (
                <div key={p} style={{ fontSize: 12 }}>
                  <Tag color="info">image</Tag>{" "}
                  <span style={{ color: "var(--text-secondary)" }}>图片 {formatBytes(size)}</span>
                </div>
              );
            }
            return (
              <div key={p} style={{ fontSize: 12 }}>
                <Tag color="info">{part?.type || "unknown"}</Tag>{" "}
                <span style={{ color: "var(--text-tertiary)" }}>{JSON.stringify(part).slice(0, 100)}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10, fontSize: 12 }}>
      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 4 }}>
        msg[{index}] · {role}
      </div>
      <Pre text={JSON.stringify(content, null, 2)} />
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "var(--text-secondary)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        marginBottom: 8,
        paddingBottom: 4,
        borderBottom: "1px solid var(--border)",
      }}
    >
      {label}
    </div>
  );
}

function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ fontSize: 12.5, color: "var(--text-primary)" }}>
      <span style={{ color: "var(--text-tertiary)" }}>{k}:</span> <code style={{ fontSize: 12 }}>{v}</code>
    </div>
  );
}

function Tag({ color, children }: { color: "info"; children: React.ReactNode }) {
  return (
    <span
      className={`badge badge-${color}`}
      style={{ fontSize: 10, padding: "1px 6px" }}
    >
      {children}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{text}</div>;
}

function Pre({ text }: { text: string }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 10,
        background: "var(--bg-secondary, #f8fafc)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontSize: 11.5,
        lineHeight: 1.5,
        color: "var(--text-primary)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 480,
        overflowY: "auto",
        fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
      }}
    >
      {text}
    </pre>
  );
}
