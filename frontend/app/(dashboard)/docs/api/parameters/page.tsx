"use client";

import Link from "next/link";

const openAiParams = [
  ["model", "string", "必填", "模型 ID。文本、推理、多模态、编程和专业模型支持 Chat Completions。"],
  ["messages", "array", "必填", "对话消息数组，按顺序传入 system、user、assistant、tool。"],
  ["messages[].role", "string", "必填", "system / user / assistant / tool。tool 消息用于回传工具执行结果。"],
  ["messages[].content", "string | array", "必填", "文本可直接传字符串；多模态输入传内容块数组。"],
  ["messages[].content[].type", "string", "多模态", "text / image_url。当前不公开音频 API。"],
  ["messages[].content[].text", "string", "多模态", "type=text 时的文本。"],
  ["messages[].content[].image_url.url", "string", "多模态", "图片 URL 或 data URL，需模型支持视觉理解。"],
  ["stream", "boolean", "可选", "开启 SSE 流式输出。长文本、推理模型和交互场景建议开启。"],
  ["stream_options.include_usage", "boolean", "可选", "流式响应最后返回 usage。需要计费、统计或 smoke 校验时建议开启。"],
  ["temperature", "number", "可选", "采样温度。范围通常为 0 到 2；越高越随机。"],
  ["top_p", "number", "可选", "核采样阈值。建议不要和 temperature 同时大幅调整。"],
  ["max_tokens", "integer", "可选", "最大输出 token 数，不能超过模型 maxOutput。"],
  ["stop", "string | string[]", "可选", "停止序列，命中后结束输出。"],
  ["presence_penalty", "number", "可选", "存在惩罚，通常范围 -2 到 2，增加新话题倾向。"],
  ["frequency_penalty", "number", "可选", "频率惩罚，通常范围 -2 到 2，降低重复表达。"],
  ["tools", "array", "可选", "函数调用定义数组。支持工具调用的模型才会稳定返回 tool_calls。"],
  ["tools[].type", "string", "工具", "固定为 function。"],
  ["tools[].function.name", "string", "工具", "函数名。建议使用字母、数字和下划线。"],
  ["tools[].function.description", "string", "工具", "函数用途说明，影响模型选择工具的准确性。"],
  ["tools[].function.parameters", "object", "工具", "JSON Schema，描述函数入参。"],
  ["tool_choice", "string | object", "可选", "auto / none / required，或指定 {type:'function', function:{name}}。"],
  ["response_format", "object", "可选", "输出格式控制。常见值为 {\"type\":\"text\"} 或 {\"type\":\"json_object\"}。"],
  ["enable_thinking", "boolean", "可选", "思考模式。DeepSeek V4 Pro、QwQ、部分 Qwen 推理模型可用；低延迟场景可关闭。"],
];

const anthropicParams = [
  ["model", "model", "模型 ID，映射到 OpenAI model。"],
  ["system", "messages[0].role=system", "系统提示词。支持字符串或 text blocks。"],
  ["messages", "messages", "user / assistant 消息会转换成 OpenAI 消息。"],
  ["messages[].content[].text", "messages[].content", "文本块。纯文本块会合并为字符串。"],
  ["messages[].content[].image", "image_url", "支持 url 或 base64 source，转换为 OpenAI image_url。"],
  ["messages[].content[].tool_use", "assistant.tool_calls", "助手工具调用结果。"],
  ["messages[].content[].tool_result", "role=tool", "工具执行结果回传。"],
  ["max_tokens", "max_tokens", "最大输出 token。"],
  ["temperature", "temperature", "采样温度。"],
  ["top_p", "top_p", "核采样。"],
  ["stop_sequences", "stop", "停止序列数组。"],
  ["stream", "stream", "开启 Anthropic SSE 事件流。"],
  ["tools", "tools", "Anthropic tools 会转换为 OpenAI function tools。"],
  ["tool_choice", "tool_choice", "auto / none / any / tool 会转换为 OpenAI tool_choice。"],
];

