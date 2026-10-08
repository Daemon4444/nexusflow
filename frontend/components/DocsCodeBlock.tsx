"use client";

import { useState } from "react";

interface DocsCodeBlockProps {
  code: string;
  label?: string;
  /** Shown in the header bar; guessed from the snippet when omitted. */
  language?: string;
}

function guessLanguage(code: string) {
  const text = code.trim();
  if (/^(curl|wget)\b/.test(text)) return "curl";
  if (/^(pip|npm|pnpm|yarn|export|brew)\b/.test(text)) return "shell";
  if (/^[{[]/.test(text)) return "json";
  if (/^(from|import) [\w.]+ import|^import \w+$|\bdef \w+\(|print\(/m.test(text)) return "python";
  if (/\b(const|let|await|import .* from)\b/.test(text)) return "javascript";
  return "text";
}

export default function DocsCodeBlock({ code, label = "复制", language }: DocsCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="dcb">
      <div className="dcb-bar">
        <span>{language || guessLanguage(code)}</span>
        <button type="button" onClick={copy} className={copied ? "is-done" : undefined}>{copied ? "已复制" : label}</button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}
