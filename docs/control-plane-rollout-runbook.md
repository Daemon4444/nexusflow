# 配置化控制面上线手册

对应 PR：https://github.com/Daemon4444/nexusflow/pull/1 ；设计见 `docs/specs/control-plane-config-design.md`，
规格见 `docs/specs/control-plane-implementation-spec.md`，上线后可删除的旧东西见
`docs/control-plane-contract-checklist.md`。

## 原则

- **合并即安全**：五个开关默认全是旧行为（`NF_CP_MODE` / `NF_TRAFFIC_MODE` / `NF_PARAM_MODE` = `legacy`，
  `NF_PROTOCOL_MODE=legacy`，`NF_CP_REQUIRE_SECOND_APPROVER=false`）。只部署代码、不改开关时，9 个入口与旧版
  逐字节一致（`test:inference-characterization`，51 个场景）。
- 每一步只动一个开关；每一步都能在 5 分钟内退回上一步（改回上一个值 + `pm2 reload`）。
- 开关写在两台节点的 `backend/.env`，两台必须一致；改完 `pm2 reload` 两台。
- 观察期看两样东西：SLS 里 `status:"shadow_diff"` 的日志，和 Redis 计数 `nf:shadow:<area>:<yyyymmdd>`
  （area：`cp_resolve_model`、`cp_pricing`、`cp_select_route`、`traffic`、`params`）。
- “Ops”= 有生产权限的运维；“审批人”= 有 `traffic.manage` 的后台管理员（operator/admin 角色）。

## 0. 上线前（合并前后都可以做）

| 检查 | 怎么做 |
|---|---|
| PR CI 全绿 | PR 页面 5 个 job（security、billing-routing、control-plane、release-scripts、frontend）全部通过 |
| 合并后 `main` 的 CI 全绿 | 发布脚本的 CI 门禁（`scripts/check-release-ci.sh`）会拒绝没有绿色 CI 的 SHA；紧急情况才用 `--override-ci <原因>` |
| 备份可用 | `scripts/check-backup-freshness.sh` 通过；若还没装每日备份 cron，先按 `ops/cron/nexusflow-db-backup.cron` 文件头安装 |
| 预留编号 | `024`/`025` 仍保留给并行分支；本次新增 `029`–`032` |

## 1. 部署代码（开关全部 legacy），迁移随部署自动执行

- **执行人**：Ops
- **命令**：按 `docs/production-release-runbook.md` 第 6 节正常发布（`scripts/deploy-all-production.sh`）。
  脚本顺序是：CI 门禁 → 安装制品 → 发布前 `migrate-with-lock.mjs --check-only` 预检 → 强制备份并做恢复校验
  → 在咨询锁下**一次性执行迁移 `029`–`032`** → 滚动切流量。不需要单独跑迁移。
  - `029` 给 `schema_migrations` 加 `checksum` 列，并为已应用的旧迁移回填校验和；
  - `030`/`031` 新建 `cp_*` 表（空表，旧代码不读）；
  - `032` 给 `async_tasks` 加三个可空列（`queued_at`、`queue_deadline_at`、`queue_request`）和一个索引。
  全部是 expand（`IF NOT EXISTS`、只加不删），旧版本代码照常运行。
- **验证**：
  - `/health` 正常；按 `docs/release-regression-test-checklist.md` 过一遍；
  - `SELECT filename, checksum IS NOT NULL AS has_checksum FROM schema_migrations ORDER BY filename;`
    包含 `029`–`032`，且所有行都有 checksum；
  - 日志里没有 `shadow_diff`（开关未开）；后台出现「配置控制面」菜单（`/admin/config`，此时显示“未发布”）。
- **回滚**：按发布手册回滚到上一个 release。迁移是 expand-only，**不回滚表结构**，上一个版本不读新列/新表。

## 2. 一致性检查 + 清理（只读 + 人工确认）

- **执行人**：Ops 执行，负责人确认
- **命令**：`npm --workspace backend run control-plane:consistency -- --online --write`
- **产出**：`docs/consistency/consistency-online-<日期>.{md,json}` 和 `ops/sql/cleanup-<日期>.sql`（只包含禁用类
  UPDATE，脚本**不会执行**它）。
- **需要人决定**：逐条审阅 SQL 后再手工执行；特别是 3 个 Seedance 模型（在售但没有启用的路由）是下线还是补路由。
- **回滚**：清理 SQL 只做禁用，按报告反向 UPDATE 即可。

## 3. 在线回填（生成控制面版本 1，不影响线上）

- **执行人**：Ops
- **命令**：
  1. 先 dry-run（只读）：
     `npm --workspace backend run control-plane:backfill -- --online --bailian-snapshot docs/upstream-sync/snapshots/<最新>.snapshot.json`
  2. 看报告：“影子比对”应为零差异，或每条差异都能解释；校验错误只允许已知的旧问题。
  3. 写入：`... --online --apply --published-by <你的邮箱> [--allow-check model_has_active_route]`
     （`--allow-check` 只在第 2 步还没处理 Seedance 时需要）。只有当前还没有任何版本时才能写入。
