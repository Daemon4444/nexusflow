# NexusFlow 配置化控制面：目标设计

- 状态：**草案，待评审**。本文档不涉及任何上线动作。
- 日期：2026-09-25
- 前置文档：2026-09-25 工程成熟度审查（Obsidian「nexusflow 工程成熟度审查 2026-09-25」）

## 0. 要解决的问题

审查的结论是：平台像 demo，根因只有一个，**"接入"写在代码里，而不是数据里**。上线模型、设置限流、决定参数是否放行，都要工程师改代码、再发版。

本设计把四样东西变成**运维可以编辑、每次变更有审计、可以回滚**的数据：

| 实体 | 回答的问题 |
|---|---|
| **模型 Model** | 我们卖什么：价格、能力、参数规则、生命周期 |
| **上游账号 UpstreamAccount** | 我们从哪里买：协议适配器、地址、密钥、是否经过中转、**账号级的真实配额** |
| **路由 Route** | 某个模型由哪个上游账号提供：上游侧的模型名、优先级、备用线路、路由级配额 |
| **流量策略 TrafficPolicy** | 怎么分配容量：用户默认限额、单个用户最多能占的份额、超限行为、熔断参数 |

---

## 1. 已拍板的决策（2026-09-25）

| # | 决策 | 在本设计中的落地方式 |
|---|---|---|
| D1 | **超限处理：对话类立即拒绝，视频/异步任务进队列** | 对话：先在同一模型的其他可用路由里选一条（这一步不增加延迟）；都满了就立即返回 **429**，带 `Retry-After`，不再返回 503。异步任务：进入 `queued` 状态，等有容量时再提交给上游，并设置队列长度上限和最长等待时间，超时就让任务失败并释放预扣的费用 |
| D2 | **不支持的参数一律返回 400** | 统一错误码 `unsupported_parameter`，错误信息里列出具体参数名。**必须分阶段上线**：先开影子模式统计会被拒的请求，逐个通知受影响的客户，然后再强制执行（见 §6 的 P5） |
| D3 | **配置放数据库，后台编辑，定期导出快照进仓库** | 所有变更都走"变更单 → 校验 → 发布"，每次发布生成一个配置版本；回滚就是重新发布旧版本；每天导出 YAML 快照提交到仓库，用于对比差异和灾备 |
| D4 | **接受第三方中转，但把它当一等公民管理** | 上游账号上有这些字段：`is_relay`、`relay_operator`、`data_path`、`quota_source`、`contract_ref`；中转账号必须指定联系人；数据结构不预设"只有官方直连" |
| D5 | 谁有权改（**待确认，先按默认方案**） | 复用现有的后台权限：改价格和上下线需要 `catalog.manage`，改上游和路由需要 `providers.manage`，改限流需要新权限 `traffic.manage`。变更单保留"审批"这一步，**现在允许提交人自己审批**；将来可以通过一个开关改成"必须由另一个人审批"，不用改代码 |

**D2 待确认的一点**：有些参数纯粹是元数据，对任何模型都没有副作用，例如 OpenAI 的 `user`、`metadata`。建议把它们列入一张**"接受但忽略"清单**，清单写进文档，其余一律 400。否则用标准 SDK 的客户会被误伤。

---

## 2. 数据模型（字段级草案）

原则：
- 每一类信息只有**一个事实源**。
- 所有表的写入只经过"配置发布"这一个入口。
- 运行时读的是内存里某个**已发布版本**的快照。

### 2.1 `cp_models`：模型目录（取代 `data/models.ts` 和 `model_overrides`）

