# Anthropic Claude Source Notes - 2026-05-10

Sources:
- Models overview: https://platform.claude.com/docs/en/about-claude/models/overview
- Pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Messages API examples/reference: https://docs.anthropic.com/en/api/messages-examples and https://docs.anthropic.com/zh-TW/api/messages

Implemented Claude models:

| NexusFlow model ID | Official model/alias | Context | Max output | Official base price |
| --- | --- | ---: | ---: | --- |
| `claude-opus-4-7` | Claude Opus 4.7 | 1M | 128K | $5 input / $25 output per MTok |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | 1M | 64K | $3 input / $15 output per MTok |
| `claude-haiku-4-5` | Claude Haiku 4.5 alias | 200K | 64K | $1 input / $5 output per MTok |

NexusFlow stores text model prices as CNY per 1M tokens. The committed catalog uses a rounded exchange assumption of `1 USD ~= ¥6.8`:

| Model | Input CNY / MTok | Output CNY / MTok |
| --- | ---: | ---: |
| `claude-opus-4-7` | ¥34 | ¥170 |
| `claude-sonnet-4-6` | ¥20.4 | ¥102 |
| `claude-haiku-4-5` | ¥6.8 | ¥34 |

Prompt caching pricing follows Anthropic's documented multipliers:
- 5-minute cache write: 1.25x base input price.
- 1-hour cache write: 2x base input price. NexusFlow currently bills generic `cache_creation_input_tokens` at 1.25x because the response usage does not distinguish cache duration in the existing route.
- Cache read / hit: 0.1x base input price.

API routing:
- Claude models use Anthropic native Messages API: `POST https://api.anthropic.com/v1/messages`.
- Required upstream headers: `x-api-key`, `anthropic-version`, `content-type`.
- Public NexusFlow endpoint remains `POST /v1/messages`; user auth can be `x-api-key` or `Authorization: Bearer`.