- **验证**：`SELECT version, kind, published_by FROM cp_config_versions;` 有 1 行 `backfill`；后台「配置控制面」
  显示“当前版本 v1”。
- **回滚**：开关仍是 legacy，版本不被读取；不满意就在后台用变更单发布修正版本。

## 4. `NF_CP_MODE=shadow`（观察 ≥ 3 天）

- **执行人**：Ops
- **操作**：两台 `.env` 加 `NF_CP_MODE=shadow`，`pm2 reload`。
- **验证**：日志出现 `控制面模式 shadow，已加载版本 1`；后台显示“本节点已加载 v1”；每天看
  `redis-cli GET nf:shadow:cp_resolve_model:<yyyymmdd>`、`cp_pricing`、`cp_select_route`，应为 0 或每条可解释
  （SLS 查 `status:"shadow_diff"` 看明细）。
- **回滚**：改回 `legacy` + reload。

## 5. `NF_CP_MODE=enforce`

- **操作**：改为 `enforce` + reload。
- **验证**：回归清单；`/v1/models` 模型数量与切换前一致；错误率、延迟无变化。
- **回滚**：改回 `shadow` + reload（立即生效）。
- 从这一步起，模型/路由/价格的修改都走后台「配置控制面」的变更单（见 `docs/MODEL_ONBOARDING.md` §0.5）。

## 6. `NF_TRAFFIC_MODE=shadow`（观察 ≥ 3 天）→ `enforce`

- **shadow 验证**：`nf:shadow:traffic:<yyyymmdd>` 与 SLS 明细，看新规则下会被 429、排队、换路由的量是否可以接受；
  不合适就在后台调整配额池 / 公平份额 / 策略（变更单）。
- **enforce 验证**：429 `capacity_exhausted` 比例、`async_tasks` 中 `status='queued'` 的数量和
  `error_message LIKE 'queue_timeout%'` 的次数；视频任务不再返回 503。
- **回滚**：改回 `shadow`。队列 worker 在 legacy/shadow 下只处理超时，已经排队的任务会按时失败并释放预扣，不会卡住。

## 7. `NF_PARAM_MODE=shadow`（观察 ≥ 7 天）→ 通知客户 → `enforce`

- **shadow**：改开关后等 ≥ 7 天，导出 SLS（`status:"shadow_diff" and shadowArea:"params"`），运行
  `node scripts/analyze-dropped-params.mjs <导出文件>`，得到按客户汇总的参数名（不含参数值）。
- **通知客户**（负责人）：
  - 今后会原样透传给上游的参数（旧版会被丢弃）；
  - 会被拒绝（400 `unsupported_parameter`）的计费敏感参数：`n`、`enable_search`、`search_options`、`plugins`、
    `file_ids`、`batch`。给出过渡期。
- **enforce 验证**：400 `unsupported_parameter` 的数量与报告一致；上游 400 原样返回给客户。
- **回滚**：改回 `shadow`。

## 8. 通知 MiniMax-M3 的 2 个用户 → `NF_PROTOCOL_MODE=enforce`

- **通知**（负责人）：`MiniMax/MiniMax-M3` 不原生支持 Anthropic Messages（D6，不做协议转换），请改用
  `/v1/chat/completions`；给出过渡期。
- **操作**：`NF_PROTOCOL_MODE=enforce` + reload。
- **验证**：`/v1/messages` 调 MiniMax-M3 返回 400 `unsupported_protocol`（错误信息里列出可用协议）；其他模型不受影响。
- **回滚**：改回 `legacy`（转换桥代码仍在）。

## 9. 收尾

- 安装每日 YAML 快照：`install -o root -g root -m 0644 ops/cron/nexusflow-cp-export.cron /etc/cron.d/nexusflow-cp-export`；
  次日 `/var/lib/nexusflow/cp-snapshots` 应有 git 提交。
- 配置飞书私聊告警：`NF_NOTIFIER=feishu_dm`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_NOTIFY_OPEN_IDS`
  （只走私聊，不用群 webhook）。
- 核对百炼控制台实际配额（有提额的在后台改配额池，`source` 改为 `console`）；补齐 HiModels / jawayid / genvia /
  Azure 的配额（目前是 `unverified`，发布时会持续告警）。
- 在后台逐个定稿回填报告中 32 个“展示能力串与结构化能力不一致”的模型。
- 给运维账号授予含 `traffic.manage` 的角色；需要双人审批时设 `NF_CP_REQUIRE_SECOND_APPROVER=true`。
- 路由探测：先 `npm --workspace backend run control-plane:route-probe -- --dry-run` 看计划，再正式探测
  （会向上游发少量真实请求）。
- 各开关 enforce 稳定 ≥ 14 天后，按 `docs/control-plane-contract-checklist.md` 逐项删除旧代码/旧表（每项单独 PR）。

## 应急

- 配置改错：后台「配置控制面 → 版本与回滚」回滚到上一版本；回滚本身是一个新版本，5 秒内所有节点生效。
- 开关出问题：改回上一个模式 + `pm2 reload`。
- 控制面数据加载失败：运行时继续用上一版并告警，不会清空配置；排查期间可把 `NF_CP_MODE` 改回 `shadow`/`legacy`。
