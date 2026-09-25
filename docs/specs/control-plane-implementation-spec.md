# 执行 Spec：NexusFlow 配置化控制面（P0–P6 全量）

> **给执行者（云端 Claude）的话**：这份 spec 要求你**一次性连续执行到底**，中途不要停下来提问。
> 遇到需要人来决定的事，按本文"默认决策"执行，并在 PR 描述的「未决事项」里写清楚你做了什么假设，然后继续往下做。
> 每完成一个阶段就提交一次，并保证 CI 是绿的。这样即使你没跑完，已经完成的阶段也是可用、可评审的。

---

## 0. 执行规则（必须遵守，优先级高于本文其他内容）

1. **禁止任何生产操作**：不部署、不 SSH、不连生产数据库或 Redis、不修改线上配置、不通知客户。你只在 GitHub 仓库里工作。
2. **不合并**：所有工作放在分支 `feat/config-control-plane` 上（基于本 spec 所在的分支 `spec/control-plane` 创建）。最后开**一个 Draft PR 指向 `main`**，不要合并，不要开 auto-merge。
3. **默认行为零变化**：所有新行为都放在开关后面，开关默认是 `legacy`（旧逻辑）。合并并部署这个 PR 后，**在没有人手动打开开关之前，线上行为必须和现在完全一样**。唯一的例外是 P0 已经完成的那几项修复。
4. **只做 expand 迁移**：新迁移从 `029_` 开始编号。`024`、`025` 已经被另一个未合并的分支占用，不要使用。不删表、不删列、不改列类型、不改名。所有删除和收缩只写进"contract 清单"文档，**不执行**。
5. **不改价格和限流的数值**：`backend/src/data/models.ts` 里的价格，以及任何限流数值，一律不要改。发现和官方不一致，只写进报告。
6. **出站 HTTP 只能走 `backend/src/services/outbound-url-policy.ts`**。`backend/src/` 下不允许出现裸的 `fetch(`，`test:outbound-url-policy` 有静态检查。需要新的出站目标时，在 policy 里加专用函数和主机白名单。
7. **测试必须兼容 pg-mem**：不要使用 `::float8`（用 `::double precision`）等 pg-mem 不支持的语法。写完就跑一遍。
8. **不要把密钥、`.env`、客户数据或请求正文写进仓库**。
9. 开始之前，先完整阅读 `WIKI.md`、`AGENTS.md`、`docs/control-plane-config-design.md`（目标设计，**本 spec 以它为准**）、`docs/MODEL_ONBOARDING.md`、`docs/production-release-runbook.md`。
10. 每个阶段结束时，至少跑一遍：`npx tsc --noEmit -p backend`，CI 里所有**不依赖真实 Postgres** 的测试，你新增的测试，前端的 `lint` 和 `build`。有依赖真实 Postgres 的测试，就把 PR 推上去让 GitHub CI 跑（CI 里有 Postgres 服务）。
11. 修改项目事实时，同步更新 `WIKI.md`。

---

## 1. 背景与已拍板的决策

完整背景见 `docs/control-plane-config-design.md`。核心结论：平台像 demo，根因是**"接入"写在代码里，而不是数据里**。目标是把**模型、上游账号（含配额池）、路由、流量策略**四类配置变成数据库里的数据：运维可以编辑，每次变更有审计，可以回滚。

| # | 决策（已由负责人拍板，不要再讨论） |
|---|---|
| D1 | 超限：对话类先换同模型的其他可用路由，都不行就**立即返回 429 + `Retry-After`**（不再返回 503）；视频等异步任务**进队列**，有队列长度上限和最长等待时间，超时释放预扣 |
| D2 | 参数与上游保持一致：**默认透传**，上游拒绝就原样转发上游的 400。平台只拦截"会改变费用或资源、而平台算不准的参数"（`billing_guarded`），返回 400 `unsupported_parameter` |
| D3 | 配置放数据库，后台编辑，变更单 → 校验 → 发布，每次发布生成一个版本，可回滚；每天导出 YAML 快照 |
| D4 | 接受第三方中转，但作为一等公民管理（`is_relay`、`relay_operator`、`data_path`、配额来源、联系人） |
| D5 | 权限：复用现有后台 RBAC（`backend/src/data/admin-access.ts`），新增 `traffic.manage`；变更单有审批步骤，**默认允许自己审批**，开关 `NF_CP_REQUIRE_SECOND_APPROVER=true` 时必须由另一个人审批 |
| D6 | **不做对话协议转换**：模型对外开放哪些对话协议，由它的路由上游原生支持、且探测通过的协议决定。图片、视频、语音的统一任务接口保留，对外定位为 NexusFlow 自有接口 |

