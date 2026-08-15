# 百炼 DeepSeek V4 Flash 稳定版对齐（2026-08-15）

- NexusFlow 对外模型 ID：`deepseek-v4-flash`
- 百炼上游模型 ID：`deepseek-v4-flash`
- 输入价：¥1 / 百万 tokens
- 缓存命中输入价：¥0.2 / 百万 tokens
- 输出价：¥2 / 百万 tokens
- 上下文 / 最大输入：1M tokens
- 最大输出：393,216 tokens（产品文案显示为 384K）
- 限流：RPM 15,000；TPM 1,200,000
- 能力：混合思考、函数调用、联网搜索、隐式上下文缓存

## 版本策略

- 百炼当前同时公开稳定 ID `deepseek-v4-flash` 和历史快照 `deepseek-v4-flash-0731`。
- NexusFlow 取消将稳定 ID 强制改写到 0731 快照，改为直接调用百炼当前稳定版，以便跟随官方稳定版本更新。
- 2026-08-15 实测百炼模型列表包含两个 ID；直接调用稳定 ID 的 OpenAI Chat 兼容端点返回 HTTP 200，响应模型为 `deepseek-v4-flash`。
- 当前未发现百炼公开 `deepseek-v4-flash-0813`，因此不虚构对应快照产品。

## 来源

- 阿里云模型页：<https://help.aliyun.com/zh/model-studio/deepseek-v4-flash>
- 阿里云 DeepSeek API 文档：<https://help.aliyun.com/zh/model-studio/deepseek-api>
