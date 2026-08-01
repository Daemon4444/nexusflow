"use client";

import Link from "next/link";

const openAiParams = [
  ["model", "string", "必填", "模型 ID。文本、推理、多模态、编程和专业模型支持 Chat Completions。"],
  ["messages", "array", "必填", "对话消息数组，按顺序传入 system、user、assistant、tool。"],
  ["messages[].role", "string", "必填", "system / user / assistant / tool。tool 消息用于回传工具执行结果。"],
  ["messages[].content", "string | array", "必填", "文本可直接传字符串；多模态输入传内容块数组。"],
  ["messages[].content[].type", "string", "多模态", "稳定示例为 text / image_url；video、input_audio 等扩展内容块需按具体模型实测。"],
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
  ["tool_choice", "string | object", "可选", "稳定支持 auto / none，或指定 {type:'function', function:{name}}。思考模式模型不建议强制工具。"],
  ["response_format", "object", "可选", "输出格式控制。常见值为 {\"type\":\"text\"} 或 {\"type\":\"json_object\"}。"],
  ["enable_thinking", "boolean", "可选", "思考模式开关。仅对已验证支持的混合思考模型可关闭；仅思考模型会忽略 false 并继续返回 reasoning_content。"],
  ["thinking_budget", "integer", "可选", "限制思考 Token 上限，按模型 ID 前缀透传（qwen3.7- / qwen3.6- / qwen3.5- / qwen3-）。"],
  ["preserve_thinking", "boolean", "可选", "将历史消息中的 reasoning_content 透传回模型，支持 qwen3.7-max、qwen3.6-max-preview、qwen3.6-plus、kimi-k2.6、kimi/kimi-k3。"],
  ["enable_search", "boolean", "可选", "联网搜索，支持通义千问文本类模型（非 VL / math 系列）。"],
  ["search_options", "object", "可选", "联网搜索配置，与 enable_search 配套使用。"],
  ["enable_context_caching", "boolean", "可选", "启用上下文缓存。重复的 prompt 前缀自动缓存，命中部分按 0.1x 输入价计费。支持通义千问、GLM 系列。"],
  ["seed", "integer", "可选", "随机种子，通义千问文本模型支持透传。"],
  ["top_k", "integer", "可选", "Top-K 采样，通义千问文本模型支持透传。"],
  ["logprobs", "boolean", "可选", "返回 log 概率，通义千问文本模型支持透传。"],
  ["repetition_penalty", "number", "可选", "重复惩罚，通义千问文本模型支持透传。"],
  ["parallel_tool_calls", "boolean", "可选", "并行工具调用，支持通义千问、DeepSeek、GLM、Anthropic 模型。"],
];

const notForwardedOpenAiParams = [
  ["max_completion_tokens", "integer", "暂未透传", "请使用当前稳定支持的 max_tokens。"],
];

