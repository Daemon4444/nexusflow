"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { SearchOutlined } from "@ant-design/icons";
import { useI18n } from "@/lib/i18n";

interface PricingTier {
  label: string;
  price: number;
}

interface TokenPricingTier {
  label: string;
  maxTokens: number;
  promptPrice: number;
  completionPrice: number;
  thinkingCompletionPrice?: number;
}

interface CacheTier {
  label: string;
  implicitHit: number;
  explicitHit?: number;
  explicitCreation?: number;
}

interface AIModel {
  id: string;
  name: string;
  provider: string;
  category: string;
  contextLength?: number;
  maxOutput?: number;
  availability?: "available" | "temporarily_unavailable" | "disabled";
  promptPrice: number | null;
  completionPrice: number | null;
  pricingStatus?: "unpublished";
  pricingType?: "token" | "per-image" | "per-second" | "per-10k-characters";
  pricingTiers?: PricingTier[];
  tokenPricingTiers?: TokenPricingTier[];
  alternatePricingModes?: Array<{
    id: string;
    label: string;
    promptPrice: number;
    completionPrice: number;
    availability: "available" | "announced";
  }>;
  /** 后端已解析的缓存价，与实扣路径同源。仅隐式缓存的模型无显式字段。 */
  cachePricing?: {
    implicitHit: number;
    explicitHit?: number;
    explicitCreation?: number;
    tiers?: CacheTier[];
  } | null;
}

export interface PricingPageProps {
  initialModels: AIModel[];
  initialError?: string;
}

const MEDIA_UNITS: Record<string, string> = {
  "per-second": "秒",
  "per-image": "张",
  "per-10k-characters": "万字符",
};

const isMedia = (model: AIModel) => Boolean(model.pricingType && MEDIA_UNITS[model.pricingType]);
const isPriced = (model: AIModel) => model.promptPrice != null && model.completionPrice != null;
const isTextModel = (model: AIModel) => !isMedia(model) && isPriced(model) && (model.completionPrice || 0) > 0;

function yuan(value: number | null | undefined, digits = 4) {
  if (value == null) return "—";
  return `¥${Number(value).toLocaleString("en-US", { maximumFractionDigits: digits })}`;
}

