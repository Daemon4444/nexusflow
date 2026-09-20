# NexusFlow 项目全景

> 本文是 NexusFlow 的**唯一项目事实入口**，供开发者、Codex、Claude、Qoder、Gemini、Copilot 等协作者使用。
>
> 最近校准：2026-07-29
>
> 校准基线：本地分支、GitHub `origin/main` 与生产环境代码；2026-07-29 低峰不可变
> v3 发布基线为 `1a6ecbc`，后续版本仍以 `/api/version` 为准。
>
> 重要：提交号和运行状态会变化，执行任务前仍应以当前代码、数据库迁移和生产探针为准。

## 1. 一句话认识项目

NexusFlow 是一个面向开发者的 AI 模型聚合、协议兼容、路由和计费平台。用户使用一套 NexusFlow 账号、余额/信控与 API Key，通过 OpenAI、Anthropic Messages、Responses 及异步任务接口访问多个文本、多模态、向量、语音、图像和视频上游。

- 产品站：`https://nexusflow.hk`
- Public API：`https://nexusflow.hk/v1`
- GitHub：`github.com/Daemon4444/nexusflow`
- 本机主工作区：`~/nexusflow`
- 生产 SSH 别名：`nexus`
- 生产目录：`/root/distiny/nexusflow`
- 生产进程：`quadrant-backend` × 2、`quadrant-frontend` × 1

这不是一个简单反向代理。核心资产是：协议转换、模型能力目录、Provider 路由、缓存感知计费、并发与限流、主/子账号账本、后台运营和可观测性。

## 2. 文档规则与事实优先级

开始任何任务前先读本文，再按任务读取专项文档。

事实冲突时按以下顺序判断：

1. 当前生产探针、数据库结构和运行配置；
2. 当前分支代码、SQL migrations、测试；
3. 本文；
4. `docs/`、`MODELS.md`、`README.md` 等专项文档；
5. `REVIEW_SPEC_*.md`、`OPTIMIZATION_SPEC.md`、`PRODUCTION_REVIEW.md`、`ISSUES.md` 等历史快照；
6. Claude/Qoder/Codex 对话或记忆。

历史总结只用于解释设计缘由，不能覆盖当前代码事实。发现本文过时时，应在同一个变更中修正本文。

文档分工：

| 文件 | 角色 |
| --- | --- |
| `WIKI.md` | 项目全景、架构、不变量、运维和当前边界；唯一事实入口 |
| `AGENTS.md` | Codex、Qoder 及通用代码 Agent 的自动入口和工作规则 |
| `CLAUDE.md` | Claude Code 自动入口 |
| `GEMINI.md` | Gemini CLI 自动入口 |
| `.github/copilot-instructions.md` | GitHub Copilot 自动入口 |
| `README.md` | 面向开发者和 GitHub 访客的快速介绍 |
| `docs/MODEL_ONBOARDING.md` | 新模型上线的强制 Playbook |
| `docs/whole-site-reliability-ux-spec-2026-07-21.md` | 2026-07-21 整站功能、协议、视觉与发布验收记录 |
| `MODELS.md` | 人工维护的模型说明；运行时目录以 API/代码/DB 覆盖层为准 |
| `REVIEW_SPEC_2026-07.md` | 2026-07-20 审计快照，不代表所有事项仍未完成 |

严禁把 `.env`、API Key、私钥、Cookie、客户请求正文或个人信息写入仓库文档。

## 3. 当前生产基线

截至 2026-07-28 校准：

| 项目 | 当前状态 |
| --- | --- |
| 前端 | Next.js `16.3.0-preview.9`、React 19、Tailwind CSS 4 |
| 后端 | Express 5、TypeScript，生产运行编译后的 `backend/dist/index.js` |
| Runtime | 生产 Node.js 22.22.1；CI 使用 Node.js 24 |
| 数据库 | 阿里云托管 PostgreSQL 16，两应用节点共享 |
| 缓存/共享状态 | 阿里云托管 Redis 7，两应用节点共享 |
| 应用节点 | ALB 后双节点；主节点 SSH `nexus`，同 VPC 节点 `nexusflow-app-j`（`172.27.219.55`） |
| 进程 | 每节点 PM2；后端 cluster ×2，前端 fork ×1 |
| 反向代理 | 阿里云 ALB + 每节点 nginx |
| 模型目录 | 95 个可计费静态模型 + 1 个公告模型（2026-09-20 重算）；`gpt-6-astra` 仅在 `/api/models` 披露，价格与凭据验证完成前不进入计费运行时或 `/v1/models` |
| 数据库迁移 | 仓库已提交到 `023_provider_list_price_fallback.sql`，其中历史上存在两个 `006_*`；以实际 migration 目录和 ledger 为准 |
| CI | npm audit（生产依赖）、计费预占测试、前后端 build |
| 备份 | 发布前 age 加密 RDS 备份和异地 PostgreSQL 16 全量恢复为强制门禁；主机 03:30 日备与异地 04:30 拉取已安装并完成恢复演练 |

常用只读检查：

