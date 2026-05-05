# Aliyun Bailian Model Reference Snapshot

Internal maintenance reference only. Do not import this file into backend runtime code and do not link it from public docs or UI.

Source: user-provided Aliyun Bailian model and pricing document pasted in the Codex thread on 2026-05-05.

Scope:
- Prices below use the China mainland deployment range unless explicitly marked otherwise.
- `promptPrice` and `completionPrice` in `backend/src/data/models.ts` should store the lowest/first-tier price for sorting and simple display.
- `tokenPricingTiers` should store input-token based tier pricing. Billing should use the tier selected by request input tokens.
- Media model `pricingTiers` should store per-image or per-second variants.
- Public-facing docs should show first-tier prices or fetch from `/api/models`; this file itself is not user-facing.

## Current Catalog Mapping

These are the models currently represented in the NexusFlow static catalog and the official Bailian pricing details to keep aligned.

### Qwen Commercial Text

| Model ID | Context | First-tier input | First-tier output | Tier pricing |
| --- | ---: | ---: | ---: | --- |
| `qwen3-max` | 262,144 | 2.5 | 10 | 0-32K: 2.5/10; 32K-128K: 4/16; 128K-256K: 7/28 |
| `qwen3.6-max-preview` | 262,144 | 9 | 54 | 0-128K: 9/54; 128K-256K: 15/90 |
| `qwen3.6-plus` | 1,000,000 | 2 | 12 | 0-256K: 2/12; 256K-1M: 8/48 |
| `qwen3.5-plus` | 1,000,000 | 0.8 | 4.8 | 0-128K: 0.8/4.8; 128K-256K: 2/12; 256K-1M: 4/24 |
| `qwen3.6-flash` | 1,000,000 | 1.2 | 7.2 | 0-256K: 1.2/7.2; 256K-1M: 4.8/28.8 |
| `qwen3.5-flash` | 1,000,000 | 0.2 | 2 | 0-128K: 0.2/2; 128K-256K: 0.8/8; 256K-1M: 1.2/12 |
| `qwen-plus` | 1,000,000 | 0.8 | 2 | non-thinking 0-128K: 0.8/2; 128K-256K: 2.4/20; 256K-1M: 4.8/48. Thinking output tiers differ in Bailian and should be added if NexusFlow exposes `enable_thinking` pricing separately. |
| `qwen-turbo` | 1,000,000 non-thinking, 131,072 thinking | 0.3 | 0.6 non-thinking, 3 thinking | Current catalog keeps simple first-tier non-thinking price. Add mode-specific pricing before exposing separate thinking billing. |
| `qwen-long` | 10,000,000 | 0.5 | 2 | Flat token price in provided doc. |

### Qwen Open Source / Reasoning

| Model ID | Context | Input | Output | Notes |
| --- | ---: | ---: | ---: | --- |
| `qwen3-235b-a22b` | 131,072 | 2 | 8 non-thinking, 20 thinking | Current catalog stores non-thinking output. Add mode-specific price before billing thinking separately. |
| `qwen3-32b` | 131,072 | 2 | 8 non-thinking, 20 thinking | Current catalog stores non-thinking output. |
| `qwen3-8b` | 131,072 | 0.5 | 2 non-thinking, 5 thinking | Current catalog stores non-thinking output. |
| `qwq-plus` | 131,072 | 1.6 | 4 | Flat token price. |
| `qwen-math-plus` | 4,096 | 4 | 12 | Flat token price. |

### Qwen Vision / Multimodal

