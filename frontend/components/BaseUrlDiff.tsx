"use client";

import { useState } from "react";

type Token = [string, string?];

/** Hand-tokenised samples: [text, className]. The base_url line is the point. */
const samples: Record<string, { label: string; copy: string; removed: Token[]; lines: Token[][] }> = {
  python: {
    label: "Python",
    removed: [["    base_url", "p"], ["="], ['"https://api.openai.com/v1"', "s"], [","]],
    copy: `from openai import OpenAI

client = OpenAI(
    base_url="https://nexusflow.hk/v1",
    api_key="sk-air-...",
)

reply = client.chat.completions.create(
    model="qwen3.8-max",
    messages=[{"role": "user", "content": "你好"}],
)
print(reply.choices[0].message.content)`,
    lines: [
      [["from", "k"], [" openai "], ["import", "k"], [" OpenAI"]],
      [],
      [["client"], [" = "], ["OpenAI", "f"], ["("]],
      [["    base_url", "p"], ["="], ['"https://nexusflow.hk/v1"', "hl"], [","]],
      [["    api_key", "p"], ["="], ['"sk-air-..."', "s"], [","]],
      [[")"]],
      [],
      [["reply"], [" = client.chat.completions."], ["create", "f"], ["("]],
      [["    model", "p"], ["="], ['"qwen3.8-max"', "s"], [","]],
      [["    messages", "p"], ["=[{"], ['"role"', "s"], [": "], ['"user"', "s"], [", "], ['"content"', "s"], [": "], ['"你好"', "s"], ["}],"]],
      [[")"]],
      [["print", "f"], ["(reply.choices["], ["0", "n"], ["].message.content)"]],
    ],
  },
  node: {
    label: "Node.js",
    removed: [["  baseURL", "p"], [": "], ['"https://api.openai.com/v1"', "s"], [","]],
    copy: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://nexusflow.hk/v1",
  apiKey: process.env.NEXUSFLOW_API_KEY,
});

const reply = await client.chat.completions.create({
  model: "deepseek-v4-flash",
  messages: [{ role: "user", content: "你好" }],
});
console.log(reply.choices[0].message.content);`,
    lines: [
      [["import", "k"], [" OpenAI "], ["from", "k"], [" "], ['"openai"', "s"], [";"]],
      [],
      [["const", "k"], [" client = "], ["new", "k"], [" "], ["OpenAI", "f"], ["({"]],
      [["  baseURL", "p"], [": "], ['"https://nexusflow.hk/v1"', "hl"], [","]],
      [["  apiKey", "p"], [": process.env."], ["NEXUSFLOW_API_KEY", "n"], [","]],
      [["});"]],
      [],
      [["const", "k"], [" reply = "], ["await", "k"], [" client.chat.completions."], ["create", "f"], ["({"]],
      [["  model", "p"], [": "], ['"deepseek-v4-flash"', "s"], [","]],
      [["  messages", "p"], [": [{ role: "], ['"user"', "s"], [", content: "], ['"你好"', "s"], [" }],"]],
      [["});"]],
      [["console", "f"], [".log(reply.choices["], ["0", "n"], ["].message.content);"]],
    ],
  },
  curl: {
    label: "curl",
    removed: [["curl", "f"], [" https://api.openai.com/v1/chat/completions \\"]],
    copy: `curl https://nexusflow.hk/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUSFLOW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "glm-5.2", "messages": [{"role": "user", "content": "你好"}]}'`,
    lines: [
      [["curl", "f"], [" "], ["https://nexusflow.hk/v1", "hl"], ["/chat/completions \\"]],
      [["  -H", "p"], [" "], ['"Authorization: Bearer $NEXUSFLOW_API_KEY"', "s"], [" \\"]],
      [["  -H", "p"], [" "], ['"Content-Type: application/json"', "s"], [" \\"]],
      [["  -d", "p"], [" "], [`'{"model": "glm-5.2",`, "s"]],
      [["      "], [`"messages": [{"role": "user", "content": "你好"}]}'`, "s"]],
    ],
  },
};


/** Code panel showing that switching to NexusFlow is a one-line base URL change. */
export default function BaseUrlDiff({ className = "" }: { className?: string }) {
  const [lang, setLang] = useState<keyof typeof samples>("python");
  const [copied, setCopied] = useState(false);
  const sample = samples[lang];

  async function copy() {
    await navigator.clipboard.writeText(sample.copy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const render = (tokens: Token[]) => tokens.map(([text, cls], i) => <span key={i} className={cls && cls !== "hl" ? `t-${cls}` : undefined}>{text}</span>);

  return (
    <div className={`bud ${className}`} aria-label="接入示例">
      <div className="bud-bar">
        <div role="tablist">
          {Object.entries(samples).map(([key, item]) => (
            <button key={key} role="tab" aria-selected={lang === key} onClick={() => setLang(key as keyof typeof samples)}>{item.label}</button>
          ))}
        </div>
        <button className="bud-copy" onClick={copy}>{copied ? "已复制" : "复制"}</button>
      </div>
      <pre key={lang}>
        {sample.lines.map((line, index) => line.some(([, cls]) => cls === "hl") ? (
          <span key={index}>
            <span className="bud-line is-del"><i>−</i>{render(sample.removed)}{"\n"}</span>
            <span className="bud-line is-add"><i>+</i>{render(line)}{"\n"}</span>
          </span>
        ) : (
          <span className="bud-line" key={index}><i>{index + 1}</i>{render(line)}{"\n"}</span>
        ))}
      </pre>
    </div>
  );
}
