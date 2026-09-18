import assert from "node:assert/strict";
import { calculateTokenCost, getReservedOutputTokens, getStaticModels, getTokenPricingTier, resolveCachePricing, resolveCompletionPrice } from "../src/data/models";
import { findProvider } from "../src/services/providers";
import { sanitizeModelDoc } from "../src/data/model-overrides";
import { estimateStreamUsage } from "../src/utils/estimate-stream-usage";
import { isExplicitCacheRequested } from "../src/utils/cache-billing";
import { anthropicToOpenAiPayload, openAiUsageToAnthropic } from "../src/utils/anthropic-openai-bridge";
import { hasThinkingOutput } from "../src/routes/messages";
import {
  getAllowedChatParameters,
  getModelCapabilities,
} from "../src/utils/model-capabilities";
import { buildUpstreamChatRequest } from "../src/utils/chat-request";
import { estimateAsyncCost } from "../src/services/async-billing";
import { getSupportedProtocols, supportsResponsesApi } from "../src/utils/model-protocols";
import {
  getUpstreamModelId,
  restorePublicModelAlias,
  rewriteUpstreamModelAliasText,
} from "../src/utils/upstream-model-aliases";

const models = getStaticModels();
assert.equal(new Set(models.map((model) => model.id)).size, models.length);
assert.equal(models.some((model) => model.id === "kimi/kimi-k3"), false, "旧 K3 ID 不得继续公开");

const snapshot = models.find((model) => model.id === "deepseek-v4-flash");
assert.ok(snapshot);
const flash0731 = models.find((model) => model.id === "deepseek-v4-flash-0731");
assert.ok(flash0731, "0731 必须作为独立快照公开，不能隐藏在稳定 ID 后面");
assert.equal(flash0731.contextLength, 1_000_000);
assert.equal(flash0731.maxOutput, 393_216);
assert.equal(flash0731.promptPrice, 1);
assert.equal(flash0731.completionPrice, 2);
assert.equal(getUpstreamModelId(flash0731.id), flash0731.id, "0731 快照必须同名直传上游");
assert.equal(getModelCapabilities(flash0731).thinking_default, true);
assert.ok(getSupportedProtocols(flash0731).includes("openai/responses"));
assert.equal(snapshot.contextLength, 1_000_000);
assert.equal(snapshot.maxOutput, 393_216);
assert.equal(getReservedOutputTokens(snapshot), 16_384);
assert.equal(getReservedOutputTokens(snapshot, 393_216), 393_216);
assert.equal(getReservedOutputTokens(snapshot, 500_000), 393_216);

// 缺省输出预留不得回退到 maxOutput：kimi-k3 的 maxOutput(1,048,576) 超过
// Provider TPM 上限(1,000,000)，回退到峰值会导致不带 max_tokens 的请求被必然拒绝。
const kimiK3 = models.find((model) => model.id === "kimi-k3");
assert.ok(kimiK3);
assert.equal(kimiK3.maxOutput, 1_048_576);
assert.equal(kimiK3.defaultOutputReservation, undefined);
assert.equal(getReservedOutputTokens(kimiK3), 16_384);
assert.equal(getReservedOutputTokens(kimiK3, 1_048_576), 1_048_576);
assert.equal(getReservedOutputTokens(kimiK3, 2_000_000), 1_048_576);
assert.equal(
  getReservedOutputTokens({ ...kimiK3, maxOutput: 8_192 }),
  8_192,
  "maxOutput 小于全局缺省预留时按 maxOutput 截断"
);
assert.equal(snapshot.promptPrice, 1);
assert.equal(snapshot.completionPrice, 2);
assert.equal(snapshot.cacheReadPrice, 0.2);
assert.doesNotMatch(snapshot.description, /0731|快照|稳定别名/);
assert.equal(snapshot.tags.some((tag) => /0731|快照|稳定别名/.test(tag)), false);
assert.equal(findProvider(snapshot.id)?.id, "dashscope");
assert.equal(getUpstreamModelId(snapshot.id), snapshot.id);
assert.equal(getUpstreamModelId("deepseek-v4-pro"), "deepseek-v4-pro");