```bash
curl -fsS https://nexusflow.hk/api/health
curl -fsS https://nexusflow.hk/api/version
ssh nexus 'cd /root/distiny/nexusflow && git status --short --branch'
ssh nexus 'pm2 status'
ssh nexus 'ssh root@172.27.219.55 "pm2 status"'
```

`/api/version` 返回实际部署构建的 Git SHA 和构建时间，用它判断“代码推了但线上仍跑旧产物”。后端 build 会把这两个值写入只读构建产物，接口优先读取产物、仅在旧部署缺少产物时回退到 PM2 环境变量，避免滚动发布漏传环境变量后误报 `unknown`。

## 4. 部署拓扑

```text
Internet
  │
  ▼
阿里云 ALB
  ├─► 主节点 nginx ─┬─ /, /admin ─► Next.js :19999
  │                 └─ /api/*, /v1/* ─► Express :3001
  └─► 节点 j nginx ─┬─ /, /admin ─► Next.js :19999
                    └─ /api/*, /v1/* ─► Express :3001

每个应用节点的 PM2
  ├─ quadrant-backend ×2       backend/dist/index.js
  └─ quadrant-frontend ×1      frontend/node_modules/next（fork）

共享托管服务
  ├─ PostgreSQL 16
  └─ Redis 7
```

后端虽然监听 `0.0.0.0:3001` 以兼容 PM2 cluster，但主机防火墙阻止公网直连；外部流量应只经 ALB 和 nginx。不要未经验证就把 cluster 模式改为 `app.listen(..., "127.0.0.1")`，历史上这会导致 PM2 cluster 不监听并产生 502。

`/v1` 的大 JSON 请求在解析前先做只读 API Key 校验，避免匿名请求触发最高 50MB 的 JSON 缓冲。校验通过后还有一层请求体准入控制（`backend/src/services/request-body-admission.ts`，Key/IP/全局 × 并发/字节六维，`PUBLIC_BODY_*` 环境变量可调）：有 `Content-Length` 时按声明值精确预占；HTTP/2 无长度或 HTTP/1.1 chunked JSON 则在读取过程中按真实在途字节动态增加 Redis 租约，并以 256 KiB 前瞻窗口减少 Redis 往返，不再把每个小请求视作 50 MiB。单请求实际读取仍受 1/50 MiB 硬上限约束。租约只保护 body 在内存中的缓冲，body 解析完成即释放，不覆盖上游调用和流式响应阶段；拒绝会返回 429/503 并在 message 中透出具体维度（如 `api_key_concurrency`），同时写入 SLS（status=rejected，errorReason=`body_admission_*`）。Key 是主要身份边界，IP 只作为高阈值 NAT/DDoS 保险丝，不能比正常付费 Key 更早拒绝。nginx 仍保留 body 大小、慢请求和每 IP 高阈值边缘熔断，但不承担客户套餐配额；客户吞吐由应用层账户/主账号聚合、模型 QPM/TPM、可选 API Key override 和 Provider 容量共同决定。

## 5. 仓库结构

```text
nexusflow/
├── backend/
│   ├── src/
│   │   ├── index.ts            # Express 入口、路由顺序、健康/版本端点
│   │   ├── routes/             # Public、用户、管理和媒体路由
│   │   ├── services/           # 上游适配、路由、限流、Redis、SLS、支付
│   │   ├── data/               # PostgreSQL 数据访问、账本、目录覆盖层
│   │   ├── middleware/         # 鉴权、错误处理
│   │   ├── utils/              # 协议桥、计费、错误脱敏、流式解析
│   │   └── db/migrations/      # 生产 schema 的增量来源
│   └── scripts/                # smoke、计费和迁移验证脚本
├── frontend/
│   ├── app/                    # Next.js App Router 页面与代理路由
│   ├── components/             # 控制台、主题、通用组件
│   └── lib/                    # API、模型、金额、i18n、认证
├── docs/                       # 专项 runbook 与回归清单
├── internal/model-sources/     # 上游模型资料快照
├── ops/nginx/                  # 双节点共享的 nginx /v1 防洪配置
├── scripts/deploy-all-production.sh
├── scripts/deploy-production.sh
├── ecosystem.config.js
├── docker-compose.yml
└── .github/workflows/ci.yml
```

根 `package.json` 使用 npm workspaces。不要在根、前端、后端分别随意生成冲突 lockfile；权威锁文件是根 `package-lock.json`。

## 6. 核心请求链路

### 6.1 文本/多模态同步请求

```text
API Key 鉴权
  → 子账号状态与模型权限
  → Consumer QPM/TPM + Provider 容量检查
  → 按最大可能成本原子预占可用资金（余额 + 信控）
  → 解析 Provider/区域/协议
  → 请求上游（流式或非流式）
  → 解析真实 usage / 缓存 token
  → 必要时对断流内容估算 usage
  → 原子结算预占并写交易
  → 写 usage_logs + SLS 指标
  → 归还 TPM 预占与 Provider 并发
```

关键代码：

