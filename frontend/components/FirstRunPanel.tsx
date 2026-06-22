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
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "https://nexusflow.vip";
  return `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [
      { "role": "user", "content": "Describe NexusFlow in one sentence" }
    ]
  }'`;
}

export function getJavascriptExample(apiKey = "sk-air-...", modelId = "qwen-plus") {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "https://nexusflow.vip";
  return `const response = await fetch("${baseUrl}/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${modelId}",
    messages: [{ role: "user", content: "Describe NexusFlow in one sentence" }],
  }),
});`;
}

export default function FirstRunPanel({ state, apiKey, modelId, compact = false }: FirstRunPanelProps) {
  const steps = [
    { key: "key", label: "Create API Key", done: state.hasApiKey, href: "/keys" },
    { key: "code", label: "Copy code example", done: state.hasApiKey, href: "/keys" },
    { key: "play", label: "Try Playground", done: state.hasUsage, href: `/playground${modelId ? `?model=${encodeURIComponent(modelId)}` : ""}` },
    { key: "monitor", label: "View usage stats", done: state.hasUsage, href: "/activity" },
  ];

  return (
    <section className="usr-section first-run-panel">
      <div className="usr-section-header">
        <div>
          <h3>Your First API Call</h3>
          <p>From API key to your first request — follow these steps for the fastest path.</p>
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
            {state.hasApiKey ? "Try Playground" : "Create API Key"}
          </Link>
          <Link className="btn-secondary" href="/models">Browse Models</Link>
        </div>
      </div>
    </section>
  );
}