### 1.1 已知事实（2026-09-25 审查所得，写代码时可以直接依赖）

- 生产版本是 `main@d110f44`。本分支在它之上已有提交 `ca95388`：熔断只统计上游故障并支持半开恢复、Claude tool_use 的参数不再被改写、两个 CLI 改走 `safeProviderFetch`、`::float8` 改为 `::double precision`、生产环境缺少 `PG_PASSWORD` 时拒绝启动。
- 生产有 2 个节点，每个节点 pm2 cluster 跑 2 个进程，共 4 个进程。**跨请求的状态必须放 Redis 或数据库**，不能只放进程内存。
- 模型接入目前有这些互不相通的路径，最终都要被 `cp_*` 取代：`data/models.ts`、`model_overrides`、`services/providers.ts`（前缀表和 `ensureRoutingDefaults` 的 if/else）、`cli/himodels-control.ts`、`cli/azure-astra-control.ts`、迁移 027/028、`utils/upstream-model-aliases.ts`、`utils/model-protocols.ts`、`utils/model-capabilities.ts`，以及 `routes/video.ts`、`routes/tasks.ts` 里靠 `apiBaseUrl.includes("genvia.ai")` 这种 URL 判断选协议的写法。
- 9 个入口路由（`v1.ts`、`messages.ts`、`responses.ts`、`image.ts`、`video.ts`、`audio.ts`、`tasks.ts`、`playground.ts`、`upload.ts`）各自重新实现了一遍"鉴权 → 限额 → 选路 → 预占 → 调用 → 结算 → 日志"。
- 生产的 `provider_capacity` 有 105 条，其中 81 条是硬编码的 `1000 rpm / 1M tpm / 100k 日限`。快照见 `backend/scripts/fixtures/bailian-2026-09-25/production-provider-capacity.json`。
- **百炼的限流是按"API Key × 模型"计算的，而且部分模型共享一个限流池**。例如 `rate-limit` 页里，kimi 的 5 个模型"同一个 API Key 下共享 500 RPM / 3,000,000 TPM"。所以配额必须支持**配额池（多个路由共享一份配额）**。
- 官方限流和生产配置不一致的例子：`glm-5.2` 官方是 500 RPM，生产配了 1000；`MiniMax/MiniMax-M3` 官方是 500 RPM / 20,000,000 TPM，生产配了 1000 / 1,000,000。
- 近 30 天走过协议转换（anthropic→openai 转换桥）的流量，只有 `MiniMax/MiniMax-M3`（55 次，2 个用户）和 `MiniMax-M2.7`（1 次）。

### 1.2 离线测试数据（都在 `backend/scripts/fixtures/bailian-2026-09-25/`，不要修改）

四个官方文档页的 HTML 快照、百炼 `/compatible-mode/v1/models` 的响应、生产 `provider_capacity` 和 `model_overrides` 的只读导出。详见该目录下的 `README.md`。你所在的环境可能访问不了阿里云和生产环境，**所有测试都必须只用这些离线数据**。

---

## 2. 全局工程约定

- **开关**（都放在 `backend/src/config/feature-flags.ts`，统一从环境变量读取，默认值必须是旧行为）：
  - `NF_CP_MODE=legacy|shadow|enforce`：配置从哪里读（P3）
  - `NF_TRAFFIC_MODE=legacy|shadow|enforce`：限流、超限处理和队列（P4）
  - `NF_PARAM_MODE=legacy|shadow|enforce`：参数透传与拦截（P5）
  - `NF_PROTOCOL_MODE=legacy|enforce`：D6，协议只开放原生支持的（P5）
  - `NF_CP_REQUIRE_SECOND_APPROVER=false`（P6）
  - `shadow` 的含义：**决策仍然按旧逻辑执行**，同时用新逻辑再算一遍，两者不一致时写结构化日志（`logToSLS`，`status:"shadow_diff"`），并累加一个 Redis 计数器（`nf:shadow:<area>:<yyyymmdd>`）。shadow 的计算失败时只能记日志，**绝不能影响请求本身**。