- `/v1/chat/completions`、models、embeddings、images：`backend/src/routes/v1.ts`
- `/v1/messages`：`backend/src/routes/messages.ts`
- `/v1/responses`：`backend/src/routes/responses.ts`
- Provider 解析：`backend/src/services/upstream.ts`
- 计费预占/结算：`backend/src/data/billing.ts`
- 缓存计费：`backend/src/utils/cache-billing.ts`
- 限流：`backend/src/services/rate-limiter.ts`

资金检查不是普通的“先查余额、后扣款”。迁移 `011_billing_reservations.sql` 和 `reserveBalanceWithReason/settleReservation/releaseReservation` 用数据库行锁解决并发请求穿透可用资金的问题。主账号可用资金为余额加信控，结算时优先扣余额、不足部分扣信控；两者独立展示和记账。预占失败会保留余额不足、子账号额度耗尽、账号暂停等稳定原因，HTTP 路由不能再把这些情况合并成同一个 402。新增任何收费路径必须接入同一套预占/结算语义。

余额与 Provider TPM 预占的输出 token 估算由 `getReservedOutputTokens`（`backend/src/data/models.ts`）决定：请求显式传 `max_tokens` 按其值（截断到 `maxOutput`）；未传时回退到模型 `defaultOutputReservation`，再回退到全局缺省 `DEFAULT_OUTPUT_RESERVATION_TOKENS = 16384`（同样不超过 `maxOutput`）。禁止回退到 `maxOutput` 峰值：kimi-k3 等大输出模型（maxOutput 1,048,576 > 路由 TPM 上限 1,000,000）会让不带 `max_tokens` 的请求被 `provider_capacity_exhausted` 必然拒绝，并把余额预占放大到实际用量的数百倍。

### 6.2 图像、视频、语音与异步任务

- OpenAI 风格图片：`POST /v1/images/generations`
- 视频别名：`POST /v1/videos/generations`
- 通用异步任务：`POST /v1/tasks`，再轮询 `GET /v1/tasks/:id`
- Playground 内部路由：`/api/image`、`/api/video`、`/api/playground`
- 音频：`/v1/audio/*`
- 上传：`/api/upload`；需 session 或 API Key

Wan 视频公开参数支持 `size`，也支持 `resolution + ratio`。`1280x720` 会规范化为 DashScope 要求的 `1280*720`；不支持的分辨率/比例组合必须在创建任务和预占计费前返回 400。文档、Playground、通用任务和 smoke 应使用同一契约。

旧 `/v1/video/*` 和 DashScope 兼容路径只负责转换请求/响应外壳，实际必须委托给统一视频任务管线。它们返回 NexusFlow 内部 task ID，并按用户/API Key 校验任务归属；严禁把任意字符串当上游 task ID 直接轮询，这会绕过账本和资源所有权。

上传链路已具备鉴权、每身份 RPM、扩展名与 MIME 精确配对、文件 magic 校验、随机文件名和图片压缩。仍应把“文件过期清理/对象存储迁移”视为后续运维事项。

## 7. Public API 与协议边界

| 能力 | 端点 | 说明 |
| --- | --- | --- |
| Models | `GET /v1/models` | OpenAI 风格目录 |
| Chat | `POST /v1/chat/completions` | OpenAI Chat Completions |
| Messages | `POST /v1/messages` | Anthropic Messages；部分模型直通、部分走协议桥 |
| Responses | `POST /v1/responses` | Responses 请求、流式、存储和归属校验 |
| Stored responses | `GET/DELETE /v1/responses/:id` | 只允许资源所属用户访问 |
| Input items | `GET /v1/responses/:id/input_items` | 同样执行归属校验 |
| Embeddings | `POST /v1/embeddings` | OpenAI Embeddings |
| Images | `POST /v1/images/generations` | 图像生成 |
| Videos | `POST /v1/videos/generations` | 视频生成兼容入口 |
| Tasks | `POST/GET /v1/tasks*` | 图像/视频等异步任务 |
| Audio | `/v1/audio/*` | 语音能力 |

必须牢记：

- “接口兼容”不等于“所有模型支持所有协议”。协议支持由模型能力和真实上游行为决定。
- 七个 Claude 公共 ID 保持无日期后缀：`claude-haiku-4-5`、`claude-sonnet-4-6`、`claude-sonnet-5`、`claude-opus-4-7`、`claude-opus-4-8`、`claude-opus-5`、`claude-fable-5`。它们通过 HiModels 原生 Anthropic Messages 兼容上游映射到对应的 `*-20260820` 固定快照，不是 NexusFlow 直连 Anthropic 官方 API；`/v1/messages` 非流式与 SSE 流式已验证，usage 可含缓存字段，但工具和缓存控制能力不得按全系列推断。
- Kimi K3 的 Messages 支持曾因上游差异走自建桥，切换逻辑由模型字段控制；`kimi-k3` 自 2026-08-09 起使用 Jaway K3 专线上游，OpenAI Chat 与 Anthropic Messages 均原生直通，非标准 HTTPS 端口必须同时命中主机和精确端点白名单。
- 模型 ID 可能包含 `/`，例如 `MiniMax/MiniMax-M3`。前端、Next proxy 和 Express 路径必须保留编码，不能把 `%2F` 提前拆成路径段。
- Responses 内置工具可能产生非 Token 上游费用。默认只允许本地 `function` 类型；其它类型必须通过 `RESPONSE_ALLOWED_TOOLS` 明确放行并先确认成本模型。
- `gpt-6-astra` 已声明 OpenAI Chat Completions 与 Responses 契约，但属于公告模型：Azure AI Foundry Provider 固定 `eastus2`，使用 `/openai/v1` 和 `api-key` 认证，当前 disabled 且无可用 capacity。
- 上游成本先使用可追溯的合同、发票、人工核验或私有折扣表价本；没有可适用价本时，使用请求结算时固化的官方原价。客户折后实付不能代替官方原价，估算请求和 Provider 不明请求仍然失败关闭。
- `messagesRouter` 必须在通用 `/v1` router 之前挂载，避免被通用路由截获。

