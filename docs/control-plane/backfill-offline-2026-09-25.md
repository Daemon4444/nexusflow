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

- 错误 3，警告 7

- ❌ `model_has_active_route` seedance-1.0-pro：active model has no active route on an active account
- ❌ `model_has_active_route` seedance-1.0-pro-fast：active model has no active route on an active account
- ❌ `model_has_active_route` seedance-1.5-pro：active model has no active route on an active account
- ⚠️ `quota_unverified`：7 条

## 影子比对（旧逻辑 vs 回填版本）

零差异：模型目录、价格和启用路由完全一致（已跳过的孤儿路由除外）。

## 跳过的孤儿路由

- anthropic / claude-opus-4-7：model is not in the catalog (P1a route_to_unknown_model)
- dashscope / MiniMax-M2.7：model is not in the catalog (P1a route_to_unknown_model)
- dashscope / qwen3-tts-flash-realtime：model is not in the catalog (P1a route_to_unknown_model)
- himodels / claude-fable-5：model is not in the catalog (P1a route_to_unknown_model)
- himodels / claude-opus-4-7：model is not in the catalog (P1a route_to_unknown_model)