- **测试**：沿用仓库现有写法，即 `backend/scripts/test-*.ts` 加上 `package.json` 里的 `test:*` 脚本。每新增一个测试脚本，就把它加进 `.github/workflows/ci.yml`。
- **CI 结构调整**（P0 里做）：把 `validate` 这个 job 拆成几个并行的 job（例如 security、billing-routing、control-plane、release-scripts、frontend），让一个失败不再挡住其他测试。迁移账本检查继续保留。
- **迁移**：每个 `.sql` 文件幂等（`IF NOT EXISTS`），pg-mem 下能执行，并且能通过 `scripts/migrate-with-lock.mjs` 的 expand 门禁。
- **金额**用 `NUMERIC`，读出后按现有写法处理（参考 `002_money_numeric.sql` 和 `data/billing.ts`）。
- **通知**：定义接口 `backend/src/services/notifier.ts`，形如 `notify(event: {severity, kind, title, body, dedupeKey})`。默认实现只写日志。另外提供一个飞书**私聊**实现（通过配置 app id/secret 和接收人 open_id，调用飞书开放平台的发消息接口），默认关闭。**禁止使用任何群 webhook**。

---

## 3. 各阶段任务

### P0 安全网（部分已完成，其余在这里补齐）

已完成：`ca95388`（见 1.1）。这些不要回退，先跑一遍确认。

待做：
1. **发布前检查 CI**：`scripts/deploy-all-production.sh` 在开始任何动作之前，用 `gh api repos/{owner}/{repo}/commits/{sha}/check-runs`（或者 `curl` 加 `GITHUB_TOKEN`）确认目标 SHA 的 `ci` 工作流结论是 `success`，否则 `release_die`。
   - 保留一个显式参数 `--override-ci "<reason>"`，并通过现有的发布遥测记录下来。
   - 在 `scripts/test-release-primitives.sh` 或新的测试脚本里覆盖：CI 通过、CI 失败、CI 进行中、使用 override 四种情况，用桩函数模拟 `gh`。
   - 更新 `docs/production-release-runbook.md`。
2. **CI 拆分成并行 job**，见 §2。
3. **每日备份修复（只在仓库里准备好，由人安装）**：
   - 新增 `ops/cron/nexusflow-db-backup.cron`，里面显式写 `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`，并把输出重定向到 `/var/log/nexusflow/db-backup.log`。
   - 新增 `scripts/check-backup-freshness.sh`：最新的 `*.dump.age` 超过 26 小时，就以非零状态退出并打印原因，可以接上 notifier。
   - 在 runbook 里写清楚安装步骤。**不要自己去装**。
4. **迁移 runner 统一**：`backend` 里的 `npm run db:migrate` 改为调用 `scripts/migrate-with-lock.mjs`，删掉 `backend/src/db/migrate.ts` 里重复的实现，或者让它只做薄转发。然后新增 `029_schema_migration_checksums.sql`：给 `schema_migrations` 加一个可空的 `checksum` 列。runner 对已应用、且 checksum 为空的迁移回填 checksum；checksum 不为空、但和文件内容不一致时，直接失败。CI 的迁移账本检查也要覆盖这一点。
5. **发布备份门禁的价格手册解耦**：把 `deploy-all-production.sh:29-32` 里写死的 `13/10/7/6` 和 `provider-cost-release.mjs:8` 写死的 book id，改为从 manifest 自身读取（manifest 增加 `expected` 字段，并由 manifest 的签名或哈希保证完整）。这一步必须保持向后兼容：旧 manifest 没有 `expected` 字段时，退回到原来写死的值，并打印告警。补上对应测试。

验收：CI 全绿；新增的测试覆盖以上每一项。

### P1 一致性检查 + 百炼官方数据同步

**P1a 一致性检查**：新增 `backend/src/cli/control-plane-consistency.ts`，有两种运行方式：
- 离线：读静态目录和 fixtures 里的生产导出。
- 在线：直接读数据库。这一种只提供给人去运行。