```yaml
id: qwen3.8-max                 # 对外的模型 ID
lifecycle: draft | preview | active | deprecated | retired
display: { name, family, provider_label, description, tags, category, featured }
limits:  { context_length, max_output, default_output_reservation }
pricing:                        # 与 models.ts 现有结构一一对应，迁移时直接搬
  type: token | per-image | per-second | per-10k-characters
  prompt, completion, cache_read, cache_read_explicit, thinking_completion
  audio_input, audio_output
  token_tiers: [...]
  media_tiers: [...]
  source_url, verified_at       # 官方价格出处和核对时间
protocols: [openai.chat, anthropic.messages, openai.responses, ...]   # 本平台对外开放的协议
capabilities:                   # 结构化字段，取代"从描述文字里找关键词"
  input:  { text, image, video, audio, file }
  output: { text, audio }
  tools: { supported, parallel }
  thinking: { mode: none|mixed|always, default_on, budget, preserve, control: enable_thinking|thinking_object }
  search: bool
  caching: { implicit, explicit }
  structured_output: bool
param_rules: <见 §4>
```

"展示用的中文能力串"（比如"函数调用""图像输入"）改为**由 `capabilities` 生成**，不再单独维护。

### 2.2 `cp_upstream_accounts`：上游账号（取代 `providers` 和 `provider_channel_configs` 里的渠道部分，以及 `services/providers.ts` 里的前缀表）

```yaml
id: dashscope-cn-main
vendor: aliyun-bailian            # 模型实际来自哪家
adapter: openai-compat | anthropic | dashscope-native | ark-video | azure-openai | pixverse
                                  # 显式枚举，取代"看 URL 里有没有 genvia.ai"
base_url, native_base_url, anthropic_base_url
auth: { scheme: bearer | x-api-key | api-key, secret_ref }   # 密钥继续用 PROVIDER_SECRET_KEY 加密存储
region
is_relay: false
relay_operator: null              # 例如 jawayid / genvia / himodels
data_path: "客户数据 → 本平台 → 阿里云百炼"      # 写进隐私政策的依据
quota:                            # 账号级配额：同一账号下所有模型共享
  rpm, tpm, concurrency, daily
  source: console | contract | observed | unverified
  verified_at
status: active | draining | disabled
owner, contract_ref, contact
```

### 2.3 `cp_routes`：路由（取代 `provider_capacity`、`ensureRoutingDefaults` 里的 if/else、`upstream-model-aliases.ts`、`isProviderModelCompatible`）

```yaml
model_id: claude-sonnet-5
account_id: himodels-main
upstream_model_id: claude-sonnet-5-aws     # 别名表并入这里
protocol_mode: passthrough | bridge        # 取代 anthropicPassThrough
priority: 100
weight: 100
quota:                                     # 可选，路由级的额外上限；实际上限取它和账号配额中更小的那个
  rpm, tpm, concurrency, daily
status: active | standby | disabled
```

### 2.4 `cp_traffic_policies`：流量策略

```yaml
scope: global | model:<id> | model_type:chat|async | user:<id>
user_default: { qpm, tpm }                # 取代代码里的 30000/5M 和表默认值 60/100000（这两处现在就互相矛盾）
fair_share: { max_share_per_user: 0.3 }   # 单个用户最多占用某条路由或某个账号容量的 30%
overflow:
  chat:  { behavior: failover_then_reject, retry_after_s: 5 }
  async: { behavior: queue, max_queue_depth: 200, max_wait_s: 1800 }
circuit:
  count_http: [5xx, 401, 403, 408, 429]   # 与 ca95388 里已实现的分类一致
  threshold: 10
  cooldown_s: 60
  half_open_probes: 1
```

### 2.5 `cp_config_versions` 和 `cp_change_requests`：变更与版本

- 变更单：`draft → validated → approved → published`，或者 `rejected`。每张变更单包含 `diff`、`author`、`approver`、`reason`，以及它影响的模型和路由。
- 发布时写入一个不可变的 `config_version`，内容是这次发布后四类实体的完整快照。运行时只读取"当前版本号"对应的快照。
- 回滚 = 选中一个旧版本再发布一次，同样会生成一个新版本和一条审计记录。
- 每天把当前版本导出成 `config/snapshots/*.yaml` 提交到仓库。只有 CI 往仓库写，**仓库里的快照不会反向写回数据库**。

---

## 3. 运行时

