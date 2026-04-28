"use client";

import { useState } from "react";

interface CopyCodeButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyCodeButton({ text, label = "复制", className = "btn-secondary" }: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      className={copied ? "btn-success" : className}
      onClick={copy}
      style={{ padding: "5px 12px", fontSize: 12 }}
    >
      {copied ? "已复制 ✓" : label}
    </button>
  );
}

interface CodeExampleProps {
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export function CodeExamples({ model, apiKey = "YOUR_API_KEY", baseUrl = "https://api.nexusflow.ai" }: CodeExampleProps) {
  const [activeTab, setActiveTab] = useState<"curl" | "python" | "javascript">("curl");

  const examples = {
    curl: `curl -X POST "${baseUrl}/v1/chat/completions" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [{"role": "user", "content": "你好！"}],
    "stream": true
  }'`,
    python: `import openai

client = openai.OpenAI(
    api_key="${apiKey}",
    base_url="${baseUrl}/v1"
)

response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "你好！"}],
    stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.content, end="")`,
    javascript: `const response = await fetch("${baseUrl}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${model}",
    messages: [{ role: "user", content: "你好！" }],
    stream: true,
  }),
});

const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(new TextDecoder().decode(value));
}`,
  };

  return (
    <div style={{
      marginTop: 12,
      padding: 14,
      background: "var(--bg-elevated)",
      borderRadius: 10,
      border: "1px solid var(--border)",
    }}>
      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: 8,
        marginBottom: 12,
      }}>
        {(["curl", "python", "javascript"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid var(--border)",
              background: activeTab === tab ? "var(--accent-bg)" : "var(--bg)",
              color: activeTab === tab ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {tab === "curl" ? "cURL" : tab === "python" ? "Python" : "JavaScript"}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <CopyCodeButton text={examples[activeTab]} />
      </div>

      {/* Code */}
      <pre style={{
        padding: "10px 12px",
        background: "#1c1917",
        borderRadius: 8,
        overflow: "auto",
        fontSize: 12,
        lineHeight: 1.6,
        color: "#e7e5e4",
        fontFamily: "var(--font-mono)",
      }}>
        <code>{examples[activeTab]}</code>
      </pre>
    </div>
  );
}