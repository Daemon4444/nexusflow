"use client";

import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { useParams } from "next/navigation";
import Link from "next/link";

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
  filename: string;
  params: string[];
  code: string;
  note?: string;
}

const categoryColors: Record<string, string> = {
  "Large Language Model": "#2563eb",
  "Reasoning Model": "#dc2626",
  "Multimodal": "#7c3aed",
  "Multimodal Model": "#7c3aed",
  "Coding Model": "#0891b2",
  "Image Generation": "#db2777",
  "Video Generation": "#f97316",
  "Embedding": "#0f766e",
  "Embedding Model": "#0f766e",
  "Specialized": "#64748b",
  "Specialized Model": "#64748b",
  "Audio": "#7c2d12",
  "Audio Model": "#7c2d12",
};

function getProtocolExamples(model: AIModel): ProtocolExample[] {
  const protocols = model.supportedProtocols || model.supported_protocols || [];
  const examples: ProtocolExample[] = [];
  const isImageModel = model.category === "Image Generation";
  const isVideoModel = model.category === "Video Generation";
  const isEmbeddingModel = model.category === "Embedding" || model.category === "Embedding Model";
  const isAsyncModel = isImageModel || isVideoModel;
  const supportsTools = model.supported.some((item) => item.toLowerCase().includes("tool") || item.toLowerCase().includes("function"));
  const supportsVision = model.supported.some((item) => item.toLowerCase().includes("vision") || item.toLowerCase().includes("image"));
  const allowedParameters = model.allowed_parameters || [];

  for (const protocol of protocols) {
    if (protocol === "openai/chat-completions") {
      examples.push({
        id: protocol,
        label: "OpenAI Chat Completions",
        endpoint: "/v1/chat/completions",
        filename: "openai-chat.sh",
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
    "max_tokens": 512${supportsTools ? `,
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the weather",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {"type": "string"}
          },
          "required": ["city"]
        }
      }
    }` : ""}
  }'`,
        note: supportsVision
          ? "Supports streaming and common sampling parameters; vision models accept image content inside messages."
          : "Supports streaming, common sampling parameters and the standard chat format.",
      });
    }

    if (protocol === "anthropic/messages") {
      examples.push({
        id: protocol,
        label: "Anthropic Messages",
        endpoint: "/v1/messages",
        filename: "anthropic-messages.sh",
        params: ["model", "messages", "system", "max_tokens", "stream", "temperature", "top_p", "stop_sequences", "tools", "tool_choice"],
        code: `curl https://api.nexusflow.ai/v1/messages \\
  -H "x-api-key: $API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "max_tokens": 512,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`,
        note: "Drop-in for Anthropic SDK or Claude Code-style clients.",
      });
    }

    if (protocol === "google/generate-content") {
      examples.push({
        id: protocol,
        label: "Google Gemini GenerateContent",
        endpoint: `/v1beta/models/${model.id}:generateContent`,
        filename: "gemini-generate-content.sh",
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
        note: "Streaming uses :streamGenerateContent?alt=sse — compatible with the Gemini SDK.",
      });
    }
  }

  if (isEmbeddingModel) {
    examples.push({
      id: "openai/embeddings",
      label: "OpenAI Embeddings",
      endpoint: "/v1/embeddings",
      filename: "openai-embeddings.sh",
      params: ["model", "input", "encoding_format", "dimensions"],
      code: `curl https://api.nexusflow.ai/v1/embeddings \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "input": ["First text segment", "Second text segment"]
  }'`,
      note: "Accepts a single string or an array of strings for batch embedding.",
    });
  }

  if (isImageModel) {
    examples.push({
      id: "openai/image-generations",
      label: "OpenAI Image Generations",
      endpoint: "/v1/images/generations",
      filename: "openai-images.sh",
      params: ["model", "prompt", "size", "n", "response_format"],
      code: `curl https://api.nexusflow.ai/v1/images/generations \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "prompt": "A high-speed mechanical horse running, metallic lines bursting with motion",
    "size": "1024x1024"
  }'`,
      note: "For image models that return synchronously. Common parameters: size, n, response_format.",
    });
  }

  if (isAsyncModel) {
    examples.push({
      id: "nexusflow/tasks",
      label: "NexusFlow Async Tasks",
      endpoint: "/v1/tasks",
      filename: "nexusflow-tasks.sh",
      params: [
        "model",
        "prompt",
        ...(isVideoModel ? ["duration", "aspect_ratio"] : ["size", "image_url"]),
      ],
      code: `curl https://api.nexusflow.ai/v1/tasks \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "prompt": "${isVideoModel ? "A short video weaving through a futuristic city" : "A bold, textured product poster"}"${isVideoModel ? `,
    "duration": 5,
    "aspect_ratio": "16:9"` : `,
    "size": "1024x1024"`}
  }'`,
      note: "Returns a task_id; poll GET /v1/tasks/:id for status and the final output.",
    });
  }

  if (model.category === "Audio" || model.category === "Audio Model") {
    if (model.id.toLowerCase().includes("tts")) {
      examples.push({
        id: "openai/audio-speech",
        label: "OpenAI Audio Speech (TTS)",
        endpoint: "/v1/audio/speech",
        filename: "openai-tts.sh",
        params: ["model", "input", "voice", "response_format"],
        code: `curl https://api.nexusflow.ai/v1/audio/speech \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "input": "Hello world — this is a TTS test.",
    "voice": "alloy"
  }' \\
  --output speech.wav`,
        note: "Returns binary audio. Voices include alloy/ash/nova/echo/sage/shimmer; DashScope native voice names are also accepted.",
      });
    }
    if (model.id.toLowerCase().includes("asr")) {
      examples.push({
        id: "openai/audio-transcriptions",
        label: "OpenAI Audio Transcriptions (ASR)",
        endpoint: "/v1/audio/transcriptions",
        filename: "openai-asr.sh",
        params: ["model", "file_url", "response_format"],
        code: `curl https://api.nexusflow.ai/v1/audio/transcriptions \\
  -H "Authorization: Bearer $API_KEY" \\
  -F "model=${model.id}" \\
  -F "file_url=https://example.com/audio.wav"`,
        note: "file_url must be a publicly reachable audio URL. Returns { text: '...' } as the transcription.",
      });
    }
  }

  return examples;
}