### 3.1 配置加载

- 每个节点把当前版本快照整体加载到内存（大约几百条记录）。版本号每 5–10 秒轮询一次，或者通过 Redis pub/sub 通知。版本号变了才重新加载，并且整份替换，不会出现新旧混用。
- 目的是把**每个请求的配置查询从现在的 6–10 次数据库往返降到 0 次**。容量计数仍然走 Redis。

### 3.2 发布前的校验（没通过就不能发布）

1. 状态为 `active` 或 `preview` 的模型，至少要有一条 `active` 路由，而且它所属的上游账号也是 `active`。这样就不会再出现"目录里有，却调不了"。
2. 路由的 `model_id` 必须存在，`account_id` 必须存在；路由选用的适配器必须支持该模型声明的所有协议。
3. 价格不能是负数；阶梯价按上限单调递增，最后一档要覆盖整个上下文长度。
4. `capabilities` 和 `param_rules` 不能互相矛盾，比如 `tools.supported=false` 却放行了 `tools` 参数。
5. 中转账号必须填写 `relay_operator` 和 `data_path`。
6. 配额来源是 `unverified` 的账号可以发布，但后台会一直显示警告。

### 3.3 限流执行顺序（对应 D1）

```
请求进来
 → 用户或 key 的 QPM/TPM 检查（按 user_default 和个性化覆盖）
     超限 → 429 user_rate_limit
 → 选路：按 priority 和 weight 排序，过滤掉 disabled 和熔断中的路由
 → 对选中的路由依次预占：路由级配额 → 账号级配额 → 该用户在这条路由上的份额
     成功 → 发给上游
     失败 → 对话类：换下一条候选路由；全部失败 → 429 capacity_exhausted + Retry-After
            异步类：任务进入 queued，由调度器在有容量时提交
 → 上游返回 429 → 读 Retry-After，这条路由在该时间内降权，并计入熔断
```

要点：
- **账号级配额是新增的核心**。现在 HiModels 的 5 个 Claude 模型各有 1000 rpm，合计 5000，永远拦不住账号层面的 429。
- `fair_share` 保证单个用户吃不满共享容量。

### 3.4 异步队列（对应 D1）

- `async_tasks.status` 增加一个 `queued` 状态（expand 迁移），调度器按"先进先出，同时限制每个用户能占的队列位置"出队。
- 进入队列时就预扣费用，出队提交失败或排队超时则释放。现有的预扣和结算机制可以复用。

---

## 4. 参数规则（对应 D2）

每个模型、每种协议对应一组规则。**对外只有"放行 / 400"两种结果**，但放行之前可以做映射：

```yaml
param_rules:
  openai.chat:
    allow: [temperature, top_p, max_tokens, stop, tools, tool_choice, response_format, enable_thinking, ...]
    rename: { max_tokens: max_completion_tokens }   # 取代 chat-request.ts 里对 gpt-6-astra 的特判
    clamp:  { max_tokens: { max: "@limits.max_output" } }
    fixed:  { stream_options.include_usage: true }
    accept_and_ignore: [user, metadata]             # 见 D2 待确认的一点
  anthropic.messages:
    allow: [...]
```

- 默认规则**由 `capabilities` 生成**，例如 `tools.supported=true` 就自动放行 `tools` 和 `tool_choice`。人工只需要写例外。
- 请求里出现不在 `allow` 里、也不在 `accept_and_ignore` 里的参数，就返回 400：
  `{"error":{"code":"unsupported_parameter","param":"enable_search","message":"Model 'deepseek-v4.1-flash' does not support 'enable_search'."}}`
- `/v1/models` 对外返回的 `capabilities` 和 `allowed_parameters` 直接来自这组数据，**展示和实际执行用的是同一份**。
- **持续校验**：定时任务对每条 `active` 路由，按模型声明的能力发最小探测请求（工具调用、图片、思考开关），结果写入 `route_probe_results`，和声明不一致时告警。把 `himodels-control verify` 的思路推广成通用能力。

---

