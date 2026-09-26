# 压测手册

| 类型 | 状态 | 最后核实 | 相关 |
|---|---|---|---|
| 操作手册 | 现行 | 2026-09-26（生产实测） | [本次结果](records/2026-09-26-production-load-test.md)、[发布手册](production-release-runbook.md)、[回归清单](release-regression-test-checklist.md) |

本文回答四个问题：什么时候压、怎么安全地压、看什么指标、怎么判断结果。最后给出当前基线和按优先级排的改进建议。

## 1. 什么时候压

| 场景 | 用哪个档位（见 §4.3） |
|---|---|
| 改了计费预占/结算、限流、连接池、Redis 租约、nginx `/v1` 门禁 | 冒烟 + 标准 |
| 控制面开关切 enforce 前后（尤其 `NF_TRAFFIC_MODE`） | 标准 + 限流探测，并看 `nf:shadow:*` |
| 大客户接入前，或客户要求承诺吞吐 | 标准 + 饱和 + 跨租户 |
| 每季度一次 | 全部档位，更新 §6 基线 |

**不要**在这些时候压：客户高峰期、上游有故障公告时、发布进行中、备份（03:30）和快照（04:10）运行时。

## 2. 安全规则（硬性）

1. **只用压测账号**：`nf-loadtest-<后缀>`，邮箱 `@loadtest.nexusflow.hk`，由 `load-test:account create` 创建。不要用任何客户或管理员账号的 key。
2. **只用便宜模型**，先估算费用：`load-test.mjs` 会按目录价算最坏费用，超过 `--max-cost-cny`（默认 ¥1）就不发请求。
3. **key 只放在 0600 文件里**：不进命令行参数、不进聊天、不进仓库；用完立即删除。
4. **阶梯加压**：每档跑完看结果，出现非预期错误（不是 429/503 容量拒绝）或流式没有 `[DONE]` 就停，工具会自动停。
5. **注意共享配额**：压测和真实客户共用同一上游配额池和同一条路由的 RPM。线上有客户流量时，不要把某个模型的路由 RPM 打满超过 1 分钟。
6. **压完必须对账并清理**：`report` 退出码为 0（账本闭合）后再 `cleanup`。对账不闭合就停下，按计费事故处理，不要清理现场。
7. **从另一台机器发压**（例如 `small`），不要在应用节点上发，以免压测进程和被测服务抢 CPU。只有做"绕过 ALB/nginx 的对照实验"时才在节点本机发。

## 3. 工具

| 工具 | 作用 | 在哪跑 |
|---|---|---|
| `scripts/load-test.mjs` | 阶梯发压：并发 × 请求数、流式比例、费用上限、自动停止；每档输出一行 JSON（状态码、错误码、客户端延迟 p50/p95/p99、rps、流式完整性） | 发压机（只需 Node ≥ 20，单文件无依赖） |
| `npm --workspace backend run load-test:account -- create` | 建压测账号和 key（key 写入 0600 文件，库里只存哈希） | 主节点 `/root/distiny/nexusflow/backend` |
| `... -- report --id <后缀> --balance <初始余额>` | 按模型/状态汇总用量、服务端延迟分位数；核对余额扣减 = 用量费用 = 流水金额，结算预占数 = 成功数，没有悬挂预占。不闭合时退出码 3 | 同上 |
| `... -- waits --seconds 20` | 只读采样 `pg_stat_activity`：等锁的语句、连接数、`max_connections` | 同上，**在压测进行中**跑 |
| `... -- shadow` | 只读列出 `nf:shadow:*` 计数（没有键 = 零差异） | 同上 |
| `... -- cleanup --id <后缀>` | 在一个事务里删除该账号的用量、预占、流水、key 和用户；拒绝非压测账号和有充值订单的账号 | 同上 |

测试：`npm run test:load-test`（发压器，含本地 mock 端到端）、`npm --workspace backend run test:load-test-account`（账号 CLI，在迁移后的 pg-mem 上走真实预占/结算/释放）。两者都在 CI 里。

## 4. 标准流程

### 4.1 准备

```bash
# 主节点：建账号（余额 20 元足够跑完全部档位）
ssh nexus 'cd /root/distiny/nexusflow/backend && \
  npm run load-test:account -- create --id 20260926 --balance 20 --key-out /root/.nf-loadtest.key'

# 把 key 和发压器送到发压机（key 走管道，不落在本机）
ssh nexus 'cat /root/.nf-loadtest.key' | ssh small 'umask 077; cat > /root/.nf-loadtest.key'
scp scripts/load-test.mjs small:/root/load-test.mjs
```

先查目标模型的路由限额，决定档位和预期：

```sql
SELECT provider_id, model_id, rpm_limit, tpm_limit, concurrent_limit
  FROM provider_capacity WHERE model_id = '<模型>' AND is_enabled;
```

### 4.2 执行

```bash
ssh small 'node /root/load-test.mjs --confirm-production --key-file /root/.nf-loadtest.key \
  --model deepseek-v4-flash --stages 5x100,20x500,50x1500 --pause-s 5'
```

