# Aliyun Bailian Chat Parameters Reference

Date: 2026-05-06

This is an internal NexusFlow reference extracted from public Aliyun Bailian / Model Studio documentation. It is not user-facing copy.

## Sources

- What is Model Studio: https://help.aliyun.com/zh/model-studio/what-is-model-studio
- Qwen API reference index: https://help.aliyun.com/zh/model-studio/qwen-api-reference/
- OpenAI Chat API reference: https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions
- Deep thinking: https://help.aliyun.com/zh/model-studio/deep-thinking
- Visual reasoning: https://help.aliyun.com/zh/model-studio/visual-reasoning

## API Shapes

Aliyun Bailian exposes three Qwen API shapes:

| API shape | Official endpoint shape | Notes for NexusFlow |
| --- | --- | --- |
| OpenAI Chat Completions | `/compatible-mode/v1/chat/completions` | Main upstream shape used by NexusFlow text models. |
| OpenAI Responses | Responses API | Official Bailian API shape, not currently exposed by NexusFlow public API. |
| DashScope native | `/api/v1/...` | Official native API shape, not currently exposed by NexusFlow public API for text chat. |

Region endpoints are not interchangeable. Official compatible-mode base URLs include Beijing, Singapore, and US Virginia.

## Official OpenAI Chat Request Parameter Inventory

### Core

| Parameter | Type | Official scope / notes | NexusFlow current public chat |
| --- | --- | --- | --- |
| `model` | string, required | Qwen text/commercial/open-source, Qwen-VL, Qwen-Coder, Qwen-Omni, Qwen-Math. Qwen-Audio is DashScope-only. | Forwarded. |
| `messages` | array, required | Ordered conversation context. Supports system, user, assistant and tool messages. | Forwarded. |
| `stream` | boolean | SSE streaming. Official docs recommend streaming for long output and thinking models. | Forwarded. |
| `stream_options.include_usage` | boolean | Adds usage in final streaming chunk. | Forwarded. If absent on streaming, NexusFlow sets `{ include_usage: true }`. |
| `max_tokens` | integer | Limits answer tokens. Official docs note it does not limit thinking-chain length. | Forwarded. |
| `response_format.type` | string | `text` or `json_object`; JSON mode requires prompt instruction. | Forwarded. |
| `n` | integer | Multiple candidates, range 1-4; limited official model support and incompatible with tools. | Not forwarded by NexusFlow chat route. |

### Message Content Blocks

| Parameter / shape | Type | Official scope / notes | NexusFlow current public chat |
| --- | --- | --- | --- |
| `messages[].content` | string or array | String for text-only; array for multimodal or explicit cache. | Forwarded as-is. |
| `content[].type` | string | `text`, `image_url`, `input_audio`, `video`, `video_url`. | Forwarded as-is; actual support depends on upstream model. |
| `content[].text` | string | Required for text blocks. | Forwarded. |
| `content[].image_url.url` | string | Image URL or Base64 data URL. | Forwarded. |
| `content[].input_audio.data` | string | Audio URL or Base64 data URL. | Forwarded, but NexusFlow docs should not claim audio support until tested. |
| `content[].input_audio.format` | string | Audio format such as `mp3` or `wav`. | Forwarded, untested in NexusFlow. |
| `content[].video` | array | Image-list style video input. | Forwarded, untested in NexusFlow public docs. |
| `content[].video_url.url` | string | Video file URL or Base64 data URL. | Forwarded, untested in NexusFlow public docs. |
| `content[].video_url.fps` | float | Frame extraction rate; official range [0.1, 10], default 2.0. | Forwarded if included. |
| `content[].min_pixels` | integer | Lower pixel bound for image/video frame scaling; model-specific defaults. | Forwarded if included. |
| `content[].max_pixels` | integer | Upper pixel bound for image/video frame scaling; model-specific defaults. | Forwarded if included. |
| `content[].total_pixels` | integer | Limits total pixels across extracted video frames. | Forwarded if included. |
| `content[].cache_control.type` | string | Explicit cache, currently `ephemeral`. | Forwarded if included. |

### Assistant / Tool Messages

| Parameter | Type | Official scope / notes | NexusFlow current public chat |
| --- | --- | --- | --- |
| `assistant.content` | string | Prior assistant output. May be empty when tool calls exist. | Forwarded. |
| `assistant.partial` | boolean | Prefix continuation; official support depends on model. | Forwarded if included inside messages. |
| `assistant.tool_calls` | array | Prior model tool calls for multi-turn function calling. | Forwarded. |
| `tool.content` | string | Tool output, must be string. | Forwarded. |
| `tool.tool_call_id` | string | Links tool result to prior tool call. | Forwarded. |

