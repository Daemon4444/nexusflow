import assert from "node:assert/strict";
import {
  createOpenAiStreamState,
  finishOpenAiStream,
  observeOpenAiStreamLine,
} from "../src/utils/openai-stream-state";

function observe(lines: string[]) {
  const state = createOpenAiStreamState();
  for (const line of lines) observeOpenAiStreamLine(state, line);
  return state;
}

const complete = observe([
  'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}',
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":2}}',
  "data: [DONE]",
]);
assert.deepEqual(finishOpenAiStream(complete), {
  ok: true,
  synthesizeDone: false,
  terminalReason: "upstream_done",
});

const missingDone = observe([
  'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}',
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":2}}',
]);
assert.deepEqual(finishOpenAiStream(missingDone), {
  ok: true,
  synthesizeDone: true,
  terminalReason: "finish_reason",
});

const tailResetAfterFinish = finishOpenAiStream(missingDone, {
  name: "TypeError",
  code: "UND_ERR_SOCKET",
});
assert.equal(tailResetAfterFinish.ok, true);
if (tailResetAfterFinish.ok) assert.equal(tailResetAfterFinish.synthesizeDone, true);

const interrupted = observe([
  'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}',
]);
assert.deepEqual(finishOpenAiStream(interrupted, { code: "UND_ERR_SOCKET" }), {
  ok: false,
  code: "upstream_stream_interrupted",
});

const timedOut = finishOpenAiStream(interrupted, { name: "TimeoutError" });
assert.deepEqual(timedOut, { ok: false, code: "upstream_timeout" });

const upstreamError = observe([
  'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}',
  'data: {"error":{"message":"sensitive upstream detail","code":"internal_error"}}',
]);
assert.equal(upstreamError.upstreamErrorCode, "internal_error");
assert.deepEqual(finishOpenAiStream(upstreamError), {
  ok: false,
  code: "upstream_stream_error",
});

console.log("OpenAI stream terminal-state checks passed");