## 8. 模型目录与 Provider 路由

模型目录由三层组成：

1. `backend/src/data/models.ts` 的 `staticModels`：可计费基础目录；
2. PostgreSQL `model_overrides`：后台可编辑的覆盖/下架层；
3. `announcedModels`：仅供 `/api/models` 展示的未开放模型，价格可为 `null`，不得进入计费、`/v1/models` 或默认 capacity。

`refreshModels()` 会让 cluster 节点周期收敛。后台“模型目录”和“Provider 模型映射”是两套不同概念：

- 模型目录定义用户看到什么、价格、能力和协议；
- Provider 映射定义某个模型能路由到哪些上游、容量、优先级和区域。

Provider 选择综合静态注册、数据库 Provider、`provider_capacity`、渠道配置、健康、区域和用户策略。区域支持已预埋北京/新加坡/美国/法兰克福，但只有配置了对应渠道与区域 Key 才生效；不能因为代码存在就宣称海外区域已可用。

Provider Router 当前是 Backend 内部核心模块，不在 ACK 等价迁移时同时拆分。当调用规模和多 Provider 复杂度足够大后，它将独立为 NexusFlow 核心平台能力，覆盖同模型多 Provider、动态权重/优先级、主备切换、客户/地区/价格/SLA 路由、容量租约、熔断/恢复/健康评分、手动锁定和成本质量最优选路。自动优化必须先满足模型兼容、客户 SLA、地域合规、容量和健康门禁，未知成本不得当作 0。每笔选路必须保存策略版本、候选集、中选理由、重试/熔断链、价本版本和人工干预，使决策可解释、可回放、可审计。

`GET /api/models` 返回完整展示目录；`GET /v1/models` 只返回可计费运行时目录。公告模型固定标记 `lifecycle=announced`、`pricingStatus=unpublished`、`availability=temporarily_unavailable` 和 `availabilityReason=pricing_unpublished`。启用映射但缺少 Provider 凭据时，运行时目录标记 `temporarily_unavailable`，收费接口在预占前返回 `provider_not_configured`；不得把空凭据请求发到上游后再暴露 401。该状态是平台级渠道状态，不替代用户级模型白名单或路由策略判断。

上线新模型必须完整阅读 `docs/MODEL_ONBOARDING.md`。至少覆盖：

- 官方模型 ID、参数、上下文、价格和渠道；
- 静态目录、协议能力、Provider 路由、计费与前端；
- 含 `/` 的 ID 编码；
- 流式、缓存、thinking、tools、图片/视频参数；
- 浏览器真实用户路径；
- 真实上游端到端、usage 和余额手算。

只通过 build 或只 curl 后端，不算“上线验证完成”。

## 9. 账号、权限与账本不变量

### 9.1 身份

- 用户登录使用 session；
- Public API 使用 `sk-air-*` API Key；
- 管理 API 必须使用 admin session；
- `/admin` 还有 nginx Basic Auth，形成双层保护。
- 演示后台使用独立的 `/demo-admin` 页面与 `/api/demo-admin/*` 只读接口；服务端仅允许
  `DEMO_ADMIN_EMAILS` 中的 session 邮箱访问，返回内容必须是合成数据，禁止复用真实
  `/api/admin/*` 查询或把该白名单当作真实管理员权限。

API Key 创建时只返回一次明文。数据库用 SHA-256 hash 验证，展示字段只保存掩码。不得恢复“掩码字符串也可通过认证”的兼容逻辑。

API Key 默认继承账户/模型套餐，不再隐含套用历史 60 RPM。`api_keys.rate_limit_override`
只有运营明确配置时才作为更窄的 Key 级保险丝；`NULL` 表示继承，而不是绕过账户
QPM/TPM。旧 `rate_limit` 字段在 expand/rollback 窗口内仅保留旧版本兼容，控制台不得把
它显示成实际套餐。公开 429 应通过 `X-RateLimit-Scope` 标明触发层级，并提供
`Retry-After` 及 limit/remaining/reset 信息。

### 9.2 主账号/子账号

