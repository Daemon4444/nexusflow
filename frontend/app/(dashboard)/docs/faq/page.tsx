"use client";

import { useState } from "react";
import Link from "next/link";

const faqs = [
  {
    category: "入门问题",
    questions: [
      {
        q: "nexusflow 是什么？",
        a: "nexusflow 是一个统一的大模型 API 平台，整合了通义千问、DeepSeek、GLM、Kimi、MiniMax 等多家供应商的模型。您只需使用一个 API Key，即可访问所有模型，无需分别注册和管理多个账户。",
      },
      {
        q: "如何开始使用？",
        a: "1. 注册账户并获取 API Key\n2. 安装 OpenAI SDK（pip install openai）\n3. 设置 base_url 为 https://nexusflow.hk/v1\n4. 使用您的 API Key 调用任意模型\n\n完整教程请查看「快速开始」文档。",
      },
      {
        q: "支持哪些编程语言？",
        a: "nexusflow 提供 OpenAI Chat、Anthropic Messages 与 Responses 等兼容接口。Python、Node.js/TypeScript 等常用官方 SDK 可通过修改 Base URL 接入；具体模型与协议支持请以模型详情页的 supported_protocols 为准。",
      },
    ],
  },
  {
    category: "账户与计费",
    questions: [
      {
        q: "如何充值？",
        a: "登录后在「账单管理」页面可以进行充值。当前支持支付宝支付，充值后余额可用于调用任意模型。",
      },
      {
        q: "计费方式是怎样的？",
        a: "按实际使用量计费。文本与向量模型通常按 Token 计费，图片按张、视频和部分语音模型按秒，语音合成也可能按万字符计费。具体单位、阶梯与价格以模型详情和定价页为准。",
      },
      {
        q: "余额会过期吗？",
        a: "不会。充值的余额永久有效，没有使用期限。",
      },
      {
        q: "如何获取发票？",
        a: "如需企业采购或发票，请在控制台提交工单，客服会根据主体资质、消费记录和可开票范围协助处理。账单页目前支持下载用量 CSV 作为对账材料。",
      },
    ],
  },
  {
    category: "API 使用",
    questions: [
      {
        q: "API Key 如何获取？",
        a: "登录后在「API 密钥」页面创建。建议为不同项目创建独立的 Key，便于管理和监控。注意保管好您的 Key，不要泄露。",
      },
      {
        q: "请求失败如何处理？",
        a: "1. 检查 API Key 是否正确\n2. 确认账户余额充足\n3. 查看错误码对应的原因（参考「错误码」文档）\n4. 对于 429 错误，实现重试机制\n5. 如问题持续，联系技术支持",
      },
      {
        q: "支持流式输出吗？",
        a: "支持。在请求中设置 stream: true 即可启用流式输出。响应会以 Server-Sent Events (SSE) 格式实时返回，适合聊天等需要即时反馈的场景。",
      },
      {
        q: "有速率限制吗？",
        a: "有。账户会应用 QPM（每分钟请求数）和 TPM（每分钟 Token 数）限制，供应商通道也可能有独立动态容量。默认账户上限与申请方式请以「限流说明」页面为准。",
      },
    ],
  },
  {
    category: "模型选择",
    questions: [
      {
        q: "应该选择哪个模型？",
        a: "取决于您的需求：\n• 复杂推理/编程：Qwen3 Max\n• 日常对话/创作：Qwen3.5 Plus（推荐）\n• 中文内容处理：Qwen3.5 系列\n• 高性价比需求：DeepSeek V4 Flash / DeepSeek V3\n• 图像生成：Wan2.2 / Wan2.6 系列\n\n建议在 Playground 中试用后决定。",
      },
      {
        q: "同一模型为什么有不同版本？",
        a: "模型供应商会持续更新模型。版本号越高通常能力越强。建议优先使用当前稳定版本，如 qwen3.5-plus、deepseek-v4-flash、deepseek-v4-pro。我们会保留旧版本一段时间以便迁移。",
      },
      {
        q: "可以同时使用多个模型吗？",
        a: "可以。您可以在同一个应用中调用任意多个模型，只需在请求中指定不同的 model ID。例如用 Qwen3 Max 做复杂推理，用 DeepSeek V4 Flash 做轻量任务以节省成本。",
      },
    ],
  },
  {
    category: "技术问题",
    questions: [
      {
        q: "支持 Function Calling 吗？",
        a: "支持。大多数文本模型都支持 Function Calling / Tool Use。在请求中传入 tools 参数定义可用函数，模型会在需要时返回函数调用请求。",
      },
      {
        q: "支持图像输入吗？",
        a: "支持。Qwen VL 系列和部分多模态模型支持图像理解。在 messages 中使用 image_url 类型的 content 传入图片 URL 或 Base64 编码即可。",
      },
      {
        q: "如何处理长文本？",
        a: "选择支持长上下文的模型：\n• Qwen3.5 Max：100 万 Token\n• Qwen3.5 Plus：100 万 Token\n• 其他主力模型：约 12-20 万 Token\n\n超长文本建议分段处理或使用向量检索。",
      },
      {
        q: "响应太慢怎么办？",
        a: "1. 使用更快的模型（如 Haiku、Turbo 系列）\n2. 启用流式输出提升体验\n3. 减少 max_tokens 限制\n4. 优化 prompt 减少不必要的上下文\n5. 考虑使用缓存避免重复请求",
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
          常见问题
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          在这里找到关于 nexusflow 的常见问题解答。如果没有找到您的问题，请联系技术支持。
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
                    aria-expanded={isOpen}
                    aria-controls={`${id}-answer`}
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
                    <div id={`${id}-answer`} style={{
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
          还有其他问题？
        </h3>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
          联系我们的技术支持团队，我们会尽快为您解答。
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
            发送邮件
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
            查看错误码
          </Link>
        </div>
      </section>
    </div>
  );
}
