# 百炼 DeepSeek V4 Flash 0731 接入记录（2026-08-01）

- NexusFlow 对外稳定模型 ID：`deepseek-v4-flash`
- 百炼实际上游模型 ID：`deepseek-v4-flash-0731`
- 输入价：¥1 / 百万 tokens
- 缓存命中输入价：¥0.2 / 百万 tokens
- 输出价：¥2 / 百万 tokens
- 上下文 / 最大输入：1M tokens
- 最大输出：393,216 tokens（产品文案显示为 384K）
- 限流：RPM 15,000；TPM 1,200,000
- 架构：MoE，总参 284B、激活 13B
- 能力：混合思考、函数调用、联网搜索、上下文缓存

## 接入约束

- 客户继续请求 `deepseek-v4-flash`，网关仅在上游请求阶段改写为 `deepseek-v4-flash-0731`。
- 响应中的 `model` 恢复为稳定 ID，避免快照 ID 泄露为新的公开产品。
- 未显式指定输出 token 上限时，余额预占仍按 16,384 tokens；显式指定时最高允许 393,216 tokens。
- 用量与计费仍归集到公开稳定 ID，价格按输入 1 / 缓存 0.2 / 输出 2 元每百万 tokens。
- 2026-08-01 实测 DashScope OpenAI Chat、混合思考、缓存参数及 Anthropic Messages 兼容端点成功。
- 2026-08-01 实测 DashScope Responses API 对稳定 ID 和 0731 快照均返回不支持；该限制不是本次别名升级引入。

## 来源

- 阿里云模型页：<https://help.aliyun.com/zh/model-studio/deepseek-v4-flash>
- 阿里云 DeepSeek API 文档：<https://help.aliyun.com/zh/model-studio/deepseek-api>