const pro0813 = models.find((model) => model.id === "deepseek-v4-pro-0813");
assert.ok(pro0813, "deepseek-v4-pro-0813 must be public as an independent snapshot");
assert.equal(pro0813.contextLength, 1_000_000);
assert.equal(pro0813.maxOutput, 393_216);
assert.equal(pro0813.promptPrice, 9, "同步 API 必须使用百炼即时推理输入价");
assert.equal(pro0813.completionPrice, 27, "同步 API 必须使用百炼即时推理输出价");
assert.equal(pro0813.cacheReadPrice, 1.8, "0813 隐式缓存按官方通用 20% 规则");
assert.equal(getReservedOutputTokens(pro0813), 16_384);
assert.equal(getUpstreamModelId(pro0813.id), pro0813.id);
assert.equal(findProvider(pro0813.id)?.id, "dashscope");
assert.deepEqual(pro0813.alternatePricingModes, [{
  id: "idle-scheduling",
  label: "闲时调度",
  promptPrice: 4.5,
  completionPrice: 13.5,
  availability: "announced",
  note: "百炼已公布价格，但官方闲时调度功能尚未开放；NexusFlow 当前不接受该模式请求。",
}]);
const pro0813Capabilities = getModelCapabilities(pro0813);
assert.equal(pro0813Capabilities.thinking_mode, "mixed");
assert.equal(pro0813Capabilities.thinking_default, true);
assert.equal(pro0813Capabilities.supports_context_caching, true);
assert.equal(pro0813Capabilities.supports_explicit_context_caching, false);
assert.equal(resolveCachePricing(pro0813).implicitHit, 1.8);

const sanitized0813 = sanitizeModelDoc(pro0813);
assert.equal(sanitized0813.ok, true, "模型覆盖层必须保留并校验其它官方定价模式");
if (sanitized0813.ok) assert.deepEqual(sanitized0813.model.alternatePricingModes, pro0813.alternatePricingModes);

const upstreamRequest = buildUpstreamChatRequest(snapshot, {
  model: snapshot.id,
  messages: [{ role: "user", content: "hello" }],
  stream: false,
  enable_thinking: false,
});
assert.equal(upstreamRequest.model, snapshot.id);
assert.equal(upstreamRequest.enable_thinking, false);
const response = restorePublicModelAlias({
  model: snapshot.id,
  response: { model: snapshot.id },
}, snapshot.id);
assert.equal(response.model, snapshot.id);
assert.equal(response.response.model, snapshot.id);
assert.match(
  rewriteUpstreamModelAliasText(
    'data: {"model":"deepseek-v4-flash"}',
    snapshot.id
  ),
  /"model":"deepseek-v4-flash"/
);