| Model ID | Context | First-tier input | First-tier output | Tier pricing |
| --- | ---: | ---: | ---: | --- |
| `qwen-vl-max` | 131,072 | 1.6 | 4 | Legacy Qwen2.5-VL commercial stable price. |
| `qwen-vl-plus` | 131,072 | 0.8 | 2 | Legacy Qwen2.5-VL commercial stable price. |
| `qwen3-vl-plus` | 262,144 | 1 | 10 | 0-32K: 1/10; 32K-128K: 1.5/15; 128K-256K: 3/30 |
| `qwen3-vl-flash` | 262,144 | 0.15 | 1.5 | 0-32K: 0.15/1.5; 32K-128K: 0.3/3; 128K-256K: 0.6/6 |
| `qwen3-omni-flash` | 65,536 | 1.8 text input | 6.9 text output for text-only input | Multimodal pricing is modality-specific. Current simple catalog is only an approximation; add modality-aware billing before exposing precise Omni pricing. |

### Qwen Coder / Translation / Embedding

| Model ID | Context | First-tier input | First-tier output | Tier pricing |
| --- | ---: | ---: | ---: | --- |
| `qwen3-coder-plus` | 1,000,000 | 4 | 16 | 0-32K: 4/16; 32K-128K: 6/24; 128K-256K: 10/40; 256K-1M: 20/200 |
| `qwen3-coder-flash` | 1,000,000 | 1 | 4 | 0-32K: 1/4; 32K-128K: 1.5/6; 128K-256K: 2.5/10; 256K-1M: 5/25 |
| `qwen-mt-plus` | 16,384 | 1.8 | 5.4 | Flat token price. |
| `text-embedding-v4` | 8,192 per item | 0.5 | 0 | Embedding input-only. |
| `text-embedding-v3` | 8,192 per item | 0.5 | 0 | Embedding input-only. |

### GLM

| Model ID | Context | First-tier input | First-tier output | Tier pricing |
| --- | ---: | ---: | ---: | --- |
| `glm-4.7` | 131,072 | 3 | 14 | 0-32K: 3/14; 32K-128K: 4/16 |
| `glm-5` | 131,072 | 4 | 18 | 0-32K: 4/18; 32K-198K: 6/22 |
| `glm-5.1` | 131,072 | 6 | 24 | 0-32K: 6/24; 32K-198K: 8/28 |

### Third-party Text Models

| Model ID | Context | Input | Output | Notes |
| --- | ---: | ---: | ---: | --- |
| `deepseek-v4-flash` | 1,000,000 | 1 | 2 | From current NexusFlow catalog; verify against latest Bailian page before changing. |
| `deepseek-v4-pro` | 1,000,000 | 12 | 24 | From current NexusFlow catalog; verify before changing. |
| `deepseek-v3.2` | 131,072 | 2 | 3 | From current NexusFlow catalog; verify before changing. |
| `deepseek-r1` | 65,536 | 4 | 16 | From current NexusFlow catalog; verify before changing. |
| `deepseek-v3` | 65,536 | 2 | 8 | From current NexusFlow catalog; verify before changing. |
| `kimi-k2.5` | 131,072 | 4 | 21 | From current NexusFlow catalog; verify before changing. |
| `kimi-k2.6` | 262,144 | 6.5 | 27 | From current NexusFlow catalog; verify before changing. |
| `MiniMax-M2.1` | 131,072 | 2.1 | 8.4 | From current NexusFlow catalog; verify before changing. |
| `MiniMax-M2.5` | 131,072 | 2.1 | 8.4 | From current NexusFlow catalog; verify before changing. |

### Image Generation / Editing

| Model ID | Pricing type | Mainland pricing | International pricing | Notes |
| --- | --- | ---: | ---: | --- |
| `wan2.6-t2i` | per image | 0.20/image | 0.220177/image | Wan text-to-image V2. |
| `wan2.5-t2i-preview` | per image | 0.20/image | 0.220177/image | Candidate to add. |
| `wan2.2-t2i-plus` | per image | 0.20/image | 0.366962/image | Candidate to add. |
| `wan2.2-t2i-flash` | per image | 0.14/image | 0.183481/image | Candidate to add. |
| `wanx2.1-t2i-plus` | per image | 0.20/image | N/A | Candidate to add. |
| `wanx2.1-t2i-turbo` | per image | 0.14/image | N/A | Candidate to add. |
| `wan2.7-image-pro` | per image | 0.50/image | 0.562065/image | Candidate image generation/editing. |
| `wan2.7-image` | per image | 0.20/image | 0.220177/image | Candidate image generation/editing. |
| `wan2.6-image` | per image | 0.20/image | 0.220177/image | Candidate image generation/editing. |
| `wan2.5-i2i-preview` | per image | 0.20/image | 0.220177/image | Candidate image edit. |
| `z-image-turbo` | per image | prompt_extend=false 0.10; true 0.20 | false 0.110089; true 0.220177 | Candidate to add. |

