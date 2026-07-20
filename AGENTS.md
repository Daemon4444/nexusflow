# NexusFlow Agent 入口

本文件会被 Codex、Qoder 和兼容 `AGENTS.md` 的代码 Agent 自动读取。

## 开始任务前必须执行

1. **完整阅读 [`WIKI.md`](WIKI.md)**。它是项目全景、架构、不变量、部署和当前边界的唯一事实入口。
2. 根据任务再读专项文档：
   - 新模型：`docs/MODEL_ONBOARDING.md`
   - 模型目录：`MODELS.md` 与实际 `/api/models`
   - 发布回归：`docs/release-regression-test-checklist.md`
   - 海外区域：`docs/overseas-region-deployment-todo.md`
   - 历史审计：`REVIEW_SPEC_2026-07.md`
3. 先检查当前分支、工作区、GitHub 和必要的生产状态。不要把历史记忆当成当前运行事实。

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
- 数据：PostgreSQL 16 + Redis 7
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
- 数据库变更必须提交新的 migration；下一个编号从 `012` 开始。
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
bash scripts/deploy-production.sh
```

发布后核对 Git、PM2、Docker、`/api/health` 和 `/api/version`。文档变更也应让生产工作区与 GitHub main 保持同步，但无需无意义地重建服务。

## 完成标准

- 需求已实现或结论有当前证据；
- 相关测试/build/真实路径按风险通过；
- 没有遗留未解释的工作区修改；
- 本地 main、GitHub main、生产 main 的关系清楚；
- 项目事实变化已写回 `WIKI.md`；
- 未泄露任何凭据、客户数据或私密请求内容。
