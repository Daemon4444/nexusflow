/**
 * Upstream error messages shown to customers: real provider shapes are read,
 * and anything that is not about the customer's own request is redacted.
 */
import assert from "node:assert/strict";
import { parseUpstreamErrorBody, redactUpstreamMessage, upstreamClientErrorMessage } from "../src/services/upstream-errors";

const ids = { publicModelId: "qwen3-coder-plus", upstreamModelId: "qwen3-coder-plus-2026-07-22" };

// DashScope native shape, captured from production on 2026-10-10.
const dashscope = parseUpstreamErrorBody(JSON.stringify({
  request_id: "1354bf80-8d50-954f-811b-0c2ae9ef054d",
  code: "InvalidParameter",
  message: "Invalid 'max_output_tokens': must be greater than or equal to 16, got 3.",
}));
assert.equal(upstreamClientErrorMessage(400, dashscope, ids), "Invalid 'max_output_tokens': must be greater than or equal to 16, got 3.");

// OpenAI / Anthropic shapes.
assert.equal(upstreamClientErrorMessage(400, { error: { message: "messages: role 'system' is not supported" } }, ids), "messages: role 'system' is not supported");
assert.equal(upstreamClientErrorMessage(422, { type: "error", error: { type: "invalid_request_error", message: "max_tokens: too small" } }, ids), "max_tokens: too small");
assert.equal(upstreamClientErrorMessage(400, { error: "plain string error" }, ids), "plain string error");

// Not about the customer's request: stays generic (null).
for (const status of [401, 403, 429, 500, 502, 503]) {
  assert.equal(upstreamClientErrorMessage(status, { error: { message: "account ak-1234567890 suspended" } }, ids), null, String(status));
}
assert.equal(upstreamClientErrorMessage(400, { status: 400 }, ids), null, "no message, no invention");
assert.equal(upstreamClientErrorMessage(400, "", ids), null);

// Redaction.
const leaky = "Model qwen3-coder-plus-2026-07-22 failed for request_id: 9f3c2a1b see https://help.aliyun.com/x?ak=1 "
  + "key sk-abcdef0123456789 LTAI5tAbCdEfGhIjKlMn user ops@example.com account 1062575564764654 id 1354bf80-8d50-954f-811b-0c2ae9ef054d";
const redacted = redactUpstreamMessage(leaky, ids.publicModelId, ids.upstreamModelId);
for (const secret of ["2026-07-22", "9f3c2a1b", "help.aliyun.com", "sk-abcdef", "LTAI5t", "ops@example.com", "1062575564764654", "1354bf80"]) {
  assert.ok(!redacted.includes(secret), `${secret} leaked: ${redacted}`);
}
assert.ok(redacted.includes("qwen3-coder-plus"), "public model id kept");
assert.ok(redactUpstreamMessage("x".repeat(1000), "m").length <= 301, "length capped");

// Non-JSON bodies are kept (truncated) for logs.
assert.equal(parseUpstreamErrorBody("<html>bad gateway</html>"), "<html>bad gateway</html>");
console.log("upstream errors: provider shapes, client-only passthrough, redaction and truncation passed");