// ========== HiModels Claude 原生 Messages 目录与别名 ==========
const claudeExpectations = [
  { id: "claude-haiku-4-5", upstream: "claude-haiku-4-5-20260820", context: 200_000, maxOutput: 64_000, input: 6.8, output: 34, cacheRead: 0.68 },
  { id: "claude-sonnet-4-6", upstream: "claude-sonnet-4-6-20260820", context: 1_000_000, maxOutput: 64_000, input: 20.4, output: 102, cacheRead: 2.04 },
  { id: "claude-sonnet-5", upstream: "claude-sonnet-5-20260820", context: 1_000_000, maxOutput: 128_000, input: 13.6, output: 68, cacheRead: 1.36 },
  { id: "claude-opus-4-7", upstream: "claude-opus-4-7-20260820", context: 1_000_000, maxOutput: 128_000, input: 34, output: 170, cacheRead: 3.4 },
  { id: "claude-opus-4-8", upstream: "claude-opus-4-8-20260820", context: 1_000_000, maxOutput: 128_000, input: 34, output: 170, cacheRead: 3.4 },
  { id: "claude-opus-5", upstream: "claude-opus-5-20260820", context: 1_000_000, maxOutput: 128_000, input: 34, output: 170, cacheRead: 3.4 },
  { id: "claude-fable-5", upstream: "claude-fable-5-20260820", context: 1_000_000, maxOutput: 128_000, input: 68, output: 340, cacheRead: 6.8 },
] as const;
assert.deepEqual(
  models.filter((model) => model.id.startsWith("claude-")).map((model) => model.id).sort(),
  claudeExpectations.map(({ id }) => id).sort(),
  "Claude 目录必须只公开七个稳定无日期后缀 ID"
);
const hiModelsProvider = findProvider("claude-haiku-4-5");
assert.ok(hiModelsProvider);
assert.equal(hiModelsProvider.baseUrl, "https://api.himodels.ai/v1");
assert.equal(hiModelsProvider.apiKeyEnv, "HIMODELS_API_KEY");
for (const expected of claudeExpectations) {
  const claude = models.find((model) => model.id === expected.id);
  assert.ok(claude, `${expected.id} must exist in the catalog`);
  assert.equal(claude.provider, "Anthropic", "目录 provider 表示模型家族，不表示直连渠道");
  assert.equal(claude.contextLength, expected.context);
  assert.equal(claude.maxOutput, expected.maxOutput);
  assert.equal(claude.promptPrice, expected.input);
  assert.equal(claude.completionPrice, expected.output);
  assert.equal(claude.cacheReadPrice, expected.cacheRead);
  assert.equal(claude.anthropicPassThrough, true);
  assert.equal(findProvider(claude.id)?.id, "himodels");
  assert.equal(getUpstreamModelId(claude.id), expected.upstream);
  assert.equal(getUpstreamModelId(claude.id, "himodels"), expected.upstream);
  assert.equal(getUpstreamModelId(claude.id, "anthropic"), claude.id);
  assert.deepEqual(getSupportedProtocols(claude), ["anthropic/messages"]);
  assert.deepEqual(getAllowedChatParameters(claude), ["model", "messages", "max_tokens", "stream", "system"]);
  assert.equal(restorePublicModelAlias({ model: expected.upstream }, claude.id).model, claude.id);
  assert.equal(
    rewriteUpstreamModelAliasText(`data: {"model":"${expected.upstream}"}`, claude.id),
    `data: {"model":"${claude.id}"}`
  );
  const claudeCapabilities = getModelCapabilities(claude);
  assert.equal(claudeCapabilities.supports_tools, false);
  assert.equal(claudeCapabilities.supports_vision, false);
  assert.equal(claudeCapabilities.thinking_mode, "none");
  assert.equal(claudeCapabilities.supports_context_caching, false);
  assert.equal(claudeCapabilities.supports_explicit_context_caching, false);
}

const haikuObject = restorePublicModelAlias({
  model: "claude-haiku-4-5-20251001",
  nested: { model: "claude-haiku-4-5-20260820" },
}, "claude-haiku-4-5");
assert.equal(haikuObject.model, "claude-haiku-4-5");
assert.equal(haikuObject.nested.model, "claude-haiku-4-5");
assert.equal(
  rewriteUpstreamModelAliasText(
    'event: message_start\ndata: {"message":{"model": "claude-haiku-4-5-20251001"}}',
    "claude-haiku-4-5"
  ),
  'event: message_start\ndata: {"message":{"model": "claude-haiku-4-5"}}'
);
assert.equal(
  rewriteUpstreamModelAliasText(
    'data: {"text":"claude-haiku-4-5-20251001"}',
    "claude-haiku-4-5"
  ),
  'data: {"text":"claude-haiku-4-5-20251001"}',
  "response normalization must not rewrite user-visible text"
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
  "parallel_tool_calls",
]) {
  assert.ok(parameters.includes(parameter), `${parameter} must be allowed`);
}
assert.ok(!parameters.includes("enable_context_caching"), "deepseek-v4-flash 官方仅支持隐式缓存");

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
const qwenPlusCapabilities = getModelCapabilities(tieredThinking);
assert.equal(qwenPlusCapabilities.thinking_mode, "mixed", "qwen-plus 应支持显式开启思考模式");
assert.equal(qwenPlusCapabilities.thinking_default, false, "qwen-plus 默认应保持非思考模式");
assert.equal(qwenPlusCapabilities.supports_enable_thinking, true, "qwen-plus 不得静默丢弃 enable_thinking");
assert.equal(
  buildUpstreamChatRequest(tieredThinking, {
    model: "qwen-plus",
    messages: [{ role: "user", content: "think" }],
    enable_thinking: true,
  }).enable_thinking,
  true,
  "qwen-plus 的 enable_thinking=true 必须透传到上游",
);
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

