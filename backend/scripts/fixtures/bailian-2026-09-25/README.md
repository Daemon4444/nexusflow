# 百炼官方数据快照（2026-09-25）

bailian-catalog-sync 的离线测试数据。

| 文件 | 来源 | 获取方式 |
|---|---|---|
| `rate-limit.html.gz` | https://help.aliyun.com/zh/model-studio/rate-limit | 公开页面，curl 抓取 |
| `model-pricing.html.gz` | https://help.aliyun.com/zh/model-studio/model-pricing | 公开页面，curl 抓取 |
| `models.html.gz` | https://help.aliyun.com/zh/model-studio/models | 公开页面，curl 抓取 |
| `qwen-api-via-openai-chat-completions.html.gz` | https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions | 公开页面，curl 抓取 |
| `compatible-mode-models.json` | `GET https://dashscope.aliyuncs.com/compatible-mode/v1/models`（华北2） | 用生产密钥做的只读请求；文件里只有模型 ID 和上架时间 |
| `production-provider-capacity.json` | 生产库 `provider_capacity` 表 | 在 `BEGIN READ ONLY` 事务里导出，只含限流数值，不含任何密钥 |
| `production-model-overrides.json` | 生产库 `model_overrides` 表 | 同上 |

所有文件保持抓取时的原样，**不要手工修改**。解析器有问题时应修解析器，不能改测试数据来迁就解析器。
