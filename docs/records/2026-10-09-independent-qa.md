# NexusFlow 独立质量检查与未提交修复审查

| 类型 | 状态 | 核实日期 | 相关文档 |
|---|---|---|---|
| 独立 QA 记录 | 本地修复，未提交、未部署 | 2026-10-09，Asia/Shanghai | [WIKI](../../WIKI.md)、[发布回归清单](../release-regression-test-checklist.md) |

## 发现：P0 / P1 / P2

本轮未发现已验证的 P0；这不是对所有路径不存在 P0 的保证。以下位置为最终工作树附近行号，以函数名为稳定定位。每项都重新读代码并执行相应验证，没有采用原报告的结论作为证据。

### P1-01：SLS SDK 默认使用 HTTP（已本地修复）

- **版本**：`5e732bd` 与初始未提交工作树均存在；生产两节点版本为该基线，但本轮没有抓取生产日志网络内容。
- **复现**：以合成凭据加载应用真实 `getSlsClient()`，stub 已安装 SDK 的 HTTP transport，仅捕获上传/查询 URL 的协议。
- **预期 / 实际**：应为 HTTPS；修改前上传与查询路径使用 `http:`。`@alicloud/log` 的 `use_https` 默认 false，应用未覆盖。
- **影响**：应用自身未对日志内容与查询结果提供传输加密；请求签名不等于加密。未声称已发生生产泄露。
- **位置**：`backend/src/services/sls.ts:18`；锁定 SDK `lib/client.js`。
- **证据**：`independent/backend/sls-sdk-before.log`、`sls-sdk-after.log`、扩展 usage PostgreSQL 测试。
- **修复**：显式 `use_https: true`；已验证安装 SDK 的读写路径均为 HTTPS。运营须确认两节点 HTTPS 出站可达，不应回退 HTTP。

### P1-02：SQL 日志 owner 校验未覆盖 SLS 返回内容（已本地修复）

- **版本**：基线与初始工作树。只在隔离库和合成 SLS stub 中复现，未读取生产客户正文。
- **复现**：账号 A 请求自己拥有的日志；让全文检索返回一条 `logId` 或 `userId` 不匹配的合成命中。
- **预期 / 实际**：应拒绝该内容；修改前直接取首条结果，HTTP 200 返回不匹配内容。
- **影响**：数据库资源归属不能证明全文搜索结果也属于该用户，形成越权返回路径。
- **位置**：`backend/src/routes/usage.ts` 的 `/logs/:logId/detail`。
- **证据**：`independent/backend/probe-before.log`、`probe-after.log`；测试同时覆盖匿名、其他用户、不存在 ID、身份缺失、主子账号。
- **修复**：先 SQL owner，后 SLS 字段限定查询，再对返回 `logId` 和 `userId` 精确校验。真实 writer 的 SQL `user_id` 与 SLS `userId` 均为同一消费 actor，已测试子账号边界。缺身份的旧记录不返回正文。
- **人工依赖**：核验 SLS 的 `logId`、`userId` 字段索引及最小查询权限。本轮未修改 RAM/STS、索引或留存策略。

### P2-01：历史折扣被当前折扣重算（已本地修复）

- **版本**：基线及初始工作树；影响最近用量和账单展示。
- **复现**：历史用量保存实付 0.1、原价 0.2、折扣 0.5；将当前折扣设为 0.2 后读取最近用量。另建无历史折扣字段的消费交易，切换当前折扣。
- **预期 / 实际**：历史值稳定、无证据保持未知；原用量显示原价 0.5/折扣 0.2，旧账单优惠额也随当前折扣变化。
- **影响**：造成历史价格与账单错觉，不能据此证明实扣金额错误。
- **位置**：`backend/src/routes/usage.ts` `/recent`、`routes/billing.ts` `/transactions`、`data/billing.ts` `getModelBillingBreakdown`。
- **证据**：backend before/after probe、`security/billing-before-utc.json`、`billing-pricing-provenance.log`。
- **修复**：展示仅使用结算快照；0 折与未知分开处理。CSV 明确区分历史总额/折扣证据与当前目录参考单价、阶梯、分项。目录涨价测试确认已保存总额和实付不变。未改历史记录或扣款算法。

