import assert from "node:assert/strict";
import { getReservedOutputTokens, getStaticModels } from "../src/data/models";
import { findProvider } from "../src/services/providers";
import {
  getAllowedChatParameters,
  getModelCapabilities,
} from "../src/utils/model-capabilities";
import { buildUpstreamChatRequest } from "../src/utils/chat-request";
import {
  getUpstreamModelId,
  restorePublicModelAlias,
  rewriteUpstreamModelAliasText,
} from "../src/utils/upstream-model-aliases";

const models = getStaticModels();
assert.equal(new Set(models.map((model) => model.id)).size, models.length);

const snapshot = models.find((model) => model.id === "deepseek-v4-flash");
assert.ok(snapshot);
assert.equal(models.some((model) => model.id === "deepseek-v4-flash-0731"), false);
assert.equal(snapshot.contextLength, 1_000_000);
assert.equal(snapshot.maxOutput, 393_216);
assert.equal(getReservedOutputTokens(snapshot), 16_384);
assert.equal(getReservedOutputTokens(snapshot, 393_216), 393_216);
assert.equal(getReservedOutputTokens(snapshot, 500_000), 393_216);
assert.equal(snapshot.promptPrice, 1);
assert.equal(snapshot.completionPrice, 2);
assert.equal(snapshot.cacheReadPrice, 0.2);
assert.equal(findProvider(snapshot.id)?.id, "dashscope");
assert.equal(getUpstreamModelId(snapshot.id), "deepseek-v4-flash-0731");
assert.equal(getUpstreamModelId("deepseek-v4-pro"), "deepseek-v4-pro");

const upstreamRequest = buildUpstreamChatRequest(snapshot, {
  model: snapshot.id,
  messages: [{ role: "user", content: "hello" }],
  stream: false,
  enable_thinking: false,
});
assert.equal(upstreamRequest.model, "deepseek-v4-flash-0731");
assert.equal(upstreamRequest.enable_thinking, false);
const response = restorePublicModelAlias({
  model: "deepseek-v4-flash-0731",
  response: { model: "deepseek-v4-flash-0731" },
}, snapshot.id);
assert.equal(response.model, snapshot.id);
assert.equal(response.response.model, snapshot.id);
assert.match(
  rewriteUpstreamModelAliasText(
    'data: {"model":"deepseek-v4-flash-0731"}',
    snapshot.id
  ),
  /"model":"deepseek-v4-flash"/
);

const capabilities = getModelCapabilities(snapshot);
assert.equal(capabilities.model_type, "chat");
assert.equal(capabilities.thinking_mode, "mixed");
assert.equal(capabilities.thinking_default, true);
assert.equal(capabilities.supports_enable_thinking, true);
assert.equal(capabilities.supports_thinking_budget, true);
assert.equal(capabilities.supports_tools, true);
assert.equal(capabilities.supports_search, true);
assert.equal(capabilities.supports_context_caching, true);

const parameters = getAllowedChatParameters(snapshot);
for (const parameter of [
  "tools",
  "enable_thinking",
  "thinking_budget",
  "enable_search",
  "enable_context_caching",
  "parallel_tool_calls",
]) {
  assert.ok(parameters.includes(parameter), `${parameter} must be allowed`);
}

console.log("model catalog onboarding tests passed");
