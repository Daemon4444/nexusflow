"use client";

const API_BASE = "https://nexusflow.hk";

const generate = `curl "${API_BASE}/v1beta/models/qwen3-max:generateContent?key=$API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "用三句话解释边缘计算。"}]
      }
    ],
    "generationConfig": {
      "temperature": 0.7,
      "topP": 0.9,
      "maxOutputTokens": 512,
      "stopSequences": ["END"]
    }
  }'`;

const stream = `curl "${API_BASE}/v1beta/models/qwen3-max:streamGenerateContent?key=$API_KEY&alt=sse" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [{"role": "user", "parts": [{"text": "写一个产品发布会开场白。"}]}],
    "generationConfig": {
      "temperature": 0.8,
      "maxOutputTokens": 800
    }
  }'`;

const tools = `curl "${API_BASE}/v1beta/models/qwen3-max:generateContent?key=$API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [{"role": "user", "parts": [{"text": "查询杭州天气"}]}],
    "tools": [{
      "functionDeclarations": [{
        "name": "get_weather",
        "description": "查询城市天气",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {"type": "string"}
          },
          "required": ["city"]
        }
      }]
    }]
  }'`;

const params = [
  { name: "contents", desc: "消息数组。每条消息包含 role 和 parts，文本内容放在 parts[].text。" },
  { name: "systemInstruction", desc: "系统提示词，转换为 OpenAI system message。" },
  { name: "contents[].parts[].inlineData", desc: "base64 图片内容，转换为 image_url。需模型支持视觉理解。" },
  { name: "contents[].parts[].fileData", desc: "文件 URL，转换为 image_url。" },
  { name: "contents[].parts[].functionCall", desc: "模型函数调用，转换为 OpenAI tool_calls。" },
  { name: "contents[].parts[].functionResponse", desc: "工具执行结果，转换为 OpenAI tool 消息。" },
  { name: "generationConfig.temperature", desc: "采样温度，值越高输出越发散。生产环境建议按模型能力在 0.2 到 1.0 内调参。" },
  { name: "generationConfig.topP", desc: "核采样阈值。通常不要和 temperature 同时大幅调整。" },
  { name: "generationConfig.maxOutputTokens", desc: "最大输出 token 数，对应 OpenAI 的 max_tokens。" },
  { name: "generationConfig.stopSequences", desc: "停止序列，对应 OpenAI 的 stop。" },
  { name: "tools.functionDeclarations", desc: "函数声明，会转换到 OpenAI tools 并走同一套模型路由。" },
  { name: "toolConfig.functionCallingConfig.mode", desc: "AUTO / ANY / NONE，分别映射到 auto / required / none。" },
];

export default function GeminiApiPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 960 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 600 }}>协议</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Gemini GenerateContent
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 720, margin: 0 }}>
          Gemini 兼容层支持 <code>generateContent</code> 和 <code>streamGenerateContent</code>，内部转换到统一 OpenAI Chat Completions 链路。
        </p>
      </div>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>端点</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            ["/v1beta/models/{model}:generateContent", "非流式生成"],
            ["/v1beta/models/{model}:streamGenerateContent", "SSE 流式生成"],
          ].map(([path, desc]) => (
            <div key={path} style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
              <code style={{ fontSize: 13 }}>{path}</code>
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>参数说明</h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {params.map((param, index) => (
            <div key={param.name} style={{ display: "grid", gridTemplateColumns: "240px 1fr", padding: "12px 16px", borderTop: index === 0 ? "none" : "1px solid var(--border)", background: index % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)", fontSize: 13 }}>
              <code>{param.name}</code>
              <span style={{ color: "var(--text-secondary)" }}>{param.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {[
        ["基础调用", generate],
        ["流式输出", stream],
        ["工具调用", tools],
      ].map(([title, code]) => (
        <section key={title} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, color: "var(--text-primary)", marginBottom: 10 }}>{title}</h2>
          <pre style={{ margin: 0, padding: 18, background: "#111827", color: "#e5e7eb", borderRadius: 8, overflowX: "auto", fontSize: 12.5, lineHeight: 1.7 }}>
            <code>{code}</code>
          </pre>
        </section>
      ))}
    </div>
  );
}
