"use client";

import { useEffect, useState, useRef } from "react";
import { fetchAPI } from "@/lib/api";
import Link from "next/link";
import "./models.css";

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
  contextLength: number; promptPrice: number | null; completionPrice: number | null;
  lifecycle?: "announced";
  pricingStatus?: "unpublished";
  pricingType?: "token" | "per-image" | "per-second" | "per-10k-characters";
  pricingTiers?: PricingTier[];
  tokenPricingTiers?: TokenPricingTier[];
  category: string; tags: string[]; isNew?: boolean; isFeatured?: boolean;
  maxOutput: number; supported: string[];
  supportedProtocols?: string[];
  supported_protocols?: string[];
  availability?: "available" | "temporarily_unavailable" | "disabled";
  availabilityReason?: string | null;
}

export interface ModelsPageProps {
  initialModels: AIModel[];
  initialProviders: string[];
  initialCategories: string[];
  initialError?: string;
}

const protocolLabels: Record<string, string> = {
  "openai/chat-completions": "OpenAI",
  "anthropic/messages": "Anthropic",
  "openai/responses": "Responses",
  "openai/embeddings": "Embedding",
  "openai/image-generations": "Image",
  "openai/audio-speech": "TTS",
  "openai/audio-transcriptions": "ASR",
  "nexusflow/tasks": "Tasks",
};

function getProtocolBadges(model: AIModel) {
  return model.supportedProtocols || model.supported_protocols || [];
}

export default function ModelsPage({ initialModels, initialProviders, initialCategories, initialError = "" }: ModelsPageProps) {
  const [models, setModels] = useState<AIModel[]>(initialModels);
  const [providers, setProviders] = useState<string[]>(initialProviders);
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

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
        // 全局分类只在无筛选时更新，避免分类按钮消失
        if (!selectedProvider && selectedCategory === "全部" && !search) {
          setAllCategories(res.categories || []);
        }
      } else {
        setModels([]);
        setError(res.message || "模型服务暂时不可用，请稍后重试");
      }
    } catch (err) {
      if (signal?.aborted) return;
      setModels([]);
      setError("无法连接模型服务，请确认后端服务已启动");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  // 当选了供应商时，只显示该供应商拥有的分类
  const visibleCategories = selectedProvider
    ? [...new Set(models.map((m) => m.category))]
    : allCategories;
  const categoryCounts = models.reduce<Record<string, number>>((acc, model) => {
    acc[model.category] = (acc[model.category] || 0) + 1;
    return acc;
  }, {});

  function formatTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
    return n.toString();
  }

  function priceLine(model: AIModel) {
    if (model.promptPrice == null || model.completionPrice == null) return [{ label: "价格", value: "待公布" }];
    const unit = model.pricingType === "per-second" ? "秒" : model.pricingType === "per-10k-characters" ? "万字符" : model.pricingType === "per-image" ? "张" : null;
    if (unit) return [{ label: "价格", value: model.promptPrice === 0 ? "免费" : `¥${model.promptPrice} / ${unit}` }];
    const from = model.tokenPricingTiers && model.tokenPricingTiers.length > 1 ? " 起" : "";
    return [
      { label: "输入", value: model.promptPrice === 0 ? "免费" : `¥${model.promptPrice}${from}` },
      { label: "输出", value: model.completionPrice === 0 ? "免费" : `¥${model.completionPrice}${from}` },
    ];
  }

  const isMedia = (model: AIModel) => model.pricingType === "per-second" || model.pricingType === "per-image" || model.pricingType === "per-10k-characters";

  return (
    <div className="mc">
      <header className="mc-head">
        <h1>模型</h1>
        <p>{models.length > 0 && !selectedProvider && selectedCategory === "全部" && !search ? `${models.length} 个模型，` : ""}一个 Key 按模型能力与可用状态调用。文本模型价格单位为 ¥ / 百万 tokens。</p>
      </header>

      <div className="mc-toolbar">
        <label className="mc-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input placeholder="搜索模型名称或 ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <select className="mc-select" value={selectedProvider} onChange={(e) => { setSelectedProvider(e.target.value); setSelectedCategory("全部"); }} aria-label="供应商">
          <option value="">全部厂商</option>
          {providers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="mc-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="排序">
          <option value="">默认排序</option>
          <option value="price-asc">价格从低到高</option>
          <option value="price-desc">价格从高到低</option>
          <option value="context">上下文最长</option>
          <option value="name">名称</option>
        </select>
      </div>

      <div className="mc-tabs" role="tablist" aria-label="模型类别">
        {["全部", ...visibleCategories].map((cat) => (
          <button key={cat} role="tab" aria-selected={selectedCategory === cat} onClick={() => setSelectedCategory(cat)}>
            {cat}<span>{cat === "全部" ? models.length : categoryCounts[cat] || 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mc-grid">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton mc-skeleton" />)}
        </div>
      ) : error ? (
        <div className="mc-empty">
          <strong>模型列表加载失败</strong>
          <span>{error}</span>
          <button onClick={() => loadModels()}>重试</button>
        </div>
      ) : models.length === 0 ? (
        <div className="mc-empty"><strong>没有找到匹配的模型</strong><span>换个关键词或清空筛选试试。</span></div>
      ) : (
        <div className="mc-grid">
          {models.map((model) => {
            const isUnavailable = model.availability && model.availability !== "available";
            const protocols = getProtocolBadges(model).map((p) => protocolLabels[p] || p);
            return (
              <Link href={`/models/${encodeURIComponent(model.id)}`} key={model.id} className={`mc-card${isUnavailable ? " is-unavailable" : ""}`}>
                <div className="mc-card-top">
                  <div className="mc-card-title">
                    <strong>{model.name}</strong>
                    {model.isNew && <em className="mc-badge is-new">新</em>}
                    {isUnavailable && (
                      <em className="mc-badge is-off" title={model.availabilityReason || "暂无可用渠道"}>{model.lifecycle === "announced" ? "即将上线" : "暂不可用"}</em>
                    )}
                  </div>
                  <code>{model.id}</code>
                  <span className="mc-meta">{model.provider} · {model.category}</span>
                </div>
                <p className="mc-desc">{model.description}</p>
                {protocols.length > 0 && <span className="mc-protocols">{protocols.join(" · ")}</span>}
                <dl className="mc-stats">
                  {!isMedia(model) && <div><dt>上下文</dt><dd>{formatTokens(model.contextLength)}</dd></div>}
                  {priceLine(model).map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
                </dl>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