- 钱只存在主账号；
- 子账号调用由主账号余额结算；
- `actor_user_id` 记录实际消费主体，便于分账；
- 子账号受状态、月度额度和模型白名单约束；
- 子账号不可自行充值；
- 删除采用软删除语义，账单和审计链不能被抹掉。

### 9.3 金额与计费

- PostgreSQL 金额字段使用 NUMERIC；
- 主账号可用资金 = 余额 + 信控；信控只能由管理员调整，消费优先扣余额再扣信控；
- 展示金额不能替代账本精度；
- 未发布价格必须保留为 `null`，不得转换成 0、免费或估算值；模型必须留在公告目录之外的计费边界；
- Token 模型可能有输入长度分层价；
- 缓存读、缓存写和普通输入价格不同；
- 流式上游缺失 usage 时，只在确有输出内容时启用估算，并在遥测中标记 `estimated=true`；
- OpenAI 兼容流必须验证正常终止：上游已有 `finish_reason` 但省略 `[DONE]` 时由代理补齐；
  在完成信号前断流或收到 SSE error 时必须记录为 `error` 并保留稳定错误码，不能因为
  HTTP 头已经发送就把中断调用写成 `success`；
- usage 写入失败不能阻断权威账本结算；
- 任何新收费路径都要支持折扣、主/子账号、预占、释放、幂等结算和失败路径。

## 10. 数据库与迁移

主要域：

- 身份：`users`、`sessions`、`api_keys`
- 账本：`transactions`、`payment_orders`、`billing_reservations`
- 用量：`usage_logs`
- Provider：`providers`、`provider_models`、`provider_capacity`、`provider_channel_configs`、健康/成本/审计表
- 策略：`customer_route_policies`、`user_rate_limits`、`user_model_discounts`
- 异步：`async_tasks`
- 产品：`tickets`、`webhooks`、`webhook_deliveries`
- 模型覆盖：`model_overrides`
- 子账号：用户父子关系、配额与 `sub_account_model_permissions`
- Responses 资源隔离：`response_ownership`

迁移顺序：

```text
001_initial_schema.sql
002_money_numeric.sql
003_provider_operations.sql
004_user_model_discounts.sql
005_usage_log_id.sql
006_dashboard_indexes.sql
006_usage_region.sql
007_model_overrides.sql
008_sub_accounts.sql
009_sub_account_model_permissions.sql
010_response_ownership.sql
011_billing_reservations.sql
012_credit_balance.sql
013_observation_safe_health_defaults.sql
014_admin_control_plane.sql
015_payment_settlement_atomicity.sql
016_api_key_rate_limit_guard.sql
017_session_token_hashes.sql
018_admin_audit_intents.sql
019_provider_cost_tiers.sql
020_upload_object_lifecycle.sql
021_control_plane_persistence_limits.sql
022_usage_retail_pricing_evidence.sql
023_provider_list_price_fallback.sql
026_api_key_rate_limit_overrides.sql
```

历史上两个迁移都使用了 `006` 前缀。不要按数字前缀去重；迁移器按完整文件名登记。
`017` 是 session hash、`018` 是通用后台审计、`019` 是 Provider 成本分层、`020`
是上传对象生命周期、`021` 是控制面持久化边界、`022` 保存结算时零售价/折扣/思考模式证据，
`023` 增加无适用私有价本时的官方原价兜底，`026` 将 API Key 固定 RPM 改为可空
override、默认继承账户套餐；`024`/`025` 已在并行企业分支预留，合并时仍按完整文件名
登记。新增 migration 前必须检查实际目录
和团队分配，禁止复用编号。
生产是否已应用以 `schema_migrations` 为准，不能从仓库文件列表推断。

## 11. 安全与隐私基线

2026-07 的多轮审计已经修复多项高危问题，包括：

- API Key 掩码绕过；
- Provider capacity 匿名修改；
- Responses 存储资源 IDOR；
- 旧图像/PixVerse/视频轮询可凭任意有效 Key 查询上游 task ID 的资源越权；
- Messages 分层价与缓存语义错计；
- 流式断流 0 计费；
- 并发余额竞态；
- 上传伪装文件与滥用；
- 上游错误直接泄漏；
- 畸形 JSON 被误报为 500；
- 子账号额度耗尽被误报为主账号余额不足；
- 缺少 Provider 凭据的模型仍被展示为可调用；
- 登录/验证码滥用与若干路由鉴权缺口。

继续修改时必须保持：

- 所有管理写接口显式 `requireAdmin`；
- 所有用户资源按 owner 校验，失败关闭；
- 外部错误经 `sanitizeUpstreamError`；
- `.env`、Provider Key、支付密钥不进 Git、不进日志；
- SLS 默认只记结构化指标。只有显式设置 `SLS_LOG_FULL_CONTENT=true` 才记录脱敏和截断后的内容；
  OpenAI Chat Completions 的成功、上游 HTTP 失败和本地异常路径都必须把请求与响应交给
  同一个脱敏器，避免开关已启用但失败日志仍只有错误摘要；