// ========== 思考判定不得被正文内容触发（多收） ==========
// 曾用全文子串匹配 thinking_delta，助手正文含该字面量就会翻转计价。
const textMentioningProtocol = [
  'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Anthropic 用 thinking_delta 表示思维链"}}',
  "data: [DONE]",
].join("\n");
assert.equal(
  hasThinkingOutput(textMentioningProtocol),
  false,
  "正文提到 thinking_delta 不得被判成思考模式"
);
assert.equal(
  hasThinkingOutput('data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"推理"}}'),
  true,
  "真实 Anthropic thinking_delta 必须识别"
);
assert.equal(
  hasThinkingOutput('data: {"choices":[{"delta":{"reasoning_content":"推理"}}]}'),
  true,
  "桥路径的 OpenAI reasoning_content 也必须识别"
);
assert.equal(hasThinkingOutput({ content: [{ type: "thinking" }] }), true, "非流式 thinking 块");
assert.equal(hasThinkingOutput({ content: [{ type: "text", text: "thinking_delta" }] }), false, "非流式正文不得误判");

// 断流估费必须把思维链长度带进计费用的 usage，否则桥路径思考请求少收
const estThinking = estimateStreamUsage(
  'data: {"choices":[{"delta":{"reasoning_content":"推理内容"}}]}\ndata: [DONE]',
  [{ role: "user", content: "hi" }]
);
assert.ok(estThinking.completion_tokens_details.reasoning_tokens > 0, "估费需报告 reasoning_tokens");

console.log("model catalog onboarding tests passed");

// ========== qwen3.7-flash 与 MiniMax/MiniMax-M3 上架（2026-08-03） ==========
const flash37 = models.find((model) => model.id === "qwen3.7-flash")!;
assert.ok(flash37, "qwen3.7-flash 必须在目录中");
assert.equal(findProvider(flash37.id)?.id, "dashscope");
assert.equal(flash37.contextLength, 1_000_000);
assert.equal(flash37.maxOutput, 131_072);
assert.equal(flash37.tokenPricingTiers!.length, 3);
// 三档价与缓存价（标准倍率：隐式 20% / 显式 10%）
const flashTierExpect = [
  { max: 32768, in: 0.2, out: 0.8, cache: 0.04, read: 0.02 },
  { max: 262144, in: 0.6, out: 2.4, cache: 0.12, read: 0.06 },
  { max: 1000000, in: 1.2, out: 4.8, cache: 0.24, read: 0.12 },
];
flashTierExpect.forEach((expect, idx) => {
  const tier = flash37.tokenPricingTiers![idx];
  assert.equal(tier.maxTokens, expect.max);
  assert.equal(tier.promptPrice, expect.in);
  assert.equal(tier.completionPrice, expect.out);
  const resolved = resolveCachePricing(flash37, tier);
  assert.equal(resolved.implicitHit, expect.cache);
  assert.equal(resolved.explicitHit, expect.read);
});
assert.equal(getTokenPricingTier(flash37, 32_768)?.promptPrice, 0.2, "32K 边界仍属第一档");
assert.equal(getTokenPricingTier(flash37, 32_769)?.promptPrice, 0.6, "超过 32K 必须进入第二档，避免少收");
const flash37Caps = getModelCapabilities(flash37);
assert.equal(flash37Caps.thinking_mode, "mixed");
assert.equal(flash37Caps.thinking_default, true, "实测默认返回 reasoning_content");
assert.equal(flash37Caps.supports_vision, true);
assert.equal(flash37Caps.supports_context_caching, true);
assert.equal(flash37Caps.supports_explicit_context_caching, true);