## 5. 上线一个模型的新流程

1. **草稿**：在后台新建模型，可以从官方模型卡填入价格、上下文长度和能力，然后选择或新建路由。
2. **自动校验**：执行 §3.2 的全部检查，再检查价格和官方价格来源是否一致（沿用 `verify-official-pricing` 的逻辑）。
3. **真实探测**：系统用这条路由对每种声明的协议和能力各发一次最小请求，并记录用量和计费是否按预期计算。探测不过不能进入下一步。
4. **灰度**：模型状态设为 `preview`，只对内部账号或指定客户可见、可调用。
5. **全量**：状态改为 `active`。每一步都是一张变更单，都有审计记录。
6. **下线**：先设为 `deprecated`（目录里显示下线日期，照样可以调用），再设为 `retired`（返回 404，带替代模型提示）。

现在分散在 `docs/MODEL_ONBOARDING.md` 里的 8 条"踩坑清单"，大部分会变成第 2、3 步的自动检查。

---

## 6. 迁移计划（每个阶段都能单独发布、单独回滚，对用户零可见变化，除非特别说明）

| 阶段 | 内容 | 用户能感知到的变化 | 验证方式 |
|---|---|---|---|
| **P0** | 分支 `fix/safety-net-20260925`（ca95388）：熔断可恢复、工具参数不再被改写、CI 恢复绿色、数据库密码缺失时拒绝启动。另外：修 cron 的 PATH、给备份加新鲜度告警、发布前检查 CI 是否通过 | 熔断器会自动恢复；Claude 工具调用的参数不再被改写 | CI 全绿，生产只读核对 |
| **P1** | 一致性检查脚本加 CI 门禁，清理生产上的孤儿路由、测试 provider、多余的覆盖条目（写生产前逐条确认） | 无 | 脚本输出为空 |
| **P2** | **统一请求管线**：9 个入口共用"鉴权 → 限额 → 选路 → 预占 → 调用 → 结算"这一条流水线，协议差异只保留在适配器里。只重构，行为不变 | 无 | 现有测试 + 录制回放对比 |
| **P3** | 新建 `cp_*` 表（expand），从现有数据源回填；运行时**影子读取**新模型，对每个请求比较新旧两套选路和计费的结果，结果不一致就记录下来 | 无 | 影子比对连续 N 天  0 差异 |
| **P4** | 切换为从 `cp_*` 读取；限流改为账号级配额 + fair_share；对话超限改为 429 + Retry-After；异步任务支持排队 | 超限时返回 429 而不是 503；视频高峰期会排队 | 灰度一个模型 → 全量 |
| **P5** | 参数规则：先开**影子模式**（只记录"如果强制会返回 400"的请求，按客户汇总）→ 通知受影响的客户 → 强制执行 | 不支持的参数返回 400 | 影子期统计报表 |
| **P6** | 后台的变更单、版本、回滚界面，每日快照导出；删除旧路径：各家 CLI 里的硬编码、`ensureRoutingDefaults`、`model_overrides`、`provider_models`（contract 迁移） | 无 | 旧代码删除后 CI 全绿 |

依赖关系：P2 是 P4 和 P5 的前提，否则每项改动都要在 9 个入口各改一遍。P3 的影子比对是整个切换的安全网。

---

## 7. 需要你提供或确认的信息

1. **每个上游账号的真实配额**：
   - 百炼：控制台里各模型的 RPM/TPM。
   - HiModels、jawayid、genvia：合同或口头约定的配额。
   - Azure：deployment 的 TPM。
   没有的就标成 `unverified`，按保守值运行。
2. **异步队列参数**：视频任务最多排多久算超时（草案是 30 分钟）；单个用户最多能占多少个排队位置。
3. **D2 的"接受但忽略"清单**：`user`、`metadata` 是否可以放进去。
4. **D5 审批**：现在是否就需要"另一个人审批"，还是先允许自己审批。
5. **隐私政策**：中转方和数据路径是否要在对外的隐私政策里列明。
