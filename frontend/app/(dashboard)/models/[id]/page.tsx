"use client";

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
  "大语言模型": "#2563eb",
  "推理模型": "#dc2626",
  "多模态模型": "#7c3aed",
  "编程模型": "#0891b2",
  "图像生成": "#db2777",
  "视频生成": "#f97316",
  "向量模型": "#0f766e",
  "专业模型": "#64748b",
};

function getProtocolExamples(model: AIModel): ProtocolExample[] {
  const protocols = model.supportedProtocols || model.supported_protocols || [];
  const examples: ProtocolExample[] = [];
  const isImageModel = model.category === "图像生成";
  const isVideoModel = model.category === "视频生成";
  const isEmbeddingModel = model.category === "向量模型";
  const isAsyncModel = isImageModel || isVideoModel;
  const supportsTools = model.supported.some((item) => item.includes("工具"));
  const supportsVision = model.supported.some((item) => item.includes("视觉") || item.includes("图像理解"));
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
    "messages": [{"role": "user", "content": "你好！"}],
    "stream": true,
    "stream_options": {"include_usage": true},
    "temperature": 0.7,
    "max_tokens": 512${supportsTools ? `,
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "查询天气",
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
          ? "支持流式输出和常用采样参数；视觉模型可在 messages 中传入图片内容。"
          : "支持流式输出、常用采样参数以及标准对话格式。",
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
      {"role": "user", "content": "你好！"}
    ]
  }'`,
        note: "适合直接复用 Anthropic SDK 或 Claude Code 风格客户端。",
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
        "parts": [{"text": "你好！"}]
      }
    ],
    "generationConfig": {
      "temperature": 0.7,
      "maxOutputTokens": 512
    }
  }'`,
        note: "流式输出使用 :streamGenerateContent?alt=sse，适合兼容 Gemini SDK。",
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
    "input": ["第一段文本", "第二段文本"]
  }'`,
      note: "支持单条文本和字符串数组批量向量化。",
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
    "prompt": "一匹高速奔跑的机械马，金属线条充满速度感",
    "size": "1024x1024"
  }'`,
      note: "适用于支持同步出图的图像模型，常用参数包括 size、n、response_format。",
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
    "prompt": "${isVideoModel ? "生成一段未来城市中穿梭的短视频" : "生成一张质感强烈的产品海报"}"${isVideoModel ? `,
    "duration": 5,
    "aspect_ratio": "16:9"` : `,
    "size": "1024x1024"`}
  }'`,
      note: "提交后返回 task_id，再轮询 GET /v1/tasks/:id 获取状态和结果。",
    });
  }

  return examples;
}

export default function ModelDetailPage() {
  const params = useParams();
  const modelId = params.id as string;
  const [model, setModel] = useState<AIModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      console.error("加载模型详情失败");
    } finally {
      setLoading(false);
    }
  }

  function formatTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
  }

  function copyCode(id: string, code: string) {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
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
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>模型未找到</div>
        <Link href="/models" className="btn-secondary">返回模型列表</Link>
      </div>
    );
  }

  const accent = categoryColors[model.category] || "#111";
  const protocols = model.supportedProtocols || model.supported_protocols || [];
  const protocolExamples = getProtocolExamples(model);
  const capabilityRows = model.capabilities ? [
    ["类型", model.capabilities.model_type],
    ["思考模式", model.capabilities.thinking_mode === "mixed" ? `可开关${model.capabilities.thinking_default === null ? "" : `，默认${model.capabilities.thinking_default ? "开启" : "关闭"}`}` : model.capabilities.thinking_mode === "always" ? "仅思考，不能关闭" : "无"],
    ["工具调用", model.capabilities.supports_tools ? "支持" : "未声明"],
    ["视觉输入", model.capabilities.supports_vision ? "支持" : "未声明"],
    ["视频输入", model.capabilities.supports_video_input ? "支持" : "未声明"],
    ["音频输入", model.capabilities.supports_audio_input ? "支持" : "未声明"],
    ["thinking_budget", model.capabilities.supports_thinking_budget ? "上游支持，当前 public chat 未透传" : "未声明"],
    ["preserve_thinking", model.capabilities.supports_preserve_thinking ? "上游支持，当前 public chat 未透传" : "未声明"],
    ["搜索参数", model.capabilities.supports_search ? "支持" : "当前未开放"],
  ] : [];

  return (
    <div style={{ padding: "32px 44px", fontFamily: "var(--font-sans)" }}>
      <div style={{ marginBottom: 28 }}>
        <Link href="/models" style={{ fontSize: 13, color: "var(--text-tertiary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          返回模型列表
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
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>上下文</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>{formatTokens(model.contextLength)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>最大输出</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>{formatTokens(model.maxOutput)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>首阶输入</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: model.promptPrice === 0 ? "var(--success)" : "var(--text-primary)" }}>
              {model.promptPrice === 0 ? "免费" : `¥${model.promptPrice}/M`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>首阶输出</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: model.completionPrice === 0 ? "var(--success)" : "var(--text-primary)" }}>
              {model.completionPrice === 0 ? "免费" : `¥${model.completionPrice}/M`}
            </div>
          </div>
        </div>
        {model.tokenPricingTiers && model.tokenPricingTiers.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>
              阶梯定价
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
                  <span style={{ textAlign: "right" }}>输入 ¥{tier.promptPrice}/M</span>
                  <span style={{ textAlign: "right" }}>输出 ¥{tier.completionPrice}/M</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card-static" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          支持的功能
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
            支持协议
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
            能力与参数边界
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
                当前 NexusFlow public chat 入口会透传的参数：
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
          API 调用示例
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
                  <button
                    onClick={() => copyCode(example.id, example.code)}
                    className="btn-secondary"
                    style={{ padding: "5px 12px", fontSize: 12, flexShrink: 0 }}
                  >
                    {copiedId === example.id ? "已复制" : "复制"}
                  </button>
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
                <pre className="code-block-body" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  {example.code}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-static">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>立即体验</div>
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>在 Playground 中测试此模型</div>
          </div>
          <Link
            href={`/playground?model=${encodeURIComponent(model.id)}`}
            className="btn-primary"
            style={{ padding: "10px 20px" }}
          >
            打开 Playground
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