const thinkingSupport = [
  ["qwen3.7-max", "混合思考", "支持 true / false", "默认开启思考；true 返回 reasoning_content；false 不返回。支持 thinking_budget 和 preserve_thinking。"],
  ["qwen3.5-flash", "混合思考", "支持 true / false", "线上验证：true 返回 reasoning_content；false 不返回。"],
  ["qwen3-max", "混合思考", "支持 true / false", "线上验证：true 返回 reasoning_content；false 不返回。"],
  ["qwq-plus", "仅思考", "false 不能关闭", "线上验证：true/false 都返回 reasoning_content。"],
  ["qwen-math-plus", "未按思考开关处理", "不要传", "线上验证：true/false 都未返回 reasoning_content。"],
  ["deepseek-r1", "仅思考", "false 不能关闭", "线上验证：true/false 都返回 reasoning_content。"],
  ["deepseek-v3.2", "混合思考", "支持 true / false", "线上验证：true 返回 reasoning_content；false 不返回。"],
  ["deepseek-v4-flash", "混合思考", "支持 true / false", "稳定别名已指向百炼 0731 快照；线上验证 true 返回 reasoning_content、false 正常直答。"],
  ["deepseek-v4-pro", "混合思考", "支持 true / false", "线上验证：true 返回 reasoning_content；false 不返回。"],
  ["glm-5.2", "混合思考", "支持 true / false", "长程任务旗舰，1M 上下文。默认开启思考；true 返回 reasoning_content，最大思维链 128K；false 不返回。支持 thinking_budget。"],
  ["glm-5.2-fast-preview", "混合思考", "支持 true / false", "GLM-5.2 高速版，能力对齐标准版，输出 TPS 1.5~2 倍。默认开启思考；支持 thinking_budget。"],
  ["glm-5.1", "混合思考", "支持 true / false", "线上验证：true 返回 reasoning_content；false 不返回。"],
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

const responsesParams = [
  ["model", "model", "模型名称，如 qwen3.7-plus。"],
  ["input", "messages", "纯文本或消息数组（支持 role: user/assistant/system/developer）。"],
  ["instructions", "system message", "系统指令，插入上下文起始位置。"],
  ["previous_response_id", "—", "上一轮响应 ID，用于多轮对话（有效期 7 天）。"],
  ["stream", "stream", "是否开启流式输出。"],
  ["store", "—", "是否存储响应（默认 true），false 则不能用 previous_response_id 引用。"],
  ["tools", "tools", "工具列表：web_search、web_extractor、code_interpreter、function 等。"],
  ["tool_choice", "tool_choice", "工具选择策略：auto / none / required。"],
  ["temperature", "temperature", "采样温度。"],
  ["top_p", "top_p", "核采样。"],
  ["max_output_tokens", "max_tokens", "最大输出 token。"],
  ["enable_thinking", "enable_thinking", "是否开启思考模式。"],
  ["reasoning", "—", "思考强度控制，如 {effort: \"high\"}。"],
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
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 700 }}>API 参考</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          参数矩阵
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, maxWidth: 760, margin: 0 }}>
          这里按后端实际透传和协议转换逻辑列出参数。文本类模型支持 OpenAI、Anthropic、Responses 三种协议；非文本模型按模型能力使用图像、音频、向量或异步任务接口。
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>OpenAI Chat Completions</h2>
        <Matrix rows={openAiParams} columns={["220px", "150px", "90px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>暂未支持的字段</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginTop: -4, marginBottom: 14 }}>
          下表列出目前公共 Chat 入口尚未稳定透传的字段；生产代码请勿依赖。
        </p>
        <Matrix rows={notForwardedOpenAiParams} columns={["220px", "150px", "90px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>思考模式支持情况</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginTop: -4, marginBottom: 14 }}>
          这里列的是 NexusFlow 线上 OpenAI Chat 入口的实测行为。支持情况会随上游模型版本变化，生产代码应按模型 ID 做显式配置。
        </p>
        <Matrix rows={thinkingSupport} columns={["220px", "140px", "140px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Anthropic Messages 映射</h2>
        <Matrix rows={anthropicParams} columns={["260px", "220px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>Responses API 映射</h2>
        <Matrix rows={responsesParams} columns={["300px", "220px", "1fr"]} />
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 14 }}>响应字段</h2>
        <Matrix rows={responseFields} columns={["300px", "1fr"]} />
      </section>

      <section style={{ padding: 18, border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff" }}>
        <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8 }}>
          生产建议：推理模型使用 <code>stream=true</code> 和 <code>stream_options.include_usage=true</code>；混合思考模型在低成本、低延迟场景显式传 <code>enable_thinking=false</code>。
          更多例子见 <Link href="/docs/api/chat" style={{ color: "#1d4ed8" }}>对话补全 API</Link> 和 <Link href="/docs/api/responses" style={{ color: "#1d4ed8" }}>Responses API</Link>。
        </div>
      </section>
    </div>
  );
}
