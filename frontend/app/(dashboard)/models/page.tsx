"use client";

import { useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import Link from "next/link";

interface AIModel {
  id: string; name: string; provider: string; description: string;
  contextLength: number; promptPrice: number; completionPrice: number;
  category: string; tags: string[]; isNew?: boolean; isFeatured?: boolean;
  maxOutput: number; supported: string[];
}

const categoryColors: Record<string, string> = {
  "大语言模型": "#b5673c", "推理模型": "#c44033", "多模态模型": "#7c6a9a",
  "编程模型": "#2563eb", "图像生成": "#db2777", "视频生成": "#ea580c",
  "语音模型": "#16a34a", "向量模型": "#ca8a04", "专业模型": "#64748b",
};

export default function ModelsPage() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("");
  const [loading, setLoading] = useState(true);

  const [allCategories, setAllCategories] = useState<string[]>([]);

  useEffect(() => { loadModels(); }, [selectedCategory, selectedProvider, search, sort]);

  async function loadModels() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.set("category", selectedCategory);
      if (selectedProvider) params.set("provider", selectedProvider);
      if (search) params.set("search", search);
      if (sort) params.set("sort", sort);
      const res = await fetchAPI(`/api/models?${params.toString()}`);
      if (res.success) {
        setModels(res.data);
        setProviders(res.providers || []);
        // 全局分类只在无筛选时更新，避免分类按钮消失
        if (!selectedProvider && selectedCategory === "全部" && !search) {
          setAllCategories(res.categories || []);
        }
      }
    } catch { console.error("加载模型列表失败"); }
    finally { setLoading(false); }
  }

  // 当选了供应商时，只显示该供应商拥有的分类
  const visibleCategories = selectedProvider
    ? [...new Set(models.map((m) => m.category))]
    : allCategories;

  function formatTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
  }

  return (
    <div style={{ padding: "32px 44px", fontFamily: "var(--font-sans)" }}>
      {/* Header */}
      <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--border)" }}>
        <div className="section-label">Model Catalog</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <h1 className="page-title" style={{ margin: 0 }}>模型列表</h1>
          {!loading && (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", background: "var(--accent-bg)", padding: "3px 10px", borderRadius: 20, border: "1px solid var(--accent-border)" }}>
              {models.length} 个模型
            </span>
          )}
        </div>
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", maxWidth: 600, margin: 0 }}>
          浏览全系列 AI 模型，涵盖文本、推理、视觉、编程、图像、视频、语音等类别
        </p>
      </div>

      {/* Search & Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", maxWidth: 300, flex: 1 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input className="input" style={{ paddingLeft: 36 }} placeholder="搜索模型..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select" style={{ minWidth: 120 }} value={selectedProvider} onChange={(e) => { setSelectedProvider(e.target.value); setSelectedCategory("全部"); }}>
          <option value="">所有供应商</option>
          {providers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="select" style={{ minWidth: 120 }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="">默认排序</option>
          <option value="price-asc">价格升序</option>
          <option value="price-desc">价格降序</option>
          <option value="context">上下文长度</option>
          <option value="name">名称</option>
        </select>
      </div>

      {/* Category Pills */}
      <div style={{ display: "flex", gap: 7, marginBottom: 24, flexWrap: "wrap" }}>
        {["全部", ...visibleCategories].map((cat) => {
          const active = selectedCategory === cat;
          const color = cat !== "全部" ? categoryColors[cat] || "var(--accent)" : "var(--accent)";
          return (
            <button key={cat} onClick={() => setSelectedCategory(cat)} style={{
              padding: "6px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: active ? 600 : 500,
              cursor: "pointer", border: "1px solid", transition: "all 0.12s", fontFamily: "inherit",
              borderColor: active ? `${color}40` : "var(--border)",
              background: active ? `${color}0e` : "var(--bg)",
              color: active ? color : "var(--text-secondary)",
              boxShadow: active ? `0 0 0 1px ${color}25` : "none",
            }}>
              {cat}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 185, borderRadius: 10 }} />)}
        </div>
      ) : models.length === 0 ? (
        <div className="empty-state" style={{ background: "var(--bg-elevated)", borderRadius: 10, border: "1px solid var(--border)" }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, marginBottom: 12 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <div style={{ fontSize: 14 }}>没有找到匹配的模型</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {models.map((model, idx) => {
            const accent = categoryColors[model.category] || "var(--accent)";
            return (
              <Link href={`/models/${encodeURIComponent(model.id)}`} key={model.id}
                className="card animate-fadeIn"
                style={{ animationDelay: `${idx * 20}ms`, opacity: 0, textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}
              >
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: accent, opacity: 0.7, borderRadius: "10px 10px 0 0" }} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 9, gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 550, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>{model.name}</span>
                      {model.isNew && <span className="tag tag-new" style={{ fontSize: 10 }}>NEW</span>}
                      {model.isFeatured && <span className="tag tag-featured" style={{ fontSize: 10 }}>HOT</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{model.provider}</span>
                      <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-tertiary)", flexShrink: 0 }} />
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: accent, background: `${accent}12`, padding: "1px 6px", borderRadius: 4, border: `1px solid ${accent}28` }}>{model.category}</span>
                    </div>
                  </div>
                  <code style={{ fontSize: 10.5, color: "var(--text-tertiary)", background: "var(--bg-elevated)", padding: "3px 7px", borderRadius: 5, border: "1px solid var(--border)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>{model.id}</code>
                </div>

                <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: 10, flex: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {model.description}
                </p>

                {model.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                    {model.tags.slice(0, 4).map((tag) => (
                      <span key={tag} style={{ padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>{tag}</span>
                    ))}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: "10px 0 0", borderTop: "1px solid var(--border)" }}>
                  {[
                    { label: "上下文", value: formatTokens(model.contextLength), color: "var(--text-primary)" },
                    { label: "输入", value: model.promptPrice === 0 ? "免费" : `¥${model.promptPrice}/M`, color: "var(--success)" },
                    { label: "输出", value: model.completionPrice === 0 ? "免费" : `¥${model.completionPrice}/M`, color: "var(--warning)" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 3, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 550, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