### P2-02：账单日期筛选漏掉上海自然日前 8 小时（已本地修复）

- **版本**：基线及初始工作树。
- **复现**：合成上海当日开始前、开始、末尾、次日四组记录，以同一天 `YYYY-MM-DD` 导出，分别在 UTC 与上海宿主时区运行。
- **预期 / 实际**：仅包含当日；UTC 原实现漏前 8 小时且多收次日前 8 小时，上海宿主仍漏前 8 小时。月分组还依赖 DB 时区。
- **影响**：CSV、分账、每日统计无法按相同日界对账。
- **位置**：`backend/src/data/billing.ts` `getBillingDateRange/getMonthlyStats/getBillingUsageExport`；普通及管理导出/分账路由。
- **证据**：`security/billing-before-{utc,shanghai}.json`、两种 TZ 的 `billing-reporting-postgres-*.log`。
- **修复**：日历日期固定上海，SQL 上界为 `< 次日零点`，包括 PG 的 `23:59:59.999999`；显式带时区时间戳保留精确边界。月汇总明确 Shanghai。跨年、微秒、CSV 文件名与用户隔离均补测试。

### P2-03：非法筛选、日志服务失败与权限错误的状态码不准确（已本地修复）

- **复现**：认证后传 `from=not-a-date`、`limit=-1`、小数/数组条数、逆序日期或非法账单分页；分别请求缺少 SLS 客户端的本人日志和另一用户日志。
- **预期 / 实际**：非法输入应 400、匿名 401、不可见资源 404、服务故障 503；原实现出现 PostgreSQL 500 或 HTTP 200 携带失败。
- **影响**：错误分类和重试判断失真；原始 SDK 异常还可能包含基础设施标识。
- **位置**：`backend/src/routes/usage.ts`、`routes/billing.ts`、`utils/usage-dates.ts`。
- **证据**：usage/billing PostgreSQL HTTP 回归、脱敏与重试合成测试。
- **修复**：严格日期和分页校验；日志查询只返回通用错误并在服务端记录稳定错误码。每次重试重新验证 session/owner。没有取消权限检查来恢复日志。

### P2-04：总请求、长尾模型和日期的旧口径错误（初始修复方向正确，已补修边界）

- **版本**：基线存在成功且费用大于零的请求数冒充总请求、模型仅前十、日期缺年/稀疏日期；初始 diff 已处理主体问题。
- **复现**：含成功/失败/免费/有费用失败及超过十个模型的隔离数据；合成浏览器账号有 31 条记录、12 模型、今日 0 次。
- **预期 / 实际**：总请求、分模型、每日用量使用一致的已记录请求集合；基线口径不同。初始新 SQL 在真实 PG 通过，但让既有 pg-mem 管理回归返回 500；其他模型组还累加舍入百分比，94 个等量模型可显示合计 103.4%。
- **位置**：`backend/src/data/usage.ts` `getOverview/getDaily/getByModel/getRecent`；`frontend/app/(dashboard)/activity/page.tsx`、`dashboard/page.tsx`、`components/ConsoleUI.tsx`。
- **证据**：原始/扩展 usage PG 测试、admin-control-plane 前后结果、`root/browser-before/desktop-activity.txt`、前端 94 模型回归。
- **修复**：全部状态统计；七个上海自然日补零，带完整年份/毫秒/时区；无当日数据为 0；分组按原始请求数重算，Other 为 94.7%，条宽以最大展示组归一化。
- **语义**：“总请求”是 `usage_logs` 已记录请求，不保证计入边缘/鉴权前拒绝。失败但已产生内容的请求仍可能有 Token/费用。账本不是此表的同义词。
- **性能**：取消 top10 的两个旧查询均需先聚合；100k 合成记录/128 模型单次 EXPLAIN 分别 25.814ms 与 25.833ms。仅说明该本地样本无明显退化，不构成生产容量保证。当前 Activity 最多展示六组；另一个直接调用方是旧 admin 用户详情。