压测进行中，在主节点另开一个终端采样数据库：

```bash
ssh nexus 'cd /root/distiny/nexusflow/backend && npm run load-test:account -- waits --seconds 20'
```

同时看两台节点的 `pm2 jlist`（重启次数、内存）和后端错误日志有没有新增。

### 4.3 档位

| 档位 | 参数 | 目的 | 参考费用 |
|---|---|---|---|
| 冒烟 | `5x100` | 端到端通路、流式 `[DONE]`、计费 | < ¥0.01 |
| 标准 | `5x100,20x500,50x1500` | 正常负载下的延迟和吞吐 | ≈ ¥0.05 |
| 饱和 | `100x3000` | 找吞吐上限：吞吐不再增长时的并发 | ≈ ¥0.07 |
| 限流探测 | 选 RPM 较低的模型，`50x1500 --expect-capacity-rejects` | 限流是否按配置精确生效、拒绝是否快速 | ≈ ¥0.02 |
| 跨租户 | 第二个压测账号 `2x30`，在饱和档进行中同时跑 | 一个客户打满时对别人的影响 | 可忽略 |
| 对照实验 | 在主节点本机 `--base-url http://127.0.0.1:3001` | 判断瓶颈在 ALB/nginx 之前还是之后 | 同饱和档 |

"参考费用"按 `deepseek-v4-flash`、`max_tokens=8` 估算；换模型时看工具打印的 `maxCostCny`。

### 4.4 收尾

```bash
ssh nexus 'cd /root/distiny/nexusflow/backend && \
  npm run load-test:account -- report --id 20260926 --balance 20 && \
  npm run load-test:account -- shadow && \
  npm run load-test:account -- cleanup --id 20260926 && rm -f /root/.nf-loadtest.key'
ssh small 'rm -f /root/.nf-loadtest.key /root/load-test.mjs'
```

`report` 不闭合时**不要**执行 cleanup。结果按 §8 模板写进 `docs/records/<日期>-<主题>-load-test.md`。

## 5. 看什么指标、怎么判读

| 现象 | 说明什么 | 下一步 |
|---|---|---|
| 并发翻倍，吞吐不变、延迟翻倍 | 某处在排队（吞吐已到上限） | 对比客户端延迟和服务端 `latency_ms` |
| 客户端延迟明显大于服务端 `latency_ms` | 排队发生在计时开始之前：鉴权、余额预占、连接池、ALB/nginx | 跑 `waits`；做本机对照实验 |
| 本机直压和经 ALB 吞吐一样 | 瓶颈不在 ALB/nginx，也不在单节点 CPU，而在共享资源（数据库/Redis/上游） | 看 `waits` 的等锁语句 |
| `waits` 里大量 `Lock:tuple` 在 `users ... FOR UPDATE` | 同一账号的余额行锁串行化（§7 P0） | 已知问题 |
| 服务端 `latency_ms` 随并发上升 | 上游变慢或排队 | 换模型/看上游状态 |
| 503 `provider_capacity_exhausted`，且拒绝耗时 < 100ms | 平台路由限额（`provider_capacity.rpm_limit`）生效，正常 | 核对限额是否符合上游真实配额 |
| 429 `capacity_exhausted` 带 `Retry-After` | 同上，`NF_TRAFFIC_MODE=enforce` 下的新语义 | — |
| 上游 429 | 上游账号配额真的满了 | 降低档位，核对控制台配额 |
| 流式没有 `[DONE]` | 断流，计费风险 | 立即停止，查 `usage_logs.status` 和 SLS |
| `report` 不闭合或有悬挂预占 | 计费缺陷 | 按计费事故处理，保留现场 |
| PM2 重启次数增加 | 进程崩溃或内存超限 | 立即停止，查错误日志 |
| `nf:shadow:*` 出现计数 | 控制面新旧逻辑有差异 | 查 SLS `status:"shadow_diff"` 明细 |

注意：`usage_logs.latency_ms` 从余额预占**之后**才开始计时，看不到预占和排队的时间，所以必须同时看客户端延迟。

## 6. 当前基线（2026-09-26，生产，单压测账号，发压机 `small`）

| 模型 | 并发 × 请求数 | 结果 | 吞吐 | 客户端 p50 / p95 | 服务端 p50 |
|---|---|---|---|---|---|
| qwen-flash | 5 × 100 | 全部 200 | 14 rps | 334 / 463 ms | — |
| qwen-flash | 20 × 500 | 全部 200 | 47 rps | 418 / 576 ms | — |
| qwen-flash | 50 × 1500 | 400 成功 / 1100 × 503（路由 RPM 1000） | — | — | — |
| deepseek-v4-flash | 50 × 1500 | 全部 200 | 48 rps | 1005 / 1400 ms | 680 ms |
| deepseek-v4-flash | 100 × 3000 | 全部 200 | 49 rps | 2048 / 3060 ms | 686 ms |
| deepseek-v4-flash（本机直压主节点） | 100 × 2000 | 全部 200 | 46 rps | 1948 / 3404 ms | — |
| deepseek-v4.1-flash | 20 × 400 | 全部 200 | 16 rps | 1020 / 1778 ms | 928 ms（p99 3160） |
| deepseek-v4.1-flash | 50 × 1500 | 1000 成功 / 500 × 503（路由 RPM 1000） | ≈ 50 rps | 988 / 2161 ms | — |