检查规则（每条规则都要写测试）：
1. 可售模型没有启用中的路由。例如 fixtures 里的 `seedance-1.0-pro`、`seedance-1.0-pro-fast`、`seedance-1.5-pro`。
2. 路由指向目录里不存在的模型。例如 `MiniMax-M2.7`、`qwen3-tts-flash-realtime`、`claude-fable-5`、`claude-opus-4-7`。
3. 覆盖层条目和静态目录完全相同。例如 `glm-5.2-fast-preview`。
4. provider 的 `api_base_url` 不是合法 URL 却带着密钥。例如 id 为 `eab81421-…` 的那条。这一条需要读 `providers` 表，离线模式跳过，但要实现。
5. `supported` 能力串和 `model-capabilities.ts` 推导出的结果矛盾。例如 `deepseek-v4.1-flash` 声明了"联网搜索"，实际却不放行搜索参数。

输出：Markdown 加 JSON 报告，外加一份**清理 SQL（只生成，不执行）**，路径 `ops/sql/cleanup-<date>.sql`。每条语句前面用注释写明原因。清理 SQL 只能用 `UPDATE … SET is_enabled=false` 或者把状态改为 disabled，**不写 DELETE**。

**P1b 百炼官方数据同步**：新增 `backend/src/services/upstream-catalog/bailian/`，配套 CLI `backend/src/cli/bailian-catalog-sync.ts`。

1. **采集**：
   - `GET /compatible-mode/v1/models` 要处理分页（`has_more`、`last_id`）。
   - 3 个文档页：`rate-limit`、`model-pricing`、`models`。
   - 所有出站请求都走 outbound-url-policy。新增 `safeUpstreamCatalogFetch`，主机白名单只放 `help.aliyun.com` 和 `dashscope.aliyuncs.com`。
   - `--offline <dir>` 模式读取 fixtures（`.html.gz`）。
2. **解析**：
   - 必须**把 HTML 表格展开成二维网格**，正确处理 `rowspan` 和 `colspan`。可以使用成熟的 HTML 解析库（例如 `parse5` 或 `node-html-parser`），版本号写死，并确保 `npm audit --omit=dev --audit-level=high` 通过。
   - **地域从所在章节标题判断**：页面结构是 `h2/h3 模型族` 下面挂 `h4 地域`，地域例如"华北2（北京）""美国（弗吉尼亚）""新加坡""德国（法兰克福）""日本（东京）""中国香港"。表格里如果没有地域列，就取最近一个 `h4` 作为地域。地域统一归一成代码：`cn-beijing`、`us-east-1`、`ap-southeast-1`、`eu-central-1`、`ap-northeast-1`、`cn-hongkong`。
   - **识别共享配额池**：一个单元格如果 `rowspan>1`，并且文本里出现"共享"，就把这几行模型归到同一个池，池 id 取成员模型排序后的哈希。
   - "动态限流"这类非数字值，记为 `{ dynamic: true }`。
3. **快照结构**（写成 TypeScript 类型，并用 zod 校验）：
   `{ source, fetchedAt, pages: [{url, sha256}], models: { [id]: { listed: boolean, regions: { [region]: { rpm?, tpm?, dynamic?, poolId? } }, pricing?: {...}, contextLength?, maxOutput? } }, pools: { [poolId]: { region, rpm, tpm, members: [] } } }`
4. **自检**（任何一条不满足就以非零状态退出，并且**不产出结果**）：
   - 解析到的模型总数低于上次快照的 80%，或者低于某个下限（fixtures 下按实际数量设定）。
   - 以下断言在 fixtures 上必须成立，这些值由负责人在 2026-09-25 人工核对过：
     - `cn-beijing` 的 `glm-5.2` = 500 RPM / 2,000,000 TPM；
     - `deepseek-v4-flash` = 15,000 / 1,200,000；
     - `MiniMax/MiniMax-M3` = 500 / 20,000,000；
     - `kimi/kimi-k3` 属于一个 5 成员的共享池，500 RPM / 3,000,000 TPM。
   - 价格：解析结果必须和 `backend/scripts/verify-official-pricing.ts` 的 `REF` 表中所有重合的百炼模型一致（REF 是人工核对过的）。不一致时，报告里分成"解析器问题"和"REF 已过期"两类，**不要改 REF 去迁就解析结果**，除非你能从 fixtures 证明 REF 是错的，并在 PR 里列出证据。
5. **差异**：
   - 快照和上一次快照比（第一次运行没有上一次，就跳过）。
   - 快照和我们的配置比：静态目录的价格、上下文、最大输出；capacity fixtures 或数据库里的限流。
   - 差异分类：`price_mismatch`、`context_mismatch`、`limit_above_upstream`（危险）、`limit_below_upstream`、`pool_not_modeled`、`sold_but_not_listed`、`listed_not_sold`、`parse_warning`。