export default function ModelDetailPage() {
  const params = useParams();
  const modelId = params.id as string;
  const [model, setModel] = useState<AIModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadModel();
  }, [modelId]);

  async function loadModel() {
    setLoading(true);
    try {
      const res = await fetchAPI(`/api/models/${modelId}`);
      if (res.success) {
        setModel(res.data);
      }
    } catch {
      console.error("Failed to load model details");
    } finally {
      setLoading(false);
    }
  }

  function formatTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
  }

  if (loading) {
    return (
      <div style={{ padding: 40, fontFamily: "var(--font-sans)" }}>
        <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="empty-state" style={{ padding: 60 }}>
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>Model not found</div>
        <Link href="/models" className="btn-secondary">Back to models</Link>
      </div>
    );
  }

  const accent = categoryColors[model.category] || "#111";
  const protocols = model.supportedProtocols || model.supported_protocols || [];
  const protocolExamples = getProtocolExamples(model);
  const capabilityRows = model.capabilities ? [
    ["Type", model.capabilities.model_type],
    ["Thinking mode", model.capabilities.thinking_mode === "mixed" ? `Toggleable${model.capabilities.thinking_default === null ? "" : `, default ${model.capabilities.thinking_default ? "on" : "off"}`}` : model.capabilities.thinking_mode === "always" ? "Thinking only, cannot disable" : "None"],
    ["Tool calling", model.capabilities.supports_tools ? "Supported" : "Not declared"],
    ["Vision input", model.capabilities.supports_vision ? "Supported" : "Not declared"],
    ["Video input", model.capabilities.supports_video_input ? "Supported" : "Not declared"],
    ["Audio input", model.capabilities.supports_audio_input ? "Supported" : "Not declared"],
    ["thinking_budget", model.capabilities.supports_thinking_budget ? "Supported upstream; not forwarded by public chat" : "Not declared"],
    ["preserve_thinking", model.capabilities.supports_preserve_thinking ? "Supported upstream; not forwarded by public chat" : "Not declared"],
    ["Search params", model.capabilities.supports_search ? "Supported" : "Not exposed"],
  ] : [];

  return (
    <div style={{ padding: "32px 44px", fontFamily: "var(--font-sans)" }}>
      <div style={{ marginBottom: 28 }}>
        <Link href="/models" style={{ fontSize: 13, color: "var(--text-tertiary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Back to models
        </Link>
      </div>

      <div className="card-accent" style={{ marginBottom: 24 }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{model.name}</h1>
              {model.isNew && <span className="tag tag-new">NEW</span>}
              {model.isFeatured && <span className="tag tag-featured">HOT</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>{model.provider}</span>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--text-tertiary)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: accent, background: `${accent}15`, padding: "3px 10px", borderRadius: 6 }}>{model.category}</span>
            </div>
          </div>
          <code style={{ fontSize: 13, color: "var(--text-tertiary)", background: "var(--bg-elevated)", padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", fontFamily: "var(--font-mono)" }}>
            {model.id}
          </code>
        </div>

        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
          {model.description}
        </p>

        {model.tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            {model.tags.map((tag) => (
              <span key={tag} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, padding: "16px 0", borderTop: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Context</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>{formatTokens(model.contextLength)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Max output</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>{formatTokens(model.maxOutput)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Tier 1 input</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: model.promptPrice === 0 ? "var(--success)" : "var(--text-primary)" }}>
              {model.promptPrice === 0 ? "Free" : `$${model.promptPrice}/M`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Tier 1 output</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: model.completionPrice === 0 ? "var(--success)" : "var(--text-primary)" }}>
              {model.completionPrice === 0 ? "Free" : `$${model.completionPrice}/M`}
            </div>
          </div>
        </div>
        {model.tokenPricingTiers && model.tokenPricingTiers.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>
              Tiered pricing
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {model.tokenPricingTiers.map((tier, idx) => (
                <div key={tier.label} style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1fr 1fr",
                  gap: 12,
                  padding: "10px 12px",
                  borderBottom: idx < model.tokenPricingTiers!.length - 1 ? "1px solid var(--border)" : "none",
                  fontSize: 13,
                }}>
                  <span style={{ fontWeight: 500 }}>{tier.label}</span>
                  <span style={{ textAlign: "right" }}>Input ${tier.promptPrice}/M</span>
                  <span style={{ textAlign: "right" }}>Output ${tier.completionPrice}/M</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card-static" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Capabilities
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {model.supported.map((s) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
              {s}
            </span>
          ))}
        </div>
      </div>

      {protocols.length > 0 && (
        <div className="card-static" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Supported protocols
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {protocols.map((protocol) => (
              <span
                key={protocol}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  background: "rgba(29,78,216,0.08)",
                  color: "#1d4ed8",
                  border: "1px solid rgba(29,78,216,0.16)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {protocol}
              </span>
            ))}
          </div>
        </div>
      )}

      {(capabilityRows.length > 0 || (model.allowed_parameters?.length || 0) > 0) && (
        <div className="card-static" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Capabilities & parameter limits
          </div>
          {capabilityRows.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              {capabilityRows.map(([label, value]) => (
                <div key={label} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          )}
          {(model.allowed_parameters?.length || 0) > 0 && (
            <div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
                Parameters forwarded by the NexusFlow public chat endpoint:
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {model.allowed_parameters!.map((param) => (
                  <span key={param} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {param}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card-static" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          API examples
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          {protocolExamples.map((example) => (
            <div key={example.id} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--bg-subtle)" }}>
              <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.5)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                      {example.label}
                    </div>
                    <code style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                      {example.endpoint}
                    </code>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {example.params.map((param) => (
                    <span
                      key={param}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 500,
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

                {example.note && (
                  <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                    {example.note}
                  </div>
                )}
              </div>

              <div className="code-block">
                <div className="code-block-header">
                  <div className="landing-code-dots"><span /><span /><span /></div>
                  <span style={{ marginLeft: 12, fontSize: 12, color: "#666" }}>
                    {example.filename}
                  </span>
                </div>
                <DocsCodeBlock code={example.code} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-static">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Try it now</div>
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Test this model in Playground</div>
          </div>
          <Link
            href={`/playground?model=${encodeURIComponent(model.id)}`}
            className="btn-primary"
            style={{ padding: "10px 20px" }}
          >
            Open Playground
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