- **单个主账号的吞吐上限约 48 rps（≈ 2900 次/分钟）**，与节点数无关（见 §7 P0）。
- 一个账号打满时，另一个账号的延迟 p50 从 805 ms 到 923 ms、p95 从 1111 ms 到 1388 ms，全部成功：影响有限，没有拖垮全平台。
- 流式请求全部以 `[DONE]` 结束；14,000 笔成功请求全部对账闭合；控制面 shadow（`NF_CP_MODE=shadow`）零差异。
- 两节点无重启，后端进程内存 150–200 MB，CPU 约 20%。

完整数据见 [2026-09-26 生产压测记录](records/2026-09-26-production-load-test.md)。

## 7. 已知瓶颈与建议（按优先级）

| 优先级 | 问题 | 证据 | 建议 |
|---|---|---|---|
| P0 | **同一主账号的余额行锁把请求串行化**：预占和结算都 `SELECT ... FROM users WHERE id=$1 FOR UPDATE`；写 `usage_logs` 时外键检查要对同一行加 `KEY SHARE`，和 `FOR UPDATE` 冲突 | 压测时 96% 的非空闲会话在等 `Lock:tuple`；两节点共 80 个连接全部占满；本机直压与经 ALB 吞吐一样；历史上 `billing_reservations` 出现过死锁 | ① 只改余额列的锁换成 `FOR NO KEY UPDATE`（不再和外键冲突）；② 用量写入移出持锁事务；③ 补 PostgreSQL 并发计费测试（同一用户大量并行预占+结算，余额精确、无死锁）；④ 仍不够时再评估按账号分片余额或批量结算。修完用"饱和"档复测，目标 ≥ 200 rps |
| P1 | **便宜模型的路由 RPM 偏保守**：`qwen-flash`、`deepseek-v4.1-flash` 是 1000/分钟（2026-06 的默认值），`deepseek-v4-flash` 是 15000 | 限流探测中正好在 1000 次时拒绝 | 按百炼控制台实际配额校准（控制面收尾项"核对配额"），在后台用变更单修改，不要直接改表 |
| P1 | **legacy 限流返回 503**，客户端会当成服务故障而不是"稍后重试" | 限流探测结果 | `NF_TRAFFIC_MODE=enforce` 后变为 429 `capacity_exhausted` + `Retry-After`（手册第 6 步），切换后复测限流探测档 |
| P1 | **连接池会被单个热点账号占满**：每进程 `PG_POOL_MAX=20`，4 进程共 80；RDS `max_connections`=420，平时只用约 20 | `waits` 采样 | 先修 P0。之后可把 `PG_POOL_MAX` 调到 40（共 160，仍远低于 420），并给连接池等待时间加监控 |
| P2 | **看不到排队时间**：`latency_ms` 在余额预占之后才开始计时 | 客户端 2048 ms vs 服务端 686 ms | 增加从请求进入到上游调用开始的准入耗时字段（写 `usage_logs` 和 SLS），让排队可观测 |
| P2 | **`usage_logs.node_id` 基本为空**：近 30 天 75% 的行为空，本次压测写入的行全部为空 | 查询结果 | 在写入用量时带上节点 ID，便于按节点排查 |
| P2 | **`deepseek-v4.1-flash` 上游长尾**：服务端 p99 约 3.2 秒、最慢 6.3 秒；`deepseek-v4-flash` 基本没有长尾 | 服务端延迟 | 对延迟敏感的客户推荐 `v4-flash`；控制面 enforce 后可以按延迟设置路由优先级 |
| P3 | 发压只来自一个 IP | 本次方法 | 下次加一台发压机，顺便验证 nginx 按 IP 限速的实际 key 是客户端 IP 而不是 ALB 地址 |

## 8. 结果记录模板

```markdown
# <日期> <主题> 压测记录

- 版本：<git sha>；开关：NF_CP_MODE=… NF_TRAFFIC_MODE=…
- 发压机：<主机>；压测账号：nf-loadtest-<后缀>（已清理）
- 模型与路由限额：<model> rpm=<> tpm=<>

| 档位 | 并发 × 请求 | 状态码 | 吞吐 | 客户端 p50/p95/p99 | 服务端 p50/p95 | 流式 [DONE] |
|---|---|---|---|---|---|---|

- 对账：report 退出码 <0/3>；花费 ¥<>
- `waits` 摘要：<等锁语句与次数>；连接数 <n>/<max>
- shadow：<零差异 / 计数>
- 节点：重启 <n>，内存 <MB>，新错误 <有/无>
- 结论与后续：<>
```
