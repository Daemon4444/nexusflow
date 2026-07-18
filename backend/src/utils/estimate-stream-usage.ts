/**
 * 上游流式中途断流（超时/连接中断）时的兜底估费。
 *
 * 正常流式：上游末尾 chunk 带 usage，平台按真实 token 计费。
 * 异常流式：上游在 usage 块发出前断开 → 平台收不到 usage → 旧逻辑记 cost=0，
 * 但用户已收到部分输出、上游也已对平台计费了这部分 → 平台白承担成本。
 *
 * 本工具从已转发的 SSE 中提取实际产出的 assistant 文本（OpenAI 与 Anthropic
 * 两种 delta 格式都覆盖），按字符/2 估算 completion token；prompt 按 messages
 * 体量估算。估费仅作兜底，SLS 标记 estimated=true 便于审计与争议退款。
 */

interface EstimatedUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

function charTokenCount(s: string): number {
  return Math.ceil(s.length / 2);
}

/** 从流式响应文本中提取已产出的 assistant 内容（覆盖 OpenAI 与 Anthropic delta） */
export function extractStreamedContent(fullResponse: string): string {
  let content = "";
  for (const line of fullResponse.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trimStart();
    if (payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload);
      // OpenAI Chat Completions: choices[0].delta.{content,reasoning_content}
      const delta = json?.choices?.[0]?.delta;
      if (delta && typeof delta === "object") {
        if (typeof delta.content === "string") content += delta.content;
        if (typeof delta.reasoning_content === "string") content += delta.reasoning_content;
      }
      // Anthropic Messages: content_block_delta.delta.{text_delta,thinking_delta}
      if (json?.type === "content_block_delta" && json?.delta) {
        const d = json.delta;
        if (d.type === "text_delta" && typeof d.text === "string") content += d.text;
        if (d.type === "thinking_delta" && typeof d.thinking === "string") content += d.thinking;
        if (d.type === "input_json_delta" && typeof d.partial_json === "string") content += d.partial_json;
      }
    } catch {
      /* 忽略残缺行 */
    }
  }
  return content;
}

/**
 * 给定已收到的流式响应与请求 messages，估算 usage。
 * 仅在真实 usage 缺失（全 0）且确有产出内容时作为兜底调用。
 */
export function estimateStreamUsage(fullResponse: string, messages: unknown): EstimatedUsage {
  const contentText = extractStreamedContent(fullResponse);
  const completionTokens = Math.max(1, charTokenCount(contentText));
  const promptTokens = Math.max(1, charTokenCount(typeof messages === "string" ? messages : JSON.stringify(messages ?? "")));
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

/** 判断一次流式的 usage 是否缺失（全 0 或无 completion）—— 用于决定是否走估费兜底 */
export function isUsageMissing(usage: any): boolean {
  const completion = Number(usage?.completion_tokens || usage?.output_tokens || 0);
  const prompt = Number(usage?.prompt_tokens || usage?.input_tokens || 0);
  return prompt === 0 && completion === 0;
}
