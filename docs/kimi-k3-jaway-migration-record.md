# Kimi K3 Jaway 上游迁移记录

日期：2026-08-09

## 对外契约

- 唯一公开模型 ID：`kimi-k3`
- 移除旧公开 ID：`kimi/kimi-k3`
- 支持 `POST /v1/chat/completions`（OpenAI Chat Completions）
- 支持 `POST /v1/messages`（Anthropic Messages）
- 两套协议均支持 SSE 流式响应
- Anthropic usage 原样保留 `cache_read_input_tokens`

## 上游契约

- Provider ID：`jawayid-k3`
- API Base：`https://jawayid.com:3000/v1`
- 上游模型 ID：`kimi-k3`
- Provider 密钥只以应用密文存入生产数据库，不进入 Git、文档或发布制品

## 安全与路由

- `PROVIDER_OUTBOUND_HOST_ALLOWLIST` 必须包含 `jawayid.com`
- `PROVIDER_OUTBOUND_ENDPOINT_ALLOWLIST` 必须包含 `jawayid.com:3000`
- 非标准端口只按精确 `hostname:port` 放行，主机白名单仍需同时命中
- `anthropicPassThrough: true` 显式启用自定义 Provider 的原生 `/messages` 直通
- `ensureRoutingDefaults` 对 `kimi-k3` 失败关闭；生产未预置 `jawayid-k3` 时不得回退或重新种到 DashScope

## 上游验收结果

- `/v1/models` 返回 `kimi-k3`
- OpenAI 非流式与流式请求成功；流式响应包含多个时间分散的数据块及最终 usage
- Anthropic 非流式与流式请求成功；较长响应确认首块到末块分时到达
- Anthropic 最终 usage 返回非零 `cache_read_input_tokens`
- OpenAI usage 返回缓存命中 token
