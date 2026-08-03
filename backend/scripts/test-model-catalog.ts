import assert from "node:assert/strict";
import { calculateTokenCost, getReservedOutputTokens, getStaticModels, resolveCachePricing, resolveCompletionPrice } from "../src/data/models";
import { findProvider } from "../src/services/providers";
import { sanitizeModelDoc } from "../src/data/model-overrides";
import { estimateStreamUsage } from "../src/utils/estimate-stream-usage";
import { isExplicitCacheRequested } from "../src/utils/cache-billing";
import { openAiUsageToAnthropic } from "../src/utils/anthropic-openai-bridge";
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
assert.doesNotMatch(snapshot.description, /0731|快照|稳定别名/);
assert.equal(snapshot.tags.some((tag) => /0731|快照|稳定别名/.test(tag)), false);
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

// ========== qwen3.8-max ==========
// 账本精度为 6 位小数，金额断言按同一精度比较，避免浮点尾差
const at6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const flagship = models.find((model) => model.id === "qwen3.8-max");
assert.ok(flagship, "qwen3.8-max must exist in the catalog");
assert.equal(flagship.contextLength, 1_000_000);
assert.equal(flagship.maxOutput, 131_072);
assert.equal(flagship.promptPrice, 12);
assert.equal(flagship.completionPrice, 36);
assert.equal(flagship.cacheReadPrice, 1.5);
assert.equal(flagship.cacheReadExplicitPrice, 1);
assert.equal(flagship.tokenPricingTiers, undefined, "官方为单一价，不应引入分层");
assert.equal(findProvider(flagship.id)?.id, "dashscope");
assert.equal(getUpstreamModelId(flagship.id), "qwen3.8-max", "公开 ID 与上游一致，不需要别名");

const flagshipCapabilities = getModelCapabilities(flagship);
assert.equal(flagshipCapabilities.model_type, "chat");
assert.equal(flagshipCapabilities.thinking_mode, "mixed");
assert.equal(flagshipCapabilities.thinking_default, true);
assert.equal(flagshipCapabilities.supports_thinking_budget, true);
assert.equal(flagshipCapabilities.supports_vision, true);
assert.equal(flagshipCapabilities.supports_search, true);
assert.equal(flagshipCapabilities.supports_context_caching, true);
assert.ok(getAllowedChatParameters(flagship).includes("preserve_thinking"));

// 三个口径必须严格等于官方价：隐式 1.5 / 显式 1 / 显式创建 15(=12×1.25)
const flagshipCache = resolveCachePricing(flagship);
assert.equal(flagshipCache.implicitHit, 1.5);
assert.equal(flagshipCache.explicitHit, 1);
assert.equal(flagshipCache.explicitCreation, 15);

// 实扣金额：100 万 token 全部命中缓存时，显式与隐式必须算出不同的钱
const implicitHitCost = at6(calculateTokenCost(flagship, 1_000_000, 0, 1_000_000, 0));
assert.equal(implicitHitCost, 1.5, "预占估算取较大值(隐式 1.5)以免预占不足");

// ========== 存量模型回归：解析器语义 ==========
// 只配 cacheReadPrice、未配显式价的模型：显式必须沿用 cacheReadPrice，不得改成 10% 倍率
const legacyConfigured = models.find((model) => model.id === "glm-5.2");
assert.ok(legacyConfigured);
assert.equal(legacyConfigured.cacheReadExplicitPrice, undefined);
const legacyCache = resolveCachePricing(legacyConfigured);
assert.equal(legacyCache.implicitHit, 2);
assert.equal(legacyCache.explicitHit, 2, "未配显式价时必须沿用 cacheReadPrice");
assert.equal(at6(calculateTokenCost(legacyConfigured, 1_000_000, 0, 1_000_000, 0)), 2);

// 完全未配缓存价的模型：回落官方标准倍率（隐式 20% / 显式 10%）
const unconfigured = models.find((model) => model.id === "qwen3-235b-a22b");
assert.ok(unconfigured);
assert.equal(unconfigured.cacheReadPrice, undefined);
const unconfiguredCache = resolveCachePricing(unconfigured);
assert.equal(unconfiguredCache.implicitHit, 0.4, "2 × 20%");
assert.equal(unconfiguredCache.explicitHit, 0.2, "2 × 10%");

// 官方显式价低于隐式价的模型：两个口径必须分开生效
const splitCache = models.find((model) => model.id === "qwen3.7-max");
assert.ok(splitCache);
const splitResolved = resolveCachePricing(splitCache);
assert.equal(splitResolved.implicitHit, 2.4, "官方输入（缓存命中）");
assert.equal(splitResolved.explicitHit, 1.2, "官方显式缓存命中");
assert.equal(splitResolved.explicitCreation, 15, "官方显式缓存创建");

// 分层模型按命中的档位取价（qwen3.7-plus 官方 档1 2/8、档2 6/24）
const tiered = models.find((model) => model.id === "qwen3.7-plus");
assert.ok(tiered);
assert.equal(at6(calculateTokenCost(tiered, 100_000, 0, 100_000, 0)), 0.04, "档1 缓存 ¥0.4/M");
assert.equal(at6(calculateTokenCost(tiered, 1_000_000, 0, 1_000_000, 0)), 1.2, "档2 缓存 ¥1.2/M");

// 思考模式输出价：官方单独定价的模型必须走思考价，未配置的模型保持不变
const thinkingPriced = models.find((model) => model.id === "qwen3-32b");
assert.ok(thinkingPriced);
assert.equal(resolveCompletionPrice(thinkingPriced, null, false), 8, "非思考输出");
assert.equal(resolveCompletionPrice(thinkingPriced, null, true), 20, "思考输出");
assert.equal(resolveCompletionPrice(flagship, null, false), 36);
assert.equal(resolveCompletionPrice(flagship, null, true), 36, "未配思考价的模型两者相同");

