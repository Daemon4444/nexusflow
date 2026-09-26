# NexusFlow 文档索引

先读根目录 [`WIKI.md`](../WIKI.md)（项目全景和唯一事实入口），再按任务从下表找专项文档。
事实冲突时的优先级见 WIKI §2：生产探针 > 代码与迁移 > WIKI > 本目录 > 历史快照。

## 按任务找文档

| 我要做什么 | 读哪份 |
|---|---|
| 发布到生产 | [production-release-runbook.md](production-release-runbook.md)，再过 [release-regression-test-checklist.md](release-regression-test-checklist.md) |
| 上线新模型 / 改价格 / 改路由 | [MODEL_ONBOARDING.md](MODEL_ONBOARDING.md)（控制面 enforce 后走后台变更单） |
| 推进控制面开关 | [control-plane-rollout-runbook.md](control-plane-rollout-runbook.md)；删除旧代码前看 [control-plane-contract-checklist.md](control-plane-contract-checklist.md) |
| 压测 / 评估容量 | [load-testing.md](load-testing.md) |
| 导入上游成本价本 | [provider-cost-price-book.md](provider-cost-price-book.md) |
| 支付接入 | [PAYMENT_SETUP.md](PAYMENT_SETUP.md) |
| 理解业务与历史故障（Agent 用） | [AGENT_PROJECT_MEMORY.md](AGENT_PROJECT_MEMORY.md) |

## 全部文档

状态含义：**现行** = 按它执行；**进行中** = 计划/实施尚未结束；**已完成** = 设计已落地，仅供理解缘由；**快照** = 某个时间点的记录，不代表现状；**归档** = 已失效，只留作历史。

### 操作手册（根目录）

长期有效、按步骤执行的文档放在根目录。它们被代码、提示词和记忆按路径引用，**不要移动**。

| 文档 | 状态 | 内容 |
|---|---|---|
| [production-release-runbook.md](production-release-runbook.md) | 现行 | 双节点不可变发布：摘流、备份恢复门禁、迁移、回滚 |
| [release-regression-test-checklist.md](release-regression-test-checklist.md) | 现行 | 发布回归用例（账号、计费、限流、协议、前端） |
| [release-telemetry.md](release-telemetry.md) | 现行 | 发布事件与节点事实的记录契约 |
| [MODEL_ONBOARDING.md](MODEL_ONBOARDING.md) | 现行 | 新模型上线全流程与历史踩坑 |
| [control-plane-rollout-runbook.md](control-plane-rollout-runbook.md) | 现行 | 控制面开关逐步上线（shadow → enforce） |
| [control-plane-contract-checklist.md](control-plane-contract-checklist.md) | 现行 | enforce 稳定后才能删除的旧代码/表 |
| [load-testing.md](load-testing.md) | 现行 | 压测安全规则、流程、判读、基线与改进建议 |
| [provider-cost-price-book.md](provider-cost-price-book.md) | 现行 | 上游成本价本的来源、版本与导入 |
| [PAYMENT_SETUP.md](PAYMENT_SETUP.md) | 现行 | 支付模块接入与配置 |
| [AGENT_PROJECT_MEMORY.md](AGENT_PROJECT_MEMORY.md) | 现行 | 给代码 Agent 的业务与生产边界长期记忆 |
| [overseas-region-deployment-todo.md](overseas-region-deployment-todo.md) | 进行中 | 海外区域上线清单（等待海外区域 Key） |

### 设计与规格 `specs/`

| 文档 | 状态 | 内容 |
|---|---|---|
| [specs/control-plane-config-design.md](specs/control-plane-config-design.md) | 已完成 | 配置化控制面目标设计（D1–D6 决策） |
| [specs/control-plane-implementation-spec.md](specs/control-plane-implementation-spec.md) | 已完成 | 控制面分阶段实施规格（P0–P6） |
| [specs/sub-accounts-spec.md](specs/sub-accounts-spec.md) | 已完成 | 主账号/子账号体系 |
| [specs/whole-site-reliability-ux-spec-2026-07-21.md](specs/whole-site-reliability-ux-spec-2026-07-21.md) | 已完成 | 2026-07 整站可靠性与体验迭代 |

### 记录 `records/`

上线、迁移、压测的过程与证据，按时间点记录，不随代码更新。

| 文档 | 状态 | 内容 |
|---|---|---|
| [records/2026-09-26-production-load-test.md](records/2026-09-26-production-load-test.md) | 快照 | 生产压测：单账号 48 rps 上限、行锁瓶颈、对账 |
| [records/kimi-k3-jaway-migration-record.md](records/kimi-k3-jaway-migration-record.md) | 快照 | Kimi K3 切换 jaway 上游 |
| [records/qwen3.8-max-onboarding-record.md](records/qwen3.8-max-onboarding-record.md) | 快照 | qwen3.8-max 接入与计费修正 |
| [records/qwen3.7-flash-minimax-m3-onboarding-record.md](records/qwen3.7-flash-minimax-m3-onboarding-record.md) | 快照 | qwen3.7-flash 与 MiniMax-M3 接入 |

### 归档 `archive/`

| 文档 | 状态 | 内容 |
|---|---|---|
| [archive/admin-billing-deployment-todo.md](archive/admin-billing-deployment-todo.md) | 归档 | 2026-05 后台折扣与账单导出部署清单（已上线） |
| [archive/admin-rate-limit-deployment-todo.md](archive/admin-rate-limit-deployment-todo.md) | 归档 | 2026-05 后台限流管理部署清单（已上线） |
| [archive/release-todo-2026-08-03.md](archive/release-todo-2026-08-03.md) | 归档 | 2026-08-03 发布 TODO（涉及模型均已上线） |

### 参考资料与工具产出

这些目录由 CLI 生成或原样存档，**不要手工编辑**；需要更新就重新运行对应工具。

| 目录 | 来源 |
|---|---|
| [pricing/](pricing/) | 百炼官方模型目录原样存档（[bailian-official-model-catalog-2026-08-03.md](pricing/bailian-official-model-catalog-2026-08-03.md)） |
| [upstream-sync/](upstream-sync/) | `bailian-catalog-sync` 的差异报告与快照 |
| [consistency/](consistency/) | `control-plane:consistency` 的离线报告（在线报告不入库） |
| [control-plane/](control-plane/) | `control-plane:backfill` 的离线回填报告 |

根目录另有若干历史快照（`REVIEW_SPEC_2026-07.md`、`OPTIMIZATION_SPEC.md`、`PRODUCTION_REVIEW.md`、`ISSUES.md` 等），只用于理解缘由，不代表现状。

## 写文档的规则

1. **放哪**：可重复执行的流程放根目录（操作手册）；设计和规格放 `specs/`；一次性的过程和证据放 `records/`，文件名以日期开头；失效的放 `archive/`，并在文件顶部加归档说明。
2. **头部**：新文档第一段放一张小表：类型、状态、最后核实日期、相关文档。
3. **登记**：新增、移动或改状态时同步更新本索引。CI（`npm run test:docs-index`）会检查 `docs/` 下每份 Markdown 都在本索引里、索引里每个链接都存在。
4. **移动文件**：用 `git mv`，并全仓替换旧路径；**已执行的迁移文件（`backend/src/db/migrations/`）里的注释永远不改**，它们有校验和，改了会让发布门禁失败。
5. **事实变化**：架构、运维、协议、计费、安全的事实变了，同一个变更里同步更新 `WIKI.md`。
6. **不写秘密**：`.env`、API Key、私钥、Cookie、客户数据、请求正文都不能进文档。
