# NexusFlow Agent 项目长期记忆

> 读者：Qoder、Codex、Claude Code 和后续代码 Agent。
> 目的：让 Agent 在修改、排障或发布前理解真实业务和生产边界，不依赖历史聊天。
> 本文是长期记忆和导航，不是实时运行状态。实时事实必须通过代码、数据库、云 API 和生产探针复核。

## 1. 项目是什么

NexusFlow 是 AI 模型聚合、多协议兼容、Provider 路由和统一计费平台，不是一个简单的 API 转发脚本。

对外提供 OpenAI Chat Completions、Anthropic Messages、OpenAI Responses、Embeddings、Images、Videos、Audio 和异步 Tasks；对内还有用户控制台、Playground、API Key、主/子账号、充值与账本、客户折扣、限流、Provider 运营和管理后台。

产品核心价值有三层：

1. 用一套稳定 API 屏蔽不同模型和上游协议差异；
2. 在客户 SLA、模型能力和合规边界内选择合适 Provider；
3. 对每笔请求做可追溯、可对账、不可穿透的计费。

## 2. 事实优先级

遇到矛盾时按以下顺序判断：

```text
生产直连探针 / 数据库 / 实际运行配置
  > 当前代码、migrations 和 Git SHA
  > WIKI.md
  > 本文与专项 runbook
  > 审计快照、Obsidian/Claude/Qoder 历史记忆和对话
```

不得根据旧对话宣称当前已上线、无流量、无故障、模型可用或价格正确。

## 3. 当前业务边界

当前代码整体是“模块化单体”，不要把尚未拆分的模块误说成已独立微服务：

- **Customer Experience**：登录、控制台、模型目录、API Key、用量、账单、折扣、主/子账号、工单。
- **Synchronous Runtime**：`/v1/chat/completions`、`/v1/messages`、`/v1/responses`、embeddings 和 audio 等同步协议。这些属于同一实时请求域，不应机械拆成多个微服务。
- **Provider Router**：目前是 Backend 内部核心模块；未来规模增大后才独立。
- **Billing Ledger**：目前是 Backend 内部模块，PostgreSQL 是资金权威；它对一致性最敏感，最后考虑拆分。
- **Async Media**：图片、视频、语音和任务轮询。这是最适合第一个拆成 Worker 的业务域。
- **Admin Control Plane**：客户、模型、Provider、价本、路由政策、折扣、限流、告警和审计；初期仍与 Backend 同部署。
- **Demo Admin**：只读演示后台，必须只返回合成数据，不是真实管理员权限的子集。

ACK 第一阶段的 Gateway、Web、API 是部署单元，不等于业务微服务已拆分。

## 4. 真实生产拓扑：双节点是硬约束

```text
Internet
  → 阿里云 ALB
      → 应用节点 A：nginx → Next.js + Express/PM2 cluster
      → 应用节点 B：nginx → Next.js + Express/PM2 cluster
  两节点共享托管 PostgreSQL 16 和 Redis 5.0 双副本
```

编排主机使用 SSH 别名 `nexus`，生产仓库为 `/root/distiny/nexusflow`。登录这台机器只代表获得发布编排入口，不代表生产只有一台。副节点的实时地址和根目录以 `scripts/deploy-all-production.sh` 的已验证配置为准，不在新脚本中再写一份。

### 生产变更的完成定义

只有以下条件全部成立，才能说“发布完成”：

1. 本地、GitHub main 和生产的 SHA 关系清楚，生产工作区无未解释漂移；
2. 同一 SHA 只 build 一次，同一不可变制品分发到两个节点；
3. 两节点按顺序摘流、排空、切换和直连验证，不同时离流；
4. 两边 backend SHA、frontend build ID、PM2 进程、健康状态和运行配置契约一致；
5. ALB 恢复 balanced，公网 health/version 和真实客户路径通过；
6. 回滚基线唯一且可验证，没有留下两个不同版本轮流承载流量。

严禁直接把 `scripts/deploy-production.sh` 当作完整发布命令。它是统一编排脚本调用的单节点原语。所有生产发布先运行 `scripts/deploy-all-production.sh --dry-run`，再在明确授权和发布窗口内执行正式发布。

## 5. 同步请求与计费链路

