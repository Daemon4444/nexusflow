# 控制面 contract 清单（enforce 稳定后才能删除的内容）

本清单列出配置化控制面（`docs/control-plane-config-design.md`、`docs/specs/control-plane-implementation-spec.md`）
全部开关切到 enforce 并稳定运行后，才允许删除的旧代码、旧表和旧路径。**每一项都必须满足它自己的前置条件，
且以单独的 PR 执行**。表只能在 contract 迁移里删除，编号接在当时最新的 migration 之后；`024`/`025` 保留给并行分支，永远不用。

通用前置条件（每一项都要满足）：

- [ ] 对应开关在生产 `enforce` 持续 ≥ 14 天，期间没有回滚到 legacy/shadow；
- [ ] 该开关的 shadow 计数（`nf:shadow:<area>:<yyyymmdd>`）在切 enforce 前连续 7 天为 0，或每条差异都已书面解释；
- [ ] 回滚手段已演练过一次（发布旧版本 = 新版本回滚，见 PR 上线手册）；
- [ ] 最近一次每日 YAML 快照（`/var/lib/nexusflow/cp-snapshots`）与当前版本一致；
- [ ] 最近一次加密备份新鲜（`scripts/check-backup-freshness.sh` 通过）。

## 1. 代码

| 项目 | 位置 | 依赖的开关 | 额外前置条件 |
|---|---|---|---|
| `ensureRoutingDefaults` 的 if/else 路由种子 | `backend/src/services/providers.ts`（`ensureRoutingDefaults`、`legacyRoutedProviderId`、`legacyDefaultCapacity`） | `NF_CP_MODE=enforce` | 启动时不再调用；新环境靠控制面回填/变更单建路由；`test:managed-routing` 改为基于 cp 数据 |
| 按 URL 判断协议 | `backend/src/pipeline/adapters.ts` 的 `legacyAdapterFromBaseUrl` 及 `adapter_mapping_mismatch` 日志 | `NF_CP_MODE=enforce` | SLS 中 `adapter_mapping_mismatch` 连续 14 天为 0；`provider_channel_configs.adapter` 全部有值 |
| 协议转换桥 | `backend/src/services/anthropic-openai-bridge.ts`、`routes/messages.ts` 的非 pass-through 分支 | `NF_PROTOCOL_MODE=enforce` | 已通知 MiniMax-M3 的 2 个用户并过了通知期；`/v1/messages` 上 `unsupported_protocol` 的 400 连续 14 天没有来自原桥接用户 |
| `anthropicPassThrough` 覆盖 | `data/models.ts` 字段、`model_overrides` 文档字段、`cp_models.legacy_flags` | `NF_PROTOCOL_MODE=enforce` | 协议完全由 cp `protocols` + 路由 `native_protocols` 决定 |
| 关键词推导能力 | `backend/src/utils/model-capabilities.ts`（`getModelCapabilities` 的关键词/前缀推导、`getAllowedChatParameters`） | `NF_CP_MODE=enforce` + `NF_PARAM_MODE=enforce` | 回填报告里 32 个“展示串与结构化能力不一致”的模型已逐一定稿；`/v1/models` 的 `capability_flags` 兼容字段已公告下线 |
| 旧参数白名单 | `backend/src/utils/chat-request.ts` 的允许列表循环 | `NF_PARAM_MODE=enforce` | `analyze-dropped-params.mjs` 报告中的客户均已通知 |
| 上游模型别名表 | `backend/src/utils/upstream-model-aliases.ts` | `NF_CP_MODE=enforce` | 所有调用点改用 `ResolvedUpstream.upstreamModelId`（cp `routes.upstream_model_id`）；`grep getUpstreamModelId` 仅剩测试 |
| 协议表 | `backend/src/utils/model-protocols.ts`（`getSupportedProtocols`、`RESPONSES_API_MODELS`） | `NF_PROTOCOL_MODE=enforce` | `/v1/models` 只输出 cp `protocols` |
| 静态价格/目录作为运行时来源 | `backend/src/data/models.ts` 的 `models` 运行时数组（保留为回填种子/测试夹具） | `NF_CP_MODE=enforce` | 计费、目录、后台全部读 cp；`refreshModels` 的 overrides 分支删除 |
| 流量旧限流 | `services/rate-limiter.ts` 的 `reserveProviderCapacityAsync`（托管路由部分）与 `provider-capacity:v2:*` 键 | `NF_TRAFFIC_MODE=enforce` | 所有托管路由都有 cp 路由；Redis 旧键 TTL 过期 |
| 熔断环境变量 | `PROVIDER_HEALTH_DOWN_THRESHOLD`、`PROVIDER_HEALTH_DOWN_COOLDOWN_MS` | `NF_TRAFFIC_MODE=enforce` | 策略 `circuit` 已按生产值配置；环境变量兜底可保留到下一次大版本 |
| 用户默认限额常量 | `backend/src/data/ratelimits.ts` 的 `DEFAULT_QPM`/`DEFAULT_TPM` | `NF_TRAFFIC_MODE=enforce` | 全局策略 `user_default` = 30000/5M（生产实际值）已发布 |

## 2. 表

| 表 | 替代 | 前置条件 |
|---|---|---|
| `model_overrides` | `cp_models` + 变更单 | `NF_CP_MODE=enforce` ≥ 14 天；后台“模型目录”编辑入口已改为生成变更单；最后一次导出存档 |
| `provider_models` | `cp_models` + `cp_routes` | 确认没有读路径（`grep provider_models`）；最后一次导出存档 |
| `provider_capacity` | `cp_routes` + `cp_quota_pools` | `NF_CP_MODE=enforce` 且 `NF_TRAFFIC_MODE=enforce` ≥ 14 天；`getManagedRouteCount`/`loadLegacyRouteRows` 已删除；两个 CLI 的旧路径已删除（见 §3） |

表删除只能 DROP，不能改名复用；先停写（代码不再写入）至少一个发布周期，再 DROP。

## 3. CLI 旧路径

| 项目 | 位置 | 前置条件 |
|---|---|---|
| `himodels-control` 直接写 `providers.status` / `provider_capacity` | `backend/src/cli/himodels-control.ts`（`controlPlaneManaged()` 为假时的分支） | `NF_CP_MODE` 不再可能回到 legacy；凭据写入保留（`providers` 仍是密钥存储） |
| `azure-astra-control` 直接写容量与状态 | `backend/src/cli/azure-astra-control.ts`（同上） | 同上 |
| 迁移 027/028 的一次性路由修正思路 | `027_disable_legacy_anthropic_claude_routes.sql`、`028_reset_himodels_for_aws_aliases.sql` | 仅记录：已应用的迁移永远不改不删；今后同类修正一律走变更单 |

## 4. 不在本清单内（保留）

- `providers` 表：继续作为上游凭据的加密存储（`cp_upstream_accounts.secret_ref = legacy_provider:<id>`），直到有独立的密钥管理方案；
- `provider_channel_configs`：多区域渠道选择仍在账号内部完成，拆分为独立账号前保留；
- 旧 `usePassThrough` 判断在 `NF_PROTOCOL_MODE=legacy` 下的行为：清单第 1 节第 3 项完成前保留。
