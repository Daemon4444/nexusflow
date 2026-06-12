"use client";

import Link from "next/link";

const openAiParams = [
  ["model", "string", "Required", "Model ID. Text, reasoning, multimodal, coding and specialized models support Chat Completions."],
  ["messages", "array", "Required", "Conversation message array, passed in order: system, user, assistant, tool."],
  ["messages[].role", "string", "Required", "system / user / assistant / tool. tool messages return tool execution results."],
  ["messages[].content", "string | array", "Required", "Text can be passed as a string; multimodal input uses an array of content blocks."],
  ["messages[].content[].type", "string", "Multimodal", "Stable examples are text / image_url. Bailian extension blocks like video and input_audio depend on per-model behavior."],
  ["messages[].content[].text", "string", "Multimodal", "Text used when type=text."],
  ["messages[].content[].image_url.url", "string", "Multimodal", "Image URL or data URL; requires a model with vision support."],
  ["stream", "boolean", "Optional", "Enable SSE streaming. Recommended for long text, reasoning models, and interactive scenarios."],
  ["stream_options.include_usage", "boolean", "Optional", "Return usage at the end of a streaming response. Recommended when billing, statistics or smoke tests are needed."],
  ["temperature", "number", "Optional", "Sampling temperature, typically 0 to 2; higher is more random."],
  ["top_p", "number", "Optional", "Nucleus sampling threshold. Avoid heavy tuning of both temperature and top_p simultaneously."],
  ["max_tokens", "integer", "Optional", "Maximum number of output tokens; cannot exceed the model's maxOutput."],
  ["stop", "string | string[]", "Optional", "Stop sequences; output ends when matched."],
  ["presence_penalty", "number", "Optional", "Presence penalty, typically -2 to 2; encourages new topics."],
  ["frequency_penalty", "number", "Optional", "Frequency penalty, typically -2 to 2; reduces repetition."],
  ["tools", "array", "Optional", "Function call definitions. Only models that support tool calling will reliably return tool_calls."],
  ["tools[].type", "string", "Tools", "Always function."],
  ["tools[].function.name", "string", "Tools", "Function name. Use letters, digits and underscores."],
  ["tools[].function.description", "string", "Tools", "Function description; affects how accurately the model selects tools."],
  ["tools[].function.parameters", "object", "Tools", "JSON Schema describing the function arguments."],
  ["tool_choice", "string | object", "Optional", "Stably supports auto / none, or {type:'function', function:{name}}. Forcing a tool is not recommended for thinking-mode models."],
  ["response_format", "object", "Optional", "Output format control. Common values are {\"type\":\"text\"} or {\"type\":\"json_object\"}."],
  ["enable_thinking", "boolean", "Optional", "Thinking-mode toggle. Can only be disabled on verified mixed-thinking models; reasoning-only models ignore false and continue returning reasoning_content."],
  ["thinking_budget", "integer", "Optional", "Limit the thinking-token budget; passed through by model ID prefix (qwen3.7- / qwen3.6- / qwen3.5- / qwen3-)."],
  ["preserve_thinking", "boolean", "Optional", "Forward reasoning_content from prior messages back to the model. Supported on qwen3.7-max, qwen3.6-max-preview, qwen3.6-plus, kimi-k2.6."],
  ["enable_search", "boolean", "Optional", "Web search; supported on Qwen text models (excluding VL / math series)."],
  ["search_options", "object", "Optional", "Web search configuration; used together with enable_search."],
  ["enable_context_caching", "boolean", "Optional", "Enable context caching. Repeated prompt prefixes are cached automatically and matched portions are billed at 0.1x input price. Supported on the Qwen and GLM series."],
  ["seed", "integer", "Optional", "Random seed; passed through for Qwen text models."],
  ["top_k", "integer", "Optional", "Top-K sampling; passed through for Qwen text models."],
  ["logprobs", "boolean", "Optional", "Return log probabilities; passed through for Qwen text models."],
  ["repetition_penalty", "number", "Optional", "Repetition penalty; passed through for Qwen text models."],
  ["parallel_tool_calls", "boolean", "Optional", "Parallel tool calls; supported on Qwen, DeepSeek, GLM, and Anthropic models."],
];

