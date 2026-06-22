"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cnyToUsd } from "@/lib/money";

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
  description: string;
  contextLength: number;
  promptPrice: number;
  completionPrice: number;
  pricingType?: "token" | "per-image" | "per-second";
  pricingTiers?: PricingTier[];
  tokenPricingTiers?: TokenPricingTier[];
  category: string;
  tags: string[];
  isNew?: boolean;
  isFeatured?: boolean;
  maxOutput: number;
  supported: string[];
  supportedProtocols?: string[];
  supported_protocols?: string[];
  capabilities?: {
    model_type: string;
    supports_tools: boolean;
    supports_vision: boolean;
    supports_video_input: boolean;
    supports_audio_input: boolean;
    supports_audio_output: boolean;
    thinking_mode: "mixed" | "always" | "none" | "unknown";
    thinking_default: boolean | null;
    supports_enable_thinking: boolean;
    supports_thinking_budget: boolean;
    supports_preserve_thinking: boolean;
    supports_search: boolean;
    supports_parallel_tool_calls: boolean;
  };
  allowed_parameters?: string[];
}

interface ProtocolExample {
  id: string;
  label: string;
  endpoint: string;
  params: string[];
  code: string;
  note?: string;
}

function getProtocolExamples(model: AIModel): ProtocolExample[] {
  const protocols = model.supportedProtocols || model.supported_protocols || [];
  const examples: ProtocolExample[] = [];
  const isImageModel = model.category === "Image Generation";
  const isVideoModel = model.category === "Video Generation";
  const isEmbeddingModel = model.category === "Embedding Model";
  const isAsyncModel = isImageModel || isVideoModel;
  const supportsTools = model.supported.some((item) => item.includes("Tools"));
  const allowedParameters = model.allowed_parameters || [];

  for (const protocol of protocols) {
    if (protocol === "openai/chat-completions") {
      examples.push({
        id: protocol,
        label: "OpenAI Chat Completions",
        endpoint: "/v1/chat/completions",
        params: allowedParameters.length > 0 ? allowedParameters : [
          "model",
          "messages",
          "stream",
          "stream_options",
          "temperature",
          "max_tokens",
          "top_p",
          "stop",
          "enable_thinking",
          "presence_penalty",
          "frequency_penalty",
          "response_format",
          ...(supportsTools ? ["tools", "tool_choice"] : []),
        ],
        code: `curl https://api.nexusflow.ai/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true,
    "stream_options": {"include_usage": true},
    "temperature": 0.7,
    "max_tokens": 512
  }'`,
        note: "Supports streaming and common sampling parameters.",
      });
    }

    if (protocol === "anthropic/messages") {
      examples.push({
        id: protocol,
        label: "Anthropic Messages",
        endpoint: "/v1/messages",
        params: ["model", "messages", "system", "max_tokens", "stream", "temperature", "top_p", "stop_sequences", "tools", "tool_choice"],
        code: `curl https://api.nexusflow.ai/v1/messages \\
  -H "x-api-key: $API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "max_tokens": 512,
    "stream": true,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
        note: "Suitable for reusing Anthropic SDK.",
      });
    }

    if (protocol === "google/generate-content") {
      examples.push({
        id: protocol,
        label: "Google Gemini GenerateContent",
        endpoint: `/v1beta/models/${model.id}:generateContent`,
        params: ["contents", "systemInstruction", "generationConfig.temperature", "generationConfig.maxOutputTokens", "generationConfig.topP", "generationConfig.stopSequences", "tools", "toolConfig", "stream"],
        code: `curl "https://api.nexusflow.ai/v1beta/models/${model.id}:generateContent?key=$API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "Hello!"}]
      }
    ],
    "generationConfig": {
      "temperature": 0.7,
      "maxOutputTokens": 512
    }
  }'`,
        note: "Streaming uses :streamGenerateContent?alt=sse.",
      });
    }
  }

  if (isEmbeddingModel) {
    examples.push({
      id: "openai/embeddings",
      label: "OpenAI Embeddings",
      endpoint: "/v1/embeddings",
      params: ["model", "input", "encoding_format", "dimensions"],
      code: `curl https://api.nexusflow.ai/v1/embeddings \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "input": ["First text", "Second text"]
  }'`,
      note: "Supports single and batch vectorization.",
    });
  }

  if (isImageModel) {
    examples.push({
      id: "openai/image-generations",
      label: "OpenAI Image Generations",
      endpoint: "/v1/images/generations",
      params: ["model", "prompt", "size", "n", "response_format"],
      code: `curl https://api.nexusflow.ai/v1/images/generations \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "prompt": "A mechanical horse running at high speed, metallic lines full of motion",
    "size": "1024x1024"
  }'`,
      note: "Synchronous image models can use this protocol directly.",
    });
  }

  if (isAsyncModel) {
    examples.push({
      id: "nexusflow/tasks",
      label: "NexusFlow Async Tasks",
      endpoint: "/v1/tasks",
      params: ["model", "prompt", ...(isVideoModel ? ["duration", "aspect_ratio"] : ["size"])],
      code: `curl https://api.nexusflow.ai/v1/tasks \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "prompt": "${isVideoModel ? "Generate a short video of a futuristic city" : "Generate a high-quality product poster"}"${isVideoModel ? `,
    "duration": 5,
    "aspect_ratio": "16:9"` : `,
    "size": "1024x1024"`}
  }'`,
      note: "Returns task_id, then poll GET /v1/tasks/:id for results.",
    });
  }

  return examples;
}

