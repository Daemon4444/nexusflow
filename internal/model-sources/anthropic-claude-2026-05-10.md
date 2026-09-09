# Claude / HiModels Source Notes - 2026-09-09

HiModels snapshot version: `20260820`.

Sources:
- Anthropic model overview: https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic Messages reference: https://docs.anthropic.com/en/api/messages-examples and https://docs.anthropic.com/zh-TW/api/messages
- HiModels upstream model snapshot mapping verified for this integration on 2026-09-09

## Model mapping and prices

NexusFlow exposes stable public IDs without a date suffix. The provider adapter maps each public ID to a fixed HiModels upstream snapshot:

| NexusFlow public ID | HiModels upstream snapshot ID | Context | Max output | Official USD input/output per MTok | CNY input/output per MTok at 6.8 |
| --- | --- | ---: | ---: | ---: | ---: |
| `claude-sonnet-5` | `claude-sonnet-5-20260820` | 1M | 128K | $2 / $10 | ¥13.6 / ¥68 |
| `claude-opus-5` | `claude-opus-5-20260820` | 1M | 128K | $5 / $25 | ¥34 / ¥170 |
| `claude-fable-5` | `claude-fable-5-20260820` | 1M | 128K | $10 / $50 | ¥68 / ¥340 |
| `claude-opus-4-8` | `claude-opus-4-8-20260820` | 1M | 128K | $5 / $25 | ¥34 / ¥170 |
| `claude-opus-4-7` | `claude-opus-4-7-20260820` | 1M | 128K | $5 / $25 | ¥34 / ¥170 |
| `claude-sonnet-4-6` | `claude-sonnet-4-6-20260820` | 1M | 64K | $3 / $15 | ¥20.4 / ¥102 |
| `claude-haiku-4-5` | `claude-haiku-4-5-20260820` | 200K | 64K | $1 / $5 | ¥6.8 / ¥34 |

The existing context and output limits are retained for Opus 4.7, Sonnet 4.6, and Haiku 4.5. The approved catalog values for Sonnet 5, Opus 4.8, Opus 5, and Fable 5 are 1M context and 128K maximum output.

## Integration facts

- Public endpoint: `POST /v1/messages`.
- Actual upstream: HiModels native Anthropic Messages compatibility, not a direct call to Anthropic's official API.
- Client authentication remains the NexusFlow API key contract; server-side upstream credentials belong to the HiModels provider configuration rather than an official Anthropic integration.
- Non-streaming Messages and Anthropic-format SSE streaming were verified against the HiModels path.
- Response usage includes standard input/output counts and can include cache-related fields.
- Cache fields do not by themselves prove that every model supports `cache_control`. Tools, prompt caching, and other optional features must be documented per model and channel only after verification.
