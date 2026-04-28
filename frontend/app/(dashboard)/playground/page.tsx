"use client";

import { Suspense, useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchAPI } from "@/lib/api";
import CostEstimate from "@/components/CostEstimate";
import PlaygroundHistory, { saveToHistory, HistoryEntry } from "@/components/PlaygroundHistory";
import PromptTemplates from "@/components/PromptTemplates";
import ErrorSuggestion, { ApiError } from "@/components/ErrorSuggestion";

interface AIModel { id: string; name: string; provider: string; category: string; promptPrice: number; completionPrice: number; tags?: string[]; }
interface Message { role: "user" | "assistant" | "system"; content: string; reasoningContent?: string; type?: "text" | "image" | "video"; mediaUrl?: string; status?: "pending" | "processing" | "done" | "error"; isStreaming?: boolean; }
interface UsageInfo { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost: string; }
type ModelMode = "chat" | "image" | "video";

interface UploadedFile {
  id: string;
  type: "image" | "video";
  name: string;
  url: string;
  preview: string;
  uploading: boolean;
  error?: string;
}

function renderInlineMarkdown(text: string) {
  const parts: any[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={`${match.index}-b`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={`${match.index}-c`} style={{ padding: "1px 5px", borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: "0.92em" }}>
          {token.slice(1, -1)}
        </code>
      );
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a
            key={`${match.index}-a`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--accent)", textDecoration: "underline" }}
          >
            {linkMatch[1]}
          </a>
        );
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

function MarkdownBlock({ text, compact = false }: { text: string; compact?: boolean }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: any[] = [];
  let i = 0;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      <p key={`p-${blocks.length}`} style={{ margin: 0, whiteSpace: "pre-wrap" }}>
        {renderInlineMarkdown(paragraph.join(" ").trim())}
      </p>
    );
    paragraph = [];
  };

  const codeFence = /^```([\w-]+)?\s*$/;
  const heading = /^(#{1,3})\s+(.+)$/;
  const unordered = /^[-*+]\s+(.+)$/;
  const ordered = /^\d+\.\s+(.+)$/;
  const isTableDivider = (line: string) => /^\s*\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(line);

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      i++;
      continue;
    }

    const codeMatch = trimmed.match(codeFence);
    if (codeMatch) {
      flushParagraph();
      const language = codeMatch[1] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().match(/^```\s*$/)) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push(
        <pre
          key={`code-${blocks.length}`}
          style={{
            margin: 0,
            padding: "12px 14px",
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            overflow: "auto",
            fontSize: compact ? 12 : 12.5,
            lineHeight: 1.65,
          }}
        >
          {language ? <div style={{ marginBottom: 8, fontSize: 11, color: "var(--text-tertiary)" }}>{language}</div> : null}
          <code style={{ whiteSpace: "pre-wrap" }}>{codeLines.join("\n")}</code>
        </pre>
      );
      i++;
      continue;
    }

    const headingMatch = trimmed.match(heading);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const tagStyle = level === 1 ? { margin: "0 0 10px", fontSize: 18, lineHeight: 1.35 } : level === 2 ? { margin: "12px 0 8px", fontSize: 16, lineHeight: 1.35 } : { margin: "12px 0 6px", fontSize: 14, lineHeight: 1.35 };
      blocks.push(
        <div key={`h-${blocks.length}`} style={{ fontWeight: 700, color: "var(--text-primary)", ...tagStyle }}>
          {renderInlineMarkdown(headingMatch[2])}
        </div>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={`q-${blocks.length}`} style={{ margin: 0, padding: "10px 12px", borderLeft: "3px solid var(--accent)", background: "var(--bg-elevated)", borderRadius: 8, color: "var(--text-secondary)" }}>
          {renderInlineMarkdown(quoteLines.join(" "))}
        </blockquote>
      );
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} style={{ margin: 0, paddingLeft: 20 }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ marginBottom: idx === items.length - 1 ? 0 : 6 }}>
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} style={{ margin: 0, paddingLeft: 20 }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ marginBottom: idx === items.length - 1 ? 0 : 6 }}>
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (trimmed.includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1] || "")) {
      flushParagraph();
      const header = trimmed.split("|").map((cell) => cell.trim()).filter(Boolean);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        const row = lines[i].split("|").map((cell) => cell.trim()).filter(Boolean);
        if (row.length) rows.push(row);
        i++;
      }
      blocks.push(
        <div key={`table-${blocks.length}`} style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: compact ? 12 : 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                {header.map((cell, idx) => (
                  <th key={idx} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                    {renderInlineMarkdown(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                      {renderInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    paragraph.push(trimmed);
    i++;
  }

  flushParagraph();
  return <div style={{ display: "grid", gap: compact ? 8 : 10 }}>{blocks}</div>;
}

function PlaygroundInner() {
  const searchParams = useSearchParams();
  const requestedModel = searchParams.get("model") || "";
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("你是一个有用的AI助手。");
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState<ModelMode>("chat");
  const [streamEnabled, setStreamEnabled] = useState(true); // 流式开关
  const [apiKey, setApiKey] = useState(""); // API Key 状态
  const [showApiKeyInput, setShowApiKeyInput] = useState(true); // 默认显示 API Key 输入框
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [lastError, setLastError] = useState<ApiError | string | null>(null);
  // Video generation parameters
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoResolution, setVideoResolution] = useState("720p");
  const [videoRatio, setVideoRatio] = useState("16:9");

  useEffect(() => {
    async function loadModels() {
      const res = await fetchAPI("/api/models");
      if (res.success) {
        setModels(res.data);
        const preferredIds = [
          requestedModel,
          "deepseek-v4-pro",
          "qwen3.6-max-preview",
          "qwen3.6-plus",
          "deepseek-v4-flash",
          "qwen3.5-plus",
          "qwen3-max",
          "qwen-plus",
        ].filter(Boolean);
        const preferred = preferredIds.find((id) => res.data.some((m: AIModel) => m.id === id));
        const fallback = res.data.find((m: AIModel) => m.category === "大语言模型") || res.data[0];
        setSelectedModel(preferred || fallback?.id || "");
      }
    }
    loadModels();
    // 从 localStorage 加载 API Key
    const savedKey = localStorage.getItem("api_key") || "";
    setApiKey(savedKey);
    // 如果有保存的 key，隐藏输入区域；否则显示
    setShowApiKeyInput(!savedKey);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      // Clean up object URLs for uploaded files
      uploadedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    };
  }, [requestedModel]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const m = models.find((m) => m.id === selectedModel);
    if (m) {
      if (m.category === "图像生成") setMode("image");
      else if (m.category === "视频生成") setMode("video");
      else setMode("chat");
      // Clear uploaded files when model changes
      setUploadedFiles(prev => { prev.forEach(f => URL.revokeObjectURL(f.preview)); return []; });
    }
  }, [selectedModel, models]);

  // ============================================================
  // 流式聊天消息
  // ============================================================

  async function sendChatMessageStream() {
    if (!input.trim() || sending) return;

    const userMsg: Message = { role: "user", content: input.trim(), type: "text" };
    const assistantMsg: Message = { role: "assistant", content: "", reasoningContent: "", type: "text", isStreaming: true };

    setMessages((p) => [...p, userMsg, assistantMsg]);
    setInput("");
    setSending(true);

    const allMsgs = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      ...messages.filter(m => m.type === "text"),
      userMsg,
    ];

    // 创建 AbortController 用于取消请求
    abortControllerRef.current = new AbortController();

    try {
      // 检查 API Key
      if (!apiKey) {
        updateLastMessage({
          content: "请先设置 API Key。点击右上角「API Key」按钮输入。",
          isStreaming: false,
          status: "error",
        });
        setSending(false);
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: allMsgs.map(m => ({ role: m.role, content: m.content })),
          stream: true,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json();
        const errorMsg = errData.error?.message || `HTTP ${response.status}`;
        updateLastMessage({
          content: `错误: ${errorMsg}`,
          isStreaming: false,
          status: "error",
        });
        setLastError({ code: errData.error?.code || String(response.status), message: errorMsg, status: response.status });
        setSending(false);
        return;
      }

      // 处理 SSE 流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let fullReasoning = "";
      let tokenCount = 0;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // 解析 SSE 数据
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
                if (data === "[DONE]") {
                  // 流结束
                  updateLastMessage({
                    content: fullContent || fullReasoning || "[空响应]",
                    reasoningContent: fullReasoning,
                    isStreaming: false,
                    status: "done",
                  });
                setSending(false);
                return;
              }

              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta?.content;
                const reasoningDelta = json.choices?.[0]?.delta?.reasoning_content;
                if (delta) {
                  fullContent += delta;
                  tokenCount++;
                  // 实时更新消息
                  updateLastMessage({
                    content: fullContent,
                    isStreaming: true,
                  });
                }
                if (reasoningDelta) {
                  fullReasoning += reasoningDelta;
                  updateLastMessage({
                    reasoningContent: fullReasoning,
                    content: fullContent || fullReasoning,
                    isStreaming: true,
                  });
                }

                // 处理 usage 信息
                if (json.usage) {
                  setUsage({
                    prompt_tokens: json.usage.prompt_tokens || 0,
                    completion_tokens: json.usage.completion_tokens || 0,
                    total_tokens: json.usage.total_tokens || 0,
                    cost: "$" + ((json.usage.total_tokens * 0.001) / 1000).toFixed(4),
                  });
                }
              } catch {
                // JSON 解析错误，忽略
              }
            }
          }
        }
      }

      // 流结束
      updateLastMessage({
        content: fullContent || fullReasoning || "[空响应]",
        reasoningContent: fullReasoning,
        isStreaming: false,
        status: "done",
      });
      setSending(false);

    } catch (err: any) {
      if (err.name === "AbortError") {
        // 用户取消了请求
        updateLastMessage({
          content: "[已取消]",
          isStreaming: false,
          status: "error",
        });
      } else {
        updateLastMessage({
          content: `网络错误: ${err.message}`,
          isStreaming: false,
          status: "error",
        });
        setLastError("network_error");
      }
      setSending(false);
    }
  }

  // ============================================================
  // 非流式聊天（备用）
  // ============================================================

  async function sendChatMessageNonStream() {
    if (!input.trim() || sending) return;

    // 检查 API Key
    if (!apiKey) {
      setMessages((p) => [...p, {
        role: "assistant",
        content: "请先设置 API Key。点击右上角「API Key」按钮输入。",
        type: "text",
        status: "error",
      }]);
      return;
    }

    const userMsg: Message = { role: "user", content: input.trim(), type: "text" };
    const allMsgs = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      ...messages.filter(m => m.type === "text"),
      userMsg,
    ];

    setMessages((p) => [...p, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: allMsgs.map(m => ({ role: m.role, content: m.content })),
          stream: false,
        }),
      });

      const data = await res.json();

      if (res.ok && data.choices) {
        setMessages((p) => [...p, {
          role: "assistant",
          content: data.choices[0].message.content || data.choices[0].message.reasoning_content || "[空响应]",
          reasoningContent: data.choices[0].message.reasoning_content || "",
          type: "text",
          status: "done",
        }]);
        setUsage({
          prompt_tokens: data.usage?.prompt_tokens || 0,
          completion_tokens: data.usage?.completion_tokens || 0,
          total_tokens: data.usage?.total_tokens || 0,
          cost: "$" + ((data.usage?.total_tokens || 0) * 0.001 / 1000).toFixed(4),
        });
      } else {
        const errorMsg = data.error?.message || `HTTP ${res.status}`;
        setMessages((p) => [...p, {
          role: "assistant",
          content: `错误: ${errorMsg}`,
          type: "text",
          status: "error",
        }]);
        setLastError({ code: data.error?.code || String(res.status), message: errorMsg, status: res.status });
      }
    } catch {
      setMessages((p) => [...p, {
        role: "assistant",
        content: "网络错误，请确认后端服务已启动。",
        type: "text",
        status: "error",
      }]);
      setLastError("network_error");
    } finally {
      setSending(false);
    }
  }

  // ============================================================
  // 图像生成
  // ============================================================

  async function generateImage() {
    if (!input.trim() || sending) return;

    const { images } = getUploadedUrls();

    // Check for uploading files
    if (uploadedFiles.some(f => f.uploading)) {
      alert("文件上传中，请稍候");
      return;
    }

    setMessages((p) => [...p,
      { role: "user", content: input.trim(), type: "text" },
      { role: "assistant", content: "正在生成图片...", type: "image", status: "pending" }
    ]);
    setInput("");
    setSending(true);

    try {
      const body: Record<string, any> = {
        model: selectedModel,
        prompt: input.trim(),
      };
      if (images.length > 0) body.ref_img = images[0];

      const res = await fetchAPI("/api/image/generate", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (res.success && res.data.task_id) {
        pollImageStatus(res.data.task_id, messages.length + 1);
      } else {
        updateLastMessage({ content: `错误: ${res.message || "图片生成失败"}`, status: "error" });
        setSending(false);
      }
    } catch {
      updateLastMessage({ content: "网络错误", status: "error" });
      setSending(false);
    }
  }

  function pollImageStatus(taskId: string, idx: number) {
    let n = 0;
    pollingRef.current = setInterval(async () => {
      if (++n > 60) {
        clearInterval(pollingRef.current!);
        updateMessageAt(idx, { content: "超时，请重试", status: "error" });
        setSending(false);
        return;
      }

      try {
        const res = await fetchAPI(`/api/image/status/${taskId}`);
        if (res.success) {
          if (res.data.task_status === "SUCCEEDED") {
            clearInterval(pollingRef.current!);
            updateMessageAt(idx, {
              content: "图片生成完成",
              mediaUrl: res.data.results?.[0]?.url,
              status: "done",
            });
            setSending(false);
          } else if (res.data.task_status === "FAILED") {
            clearInterval(pollingRef.current!);
            updateMessageAt(idx, { content: "生成失败", status: "error" });
            setSending(false);
          } else {
            updateMessageAt(idx, {
              content: `正在生成... (${res.data.task_status})`,
              status: "processing",
            });
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
  }

  // ============================================================
  // 视频生成
  // ============================================================

  async function generateVideo() {
    if (!input.trim() || sending) return;

    // Check if required files are uploaded
    const { images, videos } = getUploadedUrls();
    const config = getUploadConfig(selectedModel);

    if (config.requiredImages && images.length === 0) {
      alert("请上传所需图片");
      return;
    }
    if (config.requiredVideos && videos.length === 0) {
      alert("请上传所需视频");
      return;
    }

    // Check for uploading files
    if (uploadedFiles.some(f => f.uploading)) {
      alert("文件上传中，请稍候");
      return;
    }

    setMessages((p) => [...p,
      { role: "user", content: input.trim(), type: "text" },
      { role: "assistant", content: "正在生成视频...", type: "video", status: "pending" }
    ]);
    setInput("");
    setSending(true);

    try {
      const body: Record<string, any> = {
        model: selectedModel,
        prompt: input.trim(),
        duration: videoDuration,
        resolution: videoResolution,
        ratio: videoRatio,
      };
      // Add uploaded files
      if (images.length === 1) body.img_url = images[0];
      else if (images.length > 1) body.img_urls = images;
      if (videos.length > 0) body.video_url = videos[0];

      const res = await fetchAPI("/api/video/generate", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (res.success && res.data.task_id) {
        pollVideoStatus(res.data.task_id, messages.length + 1);
      } else {
        updateLastMessage({ content: `错误: ${res.message || "视频生成失败"}`, status: "error" });
        setSending(false);
      }
    } catch {
      updateLastMessage({ content: "网络错误", status: "error" });
      setSending(false);
    }
  }

  function pollVideoStatus(taskId: string, idx: number) {
    let n = 0;
    pollingRef.current = setInterval(async () => {
      if (++n > 120) {
        clearInterval(pollingRef.current!);
        updateMessageAt(idx, { content: "超时，请重试", status: "error" });
        setSending(false);
        return;
      }

      try {
        const res = await fetchAPI(`/api/video/status/${taskId}`);
        if (res.success) {
          const s = res.data.status;
          if (s === "successful") {
            clearInterval(pollingRef.current!);
            updateMessageAt(idx, {
              content: "视频生成完成",
              mediaUrl: res.data.video_url,
              status: "done",
            });
            setSending(false);
          } else if (s === "failed") {
            clearInterval(pollingRef.current!);
            updateMessageAt(idx, { content: "生成失败", status: "error" });
            setSending(false);
          } else {
            updateMessageAt(idx, {
              content: `正在生成... (${s || "processing"})`,
              status: "processing",
            });
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  }

  // ============================================================
  // 辅助函数
  // ============================================================

  function updateLastMessage(u: Partial<Message>) {
    setMessages((p) => {
      const n = [...p];
      if (n.length > 0) n[n.length - 1] = { ...n[n.length - 1], ...u };
      return n;
    });
  }

  function updateMessageAt(i: number, u: Partial<Message>) {
    setMessages((p) => {
      const n = [...p];
      if (n[i]) n[i] = { ...n[i], ...u };
      return n;
    });
  }

  function handleSend() {
    setLastError(null); // Clear previous error
    if (mode === "chat") {
      // Save to history before sending
      if (messages.length > 0) {
        saveToHistory({
          model: selectedModel,
          messages: messages.filter(m => m.type === "text"),
          systemPrompt,
          input: input.trim(),
        });
      }
      if (streamEnabled) {
        sendChatMessageStream();
      } else {
        sendChatMessageNonStream();
      }
    } else if (mode === "image") {
      generateImage();
    } else {
      generateVideo();
    }
  }

  function handleHistorySelect(entry: HistoryEntry) {
    setMessages(entry.messages);
    setSystemPrompt(entry.systemPrompt || "你是一个有用的AI助手。");
    setSelectedModel(entry.model);
    setInput(entry.input);
  }

  function cancelStream() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }

  function clearChat() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setMessages([]);
    setUsage(null);
    setSending(false);
    setUploadedFiles([]);
    setLastError(null);
  }

  // ============================================================
  // 文件上传
  // ============================================================

  function getUploadConfig(modelId: string) {
    // 根据模型决定上传限制
    // requiredImages/requiredVideos: 是否必须上传（false = 可选）
    const configs: Record<string, { maxImages: number; maxVideos: number; accept: string; multiple: boolean; requiredImages?: boolean; requiredVideos?: boolean }> = {
      // HappyHorse
      "happyhorse-1.0-i2v": { maxImages: 1, maxVideos: 0, accept: "image/*", multiple: false, requiredImages: true },
      "happyhorse-1.0-r2v": { maxImages: 9, maxVideos: 0, accept: "image/*", multiple: true, requiredImages: true },
      "happyhorse-1.0-video-edit": { maxImages: 5, maxVideos: 1, accept: "image/*,video/*", multiple: true, requiredVideos: true },
      "happyhorse-1.0-t2v": { maxImages: 0, maxVideos: 0, accept: "", multiple: false },
      // PixVerse - 支持文生视频和图生视频，图片可选
      "pixverse-v6": { maxImages: 1, maxVideos: 0, accept: "image/*", multiple: false, requiredImages: false },
    };
    return configs[modelId] || { maxImages: 0, maxVideos: 0, accept: "", multiple: false };
  }

  function needsUpload(modelId: string) {
    const config = getUploadConfig(modelId);
    return config.maxImages > 0 || config.maxVideos > 0;
  }

  function canUploadMore(type: "image" | "video") {
    const config = getUploadConfig(selectedModel);
    const images = uploadedFiles.filter(f => f.type === "image").length;
    const videos = uploadedFiles.filter(f => f.type === "video").length;
    if (type === "image") return images < config.maxImages && config.maxImages > 0;
    if (type === "video") return videos < config.maxVideos && config.maxVideos > 0;
    return false;
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Reset input value to allow re-upload of same file
    event.target.value = "";

    const config = getUploadConfig(selectedModel);
    const remainingImages = config.maxImages - uploadedFiles.filter(f => f.type === "image").length;
    const remainingVideos = config.maxVideos - uploadedFiles.filter(f => f.type === "video").length;

    // Validate files
    const fileArray = Array.from(files);
    const toUpload: File[] = [];
    const errors: string[] = [];

    for (const file of fileArray) {
      if (file.type.startsWith("image/") && remainingImages > 0) {
        toUpload.push(file);
      } else if (file.type.startsWith("video/") && remainingVideos > 0) {
        toUpload.push(file);
      } else {
        errors.push(`${file.name}: 不支持的文件类型或超出限制`);
      }
    }

    if (toUpload.length === 0) {
      if (errors.length > 0) alert(errors.join("\n"));
      return;
    }

    // Create local previews
    const newFiles: UploadedFile[] = toUpload.map(file => ({
      id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: file.type.startsWith("image/") ? "image" : "video",
      name: file.name,
      url: "",
      preview: URL.createObjectURL(file),
      uploading: true,
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
    setUploadingCount(c => c + newFiles.length);

    // Upload each file
    for (const file of newFiles) {
      try {
        const formData = new FormData();
        // Find the actual File object
        const originalFile = toUpload.find(f => f.name === file.name);
        if (!originalFile) throw new Error("File not found");
        formData.append("file", originalFile);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Upload failed");
        }

        const data = await res.json();
        // Backend returns { success: true, data: { url: ... } }
        const fileUrl = data.data?.url || data.url;
        if (!fileUrl) throw new Error("Upload response missing URL");
        setUploadedFiles(prev => prev.map(f => f.id === file.id ? { ...f, url: fileUrl, uploading: false } : f));
        setUploadingCount(c => c - 1);
      } catch (err: any) {
        setUploadedFiles(prev => prev.map(f => f.id === file.id ? { ...f, uploading: false, error: err.message } : f));
        setUploadingCount(c => c - 1);
      }
    }
  }

  function removeUploadedFile(id: string) {
    setUploadedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
  }

  function getUploadedUrls() {
    const images = uploadedFiles.filter(f => f.type === "image" && f.url && !f.error).map(f => f.url);
    const videos = uploadedFiles.filter(f => f.type === "video" && f.url && !f.error).map(f => f.url);
    return { images, videos };
  }

  function saveApiKey() {
    localStorage.setItem("api_key", apiKey);
    setShowApiKeyInput(false);
  }

  // ============================================================
  // 渲染
  // ============================================================

  const currentModel = models.find((m) => m.id === selectedModel);
  const visibleModels = useMemo(() => {
    const preferredOrder = [
      requestedModel,
      "deepseek-v4-pro",
      "qwen3.6-max-preview",
      "qwen3.6-plus",
      "deepseek-v4-flash",
      "qwen3.5-plus",
      "qwen3-max",
      "qwen-plus",
    ];
    const query = modelQuery.trim().toLowerCase();
    return [...models]
      .filter((model) => {
        if (!query) return true;
        return [model.id, model.name, model.provider, model.category, ...(model.tags || [])]
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const ai = preferredOrder.indexOf(a.id);
        const bi = preferredOrder.indexOf(b.id);
        const ar = ai === -1 ? preferredOrder.length : ai;
        const br = bi === -1 ? preferredOrder.length : bi;
        return ar - br || a.category.localeCompare(b.category, "zh-Hans-CN") || a.name.localeCompare(b.name, "zh-Hans-CN");
      });
  }, [models, modelQuery, requestedModel]);
  const modeConfig = {
    chat: { label: "文本对话", color: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
    image: { label: "图片生成", color: "var(--warning)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
    video: { label: "视频生成", color: "var(--accent)", bg: "var(--accent-bg)", border: "var(--accent-border)" },
  };
  const placeholders = {
    chat: "输入消息... (Enter 发送，Shift+Enter 换行)",
    image: "描述你想生成的图片...",
    video: "描述你想生成的视频...",
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", fontFamily: "var(--font-sans)" }}>
      <aside style={{ width: 340, borderRight: "1px solid var(--border)", background: "var(--bg)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>模型</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {currentModel?.name || "未选择模型"}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <span style={{
              padding: "3px 8px",
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 600,
              background: modeConfig[mode].bg,
              color: modeConfig[mode].color,
              border: `1px solid ${modeConfig[mode].border}`,
            }}>
              {modeConfig[mode].label}
            </span>
            <span style={{
              padding: "3px 8px",
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 600,
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}>
              {visibleModels.length} / {models.length}
            </span>
          </div>
        </div>

        <div style={{ padding: 12, borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
          <input
            className="input"
            value={modelQuery}
            onChange={(e) => setModelQuery(e.target.value)}
            placeholder="搜索模型、供应商、标签"
            style={{ width: "100%", fontSize: 13 }}
          />
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleModels.map((model) => {
            const active = model.id === selectedModel;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => setSelectedModel(model.id)}
                style={{
                  textAlign: "left",
                  padding: "11px 12px",
                  borderRadius: 8,
                  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: active ? "var(--accent-bg)" : "var(--bg)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {model.name}
                  </div>
                  {model.id === requestedModel && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 5px", borderRadius: 4, background: "var(--success-bg)", color: "var(--success)" }}>
                      来源
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {model.provider} · {model.category}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  <span style={{ fontSize: 10.5, padding: "2px 6px", borderRadius: 4, background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    {model.id}
                  </span>
                  <span style={{ fontSize: 10.5, padding: "2px 6px", borderRadius: 4, background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    {model.promptPrice}/M
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <h1 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Playground</h1>
              <div style={{ width: 1, height: 14, background: "var(--border)" }} />
              <span style={{
                padding: "3px 9px",
                borderRadius: 5,
                fontSize: 11.5,
                fontWeight: 600,
                background: modeConfig[mode].bg,
                color: modeConfig[mode].color,
                border: `1px solid ${modeConfig[mode].border}`,
              }}>
                {modeConfig[mode].label}
              </span>
              <span
                title={currentModel?.id || ""}
                style={{
                  maxWidth: 320,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  padding: "3px 9px",
                  borderRadius: 5,
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                {currentModel?.name || "未选择模型"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              {/* History */}
              {mode === "chat" && (
                <PlaygroundHistory
                  onSelect={handleHistorySelect}
                  currentModel={selectedModel}
                />
              )}
              {/* Prompt Templates */}
              {mode === "chat" && (
                <PromptTemplates
                  onSelect={(prompt) => setInput(prompt)}
                  currentPrompt={input}
                />
              )}
              <button
                className={apiKey ? "btn-secondary" : "btn-danger"}
                style={{ padding: "5px 12px", fontSize: 12.5 }}
                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              >
                {apiKey ? "API Key ✓" : "设置 API Key"}
              </button>
              {mode === "chat" && (
                <>
                  <button
                    className={streamEnabled ? "btn-primary" : "btn-secondary"}
                    style={{ padding: "5px 12px", fontSize: 12.5 }}
                    onClick={() => setStreamEnabled(!streamEnabled)}
                  >
                    {streamEnabled ? "流式 ✓" : "非流式"}
                  </button>
                  <button className="btn-secondary" style={{ padding: "5px 12px", fontSize: 12.5 }} onClick={() => setShowSettings(!showSettings)}>
                    设置
                  </button>
                </>
              )}
              {sending && streamEnabled && mode === "chat" && (
                <button className="btn-danger" style={{ padding: "5px 12px", fontSize: 12.5 }} onClick={cancelStream}>
                  取消
                </button>
              )}
              <button className="btn-secondary" style={{ padding: "5px 12px", fontSize: 12.5 }} onClick={clearChat}>
                清空
              </button>
            </div>
          </div>
        </div>

        {showApiKeyInput && (
          <div style={{
            padding: "12px 18px",
            borderBottom: "1px solid var(--border)",
            background: apiKey ? "var(--bg-elevated)" : "rgba(239,68,68,0.04)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: apiKey ? "var(--text-secondary)" : "#ef4444", fontWeight: 600, letterSpacing: "0.03em" }}>
                {apiKey ? "API KEY ✓" : "API KEY (必填)"}
              </label>
              {!apiKey && (
                <span style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "#ef4444",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 600,
                }}>
                  必须填写
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                type="password"
                style={{
                  flex: 1,
                  fontSize: 13,
                  borderColor: apiKey ? "var(--border)" : "#ef4444",
                }}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-air-xxx"
              />
              <button
                className={apiKey ? "btn-secondary" : "btn-primary"}
                style={{ padding: "6px 14px", fontSize: 12.5 }}
                onClick={saveApiKey}
              >
                保存
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
              从 <Link href="/keys" style={{ color: "var(--accent)" }}>API Key 管理</Link> 获取密钥
            </div>
          </div>
        )}

        {showSettings && mode === "chat" && (
          <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            <label style={{ fontSize: 11.5, color: "var(--text-secondary)", display: "block", marginBottom: 5, fontWeight: 600, letterSpacing: "0.03em" }}>
              SYSTEM PROMPT
            </label>
            <textarea className="input" style={{ minHeight: 52, resize: "vertical", fontSize: 13 }} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="设置AI的角色和行为..." />
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 18px", display: "flex", flexDirection: "column", gap: 12, background: "var(--bg-elevated)" }}>
          {messages.length === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", textAlign: "center" }}>
              <div style={{ marginBottom: 12, opacity: 0.4 }}>
                {mode === "chat" && <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
                {mode === "image" && <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>}
                {mode === "video" && <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
                {mode === "chat" ? "开始对话" : mode === "image" ? "生成图片" : "生成视频"}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                当前模型: {currentModel?.name || "未选择"}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 10, opacity: 0.7 }}>
                {mode === "chat" ? (streamEnabled ? "流式模式：实时显示生成内容" : "在下方输入消息，按 Enter 发送") : "在下方输入描述，点击生成"}
              </div>
                          </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className="animate-fadeIn" style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div className={msg.role === "user" ? "chat-user" : "chat-assistant"}>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {msg.role === "user" ? "你" : currentModel?.name || "AI"}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--text-primary)" }}>
                  <MarkdownBlock text={msg.content} compact />
                  {msg.isStreaming && (
                    <span style={{ display: "inline-block", marginLeft: 4 }}>
                      <span className="typing-dot" style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
                    </span>
                  )}
                </div>
                {msg.reasoningContent && msg.reasoningContent !== msg.content && (
                  <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", fontSize: 12.5, lineHeight: 1.65, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                    <MarkdownBlock text={msg.reasoningContent} compact />
                  </div>
                )}
                {msg.type === "image" && msg.mediaUrl && msg.status === "done" && (
                  <img src={msg.mediaUrl} alt="Generated" style={{ marginTop: 10, maxWidth: "100%", maxHeight: 360, borderRadius: 8, border: "1px solid var(--border)" }} />
                )}
                {msg.type === "video" && msg.mediaUrl && msg.status === "done" && (
                  <video src={msg.mediaUrl} controls preload="auto" style={{ marginTop: 10, maxWidth: "100%", maxHeight: 360, borderRadius: 8, border: "1px solid var(--border)" }} />
                )}
                {(msg.status === "pending" || msg.status === "processing") && (
                  <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 7 }}>
                    <div className="spinner" style={{ width: 13, height: 13 }} />
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>处理中...</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", background: "var(--bg)", flexShrink: 0 }}>
          {/* Upload area */}
          {needsUpload(selectedModel) && (
            <div style={{ marginBottom: 10 }}>
              {/* Upload limit hint */}
              <div style={{
                padding: "8px 12px",
                borderRadius: 6,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                marginBottom: 8,
                fontSize: 11,
                color: "var(--text-tertiary)",
              }}>
                {selectedModel.includes("i2v") && (
                  <>图生视频：上传1张图片作为首帧，支持 JPG/PNG，建议分辨率与输出一致</>
                )}
                {selectedModel.includes("r2v") && (
                  <>参考生视频：上传1-9张参考图片，支持 JPG/PNG，图片中人物/物体将作为主角</>
                )}
                {selectedModel.includes("video-edit") && (
                  <>视频编辑：上传1个视频（3-60秒），可选0-5张参考图片辅助编辑，支持 MP4/WebM</>
                )}
                {selectedModel === "pixverse-v6" && (
                  <>PixVerse V6：可选上传1张图片进行图生视频，否则为文生视频模式</>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 600 }}>
                  上传文件
                  {uploadingCount > 0 && (
                    <span style={{ color: "var(--accent)", marginLeft: 6 }}>
                      ({uploadingCount} 个上传中...)
                    </span>
                  )}
                </span>
                <div style={{ flex: 1 }} />
                {canUploadMore("image") && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: "4px 10px", fontSize: 11.5 }}
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploadingCount > 0}
                  >
                    + 图片
                  </button>
                )}
                {canUploadMore("video") && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: "4px 10px", fontSize: 11.5 }}
                    onClick={() => videoInputRef.current?.click()}
                    disabled={uploadingCount > 0}
                  >
                    + 视频
                  </button>
                )}
              </div>

              {/* File previews */}
              {uploadedFiles.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {uploadedFiles.map(file => (
                    <div
                      key={file.id}
                      style={{
                        position: "relative",
                        width: 64,
                        height: 64,
                        borderRadius: 8,
                        border: file.error ? "1px solid var(--error, #ef4444)" : file.uploading ? "1px solid var(--accent)" : "1px solid var(--success-border, #22c55e40)",
                        overflow: "hidden",
                        background: "var(--bg-elevated)",
                      }}
                    >
                      {file.type === "image" ? (
                        <img src={file.preview} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <video src={file.preview} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                      {/* Uploading overlay */}
                      {file.uploading && (
                        <div style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(0,0,0,0.6)",
                          gap: 4,
                        }}>
                          <div className="spinner" style={{ width: 16, height: 16 }} />
                          <span style={{ fontSize: 9, color: "#fff" }}>上传中</span>
                        </div>
                      )}
                      {/* Success indicator */}
                      {!file.uploading && !file.error && file.url && (
                        <div style={{
                          position: "absolute",
                          bottom: 2,
                          left: 2,
                          padding: "1px 4px",
                          borderRadius: 3,
                          background: "var(--success)",
                          color: "#fff",
                          fontSize: 8,
                          fontWeight: 600,
                        }}>
                          ✓
                        </div>
                      )}
                      {/* Error overlay */}
                      {file.error && (
                        <div style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(239,68,68,0.3)",
                          gap: 2,
                        }}>
                          <span style={{ fontSize: 10, color: "#ef4444" }}>✕</span>
                          <span style={{ fontSize: 8, color: "#ef4444", padding: "0 4px" }}>失败</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeUploadedFile(file.id)}
                        style={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "rgba(0,0,0,0.7)",
                          color: "#fff",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Hidden file inputs */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple={getUploadConfig(selectedModel).multiple}
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
            </div>
          )}

          {/* Video parameters - dynamic based on model */}
          {mode === "video" && selectedModel && (
            <div style={{
              marginBottom: 12,
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                  <polyline points="12 12 12 22"/>
                  <line x1="12" y1="22" x2="2" y2="17"/>
                  <line x1="12" y1="22" x2="22" y2="17"/>
                </svg>
                视频参数
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {/* Duration - options based on model */}
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>时长</div>
                  <select
                    className="input"
                    style={{ fontSize: 13, padding: "6px 10px" }}
                    value={videoDuration}
                    onChange={(e) => setVideoDuration(Number(e.target.value))}
                  >
                    {selectedModel.includes("pixverse") ? (
                      <>
                        <option value={5}>5秒</option>
                        <option value={8}>8秒</option>
                      </>
                    ) : selectedModel.includes("happyhorse") || selectedModel.includes("wan2.6") ? (
                      <>
                        <option value={3}>3秒</option>
                        <option value={5}>5秒</option>
                        <option value={8}>8秒</option>
                        <option value={10}>10秒</option>
                        <option value={12}>12秒</option>
                        <option value={15}>15秒</option>
                      </>
                    ) : (
                      <>
                        <option value={3}>3秒</option>
                        <option value={5}>5秒</option>
                        <option value={8}>8秒</option>
                        <option value={10}>10秒</option>
                        <option value={15}>15秒</option>
                      </>
                    )}
                  </select>
                </div>
                {/* Resolution - options based on model */}
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>分辨率</div>
                  <select
                    className="input"
                    style={{ fontSize: 13, padding: "6px 10px" }}
                    value={videoResolution}
                    onChange={(e) => setVideoResolution(e.target.value)}
                  >
                    {selectedModel.includes("happyhorse") ? (
                      <>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                      </>
                    ) : selectedModel.includes("pixverse") ? (
                      <>
                        <option value="360p">360p</option>
                        <option value="540p">540p</option>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                      </>
                    ) : selectedModel.includes("wan2.6") ? (
                      <>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                      </>
                    ) : (
                      <>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                      </>
                    )}
                  </select>
                </div>
                {/* Aspect ratio */}
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>宽高比</div>
                  <select
                    className="input"
                    style={{ fontSize: 13, padding: "6px 10px" }}
                    value={videoRatio}
                    onChange={(e) => setVideoRatio(e.target.value)}
                  >
                    <option value="16:9">16:9 横屏</option>
                    <option value="9:16">9:16 竖屏</option>
                    <option value="1:1">1:1 方形</option>
                    {selectedModel.includes("happyhorse") && (
                      <>
                        <option value="4:3">4:3</option>
                        <option value="3:4">3:4</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            </div>
          )}

          {usage && mode === "chat" && (
            <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 8 }}>
              <span>输入 {usage.prompt_tokens} tokens</span>
              <span>输出 {usage.completion_tokens} tokens</span>
              <span style={{ color: "var(--success)" }}>费用 {usage.cost}</span>
            </div>
          )}

          {/* Error suggestion */}
          {lastError && (
            <ErrorSuggestion
              error={lastError}
              onClose={() => setLastError(null)}
            />
          )}

          {/* Cost estimate before sending */}
          {!usage && mode === "chat" && input.trim() && (
            <CostEstimate
              model={currentModel || null}
              inputText={input}
              estimatedOutputTokens={500}
            />
          )}

          {/* API Key required warning */}
          {!apiKey && (
            <div style={{
              padding: "12px 16px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              marginBottom: 12,
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#ef4444", marginBottom: 4 }}>
                    必须设置 API Key 才能使用
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    请在上方输入框填写 API Key，或从 <Link href="/keys" style={{ color: "var(--accent)" }}>API Key 管理</Link> 获取密钥
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
            <textarea
              className="input"
              style={{ flex: 1, minHeight: 40, maxHeight: 110, resize: "none", fontSize: 13.5 }}
              placeholder={placeholders[mode]}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={sending && mode !== "chat"}
            />
            <button
              className={apiKey ? "btn-primary" : "btn-secondary"}
              style={{ padding: "9px 18px", alignSelf: "flex-end", flexShrink: 0, opacity: apiKey ? 1 : 0.6 }}
              onClick={handleSend}
              disabled={sending || !input.trim() || !apiKey}
              title={!apiKey ? "请先设置 API Key" : ""}
            >
              {sending ? (
                <span className="spinner" style={{ width: 13, height: 13 }} />
              ) : !apiKey ? (
                <span style={{ fontSize: 12 }}>需设置 Key</span>
              ) : mode === "chat" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              ) : "生成"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <PlaygroundInner />
    </Suspense>
  );
}