const notForwardedOpenAiParams = [
  ["max_completion_tokens", "integer", "Not forwarded", "Use the currently stable max_tokens instead."],
];

const thinkingSupport = [
  ["qwen3.7-max", "Mixed thinking", "Supports true / false", "Thinking is on by default; true returns reasoning_content; false does not. Supports thinking_budget and preserve_thinking."],
  ["qwen3.5-flash", "Mixed thinking", "Supports true / false", "Verified: true returns reasoning_content; false does not."],
  ["qwen3-max", "Mixed thinking", "Supports true / false", "Verified: true returns reasoning_content; false does not."],
  ["qwq-plus", "Reasoning only", "Cannot disable via false", "Verified: both true/false return reasoning_content."],
  ["qwen-math-plus", "Not handled as a thinking toggle", "Do not pass", "Verified: neither true nor false returns reasoning_content."],
  ["deepseek-r1", "Reasoning only", "Cannot disable via false", "Verified: both true/false return reasoning_content."],
  ["deepseek-v3.2", "Mixed thinking", "Supports true / false", "Verified: true returns reasoning_content; false does not."],
  ["deepseek-v4-pro", "Mixed thinking", "Supports true / false", "Verified: true returns reasoning_content; false does not."],
  ["glm-5.1", "Mixed thinking", "Supports true / false", "Verified: true returns reasoning_content; false does not."],
];

const anthropicParams = [
  ["model", "model", "Model ID, mapped to OpenAI model."],
  ["system", "messages[0].role=system", "System prompt. Supports a string or text blocks."],
  ["messages", "messages", "user / assistant messages are converted to OpenAI messages."],
  ["messages[].content[].text", "messages[].content", "Text blocks. Plain-text blocks are merged into a single string."],
  ["messages[].content[].image", "image_url", "Supports url or base64 source; converted to OpenAI image_url."],
  ["messages[].content[].tool_use", "assistant.tool_calls", "Assistant tool call results."],
  ["messages[].content[].tool_result", "role=tool", "Tool execution results."],
  ["max_tokens", "max_tokens", "Maximum output tokens."],
  ["temperature", "temperature", "Sampling temperature."],
  ["top_p", "top_p", "Nucleus sampling."],
  ["stop_sequences", "stop", "Array of stop sequences."],
  ["stream", "stream", "Enable Anthropic SSE event stream."],
  ["tools", "tools", "Anthropic tools are converted to OpenAI function tools."],
  ["tool_choice", "tool_choice", "auto / none / any / tool are converted to OpenAI tool_choice."],
];

const geminiParams = [
  ["contents", "messages", "Message array. A string contents value is wrapped into a user text message."],
  ["contents[].role", "messages[].role", "user maps to user; model maps to assistant."],
  ["contents[].parts[].text", "content text", "Text content."],
  ["contents[].parts[].inlineData", "image_url data URL", "Base64 image content; converted to image_url."],
  ["contents[].parts[].fileData", "image_url", "File URL; converted to image_url."],
  ["contents[].parts[].functionCall", "assistant.tool_calls", "Model function call."],
  ["contents[].parts[].functionResponse", "role=tool", "Tool execution result."],
  ["systemInstruction", "system message", "System prompt; supports a string or parts."],
  ["generationConfig.temperature", "temperature", "Sampling temperature."],
  ["generationConfig.topP", "top_p", "Nucleus sampling."],
  ["generationConfig.maxOutputTokens", "max_tokens", "Maximum output tokens."],
  ["generationConfig.stopSequences", "stop", "Array of stop sequences."],
  ["tools[].functionDeclarations", "tools", "Function declarations; converted to OpenAI function tools."],
  ["toolConfig.functionCallingConfig.mode", "tool_choice", "AUTO / ANY / NONE map to auto / required / none respectively; some upstream models may not accept required."],
  ["streamGenerateContent", "stream=true", "Streaming endpoint. Returns SSE when ?alt=sse is used."],
];

