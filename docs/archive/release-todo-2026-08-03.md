# 发布 TODO — 2026-08-03 晚（qwen3.8-max 计费修正 + qwen3.7-flash / MiniMax-M3 上架）

> **已归档（2026-09-26）**：本清单对应的功能早已上线，内容只作历史参考，不代表现状。当前流程见 [文档索引](../README.md)。


> 发布单元：`836abdb1..c3b36b46`（本地 main 领先 origin/main 的 9 个提交）
> 生产当前：`0ecdce6b`（2026-08-01 构建）。目标：`c3b36b46`。
> 本次同时带上：37 模型缓存价首次披露、qwen3.7-plus 档2 降价、glm-5.1 涨价、
> ca5ca6d2 body 准入租约变更、kimi-k3 缓存价首次披露。

## 一、发布前（本地）

- [ ] 浏览器回归（本地起前后端，真实点击路径，非 curl）：
  - [ ] `/models/qwen3.7-flash`：三格缓存价块 + 阶梯表 5 列（0.04/0.02、0.12/0.06、0.24/0.12）
  - [ ] `/models/MiniMax%2FMiniMax-M3`：**仅隐式单格布局（新代码路径）**，¥0.84 + 「无需也不支持显式缓存开关」文案
  - [ ] `/models/kimi%2Fkimi-k3`：隐式 ¥2/M 首次出现
  - [ ] `/pricing`：缓存披露行 37 → 39+（M3/kimi 只显示隐式段）
  - [ ] 首页正常（两新模型非主推，不应出现在 hero）
  - [ ] docs：qwen、minimax、cache、context-cache、limits、parameters、responses 各页渲染正常
- [ ] `npm audit --registry=https://registry.npmjs.org --omit=dev --audit-level=high` = 0
- [ ] 确认 ca5ca6d2 作者发布意愿；其 Redis 变体测试（test:request-body-admission）已在有隔离 Redis 的环境跑过
- [ ] `git push origin main`（fast-forward，已确认无冲突、无分叉）
- [x] 官方价本存档已随勘误提交入库（`docs/pricing/`，MODEL_ONBOARDING §4 第 20 条的防线依据）
- [x] 发布前复核发现并修正 5 处 limits 抄错行（kimi k2.5/k2.6、MiniMax-M2.5、glm-4.7、deepseek-v3），价格 0 问题

## 二、发布（双节点，按 docs/production-release-runbook.md）

- [ ] `ssh nexus` → `cd /root/distiny/nexusflow` → `git pull --ff-only origin main`
- [ ] 准备 `NEXUSFLOW_PROVIDER_COST_MANIFEST`：随机 `/run/nexusflow-provider-cost.<random>/manifest.json`，目录 root:root 0700、仅一个 0600 文件（本次价本未变，仍强制校验）
- [ ] `bash scripts/deploy-all-production.sh --dry-run` —— 任何摘流/备份/回滚预检失败不得绕过
- [ ] `bash scripts/deploy-all-production.sh`（逐节点摘流→排空→切换→直连验证，禁止两节点同时离流）
- [ ] 双节点核对：Git SHA=c3b36b46、frontend build、PM2、`/api/health`、`/api/version`（两节点直连各查一次，只看 ALB 不算数）

## 三、发布后放行门（不过 = 上线未完成）

- [ ] 建临时用户+key（按 MODEL_ONBOARDING §5 的 SQL，key_hash=sha256）
- [ ] qwen3.7-flash：chat 非流式（确认 reasoning_content 默认出现）、流式（末 chunk usage）、
      `enable_thinking:false` 可关、视觉 image_url OCR、`/v1/responses`、`/v1/messages` 直通
- [ ] MiniMax/MiniMax-M3：chat 流式/非流式、`/v1/messages` 走桥（事件序完整）、视觉、
      usage 出现 `cached_tokens` 时按 0.84 计
- [ ] **计费手算**：`usage_logs` 逐笔核对与 cost 列精确一致、余额扣减吻合：
  - [ ] flash 三档边界各一笔（0.2/0.8、0.6/2.4、1.2/4.8）
  - [ ] flash 缓存命中一笔（隐式 20% 价）
  - [ ] M3 隐式缓存命中一笔（0.84）
  - [ ] M3 思考输出无单独价（按 16.8 收）
- [ ] 老模型回归：qwen3.7-max chat + messages 各一笔
- [ ] ALB 公网浏览器点开两个新模型详情页 + pricing
- [ ] 删临时 usage_logs / api_keys / users
- [ ] 观察 SLS `body_admission_*` 拒绝率（ca5ca6d2 生效后）；`.env` 的 3 行
      `PUBLIC_BODY_*` 临时值**先不删**，稳定运行 1-2 天后再回收（需两节点同时改）
- [ ] 两模型 `provider_cost` 应为 NULL（价本未动，属预期，毛利栏空白）

## 四、收尾

- [ ] 生产工作区 / GitHub main / 本地 main 三者收敛确认
- [ ] 如有新坑，追加 `docs/MODEL_ONBOARDING.md` §4
- [ ] 项目事实变化如有遗漏，回写 `WIKI.md`
