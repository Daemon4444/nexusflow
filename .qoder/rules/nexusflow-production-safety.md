# NexusFlow 常驻b项目规则

本仓库是正在运行的 AI 模型聚合、Provider 路由和资金计费平台。任何任务开始前，必须完整阅读根目录 `AGENTS.md`、`WIKI.md` 和 `docs/AGENT_PROJECT_MEMORY.md`。

## 绝对不可忘记

1. 现网是 ALB 后的两个对等应用节点，不是单机。`ssh nexus` 只是登录发布编排主机。
2. 任何运行时变更必须使用 `scripts/deploy-all-production.sh` 覆盖两节点。不得把单节点 `deploy-production.sh` 当作完整发布。
3. 只 build 一次，将同一 Git SHA 的不可变制品分发到两节点。两台分别 build 会导致 Next.js chunk 混发。
4. 发布必须逐节点摘流、排空、切换和直连验证，不同时让两节点离流。
5. 只验证当前主机或只验证 ALB 公网结果，一律视为未完成。必须验证两节点 SHA、frontend build、PM2、health/version 和配置契约。
6. 未经用户明确授权和 dry-run/备份/回滚门禁，不得发布、切流、修改云资源或重启生产。
7. 当前生产数据是 PostgreSQL 16 + Redis 5.0 双副本。ACK/ECI 只是尚未切流的开发目标，不得误说成当前现网。
8. 收费路径必须保持余额预占、结算和释放；不得用“先查余额再扣款”，未知上游成本不得当作 0。
9. API Key 只按 hash 验证，管理写接口必须 admin 鉴权，用户资源必须验证 owner，Demo Admin 只能返回合成数据。
10. 不把 `.env`、AK/SK、Provider Key、支付密钥、Cookie、客户请求正文或个人信息写入代码、文档或日志。

当记忆与运行事实冲突时，停止假设，用双节点直连探针、数据库、当前代码和 Git SHA 查证。
