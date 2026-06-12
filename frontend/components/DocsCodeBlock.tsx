"use client";

import { useState } from "react";

interface DocsCodeBlockProps {
  code: string;
  label?: string;
}

export default function DocsCodeBlock({ code, label = "Copy" }: DocsCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div style={{
      position: "relative",
      borderRadius: 8,
      overflow: "hidden",
      background: "#111827",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <button
        type="button"
        onClick={copy}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 1,
          padding: "4px 10px",
          borderRadius: 5,
          border: "1px solid rgba(255,255,255,0.16)",
          background: copied ? "rgba(34,197,94,0.18)" : "rgba(17,24,39,0.92)",
          color: copied ? "#86efac" : "#e5e7eb",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {copied ? "Copied" : label}
      </button>
      <pre style={{
        margin: 0,
        padding: "16px 18px",
        paddingRight: 82,
        overflowX: "auto",
        color: "#e5e7eb",
        fontSize: 12.5,
        lineHeight: 1.65,
        fontFamily: "var(--font-mono)",
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