- `PROVIDER_SECRET_KEY` 是否配置必须在生产变更前检查；未配置时不能假设数据库中的 Provider Key 已加密；
- PostgreSQL/Redis 只绑定本机，3001/19999 不允许公网直连；
- 生产 Provider 出站必须配置
  `PROVIDER_OUTBOUND_HOST_ALLOWLIST`；当前清单必须包含 Azure 资源主机
  `developerhelena-1129-resource.services.ai.azure.com`，受管发布拒绝 HTTP(S)/ALL proxy 环境，
  Provider URL 仍需逐次执行 scheme、userinfo、端口、DNS 和公网地址校验；
- Provider socket DNS lookup 必须同时遵守 Node/Undici 的单地址和
  `{ all: true }` 两种回调契约；`all=true` 必须返回全部已验证的公网地址数组，
  否则 Node 22 会在连接上游前抛 `ERR_INVALID_IP_ADDRESS`；
- nginx 对 `/v1` 分路由设置入口预算：chat/responses/messages 保留 50 MiB，
  embeddings 为 8 MiB，audio 和其余路由为 1 MiB；统一设置 body inter-read
  timeout、真实客户端 IP 的连接/请求速率限制，请求不在 nginx 预缓冲以保证应用
  鉴权与配额先执行，响应不缓冲以保留 SSE。audio 只接受小字段/`file_url` 并拒绝
  binary file part 落盘；
- nginx 直接 404 `/proxy/v1*` 和 `/api/proxy/v1*`，禁止 Next proxy 成为 `/v1`
  门禁绕行路径；`/api/upload` 有 101 MiB（含 multipart overhead）、超时和单 IP
  并发/速率门禁，`/api/uploads/*` 有连接、速率和单连接带宽保护，Next 必须先鉴权
  再读上传体并流式转发下载；
- 内置工具、媒体生成和异步任务的非 Token 成本必须先有计费边界。

## 12. 可观测性、备份与恢复

- PostgreSQL `usage_logs`：用户侧统计和结算关联数据；
- SLS：路由、延迟、缓存、错误、断流估算等运营遥测；
- `/api/health`：进程存活；
- `/api/version`：部署版本；
- PM2：进程、重启、stdout/stderr；
- 托管 PostgreSQL/Redis 连通性：通过每节点 `/api/health`；
- 发布前备份：统一发布脚本通过 `scripts/db-backup-hook.sh` 从生产 `DATABASE_URL`
  或 `PG_*` 连接配置把 PostgreSQL custom-format dump 直接流式加密为 `.dump.age`，
  应用节点只保存 age 公钥 recipient，不保存私钥，也不在磁盘落明文 dump；
- 恢复门禁：加密备份必须经严格 SSH 主机校验送到异地 verifier；私钥只保留在异地
  root-only 主机，由 PostgreSQL 16 容器完成整包认证解密、TOC 校验、隔离库完整恢复、
  核心表和 migration ledger 检查，成功后才允许迁移；
- 历史本地定时备份曾指向已停用的 PostgreSQL 容器，2026-07-26 至 07-28 的
  20-byte 产物不可恢复；该旧任务已于 2026-07-29 被新的 RDS-aware
  `scripts/daily-db-backup.sh` 精确替换，每日 03:30 执行；
- 异地 root-only 加密归档使用独立 age 私钥完成认证解密、PostgreSQL 16 隔离库
  全量恢复和核心 schema 检查；每日 04:30 拉取任务已安装。2026-07-29 的正式发布
  备份与手工备份均已通过主机/异地哈希一致性及完整恢复验证。

备份“文件存在”不等于可恢复。重大 schema/计费变更后应定期执行认证解密、PostgreSQL
16 隔离库完整恢复和业务一致性演练；演练记录不得包含私钥、数据库口令或客户数据。

当前监控仍缺少完整的主动告警闭环。低余额、402 后挽回、服务健康、错误率和备份失败通知仍是高价值改进方向。

受管 Provider 路由读取 Redis 容量状态时保持 fail-closed；瞬时不可读只允许在固定的
毫秒级预算内重读，持续不可读与真实容量耗尽必须分别返回
`provider_capacity_store_unavailable` 和 `provider_capacity_exhausted`，并写入不含客户
内容的结构化过滤原因，不能统一折叠为 `provider_unavailable`。真正的容量预占也必须
使用同一个稳定租约身份做有界重试：Redis 已提交但回执丢失时视为幂等成功，RPM、每日
次数、TPM 和并发均不能重复占用；无法核实提交状态时继续 fail-closed。受管 Redis
代理内的 Lua 不使用 `SET ... KEEPTTL`，统一通过 `PTTL` 后 `PEXPIRE` 显式保存过期时间。

## 13. 前端与产品面

主要页面：

- 营销首页与模型推荐；
- 模型目录与详情；
- Pricing；
- Docs；
- Playground；
- Dashboard、Activity、Keys、Billing、Settings；
- Rate Limits、Tickets、Monitor、Sub Accounts；
- Admin：用户、余额、Provider、容量、路由、模型目录、折扣、工单等。

前端已有浅/深主题、中文优先的控制台文案和部分 i18n。不要在没有产品决策时把公开营销页整页改成单一语言。模型详情使用 catch-all 路由承接含斜杠的模型 ID。