### P2-05：默认调用示例与协议/可用性/账号权限不一致（已本地修复）

- **复现**：目录包含优先推荐但仅支持 Messages 的 Claude，或子账号仅允许其它模型。API Key 页还固定 `qwen-plus`，未读取目录。
- **预期 / 实际**：Chat 示例只能用可用且允许的 Chat 模型；基线 Dashboard 将 Claude 放入 Chat，初始 diff 忽略白名单，Keys 始终固定模型。
- **影响**：复制即可能遇到协议或权限错误。
- **位置**：`frontend/lib/models.ts:getDefaultChatModel`；Dashboard、Keys 两处示例。
- **证据**：公网目录 Claude 仅声明 `anthropic/messages`；前端回归验证 NULL/[] 白名单、未知可用性、目录失败和新建/已有 Key。
- **修复**：共享选择器要求 availability=available、Chat 协议、账号模型白名单；无候选不生成可执行示例。这里只验证目录契约，没有发付费请求证明上游实时可用。

### P2-06：工具调用示例 JSON 缺少闭合方括号（已本地修复）

- **复现**：直接运行基线模型详情示例生成函数，对含“工具调用”能力的 Chat 示例 `-d` 正文做 JSON.parse。
- **预期 / 实际**：有效 JSON；实际 tools 数组缺 `]`，解析失败。
- **位置**：`frontend/app/(dashboard)/models/[...id]/page.tsx:getProtocolExamples`。
- **证据**：`frontend/baseline-example-repro.txt`、三协议示例 JSON 回归。
- **修复**：补全数组，不改变协议权限或发送真实请求。

### P2-07：价格、缓存说明与约束失真（初始本地修复保留并验证）