```text
API Key / 身份验证
  → 主/子账号状态与模型权限
  → 客户 QPM/TPM + Provider 容量
  → 根据最大可能成本原子预占资金
  → Provider/地区/协议选路
  → 上游流式或非流式请求
  → 解析真实 usage/缓存 token，必要时对已输出的断流做标记估算
  → 原子结算或释放预占
  → transactions + usage_logs + SLS
  → 归还 TPM 预占与 Provider 并发租约
```

金钱规则不得简化：

- 钱只属于主账号；子账号是消费 actor，不单独持有余额。
- 主账号可用资金 = 余额 + 信控，结算时先扣余额、再扣信控。
- 收费请求必须使用数据库行锁下的预占/结算/释放，禁止退回“先查余额再扣款”。
- 价格不只有输入/输出；还可能有缓存读、缓存写、音频、视频秒数、输入长度分层和客户折扣。
- 上游采购价有折扣时用可追溯折扣；没有折扣资料时用对应官方原价；未知不得写成 0。
- 下游客户价、上游采购价和路由成本是三个概念，不能混用。
- 账本是资金权威；`usage_logs` 用于用量与统计，SLS 用于运营遥测，不能反向代替账本。

涉及价格、折扣、预占、流式 usage、失败退款、支付和子账号的改动属于最高风险级别，必须真实 PostgreSQL 并发验证、手算对账和失败路径测试。

## 6. Provider Router 的当前与未来

当前 Provider Router 仍在 Backend 内部。现有路由会综合模型映射、优先级、区域、容量、健康和客户政策；代码中有预留不代表对应云区域或 Provider 已配置并上线。

调用规模足够大后，Provider Router 将独立为 NexusFlow 的核心平台能力：

- 同模型多 Provider；
- 动态权重、优先级和主备切换；
- 按客户、地区、采购价和 SLA 选路；
- Provider 并发/TPM/配额容量租约；
- 熔断、半开恢复、健康评分和手动锁定主供应商；
- 在强约束满足后，自动选择成本、延迟和质量最优渠道。

选路次序必须是：

```text
模型/协议兼容
  → 客户政策与 SLA
  → 地域与合规
  → 实时容量
  → 健康与熔断状态
  → 在合格候选中优化成本、延迟和质量
```

每笔请求必须能回放路由理由：规则版本、候选 Provider、中选理由、容量租约、熔断/重试链、价本版本和人工干预。控制面故障时，实时数据面应使用最后一份已验证的策略快照，不能让控制面故障拖垮 `/v1` 数据面。

## 7. 协议、流式与历史故障教训

- 模型 ID 可包含 `/`；从前端到 Next proxy 再到 Express 都必须保留编码。
- `messagesRouter` 必须在通用 `/v1` router 之前挂载。
- 协议兼容不等于每个模型支持每个端点；必须以真实上游验证为准。
- SSE 可能已输出首字后中途断联。已发 headers 后不得再写普通 JSON 500；必须正确标记断流、结算已用量并传递取消。
- 上游省略 `[DONE]` 但已有合法 `finish_reason` 时，代理可补齐正常结束；在完成信号前断流或收到 SSE error 必须是 error。
- 所有 SSE 路径使用合法注释心跳覆盖长静默窗口；心跳只能插入完整 SSE 事件边界，不能破坏被 TCP 拆分的 JSON。
- 前端 `ChunkLoadError` 的根治是 build once 和旧 chunk 覆盖灰度/回滚窗口，不是在两台机器分别 build。
- 客户 400 不得计入 Provider 故障健康降级。
- 缺失 Provider 凭据时应在预占前报 `provider_not_configured`，不得向上游发空凭据再暴露 401。
- Redis 容量脚本必须在真实 Redis 5.0 兼容基线测试，并区分 `exhausted` 和 `state_unavailable`。
- CI 不得出现所有 job 都被条件跳过的 `No jobs were run`；任何提交至少要有不可跳过的 validate job。

## 8. 安全、隐私和权限不变量

- API Key 只按 SHA-256 hash 认证；掩码字符串只用于展示。
- 管理写接口必须显式 admin 鉴权；用户资源必须验证 owner，鉴权失败时 fail closed。
- `/admin` 的 nginx Basic Auth 和应用 admin session 是两层不同保护，不得拆掉其一。
- Demo Admin 只能返回合成数据，不得共用真实 `/api/admin/*` 查询。
- 上游错误必须脱敏；密钥、客户请求正文、Cookie 和个人信息不进 Git 或默认日志。
- SLS 默认记结构化指标。只有显式授权时才能记录脱敏且截断的内容，并遵守保留期。
- 任何 `.env`、AK/SK、Provider Key、支付密钥、数据库密码只能记录安全存储位置和调用方法，不得复制到文档、对话或日志。