当前主推模型和推荐顺序会随运营调整，不能从历史对话推断。以 `frontend/app/page.tsx`、`frontend/lib/models.ts` 和线上页面为准。

公共站与控制台共用 `Header`。登录入口携带经过站内校验的 `returnTo`；移动文档使用抽屉目录；模型与 Playground 必须遵循运行时可用性，不能推荐或提交暂不可用模型。公告模型显示“即将上线 / 价格待公布”，所有价格组件接受 `null` 且不得用 `|| 0` 转成免费。定价与模型服务端取数统一通过 `BACKEND_URL`，避免非默认端口构建静默生成空目录。

## 14. 本地开发、验证与 CI

安装与构建：

```bash
npm ci --legacy-peer-deps
npm run build:backend
npm run build:frontend
```

轻量本地后端：

```bash
cd backend
USE_PG_MEM=true PORT=3201 npx ts-node src/index.ts
```

主要验证：

```bash
npm --workspace backend run test:billing
npm run build:backend
npm run build:frontend
npm audit --omit=dev --audit-level=high
```

现有 CI 会执行上述生产依赖审计、计费预占测试和双端构建。它还不是完整测试体系：路由契约、真实数据库迁移、浏览器 E2E 和真实上游回归仍需按改动风险人工/专项执行。

前端 `npm run lint` 当前以 0 error 退出，但仍保留显式 `any`、旧 effect 和少量未使用变量等 warning 作为存量重构信号；不要把“lint 命令通过”写成“无任何 lint 债务”。

## 15. 生产部署 Runbook

生产永远运行构建产物。改 TypeScript 后只 `pm2 restart` 不会生效。

生产是双节点。必须从主节点使用统一发布脚本。它会：

1. 从两个在线节点收集上一版静态 chunk，在隔离目录只构建一次前后端；
2. 生成不可变常规文件 SHA-256 manifest 和确定性 `BUILD_ID=Git SHA`；
3. 把同一个不可变归档安装到两个节点的 release 目录；
4. 发版前要求两节点报告并核验同一个旧 SHA，把它锁定为唯一可接受回滚基线；
5. 创建并校验数据库备份，只在主节点持 PostgreSQL advisory lock 执行一次迁移；
6. 在 `014` 迁移后记录真实 `deployment_events`，节点直连验证通过后更新
   `runtime_nodes`；幂等重试不重复写，旧观测不能覆盖新状态；
7. 通过 nginx 对精确 ALB 健康检查返回 503，按
   `local-only → peer-only → balanced` 摘流、切换和验证；
8. 用 `current`/`previous` 原子指针切换 PM2；reload、运行核验或 `pm2 save`
   任一失败都恢复上一版，只有专用恢复状态加旧 SHA 复核同时通过才重新入流；
9. 验证两个节点的后端版本、前端 build header、HTML 引用的所有 Next.js chunk、
   production PM2 环境，以及 3001/19999 只监听 loopback；
10. 两个新节点直连验证后吊销全部 session 并切到 hash-only。若 legacy rollback 失败，
    只能把流量隔离到直接验证的新 SHA 节点并恢复 hash-only；不得在 compatibility
    downgrade 仍由本次发布持有时恢复 balanced；
11. `019` 后、两个新节点验证完成时，从随机 root-only staging 私下 dry-run/apply
    指定的 13-tier Provider 成本价本；不兼容旧版回滚前先停用，失败回滚恢复新节点
    时用同一 manifest 原子重激活，任何 partial 状态都禁止 balanced。

`backend/.env` 不进入制品或 manifest。安装器只在 manifest 通过后创建指向既有
root-only 配置源的软链，并在安装、激活和核验时检查实际解析目标，防止制品携带
密钥或运行目录改指其他配置。

```bash
ssh nexus
cd /root/distiny/nexusflow
git pull --ff-only origin main
bash scripts/deploy-all-production.sh --dry-run
bash scripts/deploy-all-production.sh
```

两条命令都必须通过 `NEXUSFLOW_PROVIDER_COST_MANIFEST` 指向主节点上随机
`/run/nexusflow-provider-cost.*/manifest.json`。目录必须 root:root `0700`、只含
一个 root:root `0600` 的 `manifest.json`；内容、source hash 和 manifest hash 不进
Git、制品或日志。真实发布在成功和可捕获失败时删除该 staging，dry-run 不删除。

`scripts/deploy-production.sh` 只是被统一脚本调用的单节点 install/activate/rollback 原语；
`activate` 和 `rollback` 没有 `NEXUSFLOW_DRAIN_CONFIRMED=true` 会拒绝执行。不得手工伪造
该变量或把单节点脚本当作完整生产发布。

运行目录：

```text
/root/distiny/nexusflow                 # Git 控制面，不承载新 release 的在线构建
/root/distiny/nexusflow-artifacts       # 单次构建归档及归档校验值
/root/distiny/nexusflow-releases/<sha>  # 不可变解包目录
/root/distiny/nexusflow-current         # 当前原子指针
/root/distiny/nexusflow-previous        # 上一版回滚指针
```

