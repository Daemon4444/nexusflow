"use client";

import { useEffect, useState, useRef } from "react";
import { fetchAPI } from "@/lib/api";
import Link from "next/link";

interface PricingTier {
  label: string;
  price: number;
}

interface TokenPricingTier {
  label: string;
  maxTokens: number;
  promptPrice: number;
  completionPrice: number;
}

interface AIModel {
  id: string; name: string; provider: string; description: string;
  contextLength: number; promptPrice: number; completionPrice: number;
  pricingType?: "token" | "per-image" | "per-second";
  pricingTiers?: PricingTier[];
  tokenPricingTiers?: TokenPricingTier[];
  category: string; tags: string[]; isNew?: boolean; isFeatured?: boolean;
  maxOutput: number; supported: string[];
  supportedProtocols?: string[];
  supported_protocols?: string[];
}

export interface ModelsPageProps {
  initialModels: AIModel[];
  initialProviders: string[];
  initialCategories: string[];
}

const categoryColors: Record<string, string> = {
  "LLM": "#2563eb", "Reasoning": "#dc2626", "Multimodal": "#7c3aed",
  "Coding": "#0891b2", "Image Generation": "#db2777", "Video Generation": "#f97316",
  "Embedding": "#0f766e", "Specialized": "#64748b", "Speech": "#7c2d12",
};

