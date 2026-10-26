"use client";

import { ConfigProvider, Tabs, theme as antTheme } from "antd";
import { ApiOutlined, CodeOutlined, CopyOutlined, CheckOutlined, DollarOutlined, SlidersOutlined } from "@ant-design/icons";
import { useTheme } from "@/lib/theme";
import "./detail.css";
import DocsCodeBlock from "@/components/DocsCodeBlock";
import { useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { useParams } from "next/navigation";
import Link from "next/link";

import { type AIModel, getModelGuidance, formatPrice } from "@/lib/model-detail";
import ModelCostEstimator from "@/components/ModelCostEstimator";

interface ProtocolExample {
  id: string;
  label: string;
  endpoint: string;
  filename: string;
  params: string[];
  code: string;
  note?: string;
}

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
        code: `curl https://nexusflow.hk/v1/chat/completions \\
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
    }]` : ""}
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
        code: `curl https://nexusflow.hk/v1/messages \\
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

    if (protocol === "openai/responses") {
      examples.push({
        id: protocol,
        label: "OpenAI Responses",
        endpoint: "/v1/responses",
        filename: "openai-responses.sh",
        params: ["model", "input", "instructions", "temperature", "max_output_tokens", "top_p", "stream", "tools", "tool_choice"],
        code: `curl https://nexusflow.hk/v1/responses \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "input": "你好！"
  }'`,
        note: "简洁的 Responses API 格式，适合快速调用。",
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
      code: `curl https://nexusflow.hk/v1/embeddings \\
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
      code: `curl https://nexusflow.hk/v1/images/generations \\
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
      code: `curl https://nexusflow.hk/v1/tasks \\
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

  if (model.category === "语音模型") {
    if (model.id.toLowerCase().includes("tts")) {
      examples.push({
        id: "openai/audio-speech",
        label: "OpenAI Audio Speech (TTS)",
        endpoint: "/v1/audio/speech",
        filename: "openai-tts.sh",
        params: ["model", "input", "voice", "response_format"],
        code: `curl https://nexusflow.hk/v1/audio/speech \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.id}",
    "input": "你好世界，这是语音合成测试。",
    "voice": "alloy"
  }' \\
  --output speech.wav`,
        note: "返回音频二进制数据。voice 支持 alloy/ash/nova/echo/sage/shimmer 等，也可传上游原生音色名。",
      });
    }
    if (model.id.toLowerCase().includes("asr") && model.id.endsWith("-streaming")) {
      examples.push({
        id: "nexusflow/asr-websocket",
        label: "WebSocket 实时语音识别",
        endpoint: "wss://nexusflow.hk/api-ws/v1/inference",
        filename: "asr-websocket.py",
        params: ["model", "parameters.format", "parameters.sample_rate", "parameters.language_hints", "input.context"],
        code: `import asyncio, json, uuid, websockets  # pip install websockets

async def main():
    task_id = str(uuid.uuid4())
    async with websockets.connect(
        "wss://nexusflow.hk/api-ws/v1/inference",
        additional_headers={"Authorization": "Bearer " + API_KEY},
    ) as ws:
        await ws.send(json.dumps({
            "header": {"action": "run-task", "task_id": task_id, "streaming": "duplex"},
            "payload": {
                "task_group": "audio", "task": "asr", "function": "recognition",
                "model": "${model.id}",
                "parameters": {"format": "pcm", "sample_rate": 16000},
                "input": {},
            },
        }))
        while json.loads(await ws.recv())["header"]["event"] != "task-started":
            pass
        async def send_audio():
            with open("audio.pcm", "rb") as f:  # 16 kHz 单声道 16-bit PCM
                while chunk := f.read(3200):
                    await ws.send(chunk)
                    await asyncio.sleep(0.1)
            await ws.send(json.dumps({"header": {"action": "finish-task", "task_id": task_id, "streaming": "duplex"}, "payload": {"input": {}}}))
        asyncio.create_task(send_audio())
        async for raw in ws:
            msg = json.loads(raw)
            if msg["header"]["event"] == "result-generated":
                sentence = msg["payload"]["output"]["sentence"]
                print(("[final] " if sentence.get("sentence_end") else "[partial] ") + sentence["text"])
            elif msg["header"]["event"] in ("task-finished", "task-failed"):
                print(msg["header"]["event"], msg["payload"].get("usage", ""))
                break

