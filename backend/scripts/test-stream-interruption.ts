// Stream interruption rules shared by /v1/chat/completions, /v1/messages and
// /v1/responses: what counts as delivered output, how terminal events are
// read, and when a client disconnect aborts the upstream call.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { InferenceContext } from "../src/pipeline/context";
import { estimateStreamUsage, hasStreamedOutput } from "../src/utils/estimate-stream-usage";
import { responsesStreamTerminal } from "../src/routes/responses";
import { anthropicStreamTerminal } from "../src/routes/messages";
import { createAnthropicStreamTranslator } from "../src/utils/anthropic-openai-bridge";

const sse = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

// ---- delivered output
assert.equal(hasStreamedOutput(sse({ choices: [{ delta: { role: "assistant" } }] })), false, "role-only chunk is not output");
assert.equal(hasStreamedOutput(sse({ choices: [{ delta: { content: "hi" } }] })), true);
assert.equal(hasStreamedOutput(sse({ choices: [{ delta: { tool_calls: [{ function: { name: "f", arguments: "{\"a\":1}" } }] } }] })), true, "tool calls are output");
assert.equal(hasStreamedOutput(sse({ type: "response.created", response: { id: "r" } }) + sse({ type: "response.in_progress" })), false, "Responses status events are not output");
assert.equal(hasStreamedOutput(sse({ type: "response.output_text.delta", delta: "hi" })), true);
assert.equal(hasStreamedOutput(sse({ type: "response.function_call_arguments.delta", delta: "{}" })), true);
assert.equal(hasStreamedOutput(sse({ type: "message_start", message: { usage: { input_tokens: 9 } } })), false, "message_start is not output");
assert.equal(hasStreamedOutput(sse({ type: "content_block_delta", delta: { type: "text_delta", text: "hi" } })), true);
const responsesEstimate = estimateStreamUsage(sse({ type: "response.reasoning_summary_text.delta", delta: "think" }) + sse({ type: "response.output_text.delta", delta: "answer" }), "q");
assert(responsesEstimate.completion_tokens > 1, "Responses deltas count toward the estimate");
assert(responsesEstimate.completion_tokens_details.reasoning_tokens > 0, "Responses reasoning is tracked");

// ---- terminal events
assert.equal(responsesStreamTerminal(sse({ type: "response.created" }) + sse({ type: "response.completed", response: {} })), "completed");
assert.equal(responsesStreamTerminal(sse({ type: "response.created" })), null);
assert.equal(responsesStreamTerminal(sse({ type: "response.failed" })), "failed");
assert.equal(responsesStreamTerminal(sse({ type: "response.incomplete" })), "incomplete");
assert.equal(anthropicStreamTerminal(`event: message_stop\n${sse({ type: "message_stop" })}`), "completed");
assert.equal(anthropicStreamTerminal(sse({ type: "message_delta", delta: { stop_reason: "end_turn" } })), "completed", "stop_reason without message_stop still completes");
assert.equal(anthropicStreamTerminal(sse({ type: "message_start" }) + sse({ type: "content_block_delta", delta: { type: "text_delta", text: "x" } })), null);
assert.equal(anthropicStreamTerminal(sse({ type: "error", error: {} })), "failed");

// ---- bridge translator: an interrupted stream ends with an error event, never message_stop
{
  let written = "";
  const translator = createAnthropicStreamTranslator("msg_t", "m", (text) => { written += text; });
  translator.feed(sse({ choices: [{ delta: { role: "assistant", content: "hel" } }] }));
  translator.finishInterrupted("upstream_stream_interrupted");
  assert.match(written, /event: error/);
  assert.doesNotMatch(written, /message_stop/);
}

// ---- client disconnect aborts the upstream call
function fakeContext(options: { socketDestroyed?: boolean; reqDestroyed?: boolean } = {}) {
  const res = Object.assign(new EventEmitter(), { writableEnded: false, writableFinished: false, destroyed: false });
  const req = Object.assign(new EventEmitter(), { destroyed: options.reqDestroyed ?? false, socket: { destroyed: options.socketDestroyed ?? false } });
  const ctx = new InferenceContext("test", req as unknown as Request, res as unknown as Response);
  return { ctx, res };
}
{
  const { ctx, res } = fakeContext();
  const signal = ctx.clientSignal();
  assert.equal(signal.aborted, false);
  res.emit("close");
  assert.equal(signal.aborted, true, "close before the response ended aborts upstream");
  assert.equal(ctx.clientClosed, true);
  assert.equal((signal.reason as Error).message, "client_closed");
  assert.equal(ctx.clientSignal(), signal, "one signal per request");
}
{
  const { ctx, res } = fakeContext();
  const signal = ctx.clientSignal();
  res.writableEnded = true;
  res.emit("close");
  assert.equal(signal.aborted, false, "close after res.end() is not a cancellation");
  assert.equal(ctx.clientClosed, false);
}
{
  const { ctx } = fakeContext({ reqDestroyed: true });
  assert.equal(ctx.clientSignal().aborted, false, "req.destroyed only means the body was read");
}
{
  const { ctx } = fakeContext({ socketDestroyed: true });
  assert.equal(ctx.clientSignal().aborted, true, "a socket already gone aborts immediately");
}

console.log("stream interruption tests passed");
