"use client";

import { useState } from "react";

interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  prompt: string;
  icon: string;
}

export const promptTemplates: PromptTemplate[] = [
  {
    id: "chat-general",
    name: "通用对话",
    category: "聊天",
    prompt: "",
    icon: "💬",
  },
  {
    id: "code-help",
    name: "编程助手",
    category: "编程",
    prompt: "请帮我写一个 Python 函数，实现以下功能：\n\n",
    icon: "💻",
  },
  {
    id: "code-explain",
    name: "代码解释",
    category: "编程",
    prompt: "请解释以下代码的作用和逻辑：\n\n```\n在此粘贴代码\n```",
    icon: "📝",
  },
  {
    id: "code-debug",
    name: "代码调试",
    category: "编程",
    prompt: "这段代码有问题，请帮我找出错误并修复：\n\n```\n在此粘贴代码\n```",
    icon: "🐛",
  },
  {
    id: "translate",
    name: "翻译",
    category: "文本",
    prompt: "请将以下文本翻译成英文：\n\n",
    icon: "🌐",
  },
  {
    id: "summarize",
    name: "文档总结",
    category: "文本",
    prompt: "请总结以下文档的核心要点：\n\n",
    icon: "📋",
  },
  {
    id: "creative",
    name: "创意写作",
    category: "创作",
    prompt: "请帮我写一篇关于以下主题的文章：\n\n",
    icon: "✨",
  },
  {
    id: "math",
    name: "数学问题",
    category: "推理",
    prompt: "请详细解答以下数学问题，展示完整的解题步骤：\n\n",
    icon: "🧮",
  },
];

interface PromptTemplatesProps {
  onSelect: (prompt: string) => void;
  currentPrompt: string;
}

export default function PromptTemplates({ onSelect, currentPrompt }: PromptTemplatesProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [...new Set(promptTemplates.map(t => t.category))];

  const filteredTemplates = selectedCategory
    ? promptTemplates.filter(t => t.category === selectedCategory)
    : promptTemplates;

  function handleSelect(template: PromptTemplate) {
    if (template.prompt) {
      onSelect(template.prompt);
    }
    setShowTemplates(false);
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Toggle button */}
      <button
        type="button"
        className="btn-secondary"
        onClick={() => setShowTemplates(!showTemplates)}
        style={{
          padding: "6px 12px",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>📝</span>
        <span>预设模板</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: showTemplates ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {showTemplates && (
        <div
          className="animate-fadeIn"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 12,
            minWidth: 260,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            zIndex: 100,
          }}
        >
          {/* Category filters */}
          <div style={{
            display: "flex",
            gap: 6,
            marginBottom: 12,
            flexWrap: "wrap",
          }}>
            <button
              onClick={() => setSelectedCategory(null)}
              style={{
                padding: "4px 10px",
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 600,
                border: "1px solid var(--border)",
                background: !selectedCategory ? "var(--accent-bg)" : "var(--bg)",
                color: !selectedCategory ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              全部
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  border: "1px solid var(--border)",
                  background: selectedCategory === cat ? "var(--accent-bg)" : "var(--bg)",
                  color: selectedCategory === cat ? "var(--accent)" : "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Template list */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}>
            {filteredTemplates.map(template => (
              <button
                key={template.id}
                onClick={() => handleSelect(template)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: currentPrompt === template.prompt ? "var(--accent-bg)" : "var(--bg)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s",
                }}
              >
                <span style={{ fontSize: 16 }}>{template.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}>
                    {template.name}
                  </div>
                  {template.prompt && (
                    <div style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 180,
                    }}>
                      {template.prompt.slice(0, 30)}...
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}