### Sampling / Generation

| Parameter | Type | Official scope / notes | NexusFlow current public chat |
| --- | --- | --- | --- |
| `temperature` | float | Official range [0, 2). Defaults vary by model and thinking mode. | Forwarded. |
| `top_p` | float | Official range (0, 1]. Defaults vary by model and thinking mode. | Forwarded. |
| `top_k` | integer | Non-OpenAI standard. Official defaults vary by model. | Not forwarded. |
| `repetition_penalty` | float | Non-OpenAI standard. Official defaults vary by model. | Not forwarded. |
| `presence_penalty` | float | Official range [-2.0, 2.0]. Defaults vary by model. | Forwarded. |
| `frequency_penalty` | float | OpenAI-style parameter. Not found in the currently scraped Bailian OpenAI Chat page, but NexusFlow forwards it. | Forwarded; verify upstream behavior before documenting as Bailian-supported. |
| `stop` | string or array | Stop sequence. Official docs warn not to mix token IDs and strings in the same array. | Forwarded. |
| `seed` | integer | Non-OpenAI standard in Bailian docs; range [0, 2^31 - 1]. | Not forwarded. |
| `logprobs` | boolean | Model-limited; official docs say thinking-stage content does not return logprobs. | Not forwarded. |
| `top_logprobs` | integer | Range [0, 5], effective only when `logprobs=true`. | Not forwarded. |

### Thinking / Reasoning

| Parameter | Type | Official scope / notes | NexusFlow current public chat |
| --- | --- | --- | --- |
| `enable_thinking` | boolean | Non-OpenAI standard. Controls mixed-thinking models. Official scopes include Qwen3.6, Qwen3.5, Qwen3, Qwen3-Omni-Flash and Qwen3-VL. | Forwarded. |
| `preserve_thinking` | boolean | Non-OpenAI standard. Adds historical assistant `reasoning_content` into model input. Official current support: `qwen3.6-max-preview`, `qwen3.6-plus`, `qwen3.6-plus-2026-04-02`, `kimi-k2.6` on Bailian. Counts toward input tokens and billing. | Not forwarded. |
| `thinking_budget` | integer | Non-OpenAI standard. Limits thinking-chain tokens. Official scopes include Qwen3.6, Qwen3.5, Qwen3-VL, Qwen3 commercial/open-source models; visual reasoning page also lists Qwen3.6, Qwen3.5, Qwen3-VL thinking mode, Kimi K2.6/K2.5 thinking mode. | Not forwarded. |
| `reasoning_content` | response field | Thinking-chain content appears in `choices[].message.reasoning_content` or stream delta. | Returned when upstream returns it. |

Important: official docs distinguish mixed-thinking and thinking-only models. `enable_thinking=false` disables thinking only for mixed-thinking models. Thinking-only models still think.

### Tooling / Search / Extensions

| Parameter | Type | Official scope / notes | NexusFlow current public chat |
| --- | --- | --- | --- |
| `tools` | array | Function definitions. Tool type is currently `function`. | Forwarded. |
| `tool_choice` | string or object | `auto`, `none`, or forced function object. Official docs say thinking-mode models do not support forced tool calls. | Forwarded. |
| `parallel_tool_calls` | boolean | Non-OpenAI standard Bailian extension for parallel tool calls. | Not forwarded. |
| `enable_search` | boolean | Non-OpenAI standard Bailian extension for web search. May increase token usage. | Not forwarded. |
| `search_options.forced_search` | boolean | Effective only when `enable_search=true`. | Not forwarded. |
| `search_options.search_strategy` | string | `turbo`, `max`, `agent`, `agent_max`; model-limited. | Not forwarded. |
| `search_options.enable_search_extension` | boolean | Vertical search; effective only when `enable_search=true`. | Not forwarded. |
| `X-DashScope-DataInspection` | header | Extra content-safety inspection. HTTP header / Python `extra_headers`; not supported through Node.js SDK per official docs. | Not forwarded through public API docs; backend would need explicit header policy. |
| `skill` | array | Special generation skills such as PPT generation; only `qwen-doc-turbo`, requires streaming. | Not forwarded by current chat route. |
| `enable_code_interpreter` | boolean | Official code interpreter toggle. | Not forwarded. |

### Output Modality

| Parameter | Type | Official scope / notes | NexusFlow current public chat |
| --- | --- | --- | --- |
| `modalities` | array | Qwen-Omni only. `["text"]` or `["text","audio"]`. | Not forwarded. |
| `audio.voice` | string | Required when audio output requested. | Not forwarded. |
| `audio.format` | string | Officially only `wav` in scraped section. | Not forwarded. |

### Vision-Specific

