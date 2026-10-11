# 2026-10-11 日志详情与容量等待四项修复

| 类型 | 状态 | 最后核实日期 | 相关文档 |
|---|---|---|---|
| 修复与回归记录 | 本地未提交、未部署 | 2026-10-11，Asia/Shanghai | [WIKI](../../WIKI.md)、[项目记忆](../AGENT_PROJECT_MEMORY.md) |

## 基线和范围

本轮开始与结束均只读核验：GitHub `origin/main`、两个应用节点直连 backend `/api/version`、frontend `X-NexusFlow-Build-Sha` 同为 `7f288ccbc4efe659884871b763fd2c50c6b3cdb2`，产物时间 `2026-10-11T03:23:02Z`。以下修复在独立 Git worktree `worktrees/log-capacity-fixes`、分支 `codex/fix-log-capacity-1011`，没有改动原 `source` 工作树、它的未提交报告或他人新增前端 Agent 文件。

生产仅查版本，无付费模型请求、客户正文读取、充值、改账、云权限变更或部署。问题通过基线代码与隔离合成探针复现，不将旧报告结论当证据。

## 已验证缺陷与修复

### P1：归档读取 spawn 错误可终止 worker

- 复现：合成 rclone 的 `lsf` 成功后撤掉自身执行权限，后续 `cat` 启动产生 EACCES。
- 预期：详情安全失败或回退；基线实际：子进程没有 error listener，抛出未捕获事件，独立探针 exit 1。生产全局 fatal handler 也会退出 worker，扩大单次查询的影响。
- 位置：`backend/src/services/payload-capture.ts` 的 `scanRemote/listRemote/findCapturedPayload`。
- 修复：立即监听 child error，流使用 pipeline 传播错误；命中提前停止、错误与超时均关闭流并回收子进程；目录列表、多个文件共用 8 秒 I/O 截止时间，为 SLS 回退留出余量。保持全局 fatal 策略不变。
- 失败不再静默吞成未命中；只有本地 ENOENT、远端目录不存在和成功查无记录属于空结果。rclone 的目录不存在退出码 3 按[官方文档](https://rclone.org/docs/#list-of-exit-codes)核验并补用例。
- 证据：修复前 `archive-spawn-error.log`；修复后 `fixes/payload.log`。回归覆盖成功、空目录、目录不存在、列表错误、EACCES、坏 gzip、非零退出、超时及提前命中清理。

### P2：已经满载的路由在选路阶段直接拒绝

- 复现：真实隔离 Redis 中占满并发 1 的唯一路由，100–300ms 后释放；设置等待预算 1000–1200ms，调用真实 `resolveUpstream`。
- 预期：释放后可选；基线实际：约 10ms 即返回 503，无法到达新增的预占等待逻辑。
- 位置：`backend/src/services/upstream.ts:selectManaged`，`pipeline/stages.ts:selectRoute`。
- 修复：legacy 与 control-plane 共用的选路器只针对 RPM/TPM/并发容量过滤重试，每轮重查容量与过滤条件。选路、fallback 和预占共享 deadline；日配额不等，Redis 不确定、健康、策略和凭据边界不绕过。
- 证据：修复前 `capacity-probe.log`；修复后 `fixes/routing.log`，覆盖 legacy/控制面满载后释放、关闭等待、日配额立即拒绝及既有健康/策略/Redis 失败关闭回归。

### P2：容量等待复用旧时间，滑动窗口不滑动

- 复现：真实 Redis 写入 59.8 秒前的 RPM/TPM 事件，在 1.2 秒预算内预占。基线等到窗口已过仍拒绝；重新查询当前窗口已经为空。
- 位置：`backend/src/services/scheduler.ts:acquireProviderCapacity`，底层 Lua 使用 `reservationStartedAt` 计算窗口。
- 修复：明确拒绝之后新尝试使用新的租约 ID/当前时间；同一次预占若 Redis 回执丢失，沿用原 ID/时间进行原有有限重试。未修改 Lua、计价、资金预占或 4096 输出容量估算。
- 证据：修复前 `capacity-probe.log`；修复后 `fixes/capacity.log`。覆盖 RPM/TPM 自然过期放行、等待后提交成功但丢回执仍只增加一次计数、共享 deadline 用尽、日配额立即拒绝、原有初次丢回执/并发/Redis 故障用例。

### P2：近期日志伪装成待上传并跳过 SLS

- 复现：隔离 PostgreSQL 新建本人近期日志，归档为空或失败，SLS stub 已有匹配记录。基线 HTTP 200/null，SLS 调用次数 0，并声称另一节点待上传。
- 预期：查询可用来源、正确区分故障与未命中；影响为掩盖读取故障和丢失本可返回的内容。
- 位置：`backend/src/routes/usage.ts` 日志 detail 路由；`frontend/app/(dashboard)/activity/page.tsx` 详情提示。
- 修复：归档优先，近期也回退 SLS；有 SLS 内容显示可能截断；两路成功查无内容返回中性空状态；归档失败且 SLS 没有合格内容返回 503。保持 SQL owner、归档 actor/log ID、SLS actor/log ID 精确校验和错误脱敏；不放宽查询权限。
- 证据：修复前 `recent-log-probe.log`；修复后 `fixes/usage-postgres.log` 与前端/浏览器回归。覆盖匿名 401、他人/不存在 404、主子账号、外来/缺身份结果、两路错误、安全 503、重试和真空结果。

## 验证与证据

本机证据位于项目父目录 `qa-2026-10-11/`，本轮新增在 `fixes/`。全部请求正文均为明确合成数据。数据库为 loopback PostgreSQL 16 独立测试集群（55473），Redis 为测试启动的临时独立 7.2.7 实例，无生产凭据。

| 验证 | 结果 |
|---|---|
| `test:payload-capture` | 通过：子进程/流错误与有界清理 |
| `test:provider-capacity-redis` | 通过：真实 Redis 原用例与新增窗口/回执/预算用例 |
| `test:managed-routing` | 通过：真实 Redis + pg-mem 路由回归，含 legacy/control-plane 等待 |
| `test:usage-analytics:postgres`，TZ=UTC | 通过：真实 PostgreSQL、合成归档/SLS，包括近期详情与归属 |
| `test:billing-reporting:postgres` | 通过：真实 PostgreSQL 日期/历史账单回归 |
| `test:billing` | 通过：余额预占/结算/释放与失败码 |
| `test:pipeline-stages`、`test:traffic` | 通过 |
| `test:inference-characterization` | 60 场景通过，41 个合成上游交互保持字节一致 |
| 前端 `node --test frontend/scripts/test-console-regressions.mjs` | 16/16 通过，含新增 SLS 提示与正文同时可见 |
| Chromium 桌面 1440 / 手机 390 | 本地合成账号真实登录与 8 个详情场景通过，键盘展开、SLS 截断提示、空态、503 重试；无 pageerror；详情故障注入产生预期 503，导航导致的 ERR_ABORTED 单独记录 |
| backend / frontend build | 通过 |
| 生产依赖 `npm audit --omit=dev` | 0 漏洞 |
| 全量 `npm audit` | 7 high 受影响开发依赖项，源自一个 braces 公告，未改锁文件 |

手机截图复核还发现日志筛选第二列和详情提示在面板内裁切；局部 CSS 将 600px 以下表单改为单列，详情限制视口宽度。保留 `browser-390-sls-before-layout.png`，浏览器新增输入框/提示右边界断言，不能只凭整页 scrollWidth 判断无溢出。初次脚本的完整 ID 选择器与一次后台预取 networkidle 超时已单独保留；最终脚本按实际截断标签定位，并以功能就绪校验详情。

归档新回归已加入 CI；容量、路由、PostgreSQL 与前端回归扩展原 CI 命令。浏览器用真实 Chromium、真实本地登录/会话/SQL/路由和构建后的页面，云日志适配器为合成 stub，不能代表生产云权限已通过。

## 未覆盖与人工事项

- 未部署，线上四项问题仍需后续按双节点不可变发布流程处理。本轮没有运行发布或 dry-run。
- 生产 SLS 读取授权、rclone 可执行权限/远端配置及两节点归档上传健康需运营核验。本次没有读取客户归档、测试真实 SLS 正文或改云权限，不能承诺这些配置已恢复。
- 8 秒归档 I/O 预算改善端到端超时；大归档/慢存储可能更多回退 SLS 或 503。未进行生产大文件吞吐、长时间负载或真实付费模型压力测试。
- 容量等待沿用原有非 FIFO 轮询，不承诺公平队列；Redis 不确定状态的幂等恢复有独立有限重试，可能略超等待 deadline（另加 Redis 命令耗时），不会另起第二轮完整容量等待。
- 本机 Node 26.3，生产 22.22.1，CI 24；未在生产 runtime 执行本地修改。
- `braces` 开发依赖告警仍待单独升级验证，不属于这四项运行时修复；生产依赖审计为零不能抵消开发链风险。