### Video Generation / Editing

| Model ID | Pricing type | Mainland pricing | International pricing | Notes |
| --- | --- | ---: | ---: | --- |
| `wan2.7-t2v` | per output second | 720P 0.6/s; 1080P 1/s | 720P 0.733924/s; 1080P 1.100886/s | Candidate to add. |
| `wan2.7-t2v-2026-04-25` | per output second | 720P 0.6/s; 1080P 1/s | 720P 0.733924/s; 1080P 1.100886/s | Candidate snapshot. |
| `wan2.6-t2v` | per output second | 720P 0.6/s; 1080P 1/s | 720P 0.733924/s; 1080P 1.100886/s | Already in catalog. |
| `wan2.6-i2v` | per output second | 720P 0.6/s; 1080P 1/s | 720P 0.733924/s; 1080P 1.100886/s | Already in catalog. |
| `wan2.6-i2v-flash` | per output second | audio: 720P 0.3/s, 1080P 0.5/s; no audio: 720P 0.15/s, 1080P 0.25/s | audio: 720P 0.366962/s, 1080P 0.550443/s; no audio: 720P 0.183481/s, 1080P 0.275221/s | Already in catalog. |
| `wan2.7-i2v` | per output second | 720P 0.6/s; 1080P 1/s | 720P 0.733924/s; 1080P 1.100886/s | Candidate to add. |
| `wan2.7-r2v` | input + output seconds | 720P 0.6/s; 1080P 1/s | 720P 0.733924/s; 1080P 1.100886/s | Candidate to add; input video billing capped by upstream rules. |
| `wan2.6-r2v` | input + output seconds | 720P 0.6/s; 1080P 1/s | 720P 0.733924/s; 1080P 1.100886/s | Already in catalog. |
| `wan2.6-r2v-flash` | input + output seconds | audio: 720P 0.3/s, 1080P 0.5/s; no audio: 720P 0.15/s, 1080P 0.25/s | audio: 720P 0.366962/s, 1080P 0.550443/s; no audio: 720P 0.183481/s, 1080P 0.275221/s | Already in catalog. |
| `wan2.7-videoedit` | input + output seconds | 720P 0.6/s; 1080P 1/s | 720P 0.733924/s; 1080P 1.100886/s | Candidate to add. |
| `happyhorse-1.0-t2v` | output seconds | 720P 0.9/s; 1080P 1.6/s | 720P 1.049188/s; 1080P 1.798608/s | Already in catalog. |
| `happyhorse-1.0-i2v` | output seconds | 720P 0.9/s; 1080P 1.6/s | 720P 1.049188/s; 1080P 1.798608/s | Already in catalog. |
| `happyhorse-1.0-r2v` | output seconds | 720P 0.9/s; 1080P 1.6/s | 720P 1.049188/s; 1080P 1.798608/s | Already in catalog. |
| `happyhorse-1.0-video-edit` | input + output seconds | 720P 0.9/s; 1080P 1.6/s | 720P 1.049188/s; 1080P 1.798608/s | Already in catalog. |

### PixVerse / Kling / Vidu Candidates

These are only China mainland in the pasted doc unless otherwise noted.