const m3 = models.find((model) => model.id === "MiniMax/MiniMax-M3")!;
assert.ok(m3, "MiniMax/MiniMax-M3 必须在目录中");
assert.equal(findProvider(m3.id)?.id, "dashscope", "带斜杠 ID 必须被 MiniMax 前缀路由覆盖");
assert.equal(m3.contextLength, 1_000_000);
assert.equal(m3.maxOutput, 524_288, "上游实测 max_tokens 上限 524288");
assert.equal(m3.promptPrice, 4.2);
assert.equal(m3.completionPrice, 16.8);
assert.equal(m3.anthropicPassThrough, false, "上游 apps/anthropic 实测不支持，必须走桥");
const m3Caps = getModelCapabilities(m3);
assert.equal(m3Caps.thinking_mode, "mixed", "M3 使用 thinking.type 在 adaptive/disabled 间切换");
assert.equal(m3Caps.supports_enable_thinking, false, "M3 不接受百炼通用 enable_thinking 开关");
assert.equal(m3Caps.supports_thinking_object, true, "M3 必须透传 thinking 对象");
assert.ok(getAllowedChatParameters(m3).includes("thinking"));
assert.deepEqual(
  anthropicToOpenAiPayload({ model: m3.id, messages: [], thinking: { type: "enabled", budget_tokens: 1024 } }).thinking,
  { type: "adaptive" },
  "Anthropic 桥必须把 M3 思考开关转换为其专用 thinking 对象",
);
assert.deepEqual(
  anthropicToOpenAiPayload({ model: m3.id, messages: [], thinking: { type: "disabled" } }).thinking,
  { type: "disabled" },
);
assert.equal(m3Caps.supports_vision, true);
// 仅隐式缓存：计费按 0.84 收（显式解析回落隐式价，不多收），但不宣告显式开关
assert.equal(m3Caps.supports_context_caching, true);
assert.equal(m3Caps.supports_explicit_context_caching, false);
const m3Cache = resolveCachePricing(m3);
assert.equal(m3Cache.implicitHit, 0.84);
assert.equal(m3Cache.explicitHit, 0.84, "未公示显式价必须回落隐式价，不得按 10% 倍率少收");
assert.ok(!getAllowedChatParameters(m3).includes("enable_context_caching"), "仅隐式模型不得宣告显式缓存参数");

// kimi-k3 官方有隐式缓存折扣（¥2/M），上次上线遗留：披露层此前不覆盖
const k3 = models.find((model) => model.id === "kimi-k3")!;
assert.equal(k3.anthropicPassThrough, true, "jawayid 原生 /v1/messages 必须直通");
const k3Caps = getModelCapabilities(k3);
assert.equal(k3Caps.supports_context_caching, true, "kimi-k3 缓存价必须披露");
assert.equal(k3Caps.supports_explicit_context_caching, false);
const kimi25 = models.find((model) => model.id === "kimi-k2.5")!;
assert.equal(getModelCapabilities(kimi25).supports_explicit_context_caching, true, "百炼部署 kimi-k2.5 官方支持显式缓存");
assert.ok(getAllowedChatParameters(kimi25).includes("enable_context_caching"));
const glm47 = models.find((model) => model.id === "glm-4.7")!;
assert.equal(getModelCapabilities(glm47).supports_context_caching, true);
assert.equal(getModelCapabilities(glm47).supports_explicit_context_caching, false, "glm-4.7 仅隐式缓存，不得披露显式价");
assert.ok(!getAllowedChatParameters(glm47).includes("enable_context_caching"));
const glm51 = models.find((model) => model.id === "glm-5.1")!;
assert.equal(getModelCapabilities(glm51).supports_explicit_context_caching, true);
const deepseek32 = models.find((model) => model.id === "deepseek-v3.2")!;
assert.equal(getModelCapabilities(deepseek32).supports_explicit_context_caching, true);
assert.equal(getModelCapabilities(snapshot).supports_explicit_context_caching, false, "deepseek-v4-flash 官方仅列入隐式缓存");
const qwenMath = models.find((model) => model.id === "qwen-math-plus")!;
assert.equal(getModelCapabilities(qwenMath).supports_context_caching, false, "不能按 qwen 前缀虚构缓存能力");
const qwenFlash = models.find((model) => model.id === "qwen-flash")!;
assert.equal(resolveCachePricing(qwenFlash).explicitHit, 0.015, "qwen-flash 显式命中必须按输入价 10%");
assert.equal(qwenFlash.tokenPricingTiers?.length, 3, "qwen-flash 必须按官方长上下文三档计价");
assert.equal(getTokenPricingTier(qwenFlash, 131_073)?.promptPrice, 0.6);
assert.equal(getTokenPricingTier(qwenFlash, 262_145)?.completionPrice, 12);
const qwenFlashCaps = getModelCapabilities(qwenFlash);
assert.equal(qwenFlashCaps.thinking_default, false, "qwen-flash 官方默认关闭思考");

