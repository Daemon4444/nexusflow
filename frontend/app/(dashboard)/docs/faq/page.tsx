"use client";

import { useState } from "react";
import Link from "next/link";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://nexusflow.vip";

const faqs = [
  {
    category: "Getting Started",
    questions: [
      {
        q: "What is NexusFlow?",
        a: "NexusFlow is a unified AI model API platform that integrates models from Qwen, DeepSeek, GLM, Kimi, MiniMax, and other providers. You only need one API Key to access all models - no need to register and manage multiple accounts separately.",
      },
      {
        q: "How do I get started?",
        a: "1. Register an account and get an API Key\n2. Install the OpenAI SDK (pip install openai)\n3. Set base_url to ${API_BASE_URL}/v1\n4. Use your API Key to call any model\n\nSee the Quick Start documentation for a complete tutorial.",
      },
      {
        q: "Which programming languages are supported?",
        a: "NexusFlow provides a fully OpenAI-compatible API, so it supports all languages that the OpenAI SDK supports, including: Python, Node.js/TypeScript, Go, Java, C#, Ruby, PHP, and more. We recommend using the official OpenAI SDK.",
      },
    ],
  },
  {
    category: "Account & Billing",
    questions: [
      {
        q: "How do I add balance?",
        a: "After logging in, go to the Billing page to add balance. Alipay payment is currently supported. Once added, your balance can be used to call any model.",
      },
      {
        q: "How does billing work?",
        a: "Billing is based on actual usage, measured in Tokens. Different models have different prices, with input and output priced separately. Prices are in CNY per million Tokens. No minimum spend - pay only for what you use.",
      },
      {
        q: "Does my balance expire?",
        a: "No. Added balance is valid permanently with no expiration date.",
      },
      {
        q: "How do I get an invoice?",
        a: "You can request an invoice on the Billing page. Both general VAT invoices and special VAT invoices are supported. Invoices are issued based on monthly consumption.",
      },
    ],
  },
  {
    category: "API Usage",
    questions: [
      {
        q: "How do I get an API Key?",
        a: "After logging in, create one on the API Keys page. We recommend creating separate Keys for different projects for easier management and monitoring. Keep your Key secure and do not expose it.",
      },
      {
        q: "What should I do if a request fails?",
        a: "1. Check that your API Key is correct\n2. Confirm your account has sufficient balance\n3. Check the error code for the cause (see the Error Codes documentation)\n4. For 429 errors, implement a retry mechanism\n5. If the issue persists, contact technical support",
      },
      {
        q: "Is streaming output supported?",
        a: "Yes. Set stream: true in your request to enable streaming output. Responses are returned in real-time via Server-Sent Events (SSE) format, suitable for chat and other scenarios requiring immediate feedback.",
      },
      {
        q: "Are there rate limits?",
        a: "Yes. Different plans have different RPM (requests per minute) and TPM (tokens per minute) limits. See the Rate Limits documentation for details. Enterprise users can apply for higher quotas.",
      },
    ],
  },
  {
    category: "Model Selection",
    questions: [
      {
        q: "Which model should I choose?",
        a: "It depends on your needs:\n• Complex reasoning/coding: Qwen3 Max\n• Daily conversation/creation: Qwen3.5 Plus (recommended)\n• Chinese content processing: Qwen3.5 series\n• High cost-efficiency: DeepSeek V4 Flash / DeepSeek V3\n• Image generation: Wan2.2 / Wan2.6 series\n\nWe recommend trying models in the Playground before deciding.",
      },
      {
        q: "Why are there different versions of the same model?",
        a: "Model providers continuously update their models. Higher version numbers usually mean stronger capabilities. We recommend using the current stable version, such as qwen3.5-plus, deepseek-v4-flash, deepseek-v4-pro. Older versions are kept for a period to allow migration.",
      },
      {
        q: "Can I use multiple models at the same time?",
        a: "Yes. You can call as many models as you want in the same application by specifying different model IDs in your requests. For example, use Qwen3 Max for complex reasoning and DeepSeek V4 Flash for lightweight tasks to save costs.",
      },
    ],
  },
  {
    category: "Technical Questions",
    questions: [
      {
        q: "Is Function Calling supported?",
        a: "Yes. Most text models support Function Calling / Tool Use. Pass the tools parameter in your request to define available functions, and the model will return function call requests when needed.",
      },
      {
        q: "Is image input supported?",
        a: "Yes. The Qwen VL series and some multimodal models support image understanding. Use image_url type content in messages to pass image URLs or Base64-encoded images.",
      },
      {
        q: "How do I handle long text?",
        a: "Choose a model that supports long context:\n• Qwen3.5 Max: 1 million Tokens\n• Qwen3.5 Plus: 1 million Tokens\n• Other mainstream models: approximately 120K-200K Tokens\n\nFor extremely long text, consider segmenting or using vector retrieval.",
      },
      {
        q: "What if responses are too slow?",
        a: "1. Use a faster model (e.g., Haiku, Turbo series)\n2. Enable streaming output for better experience\n3. Reduce max_tokens limit\n4. Optimize prompt to remove unnecessary context\n5. Consider using caching to avoid repeated requests",
      },
    ],
  },
];

export default function FAQPage() {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    const newSet = new Set(openItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setOpenItems(newSet);
  };

  return (
    <div style={{ padding: "48px 64px", maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <h1 style={{
          fontSize: 32,
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: 12,
          letterSpacing: "-0.5px",
          fontFamily: "var(--font-serif)",
        }}>
          FAQ
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Find answers to common questions about NexusFlow. If you don't find your question here, please contact technical support.
        </p>
      </div>

      {/* FAQ sections */}
      {faqs.map((section) => (
        <section key={section.category} style={{ marginBottom: 40 }}>
          <h2 style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: "1px solid var(--border)",
          }}>
            {section.category}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {section.questions.map((item, idx) => {
              const id = `${section.category}-${idx}`;
              const isOpen = openItems.has(id);
              return (
                <div
                  key={id}
                  style={{
                    background: "var(--bg)",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => toggleItem(id)}
                    style={{
                      width: "100%",
                      padding: "16px 20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                    }}>
                      {item.q}
                    </span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-tertiary)"
                      strokeWidth="2"
                      style={{
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s",
                        flexShrink: 0,
                        marginLeft: 16,
                      }}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {isOpen && (
                    <div style={{
                      padding: "0 20px 16px",
                      fontSize: 14,
                      color: "var(--text-secondary)",
                      lineHeight: 1.7,
                      whiteSpace: "pre-line",
                    }}>
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Still have questions */}
      <section style={{
        padding: 32,
        background: "var(--bg-elevated)",
        borderRadius: 12,
        border: "1px solid var(--border)",
        textAlign: "center",
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
          Still have questions?
        </h3>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
          Contact our technical support team - we'll get back to you as soon as possible.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <a
            href="mailto:support@nexusflow.vip"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              background: "var(--accent)",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Send Email
          </a>
          <Link
            href="/docs/api/errors"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              background: "var(--bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            View Error Codes
          </Link>
        </div>
      </section>
    </div>
  );
}