- **复现**：线上 Pricing 选 Qwen Math Plus，输入 128K、输出 800；目录上下文仅 4K，仍显示预计月费 15,648。公开目录收录 93 模型，其中 90 可用，但原文案称全部可调用；通用缓存 10% 说明与模型单价不同。
- **预期 / 实际**：不可执行组合应拒绝估价；收录、可用与不同缓存类型应分别说明。原实现无保护。
- **位置**：`pricing/PricingClient.tsx`、`docs/quickstart/page.tsx`、`app/page.tsx`、`models/ModelsClient.tsx`。
- **证据**：`root/production-invalid-estimate.png/.txt`、公网目录快照、前端阶梯/上下文/输出回归。
- **修复**：校验目录 context/maxOutput、隐藏不可用估算候选；缓存价以具体模型为准，公布数与可用数分开。
- **待验证边界**：通用两项约束不覆盖每种模型最大输入/思考预算。官方 [Qwen Plus](https://help.aliyun.com/zh/model-studio/qwen-plus) 还区分普通与思考最大输入。未逐一进行付费上游验证，也未擅改模型限制或价格表。

### P2-08：网络失败、空状态和异步竞态（已本地修复）

- **复现**：日志搜索请求拒绝；仅 billing 接口拒绝；空账号打开 Activity；`auth/me` 返回 503；模型详情慢 A 响应晚于 B；展开详情后改筛选。
- **预期 / 实际**：可重试、保留独立成功区块、无样本不报低成功率、临时故障不删 session、旧响应不覆盖新页面；原实现搜索永久加载且 pageerror，整页失败或假零，空账号显示 0%/低于95%，临时故障清 token，旧模型可能回写。
- **位置**：Activity、Dashboard、模型详情、`lib/auth.tsx`、`components/UserLayout.tsx`。
- **证据**：`root/browser-before` 的网络失败、部分失败、空账号截图/文本；前端组件故障注入回归；修复后的同路径浏览器证据见最终验证清单。
- **修复**：allSettled 区块状态、try/finally、请求世代/取消、明确空状态；401 才清 token，临时认证故障保护页失败关闭并重试；403/404 不提供无效详情重试。搜索表单支持 Enter。

### P2-09：390px 模型 ID 被裁切（已本地修复）

- **线上复现**：`/models/MiniMax%2FMiniMax-M3`，390×844；ID 右边界 431.14px，视口 390px。
- **预期 / 实际**：完整可读；旧标题横向 flex 将 ID 推出视口。document.scrollWidth 仍为390，单测整页宽度会漏报。
- **位置**：模型详情标题卡片。
- **证据**：`root/production-model-mobile.png`、`production-mobile-geometry.json`。
- **修复**：标题/元信息可换行、ID maxWidth 与 overflow-wrap；桌面及390px复测。
- **修复过程回归**：本轮取消旧模型异步请求时曾误去掉 URL 解码，真实浏览器发现含斜杠 ID 双重编码后 404。已恢复单次解码/编码并保留取消逻辑，增加 encoded/split 两种路由参数回归；中间失败证据保留于 `root/browser-final`，最终证据见 `root/browser-verified`。

### P2-10：仓库备份 cron 未加载必要验证机配置（已本地修复）

- **复现**：静态核对原模板及备份调用链：模板未 source 配置，而下游要求 restore verifier 变量；修复后在 cron 等价空环境中直接执行替换 fixture 路径的模板命令。未保存原模板实际执行失败日志。
- **预期 / 实际**：配置被导出至子进程或明确失败关闭；原模板未 source 环境文件，真实备份 hook 必需的主机为空。
- **位置**：`ops/cron/nexusflow-db-backup.cron`；`scripts/db-backup-hook.sh`。
- **证据**：`security/backup-cron.log`，测试直接执行仅替换 fixture 路径的模板命令。
- **修复**：显式 source/export 配置、umask077、缺文件关闭；未安装任何 cron。生产安装版与仓库模板不是同一事实，见最终配置核验说明。

### P2-11：开发依赖 braces 高危公告尚无官方修复（未解决）

- **复现**：`npm audit --json` 为 7 high，均由同一 braces 漏洞沿 nodemon/ESLint 构建工具链传播；生产依赖审计为 0。
- **预期 / 实际**：应有已修复依赖；当前锁定与 npm latest 均为3.0.3，官方公告无 patched version。
- **证据**：`security/audit-{full,production}.json`；[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。
- **影响/建议**：不可信深层 glob 可使开发工具栈耗尽；本轮没有证明生产运行时可利用。避免将不可信 glob 输入工具，等待上游补丁。未盲目执行 audit 推荐的 Next ESLint/nodemon 大版本降级，未修改 lockfile。

## 现场与证据来源

- 工作区：`source`，分支 `codex/qa-console-fixes`，HEAD `5e732bd23d3a20a182e5c6576fd67bf9f65ed9b2`。
- 初始现场：12个已修改文件，4个未跟踪文件；完整初始diff和status已保存在 `qa-2026-10-09/independent/root/initial-*`。未跟踪 usage PG 测试和日期工具继续完善；他人 `frontend/AGENTS.md`/`CLAUDE.md` 保留原样。
- 公网 `/api/version`、两节点直连后端版本、两节点前端 build header 均为该 SHA；生产 Git 状态输出无改动。不是仅根据公网随机命中认定双节点一致。
- 旧 `qa-2026-10-09/report.md` 的状态版本与本次不同。未重用其认证会话、客户明细或金额差异作为当前证据。
- 原材料保持原样；新增证据全部位于仓库同级 `qa-2026-10-09/independent/`。子审查报告为 `backend/report.md`、`frontend/review.md`、`security/REPORT.md`；本记录统一版本与覆盖边界。
- 本地浏览器运行独立源码快照，先重建初始工作树，再同步最终工作树；未复用已有 3100/3201/3310/3321 服务或55439数据库。snapshot build header沿用基线SHA，仅作构建要求，**不代表未提交代码与基线二进制相同**。

## 未解决、待验证与未覆盖

1. **环境/权限**：SLS RAM/STS 查询权限、字段索引与保留期尚未用生产客户日志验证；旧报告中的云拒绝只作为线索。需运营用专用合成日志检查，不能通过扩大通配权限或跳过owner恢复功能。
2. **待验证业务风险**：真实模型协议、实时容量、每个模型最大输入/输出/思考模式与全部采购价格未做付费验证；目录 availability 不等于端到端成功承诺。
3. **历史数据限制**：有快照的历史总额/折扣与实付已测试稳定；没有完整历史单价快照的 CSV 单价/阶梯只是当前目录参考，现已显式标注，不能重建丢失的历史事实。没有对生产余额差异作原因猜测或调账。
4. **环境差异**：本机Node26.3.0与生产两节点Node22.22.1、CI Node24不同；Linux发布脚本/真实nginx/ALB摘流、加密备份全量恢复、双节点压测未执行。本次不作为可直接发布结论。
5. **支付与外部服务**：不充值、不创建生产订单、不发付费推理、不改云权限、不部署。邮件验证码投递、真实支付回调、真实流式计费使用现有本地mock/PG回归，不冒充生产端到端验证。
6. **可访问性与容量**：覆盖关键键盘提交、可读状态、桌面及390px；未做完整WCAG/屏幕阅读器审计、所有浏览器兼容性或负载压力认证。完整payload capture的高并发内存/队列背压需另做受控压测，未读取客户存档。

## 最终验证结果

所有测试账号、金额、请求内容和云服务 stub 均为合成数据。独立 PostgreSQL 16.14 集群绑定 `127.0.0.1:55473`，三库分别用于 usage、security 和浏览器；从空库执行32个迁移文件。没有复用生产数据库或原有本地55439实例。

| 验证 | 结果与证据（相对 independent/） |
|---|---|
| 后端既有回归 | 33个不同套件均取得通过结果。首轮32/33，admin-control-plane 的真实失败已修复，相关套件重跑；不是每次最终编辑后都重跑全部33套。`security/test-summary.json` 保留首轮失败，最终见 `security/admin-control-plane-final.log` 及其它 `*-final.log`。 |
| 真实 PG | usage analytics、billing reporting、session token、payment settlement、sub-account concurrency 通过。新增/扩展用量测试覆盖宿主 LA、DB UTC；账单测试分别覆盖 UTC/Shanghai。最终 `root/usage-postgres-final.log`、`root/billing-postgres-final.log`；其余 `security/*postgres*.log`。 |
| 前端回归 | `node --test frontend/scripts/test-console-regressions.mjs`：15/15，通过协议/权限候选、长尾、空状态、局部失败、日志失败/竞态、认证、价格边界和斜杠路由参数。`root/frontend-regression-final.log`。这些是确定性组件逻辑回归，真实布局另用浏览器验证。 |
| 构建、静态检查 | `npm run build:backend`、`npm run build:frontend` 均通过；`npm --workspace frontend run lint` 为0 error、30 warning，未把警告记为全清。最终浏览器快照与仓库变更运行源码哈希一致。见 `root/build-*-final.log`、`frontend-lint-final.log`、`runtime-source-verification.json`。 |
| 发布脚本 | release-telemetry、reconcile、provider-cost-release、deploy-orchestrator-state、release-ci-gate、release-history、docs-index 通过；新增 `npm run test:backup-cron` 通过。`test:backup-freshness` 在 macOS 的 BSD `touch -d` 处失败，未走到剩余断言，属于环境限制，不能据此宣称 Linux 备份正常或异常。`root/release-tests.json`、`test-backup-*.log`。 |
| 依赖 | 全部依赖7个 high 包级发现，来自1条 braces 公告；`npm audit --omit=dev` 为0。没有可用官方补丁，锁文件未改。`security/audit-*.json`。 |
| 文档与 diff | 文档索引29条通过；`git diff --check` 通过；人工核对所有调用方、鉴权、日期边界、历史价格来源和初始未跟踪文件。最终状态、补丁及新文件列表见 `root/final-*`。 |

### 浏览器与实际网站

- **生产只读**：10个公开页面各跑1440px和390px，另验证匿名访问控制台跳转；公开匿名 API 的401/404符合访问边界。没有 pageerror。目录、价格、文档、登录、状态和不存在模型均保留文本/截图，见 `root/browser-production/`；不存在模型产生的404为预期。
- **本地最终**：22组页面/状态截图，桌面及390px覆盖登录后控制台、Activity、Keys、Billing、模型详情、价格、文档、设置、工单和速率页；合成31条请求/12模型/今日0次/空账号，故障注入检查搜索失败及仅余额服务失败。见 `root/browser-verified/`。
- **核心操作断言**：`root/browser-core/results.json` 的14/14通过：密码登录、刷新恢复、503保留会话并关闭保护页、恢复重试、密钥创建/刷新仅掩码/删除、Enter搜索、详情503/403区别、空结果清旧数据、估价拒绝超上下文、390px模型ID、401清会话。另 `browser-focused-results.json` 验证实际退出登录并跳转。创建密钥时未截图或输出完整值。
- **实际尺寸**：MiniMax模型ID修复前线上右边界431.14px，最终本地231.89px，均以390px视口测试；只检查 document.scrollWidth 会漏掉修复前的裁切。
- **控制台与失败请求**：最终矩阵没有未处理 pageerror，2条 console error 对应主动阻断的日志/余额请求；其余取消主要发生在导航/预取。矩阵有3次 `networkidle` 等待超时，独立重开这3页后均在约0.6s进入空闲、无待处理请求或页面异常，记录于 `browser-focused-results.json`。没有把失败请求列表全部忽略，也没有把测试等待超时直接算网站缺陷。
- **测试过程失败保留**：`browser-after` 的等待超时、`browser-final` 的模型双重编码404，以及核心脚本曾误匹配 Next 自带 alert 的选择器失败均保留。最终记录分别使用 `browser-verified`、`browser-core/results.json`、`browser-focused-results.json`，不得混用中间截图证明最终通过。
- **本地目录条件**：浏览器测试库给供应商配置了纯合成密钥和 `http://127.0.0.1:9` 地址，以展示可用模型并验证估价；不调用该地址推理。浏览器操作还阻断 `/v1/`。本地 availability 只证明合成配置下的界面逻辑，不证明生产模型可推理，见 `root/catalog-fixture.json`。

### 人工配置与后续建议

1. 发布前在专用合成日志上核验 SLS `logId`、`userId` 字段索引、最小查询权限及HTTPS连通性；无匹配内容应保持关闭，不能跳过owner检查。旧日志缺少身份字段可能无法返回详情；同ID仅元数据记录的可用性也需核验。
2. 两生产节点实际 Node 为22.22.1。主节点安装 cron 确有 `backup-release.env` 引用，文件为 `root:root 600`；只读取了存在性/属主/模式，没有读取配置值、执行备份或验收恢复。需运维按发布手册核验真实离线恢复及Linux专用检查。本轮没有安装仓库cron。
3. 跟进 braces 上游修复，修复后重新锁定与审计；先不要接受审计建议中的不相关大版本降级。
4. **体验建议（未当成已验证缺陷）**：后续做完整键盘tab/菜单箭头与屏幕阅读器检查；有需要时给费用估算增加思考模式、缓存及最大输入的模型专属说明。本轮没有进行大规模界面重构。

本轮已修复2组P1与10组P2，开发依赖P2-11仍未解决。线上两个节点仍是 `5e732bd`；本地未提交修复没有发布。没有发起付费推理、生产充值/订单、调账、修改云权限，也没有读取或导出客户请求正文。
