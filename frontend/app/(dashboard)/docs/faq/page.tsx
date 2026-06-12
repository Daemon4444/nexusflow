"use client";

import { useState } from "react";
import Link from "next/link";

const faqs = [
  {
    category: "Getting Started",
    questions: [
      {
        q: "What is nexusflow?",
        a: "nexusflow is a unified LLM API platform that aggregates models from many providers including Qwen, DeepSeek, GLM, Kimi, MiniMax, and more. Use a single API key to access every model—no need to sign up and manage accounts with each provider individually.",
      },
      {
        q: "How do I get started?",
        a: "1. Sign up and create an API key\n2. Install the OpenAI SDK (pip install openai)\n3. Set base_url to https://nexusflow.hk/v1\n4. Use your API key to call any model\n\nSee the Quick Start docs for the full walkthrough.",
      },
      {
        q: "Which programming languages are supported?",
        a: "nexusflow exposes a fully OpenAI-compatible API, so every language with an OpenAI SDK works—Python, Node.js / TypeScript, Go, Java, C#, Ruby, PHP, and more. We recommend the official OpenAI SDK.",
      },
    ],
  },
  {
    category: "Account & Billing",
    questions: [
      {
        q: "How do I top up?",
        a: "After signing in, top up from the Billing page. Alipay is currently supported; topped-up balance can be used to call any model.",
      },
      {
        q: "How is billing calculated?",
        a: "Pay-as-you-go, billed by tokens. Different models have different prices, with separate input and output rates. Prices are quoted per million tokens. There's no minimum spend—you only pay for what you use.",
      },
      {
        q: "Does my balance expire?",
        a: "No. Topped-up balance never expires.",
      },
      {
        q: "How do I get an invoice?",
        a: "Request invoices from the Billing page. Both general VAT invoices and special VAT invoices are supported, issued based on monthly spend.",
      },
    ],
  },
  {
    category: "API Usage",
    questions: [
      {
        q: "How do I get an API key?",
        a: "Create one from the API Keys page after signing in. We recommend creating a separate key per project for easier management and monitoring. Keep your key secret and don't share it.",
      },
      {
        q: "What should I do when a request fails?",
        a: "1. Verify the API key is correct\n2. Make sure your account has sufficient balance\n3. Look up the cause of the error code (see the Error Codes docs)\n4. Implement retry logic for 429 errors\n5. Contact support if the issue persists",
      },
      {
        q: "Is streaming supported?",
        a: "Yes. Set stream: true in your request to enable streaming. Responses are returned in real time as Server-Sent Events (SSE)—great for chat and other use cases that need instant feedback.",
      },
      {
        q: "Are there rate limits?",
        a: "Yes. Each plan has its own RPM (requests per minute) and TPM (tokens per minute) limits. See the Rate Limits docs for details. Enterprise customers can request higher quotas.",
      },
    ],
  },
  {
    category: "Choosing a Model",
    questions: [
      {
        q: "Which model should I pick?",
        a: "It depends on your needs:\n• Complex reasoning / coding: Qwen3 Max\n• Everyday chat / writing: Qwen3.5 Plus (recommended)\n• Chinese content workflows: Qwen3.5 family\n• Cost-sensitive workloads: DeepSeek V4 Flash / DeepSeek V3\n• Image generation: Wan2.2 / Wan2.6 family\n\nWe recommend trying them out in the Playground first.",
      },
      {
        q: "Why are there multiple versions of the same model?",
        a: "Providers update their models continuously—higher version numbers usually mean stronger capabilities. We recommend the current stable versions like qwen3.5-plus, deepseek-v4-flash, and deepseek-v4-pro. Older versions are kept for a period of time to ease migration.",
      },
      {
        q: "Can I use multiple models at the same time?",
        a: "Yes. You can call any number of models in the same application by passing different model IDs. For example, use Qwen3 Max for complex reasoning and DeepSeek V4 Flash for lightweight tasks to save cost.",
      },
    ],
  },
  {
    category: "Technical Questions",
    questions: [
      {
        q: "Is function calling supported?",
        a: "Yes. Most text models support function calling / tool use. Pass a tools parameter in your request to define available functions; the model will return function-call requests when needed.",
      },
      {
        q: "Are image inputs supported?",
        a: "Yes. The Qwen VL family and several multimodal models accept images. Include image_url-typed content in messages with either an image URL or a Base64 string.",
      },
      {
        q: "How do I handle very long text?",
        a: "Use a long-context model:\n• Qwen3.5 Max: 1M tokens\n• Qwen3.5 Plus: 1M tokens\n• Other major models: roughly 120K–200K tokens\n\nFor extremely long inputs, consider chunking or vector retrieval.",
      },
      {
        q: "Responses are too slow—what can I do?",
        a: "1. Use a faster model (e.g., the Haiku or Turbo families)\n2. Enable streaming for a better user experience\n3. Reduce max_tokens\n4. Trim the prompt to remove unnecessary context\n5. Cache results to avoid duplicate requests",
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
          Answers to common questions about nexusflow. If you don&apos;t see your question here, please contact support.
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
          Reach out to our support team and we&apos;ll get back to you as soon as possible.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <a
            href="mailto:support@nexusflow.hk"
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
            Send an Email
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