## 9. 可观测性的正确分工

- `transactions` / billing reservations：资金权威和并发安全。
- `usage_logs`：客户、模型、Token、请求结果和计费关联统计。
- SLS：路由、错误、延迟、缓存、断流、重试和上游运营遥测。
- PM2/nginx/ALB：进程、边缘和节点健康。
- `/api/health/live`：进程活着；`/api/health/ready`：依赖可用且未 drain；`/api/version`：实际构建 SHA。

上游控制台没有错误不能证明 NexusFlow 无故障；问题可能发生在边缘、协议转换、流式代理、路由、计费或客户网络。反之，平台出现 500 也不能未查证就归因上游。

## 10. 云原生演进，不与当前现网混淆

已完成的开发基线包括 ACK Serverless/ECI 用的 Backend、Frontend、Gateway 三镜像，Helm chart，非 root/只读容器，live/ready，SSE 排空和心跳，PDB/HPA/拓扑分散与 migration Job。

但这不代表 ACK 已承载生产。在集群、ACR、网络、RDS/Redis 白名单、ALB/Gateway、长连接、计费对账和回滚门禁通过之前，生产事实仍是双 ECS + nginx + PM2。

演进顺序：

1. Gateway/Web/API 容器等价、灰度和可回切；
2. 将 Async Media Worker 与 API 拆分；
3. 将 Admin Control Plane 与高 SLA 数据面解耦；
4. 当路由规模和复杂度足够高时拆 Provider Router；
5. Billing Ledger 最后评估，不为了“像微服务”而破坏资金一致性；
6. 只在多服务灰度、标签路由、统一限流/熔断和多区域需求成熟后再引入 MSE/Service Mesh。

## 11. Agent 接任务时的必做清单

### 只读查询/故障诊断

1. 确定时间窗、客户、模型、协议、request/trace ID 和失败阶段；
2. 对照 ALB/nginx/PM2/SLS/usage_logs/账本/上游，不只看一个控制台；
3. 分别验证两个生产节点，避免被 ALB 随机命中掩盖单节点故障；
4. 给出证据链和确定性等级，不用“大概是上游”代替诊断。

### 代码修改

1. 先看 Git 分支/状态和相关 migrations，保留他人变更；
2. 定义该路径的鉴权、owner、限流、计费、错误格式、观测和回滚语义；
3. 先改源码，不直接修 `dist/` 或 `.next/`；
4. 数据库变更只通过新 migration，编号以实际目录和已分配槽位为准；
5. 按风险执行单元、真实 PostgreSQL/Redis、构建、浏览器、真实上游和手算计费验证；
6. 项目事实变化同步更新 `WIKI.md` 和相关 runbook。

### 生产发布

1. 没有用户明确授权、门禁或回滚方案时，不切生产；
2. 先运行统一脚本 dry-run，不绕过摘流、备份、价本和配置预检；
3. 只部署同一不可变制品，逐节点切换；
4. 两节点直连 + ALB 公网 + 真实客户路径全部验证；
5. 任一节点不一致、连接未排空、备份不可验证、价本部分激活或回滚基线不唯一时，停止并 fail closed。

## 12. 索引：按任务读哪些文档

| 任务 | 必读 |
| --- | --- |
| 项目全景/生产 | `WIKI.md`、`docs/production-release-runbook.md` |
| 新模型/替换模型 | `docs/MODEL_ONBOARDING.md`、`MODELS.md`、运行时 `/api/models` |
| 价本/采购成本/毛利 | `docs/provider-cost-price-book.md`、账本代码与 migration 019 |
| 发布 | `docs/release-regression-test-checklist.md`、`docs/production-release-runbook.md` |
| ACK/容器 | `docs/cloud-native-microservices-architecture-spec.md`、`docs/ack-serverless-deployment-runbook.md`、`docs/ack-serverless-cloud-change-plan.md` |
| 子账号 | `docs/sub-accounts-spec.md` |
| 支付 | `docs/PAYMENT_SETUP.md`、支付/账本 migrations |
| 安全审计 | `REVIEW_SPEC_2026-07.md`（快照）+当前代码/WIKI |

本文不保存任何密钥、密码或客户请求正文。
