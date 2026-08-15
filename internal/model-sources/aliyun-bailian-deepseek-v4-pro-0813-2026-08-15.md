# Aliyun Bailian DeepSeek V4 Pro 0813 — 2026-08-15

## Public model

- NexusFlow model ID: `deepseek-v4-pro-0813`
- Upstream model ID: `deepseek-v4-pro-0813`
- Region: China (Beijing)
- Context window: 1,000,000 tokens
- Maximum output: 393,216 tokens (same V4 Pro snapshot family limit)

## Pricing evidence

Official pricing page: <https://help.aliyun.com/zh/model-studio/model-pricing>

- Online / immediate inference: input CNY 9 per million tokens; output CNY 27 per million tokens.
- Idle scheduling: input CNY 4.5 per million tokens; output CNY 13.5 per million tokens.
- The official dynamic scheduling page states that idle scheduling is not yet available. NexusFlow synchronous APIs therefore bill only the online prices. Idle prices are disclosed as `announced` metadata and never participate in reservation or settlement.

Dynamic scheduling evidence: <https://help.aliyun.com/zh/model-studio/dynamic-scheduling>

## Cache

The model pricing page marks this snapshot as cache-capable. The context cache documentation states that Alibaba-hosted models other than the exact `deepseek-v4-pro` exception use 20% of input price for implicit cache hits. Therefore the active online implicit cache price is CNY 1.8 per million tokens. Explicit cache is not advertised for this model.

Context cache evidence: <https://help.aliyun.com/zh/model-studio/context-cache>

## Production discovery

On 2026-08-15, a read-only request to the production Beijing DashScope account's OpenAI-compatible `/models` endpoint returned HTTP 200 and included `deepseek-v4-pro-0813`. No credential values were recorded.

Small live calls were then made directly against the same production provider account. OpenAI Chat Completions and the DashScope Anthropic-compatible Messages endpoint both returned HTTP 200 with the requested snapshot ID and complete usage fields (7 input tokens, 1 output token in each test). This proves both public NexusFlow protocols can use the upstream snapshot without an alias or bridge fallback.

A separate OpenAI-compatible request set `max_tokens` to 393,216 with thinking disabled and returned HTTP 200, confirming the upstream snapshot accepts the published V4 Pro family maximum-output limit while producing only the requested one-token answer.