6. **产出**：
   - 在 fixtures 上跑一次，把报告提交到 `docs/upstream-sync/bailian-2026-09-25.md` 和 `.json`。
   - CLI 的 `--notify` 选项在有差异时调用 notifier。
   - **任何结果都不能自动写进配置**。

测试：`test:bailian-catalog`，完全离线运行，并加入 CI。

### P2 统一请求管线（纯重构，行为零变化）

1. **先写特征测试，再重构**。
   - 新增 `backend/scripts/test-inference-characterization.ts`，用 undici 的 `MockAgent` 或者本地假上游服务模拟上游。对 9 个入口的主要路径（流式和非流式、成功、上游 4xx、上游 5xx、超时、余额不足、QPM 超限、容量不足）记录"黄金结果"：发往上游的 URL、请求头（去掉密钥）、请求体，返回给客户端的状态码、响应头、响应体，写入的 `usage_logs` 行，预扣和结算金额，熔断计数的变化。
   - **这些测试必须先在未改动的代码上通过，再开始重构。**
2. **新增 `backend/src/pipeline/`**：
   - 定义 `InferenceContext` 以及这些阶段：`authenticate`、`resolveModel`、`checkModelAccess`、`reserveUserQuota`、`selectRoute`、`reserveProviderCapacity`、`reserveBilling`、`invokeUpstream`（协议相关的部分下放到 adapter）、`settle`、`logUsage`、`release`（放在 finally 里，保证一定执行）。
   - 阶段之间只通过 context 传递数据。每个阶段都可以单独测试。
3. **逐个迁移 9 个入口**，每迁完一个就跑一遍特征测试。
   - adapter 用显式枚举：`openai-compat`、`anthropic`、`dashscope-native`、`ark-video`、`azure-openai`、`pixverse`。
   - **删掉所有根据 URL 子串（`genvia.ai`、`volces.com`）判断协议的写法**，改为由 provider 或 account 的 `adapter` 字段决定。在 P3 之前，先由现有的 provider 数据推导出 adapter：写一张映射表，并给映射本身写测试。
4. 验收：
   - 特征测试全部通过，现有测试全部通过；
   - 9 个路由文件总行数明显下降；
   - 在 PR 里列出任何你认为是"原来的 bug、但为了行为零变化而保留"的地方。**不要顺手修**，只列出来。

### P3 `cp_*` 数据模型 + 影子读取（`NF_CP_MODE`）

1. **迁移**（`030_` 起），字段以设计文档 §2 为准：
   - `cp_models`
   - `cp_upstream_accounts`
   - `cp_quota_pools`（新增：`id, account_id, name, rpm, tpm, concurrency, daily, source, verified_at`）
   - `cp_routes`（`quota_pool_id` 可空，另有 `native_protocols text[]` 或 jsonb）
   - `cp_traffic_policies`
   - `cp_change_requests`
   - `cp_config_versions`（不可变，内容为 jsonb 快照，外加 `version`、`published_by`、`published_at`、`parent_version`）
   - `cp_route_probe_results`
2. **仓储层和运行时加载器** `backend/src/control-plane/`：
   - 按"当前版本号"整份加载到内存，并做 zod 校验；
   - 每 5 秒轮询版本号，版本变化时整体替换；
   - 加载失败时继续使用上一版并告警，**绝不能清空配置**。
3. **回填**：`backend/src/cli/control-plane-backfill.ts`，从旧数据源确定性地生成第一个版本：
   - 数据源：静态目录、`model_overrides`、`providers`、`provider_capacity`、`provider_channel_configs`、别名表、协议表、`ensureRoutingDefaults` 的分支逻辑。
   - `native_protocols` 按当前 `usePassThrough` 的判断逻辑推导。
   - 百炼配额池：如果有 P1b 的快照就用快照，并标记 `source=docs`；没有就沿用旧值，并标记 `source=legacy_default`。
   - 离线版本读 fixtures，在线版本读数据库，在线版本只提供给人去运行。
   - 同样的输入必须得到同样的输出。