asyncio.run(main())`,
        note: "协议与百炼 DashScope 实时语音识别一致：先发 run-task，等 task-started 后推送单声道音频帧，最后发 finish-task。单个连接最长 30 分钟、费用上限约 5 分钟音频，超过会自动结束任务，重连即可继续。按累计 token 计费，连接中途断开也会结算已识别部分。",
      });
    } else if (model.id.toLowerCase().includes("asr")) {
      const tokenBilledAsr = model.id === "qwen-audio-3.1-asr-flash";
      examples.push({
        id: "openai/audio-transcriptions",
        label: "OpenAI Audio Transcriptions (ASR)",
        endpoint: "/v1/audio/transcriptions",
        filename: "openai-asr.sh",
        params: tokenBilledAsr
          ? ["model", "file_url", "language", "prompt", "format", "response_format"]
          : ["model", "file_url", "response_format"],
        code: `curl https://nexusflow.hk/v1/audio/transcriptions \\
  -H "Authorization: Bearer $API_KEY" \\
  -F "model=${model.id}" \\${tokenBilledAsr ? `
  -F "language=zh" \\` : ""}
  -F "file_url=https://example.com/audio.wav"`,
        note: tokenBilledAsr
          ? "file_url 指向公网可访问的音频文件 URL（单文件不超过 5 分钟）。language 可选，为语种提示（如 zh、en、yue，最多 4 个，逗号分隔）；prompt 可选，提供专有名词等上下文以提升识别。返回 { text, usage }，按输入音频 token 与输出文本 token 计费。"
          : "file_url 指向公网可访问的音频文件 URL。返回 { text: '...' } 转录结果。",
      });
    }
  }

  return examples;
}

export default function ModelDetailPage() {
  const params = useParams();
  const { theme } = useTheme();
  const [model, setModel] = useState<AIModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeProtocol, setActiveProtocol] = useState("");
  const [copiedId, setCopiedId] = useState(false);
  const [activeSection, setActiveSection] = useState("nmd-overview");

  useEffect(() => {
    if (!model) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting);
      if (visible.length) setActiveSection(visible[0].target.id);
    }, { rootMargin: "-100px 0px -55% 0px" });
    document.querySelectorAll(".nmd-content > section").forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [model]);

  async function copyModelId() {
    if (!model) return;
    try {
      await navigator.clipboard.writeText(model.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch { setCopiedId(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    async function loadModel() {
      setLoading(true);
      setLoadError("");
      setModel(null);
      try {
        // catch-all：params.id 为 string[]（多段，如 ["kimi","kimi-k3"]）或 string（单段）
        const rawId = Array.isArray(params.id) ? params.id.join("/") : (params.id as string);
        const decodedId = decodeURIComponent(rawId || "");
        const res = await fetchAPI(`/api/models/${encodeURIComponent(decodedId)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (res.success) {
          setModel(res.data);
        } else {
          setLoadError(res.message || "模型信息加载失败，请稍后重试");
        }
      } catch {
        if (controller.signal.aborted) return;
        setLoadError("模型服务暂时不可用，请稍后重试");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadModel();
    return () => controller.abort();
  }, [params.id]);

  function formatTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
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
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>{loadError || "模型未找到"}</div>
        <Link href="/models" className="btn-secondary">返回模型列表</Link>
      </div>
    );
  }

  const pricingType = model.pricingType || "token";
  const isUnitPriced = pricingType !== "token";
  const isAvailable = !model.availability || model.availability === "available";
  const pricingPending = model.promptPrice == null || model.completionPrice == null;
  const availabilityLabel = isAvailable
    ? "可用"
    : model.lifecycle === "announced"
      ? "即将上线"
      : model.availability === "disabled"
        ? "已下架"
        : "暂不可用";
  const availabilityDescription = model.availabilityReason === "pricing_unpublished"
    ? "Azure 官方价格与轮换凭据验证完成后开放调用。"
    : model.availabilityReason || "当前没有已配置的可用渠道，请稍后再试。";
  const pricingUnit = pricingType === "per-second"
    ? "秒"
    : pricingType === "per-image"
      ? "张"
      : pricingType === "per-10k-characters"
        ? "万字符"
        : "百万 Token";
  const unitPrice = model.pricingTiers?.[0]?.price ?? model.promptPrice;
  const protocolExamples = getProtocolExamples(model);
  const capabilityRows = model.capabilities ? [
    ["类型", model.capabilities.model_type],
    ["思考模式", model.capabilities.thinking_mode === "mixed" ? `可开关${model.capabilities.thinking_default === null ? "" : `，默认${model.capabilities.thinking_default ? "开启" : "关闭"}`}` : model.capabilities.thinking_mode === "always" ? "仅思考，不能关闭" : model.capabilities.thinking_mode === "unknown" ? "未声明" : "无"],
    ["工具调用", model.capabilities.supports_tools ? "支持" : "未声明"],
    ["视觉输入", model.capabilities.supports_vision ? "支持" : "未声明"],
    ["视频输入", model.capabilities.supports_video_input ? "支持" : "未声明"],
    ["音频输入", model.capabilities.supports_audio_input ? "支持" : "未声明"],
    ["thinking_budget", model.capabilities.supports_thinking_budget ? "支持" : "未声明"],
    ["preserve_thinking", model.capabilities.supports_preserve_thinking ? "支持" : "未声明"],
    ["搜索参数", model.capabilities.supports_search ? "支持" : "当前未开放"],
  ] : [];

  const description = model.id === "qwen3.8-max"
    ? "通义千问旗舰模型，支持视觉理解、工具调用与可切换的思考模式，适用于编程、文档分析及智能体任务。"
    : model.description;
  const price = (value: number | null | undefined) => value == null ? "待公布" : `¥${formatPrice(value)}`;

  const guidance = getModelGuidance(model);
  const sectionLinks = [
    { id: "nmd-overview", label: "概览", icon: <ApiOutlined /> },
    { id: "nmd-pricing", label: "定价", icon: <DollarOutlined /> },
    { id: "nmd-capabilities", label: "模型能力", icon: <SlidersOutlined /> },
    { id: "nmd-integration", label: "API 接入", icon: <CodeOutlined /> },
  ];

  return (
    <article className="nmd">
      <nav className="nmd-breadcrumb" aria-label="面包屑"><Link href="/models">← 模型目录</Link></nav>
      <header className="nmd-hero">
        <div className="nmd-identity">
          <h1>{model.name}<span className="nmd-provider">{model.provider}</span></h1>
          <div className="nmd-model-id"><code>{model.id}</code><button type="button" className="nmd-copy-id" onClick={copyModelId} aria-label={copiedId ? "模型 ID 已复制" : "复制模型 ID"} title={copiedId ? "已复制" : "复制模型 ID"}>{copiedId ? <CheckOutlined /> : <CopyOutlined />}</button><span className={`nmd-status ${isAvailable ? "is-available" : "is-unavailable"}`}><i aria-hidden="true" />{availabilityLabel}</span></div>
        </div>
        <div className="nmd-actions">
          <a href="#nmd-integration" className="nmd-api-button"><CodeOutlined /> API</a>
          {isAvailable ? <Link href="/keys" className="btn-primary">获取 API Key <span aria-hidden="true">↗</span></Link> : <span className="nmd-unavailable">当前未开放调用</span>}
        </div>
      </header>
      <p className="nmd-description">{description.length > 160 ? `${description.slice(0, 160)}…` : description}</p>
      {(description.length > 160 || description !== model.description) && <details className="nmd-description-more"><summary>展开介绍</summary><p>{model.description}</p></details>}
      {!isAvailable && <p className="nmd-notice" role="status">{availabilityDescription}</p>}
      <dl className="nmd-specs">
        <div><dt>{isUnitPriced ? "起步价格" : "输入 / 输出价格"}</dt><dd>{pricingPending ? "待公布" : isUnitPriced ? price(unitPrice) : `${price(model.promptPrice)} / ${price(model.completionPrice)}`}<small>/ {pricingUnit}{model.tokenPricingTiers?.length ? " · 首阶" : ""}</small></dd></div>
        {!isUnitPriced && model.contextLength > 0 && <div><dt>上下文窗口</dt><dd title={`${model.contextLength.toLocaleString()} tokens`}>{formatTokens(model.contextLength)}<small>tokens</small></dd></div>}
        {!isUnitPriced && model.maxOutput > 0 && <div><dt>最大输出</dt><dd title={`${model.maxOutput.toLocaleString()} tokens`}>{formatTokens(model.maxOutput)}<small>tokens</small></dd></div>}
        <div><dt>模型类型</dt><dd>{model.category}</dd></div>
      </dl>
      <div className="nmd-layout">
        <nav className="nmd-section-nav" aria-label="模型详情目录">{sectionLinks.map(item => <a key={item.id} href={`#${item.id}`} aria-current={activeSection === item.id ? "location" : undefined} onClick={() => setActiveSection(item.id)}>{item.icon}{item.label}</a>)}</nav>
        <div className="nmd-content">
          <section id="nmd-overview" className="nmd-section" aria-labelledby="nmd-overview-title">
            <h2 id="nmd-overview-title">概览</h2>
            <div className="nmd-guidance">
              <div><h3>适合做什么</h3><ul>{guidance.uses.map(item => <li key={item}>{item}</li>)}</ul></div>
              <div><h3>输入与使用限制</h3><ul>{guidance.limits.map(item => <li key={item}>{item}</li>)}</ul></div>
            </div>
            <div className="nmd-protocol-list"><span>支持协议</span>{protocolExamples.length ? protocolExamples.map(example => <a href="#nmd-integration" key={example.id} onClick={() => setActiveProtocol(example.id)}>{example.label.replace("OpenAI Chat Completions", "Chat Completions").replace("Anthropic Messages", "Messages").replace("OpenAI Responses", "Responses")}</a>) : <span>暂无接入示例</span>}</div>
          </section>
        <section id="nmd-pricing" className="nmd-section nmd-pricing" aria-labelledby="nmd-pricing-title">
          <div className="nmd-section-heading"><h2 id="nmd-pricing-title">定价</h2><span>人民币 / {pricingUnit}</span></div>
          <div className="nmd-price-band">{pricingPending ? <p className="nmd-price-pending">价格待公布</p> : isUnitPriced ? <div className="nmd-price-row"><span>起步价格</span><strong>{price(unitPrice)}</strong></div> : <>
            <div className="nmd-price-row"><span>{model.tokenPricingTiers?.length ? "输入 · 首阶" : "输入"}</span><strong>{price(model.promptPrice)}</strong></div>
            <div className="nmd-price-row"><span>{model.tokenPricingTiers?.length ? "输出 · 首阶" : "输出"}</span><strong>{price(model.completionPrice)}</strong></div>
          </>}
          </div><p className="nmd-note">{pricingPending ? "价格公布后开放计费。" : "按实际用量计费。账户专属折扣以账单为准。"}</p>
          {isUnitPriced && !!model.pricingTiers?.length && <div className="nmd-price-group"><h3>规格定价</h3>{model.pricingTiers.map(tier => <div className="nmd-price-line" key={tier.label}><span>{tier.label}</span><strong>{price(tier.price)}</strong></div>)}</div>}
          {model.cachePricing && <div className="nmd-price-group"><h3>上下文缓存</h3><div className="nmd-cache-grid">
            <div className="nmd-price-line"><span>隐式缓存命中</span><strong>{price(model.cachePricing.implicitHit)}</strong></div>
            {model.cachePricing.explicitHit !== undefined && <div className="nmd-price-line"><span>显式缓存命中</span><strong>{price(model.cachePricing.explicitHit)}</strong></div>}
            {model.cachePricing.explicitCreation !== undefined && <div className="nmd-price-line"><span>显式缓存创建</span><strong>{price(model.cachePricing.explicitCreation)}</strong></div>}
            </div><p className="nmd-note">{model.cachePricing.explicitHit !== undefined ? "缓存命中部分按缓存价计费，未命中部分按输入价计费。" : "自动应用隐式缓存，无需设置显式缓存开关。"}</p>
          </div>}
          {!!model.tokenPricingTiers?.length && <details className="nmd-details"><summary>完整阶梯价格 <span>{model.tokenPricingTiers.length} 档</span></summary>
            {model.tokenPricingTiers.map(tier => {
              const cache = model.cachePricing?.tiers?.find(item => item.label === tier.label);
              return <div className="nmd-tier" key={tier.label}><h3>{tier.label}</h3><div className="nmd-price-line"><span>输入 / 输出</span><strong>{price(tier.promptPrice)} / {price(tier.completionPrice)}</strong></div>{cache && <><div className="nmd-price-line"><span>隐式缓存命中</span><strong>{price(cache.implicitHit)}</strong></div>{cache.explicitHit !== undefined && <div className="nmd-price-line"><span>显式缓存命中</span><strong>{price(cache.explicitHit)}</strong></div>}{cache.explicitCreation !== undefined && <div className="nmd-price-line"><span>显式缓存创建</span><strong>{price(cache.explicitCreation)}</strong></div>}</>}</div>;
            })}
          </details>}
          {model.thinkingPricing && <div className="nmd-price-group"><h3>思考模式输出价</h3>
            <div className="nmd-price-line"><span>首阶非思考 / 思考</span><strong>{price(model.thinkingPricing.completionPrice)} / {price(model.thinkingPricing.thinkingCompletionPrice)}</strong></div>
            <p className="nmd-note">开启思考时，思维链与回答的全部输出 token 按思考价计费。</p>
            {!!model.thinkingPricing.tiers?.length && <details className="nmd-details"><summary>查看思考模式阶梯</summary>{model.thinkingPricing.tiers.map(tier => <div className="nmd-tier" key={tier.label}><h3>{tier.label}</h3><div className="nmd-price-line"><span>非思考 / 思考</span><strong>{price(tier.completionPrice)} / {price(tier.thinkingCompletionPrice)}</strong></div></div>)}</details>}
          </div>}
          {!!model.alternatePricingModes?.length && <details className="nmd-details"><summary>其它定价模式</summary>{model.alternatePricingModes.map(mode => <div className="nmd-tier" key={mode.id}><h3>{mode.label}</h3><div className="nmd-price-line"><span>输入 / 输出</span><strong>{price(mode.promptPrice)} / {price(mode.completionPrice)}</strong></div><p className="nmd-note">{mode.availability === "available" ? "可用" : "官方已公布，暂未开放"}{mode.note ? `。${mode.note}` : ""}</p></div>)}</details>}
          <ModelCostEstimator key={model.id} model={model} />
          <Link href="/pricing" className="nmd-pricing-link">查看全部模型定价 <span aria-hidden="true">↗</span></Link>
        </section>
          <section id="nmd-capabilities" className="nmd-section" aria-labelledby="nmd-capabilities-title">
            <h2 id="nmd-capabilities-title">模型能力</h2>
            <ul className="nmd-capabilities">{model.supported.map(item => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
            {capabilityRows.length > 0 && <details className="nmd-details"><summary>能力与参数边界</summary><dl className="nmd-capability-rows">{capabilityRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>}
          </section>

          <section id="nmd-integration" className="nmd-section" aria-labelledby="nmd-integration-title">
            <div className="nmd-section-heading"><h2 id="nmd-integration-title">API 接入</h2><span>使用你的 NexusFlow API Key</span></div>
            {protocolExamples.length ? <ConfigProvider theme={{ algorithm: theme === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm, token: { fontFamily: "var(--font-sans)", colorPrimary: theme === "dark" ? "#e5e7eb" : "#171717" } }}><Tabs key={model.id} className="nmd-protocols" activeKey={protocolExamples.some(example => example.id === activeProtocol) ? activeProtocol : protocolExamples[0]?.id} onChange={setActiveProtocol} items={protocolExamples.map(example => ({
              key: example.id,
              label: example.label.replace("OpenAI Chat Completions", "Chat Completions").replace("Anthropic Messages", "Messages").replace("OpenAI Responses", "Responses"),
              children: <div>
                <div className="nmd-endpoint"><span>{example.endpoint.startsWith("wss:") ? "WSS" : "POST"}</span><code>{example.endpoint}</code></div>
                <DocsCodeBlock code={example.code} />
                {example.note && <p className="nmd-note">{example.note}</p>}
                <details className="nmd-details"><summary>支持的请求参数 <span>{example.params.length}</span></summary><div className="nmd-parameters">{example.params.map(param => <code key={param}>{param}</code>)}</div></details>
              </div>,
            }))} /></ConfigProvider> : <p className="nmd-note">该模型暂未提供接入示例，请查阅文档。</p>}
          </section>

        </div>
      </div>
    </article>
  );
}
