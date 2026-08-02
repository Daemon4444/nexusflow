# NexusFlow Agent 入口

本文件会被 Codex、Qoder 和兼容 `AGENTS.md` 的代码 Agent 自动读取。

## 开始任务前必须执行

1. **完整阅读 [`WIKI.md`](WIKI.md)**。它是项目全景、架构、不变量、部署和当前边界的唯一事实入口。
2. **完整阅读 [`docs/AGENT_PROJECT_MEMORY.md`](docs/AGENT_PROJECT_MEMORY.md)**。它把业务域、请求链路、计费、Provider 路由、双节点发布和历史故障收敛为 Agent 必须掌握的长期记忆。
3. 根据任务再读专项文档：
   - 新模型：`docs/MODEL_ONBOARDING.md`
   - 模型目录：`MODELS.md` 与实际 `/api/models`
   - 发布回归：`docs/release-regression-test-checklist.md`
   - 海外区域：`docs/overseas-region-deployment-todo.md`
   - 历史审计：`REVIEW_SPEC_2026-07.md`
4. 先检查当前分支、工作区、GitHub 和必要的生产状态。不要把历史记忆当成当前运行事实。

## 最高优先级生产约束：永远是双应用节点

NexusFlow 现网不是单机，也不存在“只把主节点部署好就完成”的操作。

- ALB 后同时有两个生产应用节点；登录 `ssh nexus` 只是进入编排主机，不代表另一节点不需要变更和验证。
- 任何会影响运行时的代码、构建产物、migration、nginx、PM2、配置契约、回滚或健康检查变更，必须覆盖两节点。
- 必须只构建一次，将同一 Git SHA 的不可变制品分发到两节点；禁止两台分别 build。
- 必须从编排主机运行 `scripts/deploy-all-production.sh`；`deploy-production.sh` 只是被调用的单节点原语，不是完整发布命令。
- 发布不允许两节点同时离流。必须逐节点摘流、排空、切换、直连验证，再恢复 balanced。
- 任务只验证了当前主机、只看了公网 ALB 结果、或两节点 SHA/前端 build/PM2/配置不一致时，必须报告“未完成”，不得宣称上线成功。
- 只修文档可不重建或重启服务，但 GitHub main、主节点和副节点工作区仍应最终收敛到同一版本。

事实优先级：

```text
生产探针/数据库/运行配置
  > 当前代码与 migrations
  > WIKI.md
  > 专项文档
  > 审计快照和历史对话
```

## 项目速览

- 产品：AI 模型聚合、协议兼容、Provider 路由与统一计费平台
- 线上：`https://nexusflow.hk`
- 本地：`~/nexusflow`
- 生产：SSH `nexus`，目录 `/root/distiny/nexusflow`
- 前端：Next.js 16 preview、React 19、Tailwind 4
- 后端：Express 5、TypeScript；生产运行 `backend/dist/index.js`
- 数据：PostgreSQL 16 + Redis 5.0 双副本（现网真实基线）
- 进程：PM2 后端 cluster ×2、前端 ×1
- 部署版本：`GET /api/version`

## 不可破坏的业务不变量

- API Key 只按 SHA-256 hash 验证；掩码只能展示，不能认证。
- 管理写接口必须显式执行 admin 鉴权。
- 用户资源必须校验 owner；失败关闭，不能只靠不可猜 ID。
- 钱只在主账号；子账号是消费 actor，受配额和模型白名单约束。
- 收费请求必须使用余额预占、结算、释放语义，不能退回“先查余额后扣款”。
- 金额使用 NUMERIC 和 6 位账本精度；折扣、缓存价、分层价必须保持一致。
- 流式缺失 usage 的估算只能在确有输出时启用，并标记 `estimated=true`。
- 新收费路径必须覆盖失败、断流、取消、幂等和上游错误。
- 上游错误必须脱敏；秘密和客户内容不得进入 Git 或默认日志。
- 模型 ID 可能含 `/`；前端代理和路由必须保留编码。
- Responses 付费内置工具只能经过显式 allowlist 和成本确认。

## 修改规则

- 先读后改，保留无关的用户改动和线上漂移。
- 不编辑 `dist/` 或 `.next/` 代替源代码。
- 数据库变更必须提交新的 migration；编号以
  `backend/src/db/migrations/` 的实际文件和团队已分配槽位为准，禁止按本文猜下一个
  编号或复用已有编号。
- 新模型必须走 `docs/MODEL_ONBOARDING.md` 的代码、浏览器、上游与计费验证。
- 更新架构、运维、协议、计费或安全事实时，同步更新 `WIKI.md`。
- `REVIEW_SPEC_*`、`OPTIMIZATION_SPEC.md` 等是时间点快照，不要把已修事项再次当作现状。

## 最低验证

按风险选择并记录实际执行项：

```bash
npm --workspace backend run test:billing
npm run build:backend
npm run build:frontend
npm audit --omit=dev --audit-level=high
```

涉及用户路径时补浏览器回归；涉及上游/模型时补真实端到端和计费手算；涉及 schema 时补 PostgreSQL migration/恢复验证。

## 生产发布

生产运行构建产物，改源码后只重启 PM2 不会生效。优先使用：

```bash
ssh nexus
cd /root/distiny/nexusflow
git pull --ff-only origin main
bash scripts/deploy-all-production.sh
```

生产是 ALB 双应用节点；完整发布必须使用统一脚本同步并验证两节点，不能只运行单节点的 `deploy-production.sh`。发布后核对两节点 Git、PM2、`/api/health` 和 `/api/version`。文档变更也应让生产工作区与 GitHub main 保持同步，但无需无意义地重建服务。

统一脚本使用不可变 release、ALB 精确健康检查摘流和数据库备份门禁。正式发布前先执行
`bash scripts/deploy-all-production.sh --dry-run`；任何摘流、备份或回滚预检失败都不得绕过。
正式发布和 dry-run 还必须用 `NEXUSFLOW_PROVIDER_COST_MANIFEST` 指向随机
`/run/nexusflow-provider-cost.*/manifest.json`：root:root `0700` 目录只能含一个
root:root `0600` manifest，价本内容不得进入 Git、制品或日志；旧版回滚前必须由统一
状态机停用，失败回滚恢复新版时必须用同一 manifest 重激活。
生产 `.env` 还必须显式包含当前 Provider 出站 host allowlist，且不得包含
HTTP(S)/ALL proxy 变量；nginx 的 `/v1` 分路由 body cap（大上下文 50 MiB、
embeddings 8 MiB、audio/其余 1 MiB）、timeout、连接和速率门禁必须由 release
helper 在两节点通过 preflight，不能只依赖应用层。公开 Next proxy 不得转发任何
`/v1` 别名；上传必须先鉴权再读 body，下载必须流式转发，并保留 nginx 的
body/连接/速率/带宽门禁。
完整操作与权限要求见 `docs/production-release-runbook.md`。

## 完成标准

- 需求已实现或结论有当前证据；
- 相关测试/build/真实路径按风险通过；
- 没有遗留未解释的工作区修改；
- 本地 main、GitHub main、生产 main 的关系清楚；
- 项目事实变化已写回 `WIKI.md`；
- 未泄露任何凭据、客户数据或私密请求内容。