4. **影子比对**：`NF_CP_MODE=shadow` 时，每个请求在管线的 `selectRoute`、`resolveModel` 和计费价格解析这几步，同时用旧逻辑和 cp 各算一次，把差异记下来。`enforce` 时只用 cp。
5. **发布校验**：设计文档 §3.2 的 6 条校验，外加 D6：模型开放的协议必须在它所有 active 路由的 `native_protocols` 里。每条都要有测试。
6. 验收：在 fixtures 上回填后跑影子比对，**差异为 0**，或者每一条差异都在 PR 里解释清楚。

### P4 流量：配额池、公平份额、超限行为、异步队列（`NF_TRAFFIC_MODE`）

1. **预占**，全部在一个 Redis Lua 脚本里原子完成：路由配额 → 配额池配额 → 该用户在这个池或这条路由上的份额（`fair_share.max_share_per_user`）。沿用 `rate-limiter.ts` 现有的租约和释放模型。
2. **对话超限**：依次尝试候选路由，全部失败就返回 **429**，错误码 `capacity_exhausted`，带 `Retry-After`（默认值取自策略）。响应格式分别和 OpenAI、Anthropic 的错误格式保持一致。
3. **上游 429**：解析 `Retry-After`。在这段时间里这条路由降权或跳过，状态存在 Redis，4 个进程共享。同时计入熔断。
4. **熔断参数**从 `cp_traffic_policies` 读取（`threshold`、`cooldown_s`、`count_http`），取代 `ca95388` 里用的环境变量。环境变量保留为兜底。
5. **异步队列**：
   - `async_tasks.status` 增加 `queued` 状态（expand）。
   - 调度 worker 用 `SELECT … FOR UPDATE SKIP LOCKED`，或者用 Redis 租约保证只有一个进程出队。
   - 规则：先进先出；每个用户最多占 N 个队列位置；队列有长度上限；最长等待时间默认 1800 秒，超时就让任务失败，并释放预扣费用。
   - 查询任务的接口要能返回 `queued` 状态和排队位置。
6. **用户默认限额**改为从策略读取。代码里的 `30000/5M` 和表默认值 `60/100000` 这两处现在互相矛盾，**迁移时保留生产当前的实际生效值**（以代码里的默认值为准），并写进 PR。
7. **shadow**：记录"如果按新规则执行，会拒绝、排队还是换路由"。**enforce** 才真正生效。
8. 测试：多进程下共享配额池（可以用两个 Redis 客户端模拟）、公平份额、换路由、429 的响应格式和 `Retry-After`、队列的先进先出和超时释放、Redis 不可用时失败关闭（沿用现有语义）。

### P5 参数、能力、协议（`NF_PARAM_MODE`、`NF_PROTOCOL_MODE`）

1. **参数（D2）**：
   - `enforce` 时透传客户参数，不再按白名单剥离。
   - 只保留 `billing_guarded` 清单：例如 `n`、`enable_search`、`search_options`、会让上游读取外部资源的参数。某个模型的计费配置能正确处理时，才放行对应参数，否则返回 400 `unsupported_parameter`。
   - 平台必须改写的参数（例如 `gpt-6-astra` 的 `max_tokens` → `max_completion_tokens`），以及必须固定的参数（`stream_options.include_usage=true`），做成数据驱动。
   - `shadow` 时，**只记录参数名，不记录参数值**，统计"旧逻辑会丢弃哪些参数"。
   - 新增 `scripts/analyze-dropped-params.mjs`，读取 SLS 导出或 `usage_logs`，按客户汇总这些参数名。这个脚本只提供给人去运行。
2. **能力**：
   - `cp_models.capabilities` 使用结构化字段（设计文档 §2.1）。
   - 回填时从 `model-capabilities.ts` 的现有推导结果生成，并把 P1a 发现的矛盾列进报告。
   - `/v1/models` 在 `enforce` 时直接输出结构化能力。
   - 展示用的中文能力串由结构化能力生成。
3. **探测**：
   - 新增 `backend/src/cli/route-probe.ts`：对每条 active 路由，按模型声明的协议和能力，各发一个最小请求（文本、工具调用、图片输入、思考开关），结果写入 `cp_route_probe_results`，和声明不一致时通知。
   - 测试用 mock 上游。真实运行只提供给人去执行。
4. **协议（D6）**：
   - `NF_PROTOCOL_MODE=enforce` 时，模型只开放 `native_protocols` 里的协议。其他协议返回 400 `unsupported_protocol`，并在错误信息里提示可用的协议。
   - `/v1/messages` 的转换分支在 enforce 时不再进入。
   - **转换代码 `anthropic-openai-bridge.ts` 先不删**，写进 contract 清单。

