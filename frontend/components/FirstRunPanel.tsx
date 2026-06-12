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
      { "role": "user", "content": "Introduce NexusFlow in one sentence" }
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
    messages: [{ role: "user", content: "Introduce NexusFlow in one sentence" }],
  }),
});`;
}

export default function FirstRunPanel({ state, apiKey, modelId, compact = false }: FirstRunPanelProps) {
  const steps = [
    { key: "key", label: "Create an API key", done: state.hasApiKey, href: "/keys" },
    { key: "code", label: "Copy the example", done: state.hasApiKey, href: "/keys" },
    { key: "play", label: "Try it in Playground", done: state.hasUsage, href: `/playground${modelId ? `?model=${encodeURIComponent(modelId)}` : ""}` },
    { key: "monitor", label: "Check usage metrics", done: state.hasUsage, href: "/activity" },
  ];

  return (
    <section className="usr-section first-run-panel">
      <div className="usr-section-header">
        <div>
          <h3>Your first API call</h3>
          <p>From key to first request — this is the fastest path.</p>
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
            {state.hasApiKey ? "Open Playground" : "Create API key"}
          </Link>
          <Link className="btn-secondary" href="/models">Browse models</Link>
        </div>
      </div>
    </section>
  );
}