const geminiParams = [
  ["contents", "messages", "消息数组。字符串 contents 也会被包装成 user 文本消息。"],
  ["contents[].role", "messages[].role", "user 映射 user，model 映射 assistant。"],
  ["contents[].parts[].text", "content text", "文本内容。"],
  ["contents[].parts[].inlineData", "image_url data URL", "base64 图片内容，转换为 image_url。"],
  ["contents[].parts[].fileData", "image_url", "文件 URL，转换为 image_url。"],
  ["contents[].parts[].functionCall", "assistant.tool_calls", "模型函数调用。"],
  ["contents[].parts[].functionResponse", "role=tool", "工具执行结果。"],
  ["systemInstruction", "system message", "系统提示词，支持字符串或 parts。"],
  ["generationConfig.temperature", "temperature", "采样温度。"],
  ["generationConfig.topP", "top_p", "核采样。"],
  ["generationConfig.maxOutputTokens", "max_tokens", "最大输出 token。"],
  ["generationConfig.stopSequences", "stop", "停止序列数组。"],
  ["tools[].functionDeclarations", "tools", "函数声明，转换为 OpenAI function tools。"],
  ["toolConfig.functionCallingConfig.mode", "tool_choice", "AUTO / ANY / NONE 分别映射 auto / required / none。"],
  ["streamGenerateContent", "stream=true", "流式接口。使用 ?alt=sse 时按 SSE 返回。"],
];

const responseFields = [
  ["choices[].message.content", "非流式文本输出。"],
  ["choices[].message.reasoning_content", "推理模型可能返回的思考内容字段。"],
  ["choices[].message.tool_calls", "模型请求调用工具时返回。"],
  ["choices[].delta.content", "流式文本增量。"],
  ["choices[].delta.reasoning_content", "流式思考增量，推理模型可能返回。"],
  ["choices[].finish_reason", "stop / length / tool_calls / content_filter。"],
  ["usage.prompt_tokens", "输入 token。"],
  ["usage.completion_tokens", "输出 token。"],
  ["usage.total_tokens", "总 token。"],
  ["usage.completion_tokens_details.reasoning_tokens", "推理 token，部分模型返回。"],
];

function Matrix({ rows, columns }: { rows: string[][]; columns: string[] }) {
  return (
    <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "grid", gridTemplateColumns: columns.map((c) => c).join(" "), background: "#f1f5f9", borderBottom: "1px solid #dbe4f0", fontSize: 12, fontWeight: 700, color: "#475569" }}>
        {["参数", "类型/映射", "状态", "说明"].slice(0, columns.length).map((header) => (
          <div key={header} style={{ padding: "10px 14px" }}>{header}</div>
        ))}
      </div>
      {rows.map((row, index) => (
        <div key={row[0]} style={{ display: "grid", gridTemplateColumns: columns.map((c) => c).join(" "), borderTop: index === 0 ? "none" : "1px solid #e2e8f0", background: index % 2 === 0 ? "#ffffff" : "#f8fafc", fontSize: 13 }}>
          {row.map((cell, cellIndex) => (
            <div key={cellIndex} style={{ padding: "11px 14px", color: cellIndex === 0 ? "#2563eb" : "#475569", lineHeight: 1.6 }}>
              {cellIndex === 0 ? <code>{cell}</code> : cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function ApiParametersPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 1080 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 700 }}>API 参考</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          参数矩阵
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 760, margin: 0 }}>
          这里按后端实际透传和协议转换逻辑列出参数。文本类模型支持 OpenAI、Anthropic、Gemini 三种协议；非文本模型按模型能力使用图像、音频、向量或异步任务接口。
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>OpenAI Chat Completions</h2>
        <Matrix rows={openAiParams} columns={["220px", "150px", "90px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Anthropic Messages 映射</h2>
        <Matrix rows={anthropicParams} columns={["260px", "220px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Gemini GenerateContent 映射</h2>
        <Matrix rows={geminiParams} columns={["300px", "220px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>响应字段</h2>
        <Matrix rows={responseFields} columns={["300px", "1fr"]} />
      </section>

      <section style={{ padding: 18, border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff" }}>
        <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8 }}>
          生产建议：推理模型使用 <code>stream=true</code> 和 <code>stream_options.include_usage=true</code>；只在需要思考内容时开启 <code>enable_thinking</code>。
          更多例子见 <Link href="/docs/api/chat" style={{ color: "#1d4ed8" }}>对话补全 API</Link> 和 <Link href="/docs/api/gemini" style={{ color: "#1d4ed8" }}>Gemini 协议</Link>。
        </div>
      </section>
    </div>
  );
}
