"use client";

import { useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import Link from "next/link";

interface AIModel {
  id: string;
  name: string;
  provider: string;
  category: string;
  promptPrice: number;
  completionPrice: number;
}

export default function PricingPage() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchAPI("/api/models");
        if (res.success) {
          setModels(res.data);
        }
      } catch (e) {
        console.error("Failed to load models", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
    <div style={{ padding: "40px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <div className="section-label">Pricing</div>
        <h1 style={{
          fontSize: 40,
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "-1.5px",
          margin: "0 0 16px",
        }}>
          Simple, transparent pricing
        </h1>
        <p style={{
          fontSize: 17,
          color: "var(--text-secondary)",
          maxWidth: 520,
          margin: "0 auto 32px",
          lineHeight: 1.6,
        }}>
          Pay only for what you use. No hidden fees, no minimums. 
          Prices are per million tokens.
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
            { icon: "⚡", label: "Pay as you go", desc: "No subscriptions required" },
            { icon: "📊", label: "Real-time tracking", desc: "Monitor usage instantly" },
            { icon: "🔄", label: "No lock-in", desc: "Switch models freely" },
          ].map((item) => (
            <div key={item.label} style={{
              padding: "20px 28px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              textAlign: "center",
              minWidth: 180,
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
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
              borderColor: selectedCategory === cat ? "var(--text-primary)" : "var(--border)",
              background: selectedCategory === cat ? "var(--text-primary)" : "transparent",
              color: selectedCategory === cat ? "#fff" : "var(--text-secondary)",
              transition: "all 0.15s",
              fontFamily: "inherit",
            }}
          >
            {cat === "all" ? "All Models" : cat}
          </button>
        ))}
      </div>

      {/* Pricing tables by provider */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>
          Loading pricing...
        </div>
      ) : (
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
                  {providerModels.length} models
                </span>
              </h3>

              <div style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
                background: "var(--bg-card)",
              }}>
                {/* Table header */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  padding: "12px 20px",
                  background: "var(--bg-elevated)",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}>
                  <span>Model</span>
                  <span style={{ textAlign: "right" }}>Category</span>
                  <span style={{ textAlign: "right" }}>Input / 1M</span>
                  <span style={{ textAlign: "right" }}>Output / 1M</span>
                </div>

                {/* Model rows */}
                {providerModels.map((model) => (
                  <Link
                    key={model.id}
                    href={`/models/${encodeURIComponent(model.id)}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr 1fr",
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
                      textAlign: "right",
                      fontSize: 14,
                      fontWeight: 550,
                      color: model.promptPrice === 0 ? "var(--success)" : "var(--text-primary)",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {model.promptPrice === 0 ? "Free" : `¥${model.promptPrice}`}
                    </span>
                    <span style={{
                      textAlign: "right",
                      fontSize: 14,
                      fontWeight: 550,
                      color: model.completionPrice === 0 ? "var(--success)" : "var(--text-primary)",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {model.completionPrice === 0 ? "Free" : `¥${model.completionPrice}`}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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
          Ready to start?
        </h2>
        <p style={{
          fontSize: 15,
          color: "rgba(255,255,255,0.5)",
          margin: "0 0 28px",
        }}>
          Create an account and get your API key in seconds.
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
            Get Started Free
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
            Read the docs
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
        <strong style={{ color: "var(--text-primary)" }}>Pricing Notes:</strong>
        <ul style={{ margin: "12px 0 0", paddingLeft: 20 }}>
          <li>All prices are in CNY (¥) per million tokens</li>
          <li>Billing is calculated based on actual token usage</li>
          <li>Minimum charge per request: ¥0.0001</li>
          <li>Account balance can be recharged at any time</li>
          <li>Unused balance never expires</li>
        </ul>
      </div>
    </div>
  );
}
