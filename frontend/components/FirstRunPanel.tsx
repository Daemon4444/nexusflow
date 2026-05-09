"use client";

import Link from "next/link";
import { FirstRunState } from "@/lib/firstRun";

interface FirstRunPanelProps {
  state: FirstRunState;
  apiKey?: string;
  modelId?: string;
  compact?: boolean;
}

export function getCurlExample(apiKey = "sk-air-...", modelId = "qwen-plus") {
  return `curl https://nexusflow.hk/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [
      { "role": "user", "content": "用一句话介绍 NexusFlow" }
    ]
  }'`;
}

export function getJavascriptExample(apiKey = "sk-air-...", modelId = "qwen-plus") {
  return `const response = await fetch("https://nexusflow.hk/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${modelId}",
    messages: [{ role: "user", content: "用一句话介绍 NexusFlow" }],
  }),
});`;
}

export default function FirstRunPanel({ state, apiKey, modelId, compact = false }: FirstRunPanelProps) {
  const steps = [
    { key: "key", label: "创建 API Key", done: state.hasApiKey, href: "/keys" },
    { key: "code", label: "复制调用示例", done: state.hasApiKey, href: "/keys" },
    { key: "play", label: "Playground 试跑", done: state.hasUsage, href: `/playground${modelId ? `?model=${encodeURIComponent(modelId)}` : ""}` },
    { key: "monitor", label: "查看用量监控", done: state.hasUsage, href: "/activity" },
  ];

  return (
    <section className="usr-section first-run-panel">
      <div className="usr-section-header">
        <div>
          <h3>第一次 API 调用</h3>
          <p>从 Key 到首个请求，按这个顺序最快。</p>
        </div>
        <span className="badge badge-info">{state.completedSteps}/3</span>
      </div>
      <div className="usr-section-body" style={{ display: "grid", gap: compact ? 14 : 18 }}>
        <div className="first-run-steps">
          {steps.map((step, index) => (
            <Link key={step.key} href={step.href} className={`first-run-step ${step.done ? "done" : ""}`}>
              <span>{step.done ? "✓" : index + 1}</span>
              {step.label}
            </Link>
          ))}
        </div>
        <div className="first-run-code">
          <div className="first-run-code-head">
            <span>curl</span>
            <Link href="/docs/quickstart">Quickstart</Link>
          </div>
          <pre>{getCurlExample(apiKey, modelId)}</pre>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn-primary" href={state.hasApiKey ? `/playground${modelId ? `?model=${encodeURIComponent(modelId)}` : ""}` : "/keys"}>
            {state.hasApiKey ? "去 Playground 试跑" : "创建 API Key"}
          </Link>
          <Link className="btn-secondary" href="/models">浏览模型</Link>
        </div>
      </div>
    </section>
  );
}