// ========== 后台模型目录覆盖层不得静默丢弃计费字段 ==========
// commit 74bc436d 修过同类漏损：sanitizeModelDoc 是白名单，新增价格字段必须同步登记。
const overrideDoc = {
  id: "regression/override-billing-fields",
  name: "Override Billing Fields",
  provider: "通义千问",
  description: "回归用例",
  contextLength: 1000,
  maxOutput: 100,
  promptPrice: 10,
  completionPrice: 20,
  cacheReadPrice: 2,
  cacheReadExplicitPrice: 1,
  thinkingCompletionPrice: 50,
  audioInputPrice: 30,
  audioOutputPrice: 40,
  anthropicPassThrough: false,
  tokenPricingTiers: [
    { label: "0<Token≤1K", maxTokens: 1000, promptPrice: 10, completionPrice: 20, cacheReadPrice: 2, cacheReadExplicitPrice: 1, thinkingCompletionPrice: 50 },
  ],
};
const sanitized = sanitizeModelDoc(overrideDoc);
assert.ok(sanitized.ok, "覆盖层文档应通过校验");
const kept = sanitized.model!;
for (const field of [
  "cacheReadPrice",
  "cacheReadExplicitPrice",
  "thinkingCompletionPrice",
  "audioInputPrice",
  "audioOutputPrice",
] as const) {
  assert.equal(kept[field], overrideDoc[field], `覆盖层丢弃了计费字段 ${field}`);
}
assert.equal(kept.anthropicPassThrough, false);
const keptTier = kept.tokenPricingTiers![0];
assert.equal(keptTier.cacheReadPrice, 2);
assert.equal(keptTier.cacheReadExplicitPrice, 1);
assert.equal(keptTier.thinkingCompletionPrice, 50, "档位级思考价被丢弃");

// ========== 断流估费必须保留思考模式信号 ==========
// 计费按 reasoning_tokens>0 判定思考价；估费兜底若丢该字段，思考模式断流请求会被少收。
const sseThinking = [
  'data: {"choices":[{"delta":{"reasoning_content":"推理四个字"}}]}',
  'data: {"choices":[{"delta":{"content":"答案"}}]}',
  "data: [DONE]",
].join("\n");
const estimated = estimateStreamUsage(sseThinking, [{ role: "user", content: "hi" }]);
assert.ok(
  estimated.completion_tokens_details.reasoning_tokens > 0,
  "估费必须带 reasoning_tokens，否则思考模式断流按非思考价少收"
);
const sseNoThinking = ['data: {"choices":[{"delta":{"content":"答案"}}]}', "data: [DONE]"].join("\n");
assert.equal(
  estimateStreamUsage(sseNoThinking, [{ role: "user", content: "hi" }]).completion_tokens_details.reasoning_tokens,
  0,
  "无思维链时 reasoning_tokens 必须为 0，不得误触思考价"
);

// ========== 显式缓存判定必须覆盖两条开启途径 ==========
// 漏判 enable_context_caching 会把显式命中按隐式价计费；对显式价低于隐式价的模型即多收客户。
const cacheControlMessages = [
  { role: "system", content: [{ type: "text", text: "x", cache_control: { type: "ephemeral" } }] },
];
assert.equal(isExplicitCacheRequested(cacheControlMessages, {}), true, "cache_control 途径");
assert.equal(
  isExplicitCacheRequested([{ role: "user", content: "hi" }], { enable_context_caching: true }),
  true,
  "enable_context_caching 途径"
);
assert.equal(isExplicitCacheRequested([{ role: "user", content: "hi" }], {}), false, "两者皆无时为隐式");
assert.equal(
  isExplicitCacheRequested([{ role: "user", content: "hi" }], { enable_context_caching: "true" }),
  false,
  "非布尔 true 不得误判为显式"
);

// 端到端金额：qwen3.8-max 显式命中 ¥1 vs 隐式 ¥1.5，两条途径都必须落到 ¥1
const flagshipCacheResolved = resolveCachePricing(flagship);
assert.equal(flagshipCacheResolved.explicitHit, 1);
assert.equal(flagshipCacheResolved.implicitHit, 1.5);

// ========== 思考价不得对非思考请求生效 ==========
// 曾用 max(非思考,思考) 兜底，导致 /v1/messages 的非思考请求被按思考价多收（qwen-plus 档1 为 4 倍）。
const tieredThinking = models.find((model) => model.id === "qwen-plus")!;
const firstTier = tieredThinking.tokenPricingTiers![0];
assert.equal(resolveCompletionPrice(tieredThinking, firstTier, false), 2, "非思考请求必须按 ¥2");
assert.equal(resolveCompletionPrice(tieredThinking, firstTier, true), 8, "思考请求按 ¥8");

// 桥必须透传 reasoning_tokens，否则 Anthropic 路径拿不到判定信号
const bridged = openAiUsageToAnthropic({
  prompt_tokens: 10,
  completion_tokens: 20,
  completion_tokens_details: { reasoning_tokens: 7 },
});
assert.equal(bridged.reasoning_tokens, 7, "桥丢了 reasoning_tokens，思考价判定会失效");
assert.equal(openAiUsageToAnthropic({ prompt_tokens: 1, completion_tokens: 1 }).reasoning_tokens, 0);

console.log("model catalog onboarding tests passed");