| Provider | Model family | Notes |
| --- | --- | --- |
| PixVerse | `pixverse/pixverse-c1-t2v`, `pixverse/pixverse-v6-t2v`, `pixverse/pixverse-v5.6-t2v` | Text-to-video, audio and no-audio prices vary by 360P/540P/720P/1080P. |
| PixVerse | `pixverse/pixverse-c1-it2v`, `pixverse/pixverse-v6-it2v`, `pixverse/pixverse-v5.6-it2v` | First-frame image-to-video. |
| PixVerse | `pixverse/pixverse-c1-kf2v`, `pixverse/pixverse-v6-kf2v`, `pixverse/pixverse-v5.6-kf2v` | First/last-frame image-to-video. |
| PixVerse | `pixverse/pixverse-c1-r2v`, `pixverse/pixverse-v5.6-r2v` | Reference-to-video. |
| Kling | `kling/kling-v3-omni-video-generation`, `kling/kling-v3-video-generation` | Video generation. No free quota in mainland. |
| Kling | `kling/kling-v3-image-generation`, `kling/kling-v3-omni-image-generation` | Image generation. |
| Vidu | `vidu/viduq3-turbo_text2video`, `vidu/viduq3-pro_text2video`, `vidu/viduq2_text2video` | Text-to-video. |
| Vidu | `vidu/viduq3-pro_img2video`, `vidu/viduq3-turbo_img2video`, `vidu/viduq2-pro_img2video`, `vidu/viduq2-turbo_img2video`, `vidu/viduq2-pro-fast_img2video` | Image-to-video. |
| Vidu | `vidu/viduq3-pro_start-end2video`, `vidu/viduq3-turbo_start-end2video`, `vidu/viduq2-pro_start-end2video`, `vidu/viduq2-turbo_start-end2video` | Keyframe-to-video. |
| Vidu | `vidu/viduq3-mix_reference2video`, `vidu/viduq3_reference2video`, `vidu/viduq3-turbo_reference2video`, `vidu/viduq2-pro_reference2video`, `vidu/viduq2_reference2video` | Reference-to-video. |

## Additional Bailian Model Families To Add Later

Use this checklist when expanding the catalog. Verify live API availability before exposing to users.

### Qwen Commercial

- `qwen-max`, `qwen-max-latest`, `qwen-max-2025-01-25`, `qwen-max-2024-09-19`
- `qwen3.6-plus-2026-04-02`, `qwen3.5-plus-2026-04-20`, `qwen3.5-plus-2026-02-15`
- `qwen-plus-latest`, `qwen-plus-2025-12-01`, `qwen-plus-2025-09-11`, `qwen-plus-2025-07-28`
- `qwen3.6-flash-2026-04-16`, `qwen3.5-flash-2026-02-23`, `qwen-flash`, `qwen-flash-2025-07-28`
- `qwen-plus-us`, `qwen-flash-us` for US deployment-specific catalog entries if NexusFlow exposes US-only routing.

### Qwen Open Source

- Qwen3.6 open: `qwen3.6-35b-a3b`, `qwen3.6-27b`
- Qwen3.5 open: `qwen3.5-397b-a17b`, `qwen3.5-122b-a10b`, `qwen3.5-27b`, `qwen3.5-35b-a3b`
- Qwen3 open: `qwen3-next-80b-a3b-thinking`, `qwen3-next-80b-a3b-instruct`, `qwen3-235b-a22b-thinking-2507`, `qwen3-235b-a22b-instruct-2507`, `qwen3-30b-a3b-thinking-2507`, `qwen3-30b-a3b-instruct-2507`, `qwen3-14b`, `qwen3-4b`, `qwen3-1.7b`, `qwen3-0.6b`
- Qwen2.5: `qwen2.5-14b-instruct-1m`, `qwen2.5-7b-instruct-1m`, `qwen2.5-72b-instruct`, `qwen2.5-32b-instruct`, `qwen2.5-14b-instruct`, `qwen2.5-7b-instruct`, `qwen2.5-3b-instruct`
- QwQ open: `qwq-32b`, `qwq-32b-preview`