const protocolStyles: Record<string, { label: string; color: string; bg: string; border: string }> = {
  "openai/chat-completions": { label: "OpenAI", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  "anthropic/messages": { label: "Anthropic", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  "openai/responses": { label: "Responses", color: "#0f766e", bg: "#f0fdfa", border: "#99f6e4" },
  "openai/embeddings": { label: "Embedding", color: "#0f766e", bg: "#f0fdfa", border: "#99f6e4" },
  "openai/image-generations": { label: "Image", color: "#be185d", bg: "#fdf2f8", border: "#fbcfe8" },
  "openai/audio-speech": { label: "TTS", color: "#7c2d12", bg: "#fff7ed", border: "#fed7aa" },
  "openai/audio-transcriptions": { label: "ASR", color: "#7c2d12", bg: "#fff7ed", border: "#fed7aa" },
  "nexusflow/tasks": { label: "Tasks", color: "#475569", bg: "#f8fafc", border: "#cbd5e1" },
};

function getProtocolBadges(model: AIModel) {
  return model.supportedProtocols || model.supported_protocols || [];
}

export default function ModelsPage({ initialModels, initialProviders, initialCategories }: ModelsPageProps) {
  const [models, setModels] = useState<AIModel[]>(initialModels);
  const [providers, setProviders] = useState<string[]>(initialProviders);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [allCategories, setAllCategories] = useState<string[]>(initialCategories);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const controller = new AbortController();
    loadModels(controller.signal);
    return () => controller.abort();
  }, [selectedCategory, selectedProvider, search, sort]);

  async function loadModels(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.set("category", selectedCategory);
      if (selectedProvider) params.set("provider", selectedProvider);
      if (search) params.set("search", search);
      if (sort) params.set("sort", sort);
      const res = await fetchAPI(`/api/models?${params.toString()}`, { signal });
      if (res.success) {
        setModels(res.data);
        setProviders(res.providers || []);
        // Only update global categories when no filter is active, to avoid category buttons disappearing
        if (!selectedProvider && selectedCategory === "All" && !search) {
          setAllCategories(res.categories || []);
        }
      } else {
        setModels([]);
        setError(res.message || "The model service is temporarily unavailable, please try again later");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setModels([]);
      setError("Unable to connect to the model service, please make sure the backend service is running");
    } finally {
      setLoading(false);
    }
  }

  // When a provider is selected, only show the categories that provider has
  const visibleCategories = selectedProvider
    ? [...new Set(models.map((m) => m.category))]
    : allCategories;
  const categoryCounts = models.reduce<Record<string, number>>((acc, model) => {
    acc[model.category] = (acc[model.category] || 0) + 1;
    return acc;
  }, {});

  function formatTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
    if (n >= 1024) return `${Math.round(n / 1024)}K`;
    return n.toString();
  }

  return (
    <div className="models-page" style={{ padding: "32px 44px", fontFamily: "var(--font-sans)" }}>
      {/* Header */}
      <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--border)" }}>
        <div className="section-label">Model Catalog</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <h1 className="page-title" style={{ margin: 0 }}>Models</h1>
          {!loading && (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", background: "var(--accent-bg)", padding: "3px 10px", borderRadius: 20, border: "1px solid var(--accent-border)" }}>
              {models.length} models
            </span>
          )}
        </div>
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", maxWidth: 720, margin: 0 }}>
          Browse the full range of AI models, covering text, reasoning, vision, coding, image, video, embedding and more
        </p>
      </div>

      {/* Search & Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", maxWidth: 300, flex: 1 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input className="input" style={{ paddingLeft: 36 }} placeholder="Search models..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select" style={{ minWidth: 120 }} value={selectedProvider} onChange={(e) => { setSelectedProvider(e.target.value); setSelectedCategory("All"); }}>
          <option value="">All providers</option>
          {providers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="select" style={{ minWidth: 120 }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="">Default order</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
          <option value="context">Context Length</option>
          <option value="name">Name</option>
        </select>
      </div>

      {/* Category Pills */}
      <div className="model-output-tabs" style={{ display: "flex", gap: 7, marginBottom: 24, flexWrap: "wrap" }}>
        {["All", ...visibleCategories].map((cat) => {
          const active = selectedCategory === cat;
          const color = cat !== "All" ? categoryColors[cat] || "var(--accent)" : "var(--accent)";
          const count = cat === "All" ? models.length : categoryCounts[cat] || 0;
          return (
            <button key={cat} className="model-filter-pill" onClick={() => setSelectedCategory(cat)} style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: active ? 650 : 560,
              cursor: "pointer", border: "1px solid", transition: "all 0.16s", fontFamily: "inherit",
              borderColor: active ? `${color}40` : "var(--border)",
              background: active ? `${color}0e` : "var(--bg)",
              color: active ? color : "var(--text-secondary)",
              boxShadow: active ? `0 0 0 1px ${color}25` : "none",
            }}>
              <span>{cat}</span>
              <span className="model-filter-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="models-grid model-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 185, borderRadius: 10 }} />)}
        </div>
      ) : error ? (
        <div className="empty-state" style={{ background: "rgba(239,68,68,0.06)", borderRadius: 10, border: "1px solid rgba(239,68,68,0.22)" }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" style={{ opacity: 0.8, marginBottom: 12 }}>
            <circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>
          </svg>
          <div style={{ fontSize: 14, fontWeight: 650, color: "var(--text-primary)", marginBottom: 6 }}>Failed to load models</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>{error}</div>
          <button
            onClick={() => loadModels()}
            style={{
              padding: "8px 14px",
              borderRadius: 7,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      ) : models.length === 0 ? (
        <div className="empty-state" style={{ background: "var(--bg-elevated)", borderRadius: 10, border: "1px solid var(--border)" }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, marginBottom: 12 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <div style={{ fontSize: 14 }}>No matching models found</div>
        </div>
      ) : (
        <div className="models-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
          {models.map((model, idx) => {
            const accent = categoryColors[model.category] || "var(--accent)";
            const protocolBadges = getProtocolBadges(model);
            return (
              <Link href={`/models/${encodeURIComponent(model.id)}`} key={model.id}
                className="card model-card animate-fadeIn"
                style={{ animationDelay: `${idx * 20}ms`, opacity: 0, textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", borderTop: `3px solid ${accent}` }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 9, gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="model-card-title-row" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                      <span className="model-card-title" style={{ fontSize: 15, fontWeight: 550, color: "var(--text-primary)", letterSpacing: "0" }}>{model.name}</span>
                      {model.isNew && <span className="tag tag-new" style={{ fontSize: 10 }}>NEW</span>}
                      {model.isFeatured && <span className="tag tag-featured" style={{ fontSize: 10 }}>HOT</span>}
                    </div>
                    <div className="model-card-meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{model.provider}</span>
                      <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-tertiary)", flexShrink: 0 }} />
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: accent, background: `${accent}12`, padding: "1px 6px", borderRadius: 4, border: `1px solid ${accent}28` }}>{model.category}</span>
                    </div>
                  </div>
                  <code style={{ fontSize: 10.5, color: "var(--text-tertiary)", background: "var(--bg-elevated)", padding: "3px 7px", borderRadius: 5, border: "1px solid var(--border)", flexShrink: 1, minWidth: 0, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>{model.id}</code>
                </div>

                {protocolBadges.length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                    {protocolBadges.map((protocol) => {
                      const style = protocolStyles[protocol] || { label: protocol, color: "#475569", bg: "#f8fafc", border: "#cbd5e1" };
                      return (
                        <span key={protocol} title={protocol} style={{
                          padding: "2px 7px",
                          borderRadius: 5,
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: style.color,
                          background: style.bg,
                          border: `1px solid ${style.border}`,
                          fontFamily: "var(--font-mono)",
                        }}>
                          {style.label}
                        </span>
                      );
                    })}
                  </div>
                )}

                <p className="model-card-description" style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: 10, flex: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {model.description}
                </p>

                {model.tags.length > 0 && (
                  <div className="model-card-tags" style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                    {model.tags.slice(0, 4).map((tag) => (
                      <span key={tag} style={{ padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>{tag}</span>
                    ))}
                  </div>
                )}

                <div className="model-card-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: "10px 0 0", borderTop: "1px solid var(--border)" }}>
                  {(() => {
                    const isMedia = model.pricingType === "per-second" || model.pricingType === "per-image";
                    if (isMedia) {
                      const unit = model.pricingType === "per-second" ? "/s" : "/image";
                      return [
                        { label: "Context", value: formatTokens(model.contextLength), color: "var(--text-primary)" },
                        { label: "Price", value: model.promptPrice === 0 ? "Free" : `$${model.promptPrice}${unit}`, color: "var(--success)" },
                        { label: "Billing", value: model.pricingType === "per-second" ? "Per second" : "Per image", color: "var(--warning)" },
                      ];
                    }
                    if (model.tokenPricingTiers && model.tokenPricingTiers.length > 0) {
                      return [
                        { label: "Context", value: formatTokens(model.contextLength), color: "var(--text-primary)" },
                        { label: "Input (tier 1)", value: `$${model.promptPrice}/M`, color: "var(--success)" },
                        { label: "Output (tier 1)", value: `$${model.completionPrice}/M`, color: "var(--warning)" },
                      ];
                    }
                    return [
                      { label: "Context", value: formatTokens(model.contextLength), color: "var(--text-primary)" },
                      { label: "Input", value: model.promptPrice === 0 ? "Free" : `$${model.promptPrice}/M`, color: "var(--success)" },
                      { label: "Output", value: model.completionPrice === 0 ? "Free" : `$${model.completionPrice}/M`, color: "var(--warning)" },
                    ];
                  })().map((s) => (
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