export default function ModelDetailPage() {
  const params = useParams();
  const [model, setModel] = useState<AIModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const id = Array.isArray(params.id) ? params.id.join("/") : params.id;
      const res = await fetchAPI(`/api/models/${id}`);
      if (res.success) setModel(res.data);
      setLoading(false);
    }
    load();
  }, [params.id]);

  function formatTokens(num: number) {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(0)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  }

  if (loading) {
    return (
      <div style={{ padding: "60px 40px", textAlign: "center", color: "var(--text-secondary)" }}>
        Loading...
      </div>
    );
  }

  if (!model) {
    return (
      <div style={{ padding: "60px 40px", textAlign: "center" }}>
        <h2 style={{ color: "var(--text-primary)", marginBottom: 12 }}>Model not found</h2>
        <Link href="/models" className="btn-primary">
          Back to Model Catalog
        </Link>
      </div>
    );
  }

  const protocolExamples = getProtocolExamples(model);

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "var(--text-secondary)",
          marginBottom: 28,
        }}
      >
        <Link href="/models" style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: 500 }}>
          Model Catalog
        </Link>
        <span>/</span>
        <span>{model.name}</span>
      </div>

      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <h1 style={{ fontSize: 32, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
            {model.name}
          </h1>
          {model.isNew && <span className="tag tag-new">NEW</span>}
          {model.isFeatured && <span className="tag tag-featured">HOT</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Provider: <span style={{ color: "var(--text-primary)" }}>{model.provider}</span>
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-tertiary)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              padding: "3px 10px",
              borderRadius: 4,
            }}
          >
            {model.id}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
          Model Description
        </h3>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          {model.description}
        </p>
      </div>

      {(() => {
        const isMedia = model.pricingType === "per-second" || model.pricingType === "per-image";
        const hasTiers = model.pricingTiers && model.pricingTiers.length > 0;
        const hasTokenTiers = model.tokenPricingTiers && model.tokenPricingTiers.length > 0;

        if (isMedia) {
          return (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <div className="stat-card">
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase" }}>
                    Context Window
                  </div>
                  <div className="stat-value" style={{ color: "#2563eb" }}>
                    {formatTokens(model.contextLength)}
                  </div>
                  <div className="stat-label">tokens</div>
                </div>
                <div className="stat-card">
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase" }}>
                    Starting Price
                  </div>
                  <div className="stat-value" style={{ color: "#10b981" }}>
                    ${cnyToUsd(model.promptPrice).toFixed(2)}
                  </div>
                  <div className="stat-label">{model.pricingType === "per-second" ? "/sec" : "/image"}</div>
                </div>
                <div className="stat-card">
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase" }}>
                    Billing Method
                  </div>
                  <div className="stat-value" style={{ color: "#0f766e", fontSize: 18 }}>
                    {model.pricingType === "per-second" ? "Billed per second" : "Billed per image"}
                  </div>
                </div>
              </div>
              {hasTiers && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
                    Resolution Pricing
                  </h3>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      padding: "10px 16px",
                      background: "var(--bg-elevated)",
                      borderBottom: "1px solid var(--border)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-tertiary)",
                      textTransform: "uppercase",
                    }}>
                      <span>Spec</span>
                      <span style={{ textAlign: "right" }}>Price</span>
                    </div>
                    {model.pricingTiers!.map((tier, i) => (
                      <div key={i} style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        padding: "10px 16px",
                        borderBottom: i < model.pricingTiers!.length - 1 ? "1px solid var(--border)" : "none",
                        fontSize: 14,
                      }}>
                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{tier.label}</span>
                        <span style={{ textAlign: "right", fontWeight: 600, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
                          ${cnyToUsd(tier.price).toFixed(2)}{model.pricingType === "per-second" ? " /sec" : " /image"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        }

        return (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
                marginBottom: 20,
              }}
            >
              <div className="stat-card">
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase" }}>
                  Context Window
                </div>
                <div className="stat-value" style={{ color: "#2563eb" }}>
                  {formatTokens(model.contextLength)}
                </div>
                <div className="stat-label">tokens</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase" }}>
                  Max Output
                </div>
                <div className="stat-value" style={{ color: "#2563eb" }}>
                  {formatTokens(model.maxOutput)}
                </div>
                <div className="stat-label">tokens</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase" }}>
                  1st Tier Input
                </div>
                <div className="stat-value" style={{ color: "#10b981" }}>
                  ${cnyToUsd(model.promptPrice).toFixed(2)}
                </div>
                <div className="stat-label">/ million tokens</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase" }}>
                  1st Tier Output
                </div>
                <div className="stat-value" style={{ color: "#0f766e" }}>
                  ${cnyToUsd(model.completionPrice).toFixed(2)}
                </div>
                <div className="stat-label">/ million tokens</div>
              </div>
            </div>
            {hasTokenTiers && (
              <div className="card" style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
                  Tiered Pricing
                </h3>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 1fr 1fr",
                    padding: "10px 16px",
                    background: "var(--bg-elevated)",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                  }}>
                    <span>Input Tokens per Request</span>
                    <span style={{ textAlign: "right" }}>In/M</span>
                    <span style={{ textAlign: "right" }}>Out/M</span>
                  </div>
                  {model.tokenPricingTiers!.map((tier, i) => (
                    <div key={tier.label} style={{
                      display: "grid",
                      gridTemplateColumns: "1.4fr 1fr 1fr",
                      padding: "10px 16px",
                      borderBottom: i < model.tokenPricingTiers!.length - 1 ? "1px solid var(--border)" : "none",
                      fontSize: 14,
                    }}>
                      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{tier.label}</span>
                      <span style={{ textAlign: "right", fontWeight: 600, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>${cnyToUsd(tier.promptPrice).toFixed(2)}</span>
                      <span style={{ textAlign: "right", fontWeight: 600, color: "#0f766e", fontVariantNumeric: "tabular-nums" }}>${cnyToUsd(tier.completionPrice).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
            Tags
          </h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {model.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
            Supported Capabilities
          </h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {model.supported.map((s) => (
              <span
                key={s}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {(model.supportedProtocols || model.supported_protocols)?.length ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
            Supported Protocols
          </h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(model.supportedProtocols || model.supported_protocols || []).map((protocol) => (
              <span
                key={protocol}
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  background: "rgba(29,78,216,0.08)",
                  border: "1px solid rgba(29,78,216,0.16)",
                  color: "#1d4ed8",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {protocol}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {(model.capabilities || (model.allowed_parameters?.length || 0) > 0) ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
            Capabilities & Parameters
          </h3>
          {model.capabilities ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              {[
                ["Type", model.capabilities.model_type],
                ["Thinking Mode", model.capabilities.thinking_mode === "mixed" ? `Toggleable${model.capabilities.thinking_default === null ? "" : `，default ${model.capabilities.thinking_default ? "on" : "off"}`}` : model.capabilities.thinking_mode === "always" ? "Always on, cannot disable" : "None"],
                ["Tool Calls", model.capabilities.supports_tools ? "Supported" : "Not declared"],
                ["Vision Input", model.capabilities.supports_vision ? "Supported" : "Not declared"],
                ["Video Input", model.capabilities.supports_video_input ? "Supported" : "Not declared"],
                ["Search Param", model.capabilities.supports_search ? "Supported" : "Not yet enabled"],
              ].map(([label, value]) => (
                <div key={label} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          ) : null}
          {(model.allowed_parameters?.length || 0) > 0 ? (
            <>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
                Parameters forwarded by NexusFlow public chat:
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {model.allowed_parameters!.map((param) => (
                  <span key={param} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {param}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
          API Examples
        </h3>
        <div style={{ display: "grid", gap: 16 }}>
          {protocolExamples.map((example) => (
            <div key={example.id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", background: "var(--bg-subtle)" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                  {example.label}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: 10 }}>
                  {example.endpoint}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: example.note ? 10 : 0 }}>
                  {example.params.map((param) => (
                    <span
                      key={param}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {param}
                    </span>
                  ))}
                </div>
                {example.note ? (
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                    {example.note}
                  </div>
                ) : null}
              </div>
              <DocsCodeBlock code={example.code} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href="/playground" className="btn-primary" style={{ fontSize: 13, padding: "8px 16px" }}>
            Try in Playground
          </Link>
        </div>
      </div>
    </div>
  );
}