| Parameter | Type | Official scope / notes | NexusFlow current public chat |
| --- | --- | --- | --- |
| `vl_high_resolution_images` | boolean | Non-OpenAI standard. Raises input image pixel cap; model-specific pixel limits. | Not forwarded. |
| `min_pixels` | integer | Per content block; model-specific defaults. | Forwarded if embedded in content block. |
| `max_pixels` | integer | Per content block; affected by `vl_high_resolution_images`. | Forwarded if embedded in content block. |
| `total_pixels` | integer | Per content block; video frame total pixel limit. | Forwarded if embedded in content block. |
| `fps` | float | Per `video_url` block. | Forwarded if embedded in content block. |

## Official Deep Thinking Model Support

Official Bailian docs categorize thinking behavior as:

| Category | Behavior |
| --- | --- |
| Mixed thinking | `enable_thinking=true` thinks before answering; `false` answers directly. |
| Thinking-only | Always thinks before answering; do not rely on `enable_thinking=false`. |

### Model families from official deep-thinking page

| Family | Official category / default |
| --- | --- |
| Qwen3.6 Max | Mixed thinking, default on: `qwen3.6-max-preview`. |
| Qwen3.6 Plus | Mixed thinking, default on: `qwen3.6-plus`, `qwen3.6-plus-2026-04-02`. |
| Qwen3.6 Flash | Mixed thinking, default on: `qwen3.6-flash`, `qwen3.6-flash-2026-04-16`. |
| Qwen3.5 Plus / Flash commercial | Mixed thinking, default on. |
| Qwen3 Max commercial | Mixed thinking, default off for listed Max variants. |
| Qwen3 Plus / Flash / Turbo commercial | Mixed thinking, default off for listed stable/latest/snapshot models. |
| Qwen3 open source | Mixed thinking, default on for listed non-thinking-suffix models. |
| Qwen3 thinking-suffix models | Thinking-only. |
| QwQ | Thinking-only: `qwq-plus`, `qwq-plus-latest`, `qwq-plus-2025-03-05`, `qwq-32b`. |
| DeepSeek on Bailian | `deepseek-v4-pro` and `deepseek-v4-flash`: mixed default on. `deepseek-v3.2`, `deepseek-v3.2-exp`, `deepseek-v3.1`: mixed default off. `deepseek-r1` and R1 variants/distills: thinking-only. |
| GLM | Mixed thinking, default on: `glm-5.1`, `glm-5`, `glm-4.7`, `glm-4.6`, `glm-4.5`, `glm-4.5-air`. |
| Kimi on Bailian | `kimi-k2.6`, `kimi-k2.5`: mixed default off. `kimi-k2-thinking`: thinking-only. |
| MiniMax | Thinking-only for listed MiniMax M2.x models. |

### Visual reasoning caveat

Official visual reasoning docs state:

- `qwen3.5-plus`, `qwen3-vl-plus`, `qwen3-vl-flash` can use `enable_thinking` to turn thinking on/off.
- `qwen3-vl-...-thinking` models only support thinking on.
- Other Qwen-VL models should not be assumed to support `enable_thinking`.
- `thinking_budget` can limit visual reasoning length for supported models.

## NexusFlow Implementation Gap

Current `/v1/chat/completions` forwards only:

- `temperature`
- `max_tokens`
- `top_p`
- `stop`
- `frequency_penalty`
- `presence_penalty`
- `tools`
- `tool_choice`
- `response_format`
- `stream_options`
- `enable_thinking`

It does not forward official Bailian extensions such as:

- `thinking_budget`
- `preserve_thinking`
- `top_k`
- `repetition_penalty`
- `seed`
- `logprobs`
- `top_logprobs`
- `parallel_tool_calls`
- `enable_search`
- `search_options`
- `enable_code_interpreter`
- `vl_high_resolution_images`
- `skill`
- `modalities`
- `audio`
- `n`

Some nested multimodal fields are forwarded implicitly because they live inside `messages[].content`, but they are not explicitly validated or documented by NexusFlow yet.

## Recommended NexusFlow Follow-Up

1. Add a first-class model capability table:
   - `supports_thinking`
   - `thinking_mode`: `mixed` / `always` / `none`
   - `thinking_default`
   - `supports_thinking_budget`
   - `supports_preserve_thinking`
   - `supports_search`
   - `supports_parallel_tools`
   - `supports_vision`, `supports_video_input`, `supports_audio_input`, `supports_audio_output`
2. Change docs to render parameters from this table rather than hand-written text.
3. Decide whether NexusFlow should expose Bailian-specific extension parameters. If yes, add explicit allowlist forwarding and tests.
4. Keep public docs separate from internal upstream docs: public docs must only show parameters actually passed through by NexusFlow.