function tokens(value: number) {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

/** Tier that applies to a request with this many input tokens. */
function tierFor(model: AIModel, inputTokens: number) {
  const tiers = [...(model.tokenPricingTiers || [])].sort((a, b) => a.maxTokens - b.maxTokens);
  const tier = tiers.find((item) => inputTokens <= item.maxTokens) || tiers[tiers.length - 1];
  const cacheTier = tier && model.cachePricing?.tiers?.find((item) => item.label === tier.label);
  return {
    prompt: tier?.promptPrice ?? model.promptPrice ?? 0,
    completion: tier?.completionPrice ?? model.completionPrice ?? 0,
    cache: cacheTier?.implicitHit ?? model.cachePricing?.implicitHit ?? null,
  };
}

const INPUT_STEPS = [500, 2_000, 8_000, 32_000, 128_000];
const OUTPUT_STEPS = [200, 800, 2_000, 8_000];
const CALL_STEPS = [100, 1_000, 10_000, 100_000];

export default function PricingPage({ initialModels, initialError = "" }: PricingPageProps) {
  const { t } = useI18n();
  const textModels = useMemo(() => initialModels.filter(model => isTextModel(model) && (!model.availability || model.availability === "available")), [initialModels]);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const [modelId, setModelId] = useState(() => (textModels.find((m) => m.id === "qwen3.8-flash") || textModels[0])?.id || "");
  const [inputTokens, setInputTokens] = useState(2_000);
  const [outputTokens, setOutputTokens] = useState(800);
  const [calls, setCalls] = useState(1_000);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of initialModels) counts.set(model.category, (counts.get(model.category) || 0) + 1);
    return [...counts.entries()];
  }, [initialModels]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byProvider = new Map<string, AIModel[]>();
    for (const model of initialModels) {
      if (category !== "all" && model.category !== category) continue;
      if (needle && ![model.name, model.id, model.provider].some((v) => v.toLowerCase().includes(needle))) continue;
      if (!byProvider.has(model.provider)) byProvider.set(model.provider, []);
      byProvider.get(model.provider)!.push(model);
    }
    return [...byProvider.entries()];
  }, [initialModels, category, query]);

  const selected = textModels.find((m) => m.id === modelId) || textModels[0];
  const exceedsContext = Boolean(selected?.contextLength && inputTokens + outputTokens > selected.contextLength);
  const exceedsOutput = Boolean(selected?.maxOutput && outputTokens > selected.maxOutput);
  const estimateError = exceedsContext
    ? `输入与输出合计超出该模型 ${tokens(selected!.contextLength!)} 的上下文上限，请减少 tokens。`
    : exceedsOutput ? `输出超出该模型 ${tokens(selected!.maxOutput!)} 的最大输出上限，请减少 tokens。` : "";
  const estimate = useMemo(() => {
    if (!selected || estimateError) return null;
    const price = tierFor(selected, inputTokens);
    const perCall = (inputTokens * price.prompt + outputTokens * price.completion) / 1e6;
    return { perCall, monthly: perCall * calls * 30 };
  }, [selected, inputTokens, outputTokens, calls, estimateError]);

  return (
    <div className="pr">
      <header className="pr-head">
        <h1>模型定价</h1>
        <p>按实际用量计费，没有订阅费和最低消费，余额永不过期。文本模型按每百万 token 计价，命中缓存的输入自动按更低价格结算。</p>
      </header>

      <div className="pr-toolbar">
        <div className="pr-tabs" role="tablist" aria-label="模型类别">
          <button role="tab" aria-selected={category === "all"} onClick={() => setCategory("all")}>{t("allModels")}</button>
          {categories.map(([name]) => (
            <button key={name} role="tab" aria-selected={category === name} onClick={() => setCategory(name)}>{name}</button>
          ))}
        </div>
        <label className="pr-search">
          <SearchOutlined />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型" />
        </label>
      </div>

      {initialError && (
        <div className="nf-inline-warning" role="alert"><strong>价格目录加载失败</strong><span>{initialError}</span></div>
      )}
      {groups.length === 0 && <p className="pr-empty">没有找到匹配的模型。</p>}

      {groups.map(([provider, models]) => {
        const hasText = models.some((m) => !isMedia(m));
        return (
          <section className="pr-group" key={provider}>
            <h2>{provider}</h2>
            <div className="pr-list">
              {hasText && (
                <div className="pr-row pr-row-head" aria-hidden>
                  <span>模型</span>
                  <span>输入</span>
                  <span>输出</span>
                  <span>缓存命中</span>
                  <span />
                </div>
              )}
              {models.map((model) => {
                const tiers = model.tokenPricingTiers || [];
                const expandable = tiers.length > 1 || Boolean(model.alternatePricingModes?.length);
                const isOpen = open === model.id;
                return (
                  <Fragment key={model.id}>
                    <div className={`pr-row${isOpen ? " is-open" : ""}`}>
                      <Link href={`/models/${encodeURIComponent(model.id)}`} className="pr-model">
                        <strong>{model.name}</strong>
                        {model.availability && model.availability !== "available" && <span>暂不可用</span>}
                        <span>{model.id}{model.contextLength ? ` · ${tokens(model.contextLength)} 上下文` : ""}</span>
                      </Link>
                      {!isPriced(model) ? (
                        <span className="pr-span pr-muted">价格待公布</span>
                      ) : isMedia(model) ? (
                        <span className="pr-span pr-media">
                          {(model.pricingTiers?.length ? model.pricingTiers : [{ label: "", price: model.promptPrice || 0 }]).map((tier, i) => (
                            <span key={i}><b>{yuan(tier.price, 5)}</b> / {MEDIA_UNITS[model.pricingType!]}{tier.label && <em>{tier.label}</em>}</span>
                          ))}
                        </span>
                      ) : model.promptPrice === 0 && model.completionPrice === 0 ? (
                        <span className="pr-span pr-free">{t("freeLabel")}</span>
                      ) : (
                        <>
                          <span className="pr-price" data-label="输入">{yuan(tiers[0]?.promptPrice ?? model.promptPrice)}{tiers.length > 1 && <em>起</em>}</span>
                          <span className="pr-price" data-label="输出">{yuan(tiers[0]?.completionPrice ?? model.completionPrice)}{tiers.length > 1 && <em>起</em>}</span>
                          <span className="pr-price pr-cache" data-label="缓存命中">{model.cachePricing ? yuan(model.cachePricing.implicitHit) : "—"}</span>
                        </>
                      )}
                      <span className="pr-action">
                        {expandable && (
                          <button onClick={() => setOpen(isOpen ? null : model.id)} aria-expanded={isOpen}>
                            {isOpen ? "收起" : "阶梯价"}
                          </button>
                        )}
                      </span>
                    </div>
                    {isOpen && (
                      <div className="pr-tiers">
                        <table>
                          <thead>
                            <tr><th>单次请求输入</th><th>输入</th><th>输出</th><th>缓存命中</th></tr>
                          </thead>
                          <tbody>
                            {tiers.map((tier) => {
                              const cache = model.cachePricing?.tiers?.find((c) => c.label === tier.label);
                              return (
                                <tr key={tier.label}>
                                  <td>{tier.label}</td>
                                  <td>{yuan(tier.promptPrice)}</td>
                                  <td>{yuan(tier.completionPrice)}{tier.thinkingCompletionPrice ? <small>思考模式 {yuan(tier.thinkingCompletionPrice)}</small> : null}</td>
                                  <td>{cache ? yuan(cache.implicitHit) : "—"}</td>
                                </tr>
                              );
                            })}
                            {model.alternatePricingModes?.map((mode) => (
                              <tr key={mode.id}>
                                <td>{mode.label}{mode.availability === "announced" ? "（暂未开放）" : ""}</td>
                                <td>{yuan(mode.promptPrice)}</td>
                                <td>{yuan(mode.completionPrice)}</td>
                                <td>—</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="pr-unit">文本模型价格单位为 ¥ / 百万 tokens。</p>

      {selected && (
        <section className="pr-estimate">
          <div className="pr-estimate-form">
            <h2>估算月度费用</h2>
            <label>
              <span>模型</span>
              <select value={selected.id} onChange={(event) => setModelId(event.target.value)}>
                {textModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
            </label>
            <Choice label="每次输入 tokens" value={inputTokens} options={INPUT_STEPS} format={tokens} onChange={setInputTokens} />
            <Choice label="每次输出 tokens" value={outputTokens} options={OUTPUT_STEPS} format={tokens} onChange={setOutputTokens} />
            <Choice label="每天调用次数" value={calls} options={CALL_STEPS} format={(v) => v.toLocaleString("en-US")} onChange={setCalls} />
          </div>
          <div className="pr-estimate-result">
            {estimate ? <>
              <span>预计每月</span>
              <strong>{yuan(estimate.monthly, estimate.monthly < 100 ? 2 : 0)}</strong>
              <p>单次约 {yuan(estimate.perCall, 5)}，按 30 天计，未计缓存折扣。按普通输出价估算，未计思考模式额外输出、工具费用及账号折扣。上下文校验使用目录上限，具体输入和思考限制以上游模型要求为准；实际以每次请求的真实用量结算。</p>
            </> : <p role="alert">{estimateError}</p>}
          </div>
        </section>
      )}

      <section className="pr-notes">
        <h2>计费说明</h2>
        <dl>
          <div><dt>计价单位</dt><dd>文本按每百万 token；图片按张；视频与语音识别按秒；语音合成按万字符。均为人民币。</dd></div>
          <div><dt>阶梯计费</dt><dd>部分模型按单次请求的输入长度分档，长 prompt 自动适用对应档位，点“阶梯价”查看每一档。</dd></div>
          <div><dt>上下文缓存</dt><dd>缓存支持与价格因模型而异。上表为隐式缓存命中价；显式缓存命中、创建及阶梯价格请查看模型详情。详见 <Link href="/docs/context-cache">缓存文档</Link>。</dd></div>
          <div><dt>Claude</dt><dd>按 Anthropic 官方美元价以 1 USD ≈ ¥6.8 折算，汇率变动时可能调整。</dd></div>
          <div><dt>失败请求</dt><dd>没有任何产出的失败请求不计费。</dd></div>
        </dl>
      </section>

      <section className="pr-cta">
        <div>
          <h2>{t("ctaReady")}</h2>
          <p>{t("ctaReadyDesc")}</p>
        </div>
        <div>
          <Link href="/login?tab=register" className="pr-btn-primary">{t("getStartedFree")}</Link>
          <Link href="/docs/quickstart" className="pr-btn-secondary">{t("readDocs")}</Link>
        </div>
      </section>
    </div>
  );
}

function Choice({ label, value, options, format, onChange }: { label: string; value: number; options: number[]; format: (value: number) => string; onChange: (value: number) => void }) {
  return (
    <div className="pr-choice">
      <span>{label}</span>
      <div role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button key={option} role="radio" aria-checked={value === option} onClick={() => onChange(option)}>{format(option)}</button>
        ))}
      </div>
    </div>
  );
}