### P6 后台：变更单、版本、回滚、上线流程、快照导出

1. **后端 API**，挂在现有的 `routes/admin-control-plane.ts` 下，沿用 `requirePermission` 和审计：
   - 变更单：创建、查看 diff、校验（跑 §3.2 的全部校验）、审批（受 D5 开关约束）、发布（生成新版本）、驳回；
   - 版本：列表、对比任意两个版本、回滚（回滚本身也会生成一个新版本）；
   - 实体的增删改只能通过变更单进行，**没有直接修改数据的接口**。
2. **模型上线流程**（设计文档 §5）：草稿 → 自动校验（包括和 P1b 快照的价格比对）→ 真实探测（调用 P5 的探测器）→ `preview`（只对白名单用户可见、可调用）→ `active`；下线流程是 `deprecated` → `retired`（`retired` 的模型返回 404，并提示替代模型）。
3. **前端**：在 `frontend/app/admin` 下新增"控制面"模块（参考现有的 `ModelCatalogManager.tsx` 和 `features/admin` 的写法），包括：
   - 模型、上游账号与配额池、路由、策略的列表和编辑页，每次编辑生成一张变更单；
   - 变更单 diff 视图、版本历史和回滚；
   - 百炼差异报告视图（读 P1b 的产出）；
   - 探测结果视图。
   - 新权限 `traffic.manage` 要加进角色映射。
4. **快照导出**：新增 `backend/src/cli/control-plane-export.ts`，把当前版本导出成 `config/snapshots/*.yaml`，格式稳定，按 id 排序。提供 cron 模板，只提供给人去安装。
5. **CLI 收编**：`himodels-control` 和 `azure-astra-control` 改为生成变更单，不再直接写表。旧的写表行为只在 `NF_CP_MODE=legacy` 时保留。
6. **contract 清单**：新增 `docs/control-plane-contract-checklist.md`，列出 enforce 稳定后才能删除的内容，每一项都写明删除的前置条件：
   - 代码：`ensureRoutingDefaults`、URL 判断协议的逻辑、`anthropic-openai-bridge.ts`、`model-capabilities.ts` 的关键词推导、`upstream-model-aliases.ts`、`anthropicPassThrough`；
   - 表：`model_overrides`、`provider_models`、`provider_capacity`；
   - 两个 CLI 的旧路径。

---

## 4. 最终交付

1. 分支 `feat/config-control-plane`，每个阶段至少一个提交，提交信息以 `P0:`、`P1:` …… 开头。
2. **一个 Draft PR 指向 `main`**，描述里包含：
   - 各阶段的完成清单，每一项附上对应的测试名；
   - CI 结果；
   - **上线手册**：按顺序写清楚每一步由谁执行、执行什么命令、怎么验证、怎么回滚。顺序是：部署（全部开关都是 legacy）→ 跑迁移 → 在线回填 → `NF_CP_MODE=shadow` 观察 → `enforce` → `NF_TRAFFIC_MODE` 同样先 shadow 再 enforce → `NF_PARAM_MODE` 先 shadow，统计后通知客户，再 enforce → `NF_PROTOCOL_MODE=enforce`（之前要先通知 MiniMax-M3 的 2 个用户）→ 执行 contract 清单；
   - **需要人做的事**：安装备份 cron、在线执行一致性检查和清理 SQL、在线回填、核对百炼控制台的实际配额和提额情况、提供 HiModels/jawayid/genvia/Azure 的配额、配置飞书私聊通知；
   - **未决事项**：你做过的所有假设。
3. 更新文档：`WIKI.md`、`docs/MODEL_ONBOARDING.md`（改成走控制面流程的版本）、`docs/control-plane-config-design.md`（状态改为"实现中"，并链接到 PR）。

## 5. 完成标准（全部满足才算完成）

- [ ] 开关全部为默认值时，特征测试证明 9 个入口的行为和 `d110f44` + `ca95388` 完全一致
- [ ] CI 全绿，包括新加的并行 job 和真实 Postgres 的测试
- [ ] fixtures 上：回填 → 影子比对差异为 0，或者每条都有解释
- [ ] P1b 的断言全部成立；差异报告已提交
- [ ] 没有任何生产操作，没有提交任何密钥，没有合并 PR