const qwenTurbo = models.find((model) => model.id === "qwen-turbo")!;
assert.equal(qwenTurbo.contextLength, 131_072);
assert.equal(qwenTurbo.thinkingCompletionPrice, 3);
assert.equal(getModelCapabilities(qwenTurbo).thinking_default, false);
assert.equal(models.find((model) => model.id === "qwen-long")?.maxOutput, 8_192);

assert.equal(models.some((model) => model.id === "qwen3-tts-flash-realtime"), false, "不得再公开隐藏改写的实时 TTS ID");
assert.ok(models.some((model) => model.id === "qwen3-tts-flash"), "公开 ID 必须与 HTTP 上游一致");

assert.equal(supportsResponsesApi("deepseek-v4-flash"), true);
assert.equal(supportsResponsesApi("qwen3-coder-plus"), true);
assert.equal(supportsResponsesApi("qwen-long"), false);
assert.ok(getSupportedProtocols(qwenFlash).includes("openai/responses"));
assert.ok(!getSupportedProtocols(qwenTurbo).includes("openai/responses"));

assert.equal(getModelCapabilities(models.find((model) => model.id === "qwen3-vl-plus")!).supports_search, false);
assert.equal(getModelCapabilities(models.find((model) => model.id === "qwen3-omni-flash")!).supports_search, false);
assert.equal(getModelCapabilities(models.find((model) => model.id === "MiniMax-M2.1")!).supports_search, true);
assert.equal(getModelCapabilities(models.find((model) => model.id === "MiniMax-M2.5")!).supports_search, false);

// ========== 百炼新模型上架（2026-09-18）：文本 7 个 ==========
const qwen38Flash = models.find((model) => model.id === "qwen3.8-flash")!;
assert.ok(qwen38Flash, "qwen3.8-flash 必须在目录中");
assert.equal(findProvider(qwen38Flash.id)?.id, "dashscope");
assert.equal(qwen38Flash.contextLength, 1_000_000);
assert.equal(qwen38Flash.maxOutput, 131_072);
assert.equal(qwen38Flash.promptPrice, 0.8);
assert.equal(qwen38Flash.completionPrice, 2.7);
assert.equal(qwen38Flash.category, "多模态模型");
assert.ok(getSupportedProtocols(qwen38Flash).includes("openai/responses"), "qwen3.8 系列官方支持 Responses API");
const qwen38FlashCaps = getModelCapabilities(qwen38Flash);
assert.equal(qwen38FlashCaps.thinking_mode, "mixed");
assert.equal(qwen38FlashCaps.thinking_default, true);
assert.equal(qwen38FlashCaps.supports_vision, true);
assert.equal(qwen38FlashCaps.supports_context_caching, true);
assert.equal(qwen38FlashCaps.supports_explicit_context_caching, true);

