"use client";

import Link from "next/link";

const openAiParams = [
  ["model", "string", "Required", "Model ID. Text, reasoning, multimodal, coding, and specialized models support Chat Completions."],
  ["messages", "array", "Required", "Array of conversation messages, passed in order: system, user, assistant, tool."],
  ["messages[].role", "string", "Required", "system / user / assistant / tool. tool messages return function execution results."],
  ["messages[].content", "string | array", "Required", "Plain text can be passed as a string; multimodal input uses an array of content blocks."],
  ["messages[].content[].type", "string", "Multimodal", "Stable examples are text / image_url; extended content blocks like video and input_audio must be tested per model."],
  ["messages[].content[].text", "string", "Multimodal", "Text when type=text."],
  ["messages[].content[].image_url.url", "string", "Multimodal", "Image URL or data URL; requires a model with vision support."],
  ["stream", "boolean", "Optional", "Enable SSE streaming. Recommended for long text, reasoning models, and interactive scenarios."],
  ["stream_options.include_usage", "boolean", "Optional", "Returns usage at the end of a streaming response. Recommended for billing, statistics, or smoke checks."],
  ["temperature", "number", "Optional", "Sampling temperature. Typically 0 to 2; higher is more random."],
  ["top_p", "number", "Optional", "Nucleus sampling threshold. Avoid adjusting it heavily together with temperature."],
  ["max_tokens", "integer", "Optional", "Maximum output tokens, cannot exceed the model maxOutput."],
  ["stop", "string | string[]", "Optional", "Stop sequences; output ends when matched."],
  ["presence_penalty", "number", "Optional", "Presence penalty, typically -2 to 2, encourages new topics."],
  ["frequency_penalty", "number", "Optional", "Frequency penalty, typically -2 to 2, reduces repetition."],
  ["tools", "array", "Optional", "Array of function calling definitions. Only models that support function calling reliably return tool_calls."],
  ["tools[].type", "string", "Tool", "Always function."],
  ["tools[].function.name", "string", "Tool", "Function name. Use letters, digits, and underscores."],
  ["tools[].function.description", "string", "Tool", "Description of the function, affecting how accurately the model selects tools."],
  ["tools[].function.parameters", "object", "Tool", "JSON Schema describing the function parameters."],
  ["tool_choice", "string | object", "Optional", "Stably supports auto / none, or specify {type:'function', function:{name}}. Forcing tools is not recommended for thinking mode models."],
  ["response_format", "object", "Optional", "Output format control. Common values are {\"type\":\"text\"} or {\"type\":\"json_object\"}."],
  ["enable_thinking", "boolean", "Optional", "Thinking mode toggle. Can be turned off only for verified hybrid thinking models; thinking-only models ignore false and keep returning reasoning_content."],
  ["thinking_budget", "integer", "Optional", "Caps the thinking token budget, forwarded by model ID prefix (qwen3.7- / qwen3.6- / qwen3.5- / qwen3-)."],
  ["preserve_thinking", "boolean", "Optional", "Forwards reasoning_content from prior messages back to the model. Supported by qwen3.7-max, qwen3.6-max-preview, qwen3.6-plus, kimi-k2.6."],
  ["enable_search", "boolean", "Optional", "Web search, supported by Qwen text models (not the VL / math series)."],
  ["search_options", "object", "Optional", "Web search configuration, used together with enable_search."],
  ["enable_context_caching", "boolean", "Optional", "Enable context cache. Repeated prompt prefixes are cached automatically; hits are billed at 0.1x the input price. Supported by Qwen and GLM series."],
  ["seed", "integer", "Optional", "Random seed, forwarded for Qwen text models."],
  ["top_k", "integer", "Optional", "Top-K sampling, forwarded for Qwen text models."],
  ["logprobs", "boolean", "Optional", "Return log probabilities, forwarded for Qwen text models."],
  ["repetition_penalty", "number", "Optional", "Repetition penalty, forwarded for Qwen text models."],
  ["parallel_tool_calls", "boolean", "Optional", "Parallel function calling, supported by Qwen, DeepSeek, GLM, and Anthropic models."],
];

const notForwardedOpenAiParams = [
  ["max_completion_tokens", "integer", "Not forwarded", "Use the currently stable max_tokens instead."],
];

const thinkingSupport = [
  ["qwen3.7-max", "Hybrid thinking", "Supports true / false", "Thinking on by default; true returns reasoning_content, false does not. Supports thinking_budget and preserve_thinking."],
  ["qwen3.5-flash", "Hybrid thinking", "Supports true / false", "Verified live: true returns reasoning_content, false does not."],
  ["qwen3-max", "Hybrid thinking", "Supports true / false", "Verified live: true returns reasoning_content, false does not."],
  ["qwq-plus", "Thinking only", "false cannot disable", "Verified live: both true/false return reasoning_content."],
  ["qwen-math-plus", "Not treated as a thinking toggle", "Do not send", "Verified live: neither true/false returns reasoning_content."],
  ["deepseek-r1", "Thinking only", "false cannot disable", "Verified live: both true/false return reasoning_content."],
  ["deepseek-v3.2", "Hybrid thinking", "Supports true / false", "Verified live: true returns reasoning_content, false does not."],
  ["deepseek-v4-pro", "Hybrid thinking", "Supports true / false", "Verified live: true returns reasoning_content, false does not."],
  ["glm-5.2", "Hybrid thinking", "Supports true / false", "Flagship for long-horizon tasks, 1M context. Thinking on by default; true returns reasoning_content with up to 128K chain-of-thought, false does not. Supports thinking_budget."],
  ["glm-5.1", "Hybrid thinking", "Supports true / false", "Verified live: true returns reasoning_content, false does not."],
];

