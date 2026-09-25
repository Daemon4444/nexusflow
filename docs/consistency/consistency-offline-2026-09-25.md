# 控制面一致性检查（offline）

- 生成时间：2026-09-25T00:00:00.000Z
- 数据来源：fixtures backend/scripts/fixtures/bailian-2026-09-25

| 规则 | 数量 |
|---|---|
| `sellable_model_without_route` | 3 |
| `route_to_unknown_model` | 5 |
| `override_identical_to_static` | 1 |
| `provider_invalid_url_with_secret` | 0 |
| `capability_declaration_mismatch` | 2 |

> 跳过 `provider_invalid_url_with_secret`：offline mode has no providers table export

## `sellable_model_without_route`

| 对象 | 严重度 | 说明 | 有清理 SQL |
|---|---|---|---|
| `seedance-1.5-pro` | high | sold in the catalog but every route is disabled (volcengine-ark) | 否 |
| `seedance-1.0-pro` | high | sold in the catalog but every route is disabled (volcengine-ark) | 否 |
| `seedance-1.0-pro-fast` | high | sold in the catalog but every route is disabled (volcengine-ark) | 否 |

## `route_to_unknown_model`

| 对象 | 严重度 | 说明 | 有清理 SQL |
|---|---|---|---|
| `anthropic/claude-opus-4-7` | low | disabled route points at a model that is not in the catalog (already inert) | 否 |
| `dashscope/MiniMax-M2.7` | high | enabled route points at a model that is not in the catalog | 是 |
| `dashscope/qwen3-tts-flash-realtime` | high | enabled route points at a model that is not in the catalog | 是 |
| `himodels/claude-fable-5` | low | disabled route points at a model that is not in the catalog (already inert) | 否 |
| `himodels/claude-opus-4-7` | low | disabled route points at a model that is not in the catalog (already inert) | 否 |

## `override_identical_to_static`

| 对象 | 严重度 | 说明 | 有清理 SQL |
|---|---|---|---|
| `glm-5.2-fast-preview` | medium | model_overrides row equals the static entry in every pricing/limit/runtime field and differs only in display fields (supported); disabling it reverts the display to the static catalog | 是 |

## `capability_declaration_mismatch`

| 对象 | 严重度 | 说明 | 有清理 SQL |
|---|---|---|---|
| `deepseek-v4.1-flash` | medium | declares "联网搜索" but supports_search is false, so the related parameters are not honoured | 否 |
| `glm-5.2-fast-preview` | medium | declares "联网搜索" but supports_search is false, so the related parameters are not honoured | 否 |

