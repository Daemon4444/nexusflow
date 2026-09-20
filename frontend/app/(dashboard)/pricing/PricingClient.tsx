"use client";

import { useState } from "react";
import Link from "next/link";
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
}

interface AIModel {
  id: string;
  name: string;
  provider: string;
  category: string;
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
  } | null;
}

export interface PricingPageProps {
  initialModels: AIModel[];
  initialError?: string;
}

export default function PricingPage({ initialModels, initialError = "" }: PricingPageProps) {
  const { t } = useI18n();
  const [models] = useState<AIModel[]>(initialModels);
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = ["all", ...new Set(models.map((m) => m.category))];
  const filteredModels = selectedCategory === "all"
    ? models
    : models.filter((m) => m.category === selectedCategory);

  // Group by provider
  const groupedByProvider = filteredModels.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<string, AIModel[]>);

  return (
    <div className="pricing-page" style={{ padding: "40px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <div className="section-label">{t("pricingLabel")}</div>
        <h1 style={{
          fontSize: 40,
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "-1.5px",
          margin: "0 0 16px",
        }}>
          {t("pricingTitle")}
        </h1>
        <p style={{
          fontSize: 17,
          color: "var(--text-secondary)",
          maxWidth: 520,
          margin: "0 auto 32px",
          lineHeight: 1.6,
        }}>
          {t("pricingSubtitle")}
        </p>

        {/* Billing model highlights */}
        <div style={{
          display: "flex",
          gap: 24,
          justifyContent: "center",
          flexWrap: "wrap",
          marginBottom: 40,
        }}>
          {[
            { marker: "01", label: t("pricePayg"), desc: t("pricePaygDesc") },
            { marker: "02", label: t("priceRealtime"), desc: t("priceRealtimeDesc") },
            { marker: "03", label: t("priceNoLockin"), desc: t("priceNoLockinDesc") },
          ].map((item) => (
            <div key={item.label} style={{
              padding: "20px 28px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              textAlign: "center",
              minWidth: 180,
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--accent)", marginBottom: 10 }}>{item.marker}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap", justifyContent: "center" }}>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: selectedCategory === cat ? 600 : 450,
              cursor: "pointer",
              border: "1px solid",
              borderColor: selectedCategory === cat ? "var(--accent)" : "var(--border)",
              background: selectedCategory === cat ? "var(--accent)" : "transparent",
              color: selectedCategory === cat ? "#fff" : "var(--text-secondary)",
              transition: "all 0.15s",
              fontFamily: "inherit",
            }}
          >
            {cat === "all" ? t("allModels") : cat}
          </button>
        ))}
      </div>

      {/* Pricing tables by provider */}
      {initialError ? (
        <div className="nf-inline-warning" role="alert">
          <strong>价格目录加载失败</strong>
          <span>{initialError}</span>
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {Object.entries(groupedByProvider).map(([provider, providerModels]) => (
            <div key={provider}>
              <h3 style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: "1px solid var(--border)",
              }}>
                {provider}
                <span style={{
                  marginLeft: 12,
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-tertiary)",
                }}>
                  {providerModels.length} {t("modelsCountSuffix")}
                </span>
              </h3>

              <div style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
                background: "var(--bg-card)",
              }}>
                {/* Table header */}
                <div className="pricing-table-head" style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 2fr",
                  padding: "12px 20px",
                  background: "var(--bg-elevated)",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}>
                  <span>{t("thModel")}</span>
                  <span style={{ textAlign: "right" }}>{t("thCategory")}</span>
                  <span style={{ textAlign: "right" }}>{t("thPricing")}</span>
                </div>

                {/* Model rows */}
                {providerModels.map((model) => {
                  const isMedia = model.pricingType === "per-second"
                    || model.pricingType === "per-image"
                    || model.pricingType === "per-10k-characters";
                  const hasTiers = model.pricingTiers && model.pricingTiers.length > 0;
                  const hasTokenTiers = model.tokenPricingTiers && model.tokenPricingTiers.length > 0;
                  const pricingPending = model.promptPrice == null || model.completionPrice == null;
                  return (
                  <Link
                    key={model.id}
                    href={`/models/${encodeURIComponent(model.id)}`}
                    className="pricing-table-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 2fr",
                      padding: "16px 20px",
                      borderBottom: "1px solid var(--border)",
                      textDecoration: "none",
                      color: "inherit",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontWeight: 550, color: "var(--text-primary)" }}>
                      {model.name}
                    </span>
                    <span style={{ textAlign: "right", fontSize: 13, color: "var(--text-tertiary)" }}>
                      {model.category}
                    </span>
                    <span style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 3,
                    }}>
                    {pricingPending ? (
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--warning, #d97706)" }}>
                        价格待公布 · 尚未开放
                      </span>
                    ) : isMedia && hasTiers ? (
                      <span style={{
                        textAlign: "right",
                        fontSize: 13,
                        fontWeight: 550,
                        color: "var(--text-primary)",
                        fontVariantNumeric: "tabular-nums",
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                        gap: "4px 12px",
                      }}>
                        {model.pricingTiers!.map((tier, idx) => (
                          <span key={idx} style={{ whiteSpace: "nowrap" }}>
                            {tier.label}：¥{tier.price}{
                              model.pricingType === "per-second"
                                ? "/秒"
                                : model.pricingType === "per-10k-characters"
                                  ? "/万字符"
                                  : "/张"
                            }
                          </span>
                        ))}
                      </span>
                    ) : isMedia ? (
                      <span style={{
                        textAlign: "right",
                        fontSize: 14,
                        fontWeight: 550,
                        color: "var(--text-primary)",
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        ¥{model.promptPrice}{
                          model.pricingType === "per-second"
                            ? "/秒"
                            : model.pricingType === "per-10k-characters"
                              ? "/万字符"
                              : "/张"
                        }
                      </span>
                    ) : hasTokenTiers ? (
                      <span style={{
                        textAlign: "right",
                        fontSize: 13,
                        fontWeight: 550,
                        color: "var(--text-primary)",
                        fontVariantNumeric: "tabular-nums",
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                        gap: "4px 12px",
                      }}>
                        {model.tokenPricingTiers!.map((tier) => (
                          <span key={tier.label} style={{ whiteSpace: "nowrap" }}>
                            {tier.label}：入¥{tier.promptPrice}/出¥{tier.completionPrice} / 百万 Token
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span style={{
                        textAlign: "right",
                        fontSize: 14,
                        fontVariantNumeric: "tabular-nums",
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        gap: 4,
                      }}>
                        {model.promptPrice === 0 && model.completionPrice === 0 ? (
                          <span style={{ fontWeight: 550, color: "var(--success)" }}>{t("freeLabel")}</span>
                        ) : (
                          <>
                            <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 450 }}>{t("inputShort")}</span>
                            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>¥{model.promptPrice}</span>
                            <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 450, margin: "0 2px" }}>/</span>
                            <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 450 }}>{t("outputShort")}</span>
                            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>¥{model.completionPrice}</span>
                            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 450 }}> / 百万 Token</span>
                          </>
                        )}
                      </span>
                    )}
                    {model.cachePricing && (
                      <span style={{
                        fontSize: 11.5,
                        color: "var(--text-tertiary)",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}>
                        缓存命中 隐式¥{model.cachePricing.implicitHit}{model.cachePricing.explicitHit !== undefined ? ` / 显式¥${model.cachePricing.explicitHit}` : ""}
                      </span>
                    )}
                    {model.alternatePricingModes?.map((mode) => (
                      <span key={mode.id} style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {mode.label} 入¥{mode.promptPrice}/出¥{mode.completionPrice}
                        {mode.availability === "announced" ? "（官方已公布，暂未开放）" : ""}
                      </span>
                    ))}
                    </span>
                  </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

      {/* CTA */}
      <div style={{
        marginTop: 64,
        padding: "48px 40px",
        background: "#0a0a0a",
        borderRadius: 20,
        textAlign: "center",
      }}>
        <h2 style={{
          fontSize: 28,
          fontWeight: 700,
          color: "#fff",
          margin: "0 0 12px",
          letterSpacing: "-1px",
        }}>
          {t("ctaReady")}
        </h2>
        <p style={{
          fontSize: 15,
          color: "rgba(255,255,255,0.5)",
          margin: "0 0 28px",
        }}>
          {t("ctaReadyDesc")}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link
            href="/login"
            style={{
              padding: "12px 28px",
              background: "#fff",
              color: "#0a0a0a",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              transition: "transform 0.15s",
            }}
          >
            {t("getStartedFree")}
          </Link>
          <Link
            href="/docs"
            style={{
              padding: "12px 28px",
              background: "transparent",
              color: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              transition: "border-color 0.15s, color 0.15s",
            }}
          >
            {t("readDocs")}
          </Link>
        </div>
      </div>

      {/* Pricing notes */}
      <div style={{
        marginTop: 48,
        padding: 24,
        background: "rgba(0,0,0,0.02)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        fontSize: 13,
        color: "var(--text-secondary)",
        lineHeight: 1.7,
      }}>
        <strong style={{ color: "var(--text-primary)" }}>{t("pricingNotesTitle")}</strong>
        <ul style={{ margin: "12px 0 0", paddingLeft: 20 }}>
          <li>All prices are in CNY (¥), per million tokens unless otherwise noted</li>
          <li><strong>阶梯计费</strong>：通义千问、GLM 系列按单次请求输入 token 总量分档计费，长 prompt 自动适用更高档位价格</li>
          <li><strong>上下文缓存</strong>：缓存能力与命中价以各模型行披露为准。显式缓存标准命中价为 0.1x、创建价为 1.25x；隐式缓存自动生效，折扣因模型而异。详见 <a href="/docs/context-cache" style={{ color: "#1d4ed8" }}>缓存文档</a></li>
          <li><strong>Claude 定价</strong>：基于 Anthropic 官方 USD 价格按 1 USD ≈ ¥6.8 折算，汇率变动时可能调整</li>
          <li>Video models: per-second billing based on resolution and audio options</li>
          <li>Image models: per-image billing</li>
          <li>Account balance can be recharged at any time, unused balance never expires</li>
        </ul>
      </div>
    </div>
  );
}
