import assert from "node:assert/strict";

const apiKey = process.env.HIMODELS_API_KEY?.trim();
if (!apiKey) throw new Error("HIMODELS_API_KEY is required");

const baseUrl = "https://api.himodels.ai/v1";
const models = [
  "claude-haiku-4-5-20260820",
  "claude-sonnet-4-6-20260820",
  "claude-sonnet-5-20260820",
  "claude-opus-4-7-20260820",
  "claude-opus-4-8-20260820",
  "claude-opus-5-20260820",
  "claude-fable-5-20260820",
] as const;

function requestBody(model: string, stream: boolean) {
  return {
    model,
    max_tokens: 1,
    stream,
    messages: [{ role: "user", content: "Reply with OK." }],
  };
}

async function request(model: string, stream: boolean): Promise<Response> {
  return fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody(model, stream)),
    signal: AbortSignal.timeout(120_000),
  });
}

async function checkNonStreaming(model: string): Promise<void> {
  const startedAt = Date.now();
  const response = await request(model, false);
  assert.equal(response.status, 200, `${model}: HTTP ${response.status}`);
  const body = await response.json() as Record<string, any>;
  assert.equal(body.type, "message", `${model}: missing message response type`);
  assert.ok(body.usage && typeof body.usage === "object", `${model}: missing usage`);
  console.log(JSON.stringify({
    model,
    mode: "non-streaming",
    status: response.status,
    latencyMs: Date.now() - startedAt,
    hasUsage: true,
    hasInputTokens: Number.isFinite(body.usage.input_tokens),
    hasOutputTokens: Number.isFinite(body.usage.output_tokens),
    hasCacheCreationTokens: Number.isFinite(body.usage.cache_creation_input_tokens),
    hasCacheReadTokens: Number.isFinite(body.usage.cache_read_input_tokens),
  }));
}

async function checkStreaming(model: string): Promise<void> {
  const startedAt = Date.now();
  const response = await request(model, true);
  assert.equal(response.status, 200, `${model}: streaming HTTP ${response.status}`);
  assert.ok(response.body, `${model}: missing streaming body`);

  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;
  const eventTypes = new Set<string>();
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    assert.ok(bytes <= 1_000_000, `${model}: streaming response exceeded safety limit`);
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("event:")) eventTypes.add(line.slice(6).trim());
    }
  }
  buffer += decoder.decode();
  for (const line of buffer.split("\n")) {
    if (line.startsWith("event:")) eventTypes.add(line.slice(6).trim());
  }

  for (const required of ["message_start", "content_block_delta", "message_stop"]) {
    assert.ok(eventTypes.has(required), `${model}: missing ${required} SSE event`);
  }
  console.log(JSON.stringify({
    model,
    mode: "streaming",
    status: response.status,
    latencyMs: Date.now() - startedAt,
    eventTypes: [...eventTypes].sort(),
  }));
}

async function main(): Promise<void> {
  for (const model of models) await checkNonStreaming(model);
  await checkStreaming("claude-haiku-4-5-20260820");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