### Qwen Vision / Audio / Omni

- Vision commercial: `qwen3-vl-plus`, `qwen3-vl-flash`, `qwen-vl-max`, `qwen-vl-plus`, `qwen-vl-ocr`
- Vision open: `qwen3-vl-235b-a22b-thinking`, `qwen3-vl-235b-a22b-instruct`, `qwen3-vl-32b-thinking`, `qwen3-vl-32b-instruct`, `qwen3-vl-30b-a3b-thinking`, `qwen3-vl-30b-a3b-instruct`, `qwen3-vl-8b-thinking`, `qwen3-vl-8b-instruct`, `qwen2.5-vl-72b-instruct`, `qwen2.5-vl-32b-instruct`, `qwen2.5-vl-7b-instruct`, `qwen2.5-vl-3b-instruct`
- Omni: `qwen3.5-omni-plus`, `qwen3.5-omni-flash`, `qwen3-omni-flash`, `qwen-omni-turbo`, `qwen2.5-omni-7b`
- Realtime Omni: `qwen3.5-omni-plus-realtime`, `qwen3.5-omni-flash-realtime`, `qwen3-omni-flash-realtime`, `qwen-omni-turbo-realtime`
- Audio understanding: `qwen-audio-turbo`, `qwen-audio-turbo-latest`

### Speech / Translation

- TTS: `qwen3-tts-instruct-flash`, `qwen3-tts-vd-2026-01-26`, `qwen3-tts-vc-2026-01-22`, `qwen3-tts-flash`, `qwen-tts`, `qwen-tts-realtime`, `cosyvoice-v3.5-plus`, `cosyvoice-v3.5-flash`, `cosyvoice-v3-plus`, `cosyvoice-v3-flash`, `cosyvoice-v2`, `cosyvoice-v1`
- Voice tools: `qwen-voice-enrollment`, `qwen-voice-design`
- ASR: `qwen3-asr-flash-filetrans`, `qwen3-asr-flash`, `qwen3-asr-flash-realtime`, `fun-asr`, `fun-asr-mtl`, `fun-asr-realtime`, `fun-asr-flash-8k-realtime`, `paraformer-v2`, `paraformer-8k-v2`, `paraformer-realtime-v2`, `sensevoice-v1`
- Live translation: `qwen3-livetranslate-flash`, `qwen3-livetranslate-flash-realtime`

### Embedding / Rerank / Industry

- Embedding: `text-embedding-v4`, `text-embedding-v3`, `text-embedding-v2`, `text-embedding-v1`, `text-embedding-async-v2`, `text-embedding-async-v1`
- Multimodal embedding: `qwen3-vl-embedding`, `qwen2.5-vl-embedding`, `tongyi-embedding-vision-plus-2026-03-06`, `tongyi-embedding-vision-flash-2026-03-06`, `tongyi-embedding-vision-plus`, `tongyi-embedding-vision-flash`, `multimodal-embedding-v1`
- Rerank: `qwen3-vl-rerank`, `qwen3-rerank`, `gte-rerank-v2`
- Industry/specialized: `farui-plus`, `tongyi-intent-detect-v3`, `qwen-plus-character`, `qwen-flash-character`, `gui-plus`, `qwen-doc-turbo`, `qwen-deep-research`, `tongyi-xiaomi-analysis-flash`, `tongyi-xiaomi-analysis-pro`

## Maintenance Workflow

1. Add or update models in `backend/src/data/models.ts`.
2. For token models with input-token tiers, add `tokenPricingTiers`.
3. Keep `promptPrice` / `completionPrice` equal to the first tier.
4. For media models, add `pricingType` and `pricingTiers`.
5. Add provider routing in `backend/src/services/providers.ts` if needed.
6. Confirm adapters support the model family.
7. Run:

```bash
npm run build:backend
npm run build:frontend
git diff --check
```

8. Do not expose this file through frontend docs or navigation.
