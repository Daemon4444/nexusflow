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
    name: "General Chat",
    category: "Chat",
    prompt: "",
    icon: "💬",
  },
  {
    id: "code-help",
    name: "Code Assistant",
    category: "Coding",
    prompt: "Please help me write a Python function that implements the following:\n\n",
    icon: "💻",
  },
  {
    id: "code-explain",
    name: "Code Explanation",
    category: "Coding",
    prompt: "Please explain the purpose and logic of the following code:\n\n```\nPaste code here\n```",
    icon: "📝",
  },
  {
    id: "code-debug",
    name: "Code Debugging",
    category: "Coding",
    prompt: "This code has issues. Please help me find and fix the errors:\n\n```\nPaste code here\n```",
    icon: "🐛",
  },
  {
    id: "translate",
    name: "Translation",
    category: "Text",
    prompt: "Please translate the following text into English:\n\n",
    icon: "🌐",
  },
  {
    id: "summarize",
    name: "Document Summary",
    category: "Text",
    prompt: "Please summarize the key points of the following document:\n\n",
    icon: "📋",
  },
  {
    id: "creative",
    name: "Creative Writing",
    category: "Creative",
    prompt: "Please help me write an article about the following topic:\n\n",
    icon: "✨",
  },
  {
    id: "math",
    name: "Math Problem",
    category: "Reasoning",
    prompt: "Please solve the following math problem in detail, showing complete step-by-step solution:\n\n",
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
        <span>Templates</span>
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
              All
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