const responseFields = [
  ["choices[].message.content", "Non-streaming text output."],
  ["choices[].message.reasoning_content", "Thinking content possibly returned by reasoning models."],
  ["choices[].message.tool_calls", "Returned when the model requests tool calls."],
  ["choices[].delta.content", "Streaming text delta."],
  ["choices[].delta.reasoning_content", "Streaming thinking delta; possibly returned by reasoning models."],
  ["choices[].finish_reason", "stop / length / tool_calls / content_filter."],
  ["usage.prompt_tokens", "Input tokens."],
  ["usage.completion_tokens", "Output tokens."],
  ["usage.total_tokens", "Total tokens."],
  ["usage.completion_tokens_details.reasoning_tokens", "Reasoning tokens; returned by some models."],
];

function Matrix({ rows, columns }: { rows: string[][]; columns: string[] }) {
  return (
    <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "grid", gridTemplateColumns: columns.map((c) => c).join(" "), background: "#f1f5f9", borderBottom: "1px solid #dbe4f0", fontSize: 12, fontWeight: 700, color: "#475569" }}>
        {["Parameter", "Type / Mapping", "Status", "Description"].slice(0, columns.length).map((header) => (
          <div key={header} style={{ padding: "10px 14px" }}>{header}</div>
        ))}
      </div>
      {rows.map((row, index) => (
        <div key={row[0]} style={{ display: "grid", gridTemplateColumns: columns.map((c) => c).join(" "), borderTop: index === 0 ? "none" : "1px solid #e2e8f0", background: index % 2 === 0 ? "#ffffff" : "#f8fafc", fontSize: 13 }}>
          {row.map((cell, cellIndex) => (
            <div key={cellIndex} style={{ padding: "11px 14px", color: cellIndex === 0 ? "#2563eb" : "#475569", lineHeight: 1.6, minWidth: 0 }}>
              {cellIndex === 0 ? <code style={{ wordBreak: "break-all" }}>{cell}</code> : cell}
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
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 700 }}>API Reference</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Parameters Matrix
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 760, margin: 0 }}>
          This page lists parameters according to the backend's actual passthrough and protocol-conversion logic. Text models support three protocols—OpenAI, Anthropic and Gemini—while non-text models use the image, audio, embedding or async-task endpoints based on capability.
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>OpenAI Chat Completions</h2>
        <Matrix rows={openAiParams} columns={["220px", "150px", "90px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Fields Not Yet Supported</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginTop: -4, marginBottom: 14 }}>
          The fields below are not yet stably forwarded by the public chat entry point; production code should not depend on them.
        </p>
        <Matrix rows={notForwardedOpenAiParams} columns={["220px", "150px", "90px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Thinking-mode Support</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginTop: -4, marginBottom: 14 }}>
          The behavior listed here is observed via the live NexusFlow OpenAI Chat entry. Support may change with upstream model versions; production code should use explicit configuration per model ID.
        </p>
        <Matrix rows={thinkingSupport} columns={["220px", "140px", "140px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Anthropic Messages Mapping</h2>
        <Matrix rows={anthropicParams} columns={["260px", "220px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Gemini GenerateContent Mapping</h2>
        <Matrix rows={geminiParams} columns={["300px", "220px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Response Fields</h2>
        <Matrix rows={responseFields} columns={["300px", "1fr"]} />
      </section>

      <section style={{ padding: 18, border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff" }}>
        <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8 }}>
          Production tip: for reasoning models use <code>stream=true</code> and <code>stream_options.include_usage=true</code>; on mixed-thinking models, explicitly pass <code>enable_thinking=false</code> for low-cost, low-latency scenarios.
          See more examples in <Link href="/docs/api/chat" style={{ color: "#1d4ed8" }}>Chat Completions API</Link> and <Link href="/docs/api/gemini" style={{ color: "#1d4ed8" }}>Gemini protocol</Link>.
        </div>
      </section>
    </div>
  );
}
