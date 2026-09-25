# 控制面回填报告（2026-09-25）

来源：fixtures backend/scripts/fixtures/bailian-2026-09-25。本报告由 `src/cli/control-plane-backfill.ts` 生成，只读旧表，不写任何数据。

## 概要

- 模型 94、上游账号 8、额度池 81、路由 100、流量策略 1
- 内容 SHA-256：`bbea77b573affae8759318ec67e5526fd30aba5af42913bffaa9ef61bb8c0518`
- 额度池来源：docs 74、legacy_default 7、共享 1
- 由 ensureRoutingDefaults 补出的路由：0
- 跳过的孤儿路由：5
- 兼容桥接（非原生协议）模型：MiniMax/MiniMax-M3（anthropic.messages）、MiniMax/MiniMax-M2.7（anthropic.messages）

## 校验

- 错误 3，警告 39

- ❌ `model_has_active_route` seedance-1.0-pro：active model has no active route on an active account
- ❌ `model_has_active_route` seedance-1.0-pro-fast：active model has no active route on an active account
- ❌ `model_has_active_route` seedance-1.5-pro：active model has no active route on an active account
- ⚠️ `display_capabilities`：32 条
- ⚠️ `quota_unverified`：7 条

## 影子比对（旧逻辑 vs 回填版本）

零差异：模型目录、价格和启用路由完全一致（已跳过的孤儿路由除外）。

## 能力宣告 vs 结构化能力（展示串将由结构化能力生成）

结构化能力由 `model-capabilities.ts` 的现有推导生成；下列模型的展示串与之不一致（对应 P1a 规则 5），发布前需人工确认以哪边为准。

- deepseek-v4.1-flash：shows “联网搜索” but capabilities say no
- glm-4.7：capabilities say “思考模式” but it is not shown; capabilities say “上下文缓存” but it is not shown
- glm-5：capabilities say “上下文缓存” but it is not shown
- glm-5.2-fast-preview：shows “联网搜索” but capabilities say no
- gpt-6-astra：capabilities say “上下文缓存” but it is not shown
- kimi-k2-thinking：capabilities say “上下文缓存” but it is not shown
- kimi-k2.5：capabilities say “思考模式” but it is not shown; capabilities say “上下文缓存” but it is not shown
- kimi-k2.6：capabilities say “思考模式” but it is not shown; capabilities say “上下文缓存” but it is not shown
- kimi-k2.7-code：capabilities say “上下文缓存” but it is not shown
- kimi/kimi-k2.7-code-highspeed：capabilities say “上下文缓存” but it is not shown
- MiniMax-M2.1：capabilities say “上下文缓存” but it is not shown
- MiniMax-M2.5：capabilities say “上下文缓存” but it is not shown
- MiniMax/MiniMax-M2.7：capabilities say “上下文缓存” but it is not shown
- qwen-flash：capabilities say “联网搜索” but it is not shown; capabilities say “上下文缓存” but it is not shown
- qwen-plus：capabilities say “思考模式” but it is not shown; capabilities say “联网搜索” but it is not shown; capabilities say “上下文缓存” but it is not shown
- qwen-turbo：capabilities say “联网搜索” but it is not shown; capabilities say “上下文缓存” but it is not shown
- qwen-vl-max：capabilities say “上下文缓存” but it is not shown
- qwen-vl-plus：capabilities say “上下文缓存” but it is not shown
- qwen3-32b：capabilities say “思考模式” but it is not shown
- qwen3-8b：capabilities say “思考模式” but it is not shown
- qwen3-coder-flash：capabilities say “上下文缓存” but it is not shown
- qwen3-coder-plus：capabilities say “上下文缓存” but it is not shown
- qwen3-max：capabilities say “联网搜索” but it is not shown; capabilities say “上下文缓存” but it is not shown
- qwen3-vl-flash：capabilities say “上下文缓存” but it is not shown
- qwen3-vl-plus：capabilities say “上下文缓存” but it is not shown
- qwen3.5-flash：capabilities say “联网搜索” but it is not shown; capabilities say “上下文缓存” but it is not shown
- qwen3.5-plus：capabilities say “联网搜索” but it is not shown; capabilities say “上下文缓存” but it is not shown
- qwen3.6-flash：capabilities say “联网搜索” but it is not shown; capabilities say “上下文缓存” but it is not shown
- qwen3.6-max-preview：capabilities say “联网搜索” but it is not shown; capabilities say “上下文缓存” but it is not shown
- qwen3.6-plus：capabilities say “联网搜索” but it is not shown; capabilities say “上下文缓存” but it is not shown
- qwen3.7-max：capabilities say “上下文缓存” but it is not shown
- qwen3.7-plus：capabilities say “上下文缓存” but it is not shown

## 跳过的孤儿路由

- anthropic / claude-opus-4-7：model is not in the catalog (P1a route_to_unknown_model)
- dashscope / MiniMax-M2.7：model is not in the catalog (P1a route_to_unknown_model)
- dashscope / qwen3-tts-flash-realtime：model is not in the catalog (P1a route_to_unknown_model)
- himodels / claude-fable-5：model is not in the catalog (P1a route_to_unknown_model)
- himodels / claude-opus-4-7：model is not in the catalog (P1a route_to_unknown_model)
