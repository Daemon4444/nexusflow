"use client";

import { Suspense, useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchAPI } from "@/lib/api";

interface AIModel { id: string; name: string; provider: string; category: string; promptPrice: number; completionPrice: number; tags?: string[]; }
interface Message { role: "user" | "assistant" | "system"; content: string; type?: "text" | "image" | "video"; mediaUrl?: string; status?: "pending" | "processing" | "done" | "error"; isStreaming?: boolean; }
interface UsageInfo { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost: string; }
type ModelMode = "chat" | "image" | "video";

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
  const [showApiKeyInput, setShowApiKeyInput] = useState(false); // 显示 API Key 输入框
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [requestedModel]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const m = models.find((m) => m.id === selectedModel);
    if (m) {
      if (m.category === "图像生成") setMode("image");
      else if (m.category === "视频生成") setMode("video");
      else setMode("chat");
    }
  }, [selectedModel, models]);

  // ============================================================
  // 流式聊天消息
  // ============================================================

  async function sendChatMessageStream() {
    if (!input.trim() || sending) return;

    const userMsg: Message = { role: "user", content: input.trim(), type: "text" };
    const assistantMsg: Message = { role: "assistant", content: "", type: "text", isStreaming: true };

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
        updateLastMessage({
          content: `错误: ${errData.error?.message || `HTTP ${response.status}`}`,
          isStreaming: false,
          status: "error",
        });
        setSending(false);
        return;
      }

      // 处理 SSE 流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
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
                  content: fullContent,
                  isStreaming: false,
                  status: "done",
                });
                setSending(false);
                return;
              }

              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  fullContent += delta;
                  tokenCount++;
                  // 实时更新消息
                  updateLastMessage({
                    content: fullContent,
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
        content: fullContent,
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
          content: data.choices[0].message.content,
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
        setMessages((p) => [...p, {
          role: "assistant",
          content: `错误: ${data.error?.message || `HTTP ${res.status}`}`,
          type: "text",
          status: "error",
        }]);
      }
    } catch {
      setMessages((p) => [...p, {
        role: "assistant",
        content: "网络错误，请确认后端服务已启动。",
        type: "text",
        status: "error",
      }]);
    } finally {
      setSending(false);
    }
  }

  // ============================================================
  // 图像生成
  // ============================================================

  async function generateImage() {
    if (!input.trim() || sending) return;
    setMessages((p) => [...p,
      { role: "user", content: input.trim(), type: "text" },
      { role: "assistant", content: "正在生成图片...", type: "image", status: "pending" }
    ]);
    setInput("");
    setSending(true);

    try {
      const res = await fetchAPI("/api/image/generate", {
        method: "POST",
        body: JSON.stringify({ model: selectedModel, prompt: input.trim() }),
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
    setMessages((p) => [...p,
      { role: "user", content: input.trim(), type: "text" },
      { role: "assistant", content: "正在生成视频...", type: "video", status: "pending" }
    ]);
    setInput("");
    setSending(true);

    try {
      const res = await fetchAPI("/api/video/generate", {
        method: "POST",
        body: JSON.stringify({ model: selectedModel, prompt: input.trim() }),
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
    if (mode === "chat") {
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
          <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            <label style={{ fontSize: 11.5, color: "var(--text-secondary)", display: "block", marginBottom: 5, fontWeight: 600, letterSpacing: "0.03em" }}>
              API KEY
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                type="password"
                style={{ flex: 1, fontSize: 13 }}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-air-xxx"
              />
              <button className="btn-primary" style={{ padding: "6px 14px", fontSize: 12.5 }} onClick={saveApiKey}>
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
                <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                  {msg.content}
                  {msg.isStreaming && (
                    <span style={{ display: "inline-block", marginLeft: 4 }}>
                      <span className="typing-dot" style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
                    </span>
                  )}
                </div>
                {msg.type === "image" && msg.mediaUrl && msg.status === "done" && (
                  <img src={msg.mediaUrl} alt="Generated" style={{ marginTop: 10, maxWidth: "100%", maxHeight: 360, borderRadius: 8, border: "1px solid var(--border)" }} />
                )}
                {msg.type === "video" && msg.mediaUrl && msg.status === "done" && (
                  <video src={msg.mediaUrl} controls style={{ marginTop: 10, maxWidth: "100%", maxHeight: 360, borderRadius: 8, border: "1px solid var(--border)" }} />
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
          {usage && mode === "chat" && (
            <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 8 }}>
              <span>输入 {usage.prompt_tokens} tokens</span>
              <span>输出 {usage.completion_tokens} tokens</span>
              <span style={{ color: "var(--success)" }}>费用 {usage.cost}</span>
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
              className="btn-primary"
              style={{ padding: "9px 18px", alignSelf: "flex-end", flexShrink: 0 }}
              onClick={handleSend}
              disabled={sending || !input.trim()}
            >
              {sending ? (
                <span className="spinner" style={{ width: 13, height: 13 }} />
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