const glm53 = models.find((model) => model.id === "glm-5.3")!;
assert.ok(glm53, "glm-5.3 必须在目录中");
assert.equal(findProvider(glm53.id)?.id, "dashscope");
assert.equal(glm53.contextLength, 1_048_576);
assert.equal(glm53.maxOutput, 131_072);
assert.equal(glm53.promptPrice, 8);
assert.equal(glm53.completionPrice, 28);
assert.equal(resolveCachePricing(glm53).implicitHit, 2);
const glm53Caps = getModelCapabilities(glm53);
assert.equal(glm53Caps.thinking_mode, "mixed");
assert.equal(glm53Caps.thinking_default, true);
assert.equal(glm53Caps.supports_thinking_budget, true, "glm- 前缀必须支持思考预算");
assert.equal(glm53Caps.supports_context_caching, true);
assert.equal(glm53Caps.supports_explicit_context_caching, false);

const d41Flash = models.find((model) => model.id === "deepseek-v4.1-flash")!;
assert.ok(d41Flash, "deepseek-v4.1-flash 必须在目录中");
assert.equal(findProvider(d41Flash.id)?.id, "dashscope");
assert.equal(d41Flash.contextLength, 1_000_000);
assert.equal(d41Flash.maxOutput, 393_216);
assert.equal(getReservedOutputTokens(d41Flash), 16_384);
assert.equal(d41Flash.promptPrice, 1, "沿用平价口径取闲时价");
assert.equal(d41Flash.completionPrice, 4);
assert.equal(d41Flash.cacheReadPrice, 0.2);
const d41Caps = getModelCapabilities(d41Flash);
assert.equal(d41Caps.thinking_mode, "mixed");
assert.equal(d41Caps.thinking_default, true);
assert.equal(d41Caps.supports_context_caching, true);
assert.equal(d41Caps.supports_explicit_context_caching, false);
assert.equal(supportsResponsesApi(d41Flash.id), false, "未经官方证实前不得宣告 Responses API");

const kimi27Code = models.find((model) => model.id === "kimi-k2.7-code")!;
assert.ok(kimi27Code, "kimi-k2.7-code 必须在目录中");
assert.equal(findProvider(kimi27Code.id)?.id, "dashscope");
assert.equal(kimi27Code.contextLength, 262_144);
assert.equal(kimi27Code.maxOutput, 98_304);
assert.equal(kimi27Code.promptPrice, 6.5);
assert.equal(kimi27Code.completionPrice, 27);
assert.equal(resolveCachePricing(kimi27Code).explicitHit, 0.65);
const kimi27Caps = getModelCapabilities(kimi27Code);
assert.equal(kimi27Caps.thinking_mode, "mixed");
assert.equal(kimi27Caps.thinking_default, true);
assert.ok(getAllowedChatParameters(kimi27Code).includes("preserve_thinking"));

const kimi27Highspeed = models.find((model) => model.id === "kimi/kimi-k2.7-code-highspeed")!;
assert.ok(kimi27Highspeed, "高速版上游 id 带斜杠前缀，目录必须同名公开");
assert.equal(findProvider(kimi27Highspeed.id)?.id, "dashscope", "带斜杠 ID 必须被 kimi 前缀路由覆盖");
assert.equal(getUpstreamModelId(kimi27Highspeed.id), kimi27Highspeed.id);
assert.equal(kimi27Highspeed.promptPrice, 13);
assert.equal(kimi27Highspeed.completionPrice, 54);
assert.equal(getModelCapabilities(kimi27Highspeed).thinking_mode, "mixed");

const kimiK2Thinking = models.find((model) => model.id === "kimi-k2-thinking")!;
assert.ok(kimiK2Thinking, "kimi-k2-thinking 必须在目录中");
assert.equal(findProvider(kimiK2Thinking.id)?.id, "dashscope");
assert.equal(kimiK2Thinking.promptPrice, 4);
assert.equal(kimiK2Thinking.completionPrice, 16);
assert.equal(getModelCapabilities(kimiK2Thinking).thinking_mode, "always", "-thinking 后缀必须识别为纯思考模型");