默认摘流不依赖 ALB RAM 权限。两节点必须先安装 root-owned
`/etc/nginx/nexusflow-drain.conf` 和
`/usr/local/sbin/nexusflow-nginx-health-drain-node`，以及 root-owned
`/etc/nginx/conf.d/nexusflow-audio-guards.conf` 和
`/etc/nginx/snippets/nexusflow-v1-location.conf`。摘流只匹配 ALB 的来源 IP、
`HEAD /api/health` 与 `SLBHealthCheck` UA，随后等待连续 503、公共 node probe
仅命中另一节点及现有连接归零。任何失败由 hook 与外层编排 trap 恢复健康检查。
截至 2026-07-28，`NexusFlowCertSyncRole` 对 ALB ServerGroup 仍为 `ImplicitDeny`，
所以 `alb-traffic-hook.aliyun.sh` 只是未启用的可选路径，不再阻断默认发布。
安装、验证和恢复步骤见 `docs/production-release-runbook.md`。

部署后必须检查：

```bash
git status --short --branch
pm2 status
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3001/api/version
ssh root@172.27.219.55 'curl -fsS http://127.0.0.1:3001/api/health'
ssh root@172.27.219.55 'curl -fsS http://127.0.0.1:3001/api/version'
curl -fsS https://nexusflow.hk/api/health
curl -fsS https://nexusflow.hk/api/version
bash scripts/deploy-all-production.sh --verify-only
```

涉及 migration 时，统一脚本会先备份、扫描破坏性/contract SQL、持 advisory lock
执行一次迁移。Schema 必须采用 expand/contract，使上一版应用在回滚窗口内仍可运行；
不得靠手工改表、不提交 SQL，或依赖破坏性逆迁移回滚。涉及支付、余额、API Key、
权限、上传或 Provider Key 的变更，需要比普通 UI 变更更严格的失败路径与回滚验证。

## 16. 修改纪律

1. 先确认工作区和生产是否有未提交漂移；
2. 先读相关代码，不根据旧文档猜实现；
3. 保持协议、计费、权限和日志语义一致；
4. 任何新 API 都要定义鉴权、限流、计费、错误格式和 owner；
5. 任何新模型都走 `docs/MODEL_ONBOARDING.md`；
6. 任何生产变更都要有 build、版本核对和真实用户路径验证；
7. 不覆盖无关的用户改动，不把线上漂移静默丢掉；
8. 变更项目事实时同步更新本文；
9. 不在文档中保存秘密或客户级数据；
10. 完成后保持本地 main、GitHub main、生产 main 可解释且干净。

## 17. 已合并的历史认知

本文已经吸收而不是逐字复制此前 Qoder、Claude 和 Codex 的项目总结：

- 2026-04，Qoder 阶段完成基础平台梳理、PixVerse 双通道、Playground 视频参数、文件上传代理和早期自动化验证；
- 2026-05，项目从早期聚合器扩展为 PostgreSQL 驱动的多协议平台，逐步形成 Provider 运营、限流、折扣、缓存计费、SLS 和管理后台；
- 2026-06，加入区域路由预埋、PM2 双实例、数据库本地/异地备份、模型目录 DB 覆盖层、更多模型与控制台改版；
- 2026-07，上线主/子账号账本、Kimi K3 与协议桥，完成 API Key/IDOR/计费/流式等全面安全审计，并补上余额原子预占、上传加固、CI、部署脚本和版本探针。

历史对话中已过时的内容已经剔除，例如：生产使用 ts-node、迁移只到 004、固定模型数量、旧服务器地址、旧模型可用性和“只重启即可生效”等。

可继续追溯的历史来源：

- Git 历史中的 `WIKI.md/wiki.md`；
- `REVIEW_SPEC_2026-07.md`；
- `PRODUCTION_REVIEW.md`、`OPTIMIZATION_SPEC.md`、`PARAM_AUDIT_SPEC.md`、`ISSUES.md`；
- 本机 Claude 结构化记忆和 Obsidian 的 NexusFlow 笔记。

这些是决策档案，不是运行时真相。

## 18. 当前仍值得做的事

按价值优先，而不是把旧 Spec 中所有勾选框机械重做：

1. 主动监控与告警闭环：健康、错误率、低余额、402、备份失败；
2. 定期恢复演练与凭据轮换，确认 `PROVIDER_SECRET_KEY` 等生产安全配置；
3. 扩充 CI：路由契约、迁移、真实 PostgreSQL、浏览器 E2E，并逐步清零前端 lint warning；
4. 处理客户端取消后的上游 stream/resource 释放；
5. 上传对象生命周期、配额与对象存储；
6. 拆分前端超大组件、收紧诊断 payload 类型并清理重复路由逻辑；
7. 稳定后再从 Next.js preview 版本迁移到正式版本；
8. 对海外渠道、Responses 付费工具、Seedance/Claude 等能力保持“有 Key 且真实端到端通过才宣称可用”。

每次开始新一轮优化前，先查 GitHub CI、生产版本、最近错误和真实业务数据，再重新排序。