const anthropicParams = [
  ["model", "model", "Model ID, mapped to the OpenAI model."],
  ["system", "messages[0].role=system", "System prompt. Supports a string or text blocks."],
  ["messages", "messages", "user / assistant messages are converted to OpenAI messages."],
  ["messages[].content[].text", "messages[].content", "Text block. Plain text blocks are merged into a string."],
  ["messages[].content[].image", "image_url", "Supports url or base64 source, converted to OpenAI image_url."],
  ["messages[].content[].tool_use", "assistant.tool_calls", "Assistant tool call result."],
  ["messages[].content[].tool_result", "role=tool", "Returns the function execution result."],
  ["max_tokens", "max_tokens", "Maximum output tokens."],
  ["temperature", "temperature", "Sampling temperature."],
  ["top_p", "top_p", "Nucleus sampling."],
  ["stop_sequences", "stop", "Array of stop sequences."],
  ["stream", "stream", "Enable the Anthropic SSE event stream."],
  ["tools", "tools", "Anthropic tools are converted to OpenAI function tools."],
  ["tool_choice", "tool_choice", "auto / none / any / tool is converted to OpenAI tool_choice."],
];

const responsesParams = [
  ["model", "model", "Model name, e.g. qwen3.7-plus."],
  ["input", "messages", "Plain text or an array of messages (supports role: user/assistant/system/developer)."],
  ["instructions", "system message", "System instructions, inserted at the start of the context."],
  ["previous_response_id", "—", "Previous response ID for multi-turn conversations (valid for 7 days)."],
  ["stream", "stream", "Whether to enable streaming output."],
  ["store", "—", "Whether to store the response (default true); if false, it cannot be referenced via previous_response_id."],
  ["tools", "tools", "Tool list: web_search, web_extractor, code_interpreter, function, etc."],
  ["tool_choice", "tool_choice", "Tool selection strategy: auto / none / required."],
  ["temperature", "temperature", "Sampling temperature."],
  ["top_p", "top_p", "Nucleus sampling."],
  ["max_output_tokens", "max_tokens", "Maximum output tokens."],
  ["enable_thinking", "enable_thinking", "Whether to enable thinking mode."],
  ["reasoning", "—", "Thinking effort control, e.g. {effort: \"high\"}."],
];

const responseFields = [
  ["choices[].message.content", "Non-streaming text output."],
  ["choices[].message.reasoning_content", "Thinking content field that reasoning models may return."],
  ["choices[].message.tool_calls", "Returned when the model requests a tool call."],
  ["choices[].delta.content", "Streaming text delta."],
  ["choices[].delta.reasoning_content", "Streaming thinking delta that reasoning models may return."],
  ["choices[].finish_reason", "stop / length / tool_calls / content_filter."],
  ["usage.prompt_tokens", "Input tokens."],
  ["usage.completion_tokens", "Output tokens."],
  ["usage.total_tokens", "Total tokens."],
  ["usage.completion_tokens_details.reasoning_tokens", "Reasoning tokens, returned by some models."],
];

function Matrix({ rows, columns }: { rows: string[][]; columns: string[] }) {
  return (
    <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "grid", gridTemplateColumns: columns.map((c) => c).join(" "), background: "#f1f5f9", borderBottom: "1px solid #dbe4f0", fontSize: 12, fontWeight: 700, color: "#475569" }}>
        {["Parameter", "Type/Mapping", "Status", "Description"].slice(0, columns.length).map((header) => (
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
          Parameter Matrix
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 760, margin: 0 }}>
          Parameters are listed according to the backend's actual forwarding and protocol conversion logic. Text models support all three protocols (OpenAI, Anthropic, Responses); non-text models use the image, audio, embedding, or async task endpoints based on their capabilities.
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>OpenAI Chat Completions</h2>
        <Matrix rows={openAiParams} columns={["220px", "150px", "90px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Currently Unsupported Fields</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginTop: -4, marginBottom: 14 }}>
          The table below lists fields not yet stably forwarded by the public Chat endpoint; do not rely on them in production code.
        </p>
        <Matrix rows={notForwardedOpenAiParams} columns={["220px", "150px", "90px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Thinking Mode Support</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginTop: -4, marginBottom: 14 }}>
          This lists the tested behavior of the NexusFlow live OpenAI Chat endpoint. Support varies with upstream model versions, so production code should configure behavior explicitly per model ID.
        </p>
        <Matrix rows={thinkingSupport} columns={["220px", "140px", "140px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Anthropic Messages Mapping</h2>
        <Matrix rows={anthropicParams} columns={["260px", "220px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Responses API Mapping</h2>
        <Matrix rows={responsesParams} columns={["300px", "220px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Response Fields</h2>
        <Matrix rows={responseFields} columns={["300px", "1fr"]} />
      </section>

      <section style={{ padding: 18, border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff" }}>
        <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8 }}>
          Production tip: for reasoning models, use <code>stream=true</code> and <code>stream_options.include_usage=true</code>; for hybrid thinking models in low-cost, low-latency scenarios, explicitly pass <code>enable_thinking=false</code>.
          See more examples in the <Link href="/docs/api/chat" style={{ color: "#1d4ed8" }}>Chat Completions API</Link> and the <Link href="/docs/api/responses" style={{ color: "#1d4ed8" }}>Responses API</Link>.
        </div>
      </section>
    </div>
  );
}