const m27 = models.find((model) => model.id === "MiniMax/MiniMax-M2.7")!;
assert.ok(m27, "MiniMax/MiniMax-M2.7 必须在目录中");
assert.equal(findProvider(m27.id)?.id, "dashscope");
assert.equal(m27.contextLength, 196_608);
assert.equal(m27.maxOutput, 32_768);
assert.equal(m27.promptPrice, 2.1);
assert.equal(m27.completionPrice, 8.4);
assert.equal(m27.anthropicPassThrough, false, "MiniMax 思考系列上游 apps/anthropic 不支持，必须走桥");
const m27Caps = getModelCapabilities(m27);
assert.equal(m27Caps.thinking_mode, "always", "M2.7 仅思考模式");
assert.equal(m27Caps.supports_enable_thinking, false, "纯思考模型不得宣告 enable_thinking 开关");
assert.equal(m27Caps.supports_context_caching, true);
assert.equal(m27Caps.supports_explicit_context_caching, false);

// ========== 百炼新模型上架（2026-09-18）：视频/图片 11 个 ==========
const asyncCatalog = [
  { id: "wan2.7-image", price: 0.2, category: "图像生成" },
  { id: "wan2.7-image-pro", price: 0.5, category: "图像生成" },
  { id: "wan2.7-t2v", price: 0.6, category: "视频生成" },
  { id: "wan2.7-i2v", price: 0.6, category: "视频生成" },
  { id: "wan2.7-r2v", price: 0.6, category: "视频生成" },
  { id: "wan2.7-videoedit", price: 0.6, category: "视频生成" },
  { id: "wan3.0-video", price: 0.3, category: "视频生成" },
  { id: "wan3.0-video-prime", price: 0.45, category: "视频生成" },
  { id: "happyhorse-1.1-t2v", price: 0.45, category: "视频生成" },
  { id: "happyhorse-1.1-i2v", price: 0.45, category: "视频生成" },
  { id: "happyhorse-1.1-r2v", price: 0.45, category: "视频生成" },
] as const;
for (const expected of asyncCatalog) {
  const entry = models.find((model) => model.id === expected.id);
  assert.ok(entry, `${expected.id} 必须在目录中`);
  assert.equal(entry.category, expected.category);
  assert.equal(entry.promptPrice, expected.price);
  assert.equal(findProvider(entry.id)?.id, "dashscope");
  assert.equal(entry.pricingType, expected.category === "图像生成" ? "per-image" : "per-second");
}

// 视频按秒计费走 async-billing 的硬编码分支（目录价仅展示，不参与结算），必须同步断言
for (const [id, expected] of [
  ["wan2.7-t2v", 0.6],
  ["wan2.7-i2v", 0.6],
  ["wan2.7-r2v", 0.6],
  ["wan2.7-videoedit", 0.6],
  ["wan3.0-video", 0.3],
  ["wan3.0-video-prime", 0.45],
  ["happyhorse-1.1-t2v", 0.45],
  ["happyhorse-1.1-i2v", 0.45],
  ["happyhorse-1.1-r2v", 0.45],
] as const) {
  const entry = models.find((model) => model.id === id);
  assert.ok(entry, `${id} 必须在目录中`);
  assert.equal(
    estimateAsyncCost(entry, { duration: 10 }),
    Math.round(expected * 10 * 100) / 100,
    `${id} 每秒结算价必须为 ¥${expected}，且不得被旧前缀分支吞掉`
  );
}
for (const [id, expected] of [["wan2.7-image", 0.2], ["wan2.7-image-pro", 0.5]] as const) {
  const entry = models.find((model) => model.id === id);
  assert.ok(entry);
  assert.equal(estimateAsyncCost(entry, { n: 2 }), expected * 2, `${id} 图片按张计费`);
}
