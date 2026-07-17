# 新模型上线 Playbook

> 目的：任何人（或 AI 助手）接到「上线一个新模型」的需求时，照本清单执行即可全面、无遗漏地完成，不踩历史上踩过的坑。
> 最近一次全流程实操参考：Kimi K3（`kimi/kimi-k3`，2026-07-17~18，commits 45a9ace→f5497e3）。

---

## 0. 平台背景速览（30 秒）

- **架构**：`backend/`（Express 5 + Postgres/Redis，PM2 cluster×2）+ `frontend/`（Next.js，静态营销页+dashboard）。生产服务器 SSH 别名 `nexus`，应用在 `/root/distiny/nexusflow`，线上 https://nexusflow.hk。
- **模型目录**：静态种子 `backend/src/data/models.ts`（`staticModels`）+ DB 覆盖层 `model_overrides` 表（admin「模型目录」tab 管理，10s 轮询全节点生效，空表=纯静态）。**计费与展示共用同一份 `models` 数组**。
- **路由**：`backend/src/services/providers.ts` 按模型 ID **前缀** 路由到上游（dashscope / anthropic / volcengine-ark）。模型 ID 原样透传给上游。
- **协议**：`/v1/chat/completions`（OpenAI）、`/v1/messages`（Anthropic，直通或转换桥）、`/v1/responses`（**实测仅通义千问系支持**）。协议宣告在 `backend/src/utils/model-protocols.ts`——**必须实测再宣告，不要想当然**。
- **前端 API 链路**：浏览器 → Next `/proxy/[...path]` 代理 → 后端。**验证必须走浏览器真实点击路径，curl 直连后端不算数**（代理层有自己的解码/编码行为）。

## 1. 上线前：核对官方模型卡

数据源：阿里云百炼控制台模型详情页（JS 渲染，WebFetch 抓不到，用 `agent-browser`）。必须拿到：

- [ ] 模型 ID（**注意新模型多为 `厂商/模型名` 带斜杠格式**，如 `kimi/kimi-k3`）
- [ ] 输入价 / 输出价 / **缓存命中价**（元/百万 token）；分层定价则记每层
- [ ] 上下文长度 / 最大输入 / 最大输出（思考模式下可能不同）
- [ ] 能力清单：视觉/音频输入、思考模式（always/mixed/默认开关）、函数调用、结构化输出、联网搜索、前缀续写、批量、缓存
- [ ] **该模型在百炼账号是否已开通**——新第三方模型要在控制台点开通/同意协议，否则上游报 "The product is not activated"。先让用户开通再做端到端验证。

## 2. 后端改动清单

| 文件 | 改什么 |
|------|--------|
| `backend/src/data/models.ts` | 新增 AIModel 条目。**必填**：id/name/provider/description/contextLength/promptPrice/completionPrice/category/tags/maxOutput/supported。**别漏**：`cacheReadPrice`（有缓存价必须显式配，否则回退默认 10%/20% 乘数会算错）、分层价 `tokenPricingTiers`（每层可带 cacheReadPrice）、omni 类加 `audioInputPrice/audioOutputPrice`、上游 anthropic 端点未接入则加 `anthropicPassThrough: false` |
| `backend/src/utils/model-capabilities.ts` | 思考模式集合（MIXED_THINKING_DEFAULT_ON/OFF/ALWAYS）、PRESERVE_THINKING_MODELS、SEARCH_ENABLED_MODELS（非 qwen/deepseek/minimax 但支持联网搜索的）|
| `backend/src/services/providers.ts` | 通常**不用改**（前缀匹配）。全新厂商前缀才需要加 |
| `backend/src/utils/model-protocols.ts` | 通常不用改。但 `/v1/responses` 支持面收紧在这里；`anthropicPassThrough` 语义见 §4 |

- `ensureRoutingDefaults()` 启动时自动为新模型建 capacity 行，无需手动。
- category 决定 model_type（chat/embedding/image/video/audio）→ 决定协议与计费路径，别写错。

## 3. 前端 + 文档同步清单（「全面」的定义）

| 位置 | 内容 |
|------|------|
| `frontend/app/(dashboard)/docs/api/<厂商>/page.tsx` | 模型表、示例代码（模型 ID）、能力说明（视觉示例等） |
| `frontend/app/(dashboard)/docs/models/page.tsx` | 厂商系列卡片 models 列表 + pricingTable |
| `frontend/app/(dashboard)/docs/api/cache/page.tsx` | 显式/隐式缓存两张表 |
| `frontend/app/(dashboard)/docs/context-cache/page.tsx` | 厂商缓存汇总行 |
| `frontend/app/(dashboard)/docs/api/parameters/page.tsx` | preserve_thinking 等参数支持模型列表 |
| `frontend/app/page.tsx` | 首页：主推大卡片（换主推时）、hero NEW pill/指标、`fallbackModelRows`、`fallbackCarouselModels`（**兜底价格照 models.ts 抄，别凭印象写**——踩过 Seedance 0.04/0.44 的坑） |
| `frontend/lib/models.ts` | `getRecommendedModels` 的 preferredIds（置顶新旗舰、汰换旧的） |
| `MODELS.md` | 厂商模型表 + 服务提供商汇总的数量行 + 协议矩阵 |
| `wiki.md` | 思考模式分类表、preserve_thinking、显式缓存模型列表、大语言模型清单 |

## 4. 已知坑（每条都真实踩过）

1. **带斜杠的模型 ID 有三层坑**：
   - Express `/:id` 只匹配单段 → 前端 fetch 模型详情必须 `encodeURIComponent(decodeURIComponent(id))`（两个详情页都已处理）；
   - **Next `/proxy/[...path]` 代理会把每段解码再 join** → 已修为 `path.map(encodeURIComponent).join("/")`，别回退；
   - `model_overrides` 的 ID 正则需含 `/`（已修）。
2. **缓存计费三个函数要一致**：`calculateTokenCost`（models.ts）、`calculateOpenAiCacheAwareCost`（cache-billing.ts）、`calculateAnthropicUsageCost`（messages.ts）。加新价格字段时三处都要检查（messages 路径曾漏 cacheReadPrice 少收钱）。
3. **`anthropicPassThrough` 字段**：缺省/true=/v1/messages 直通上游 `apps/anthropic`；`false`=走平台内 `anthropic-openai-bridge` 协议转换（上游未接入该模型时）。可在 admin 模型目录按模型覆盖热切换。上游后来接入了就改回 true。
4. **协议支持必须实测**：用服务器 DASHSCOPE_API_KEY 直调上游各端点（compatible-mode/v1/chat/completions、/responses、/apps/anthropic/v1/messages）确认，再决定 model-protocols.ts 宣告什么。Responses 端点 kimi/glm/deepseek/minimax 全不支持。
5. **本地联调**：`USE_PG_MEM=true PORT=3201 npx tsx src/index.ts`，测试 key=`sk-air-local-test-000000000000000000000000`。pg-mem 缺 SQL 函数要在 `db/memory.ts` registerFunction（已补 round/now/to_char/replace/length）。真实上游调用需临时 export 生产 DASHSCOPE_API_KEY（只进环境变量，不落盘）。
6. **WIKI.md/wiki.md 大小写冲突**：macOS 上同一文件，WIKI.md 永远显示脏。`git update-index --skip-worktree WIKI.md` 后 rebase/push 不再被卡。
7. **流式路由的 catch 里禁止裸调 `res.status()`**：SSE 头已发出会抛 ERR_HTTP_HEADERS_SENT，必须先判 `res.headersSent`。
8. **omni 类模型**：音频分模态计费走 `audioInputPrice/audioOutputPrice`，漏配会按文本价少收 7-8 倍。

## 5. 验证清单（全过才算上线完成）

**生产端到端**（建临时用户+key，测完删）：

```bash
# 建临时 key（key_hash = sha256(完整token)，key 列存脱敏值）
KEY="sk-air-$(openssl rand -hex 24)"; HASH=$(printf "%s" "$KEY" | shasum -a 256 | cut -d" " -f1)
ssh nexus "docker exec quadrant-postgres psql -U quadrant -d quadrant -c \"
  INSERT INTO users (id,email,nickname,balance) VALUES ('nf-model-test-user','t@nexusflow.hk','测试',20);
  INSERT INTO api_keys (id,user_id,name,key,key_hash) VALUES ('nf-model-test-key','nf-model-test-user','e2e','${KEY:0:12}masked','$HASH');\""
# 测完清理：DELETE usage_logs/api_keys/users WHERE 对应 id
```

- [ ] `/v1/chat/completions` 非流式（有思考模式则确认 reasoning_content）
- [ ] `/v1/chat/completions` 流式（末 chunk usage）
- [ ] 视觉模型：image_url 输入实测（官方样例图 OCR）
- [ ] `/v1/messages` 非流式+流式（直通或桥，事件序完整）
- [ ] 工具调用 + tool_result 回环（如支持）
- [ ] **计费核对**：查 `usage_logs`（`ssh nexus docker exec quadrant-postgres psql ...`），手算每笔（含缓存命中价）与 cost 列精确一致，余额扣减吻合
- [ ] 老模型回归：qwen3.7-max 走一遍 chat+messages

**浏览器真实路径**（`agent-browser`，不是 curl）：

- [ ] 首页 → 点新模型入口 → 详情页完整渲染（价格/上下文/协议徽章正确）
- [ ] 模型列表页 → 点卡片 → 详情页（编码 URL 路径）
- [ ] `/api/models` 总数+新条目字段+capabilities 正确
- [ ] docs 相关页、pricing 页正常

## 6. 部署 runbook

```bash
# 本地：typecheck + build 全过再提交
cd backend && npx tsc --noEmit && cd ../frontend && npx next build
git add <明确列出文件，排除 WIKI.md> && git commit && git push origin main
# 若 push 被拒：git update-index --skip-worktree WIKI.md && git rebase origin/main && git push
# 生产：
ssh nexus 'cd /root/distiny/nexusflow && git pull origin main \
  && cd backend && npm run build && cd ../frontend && npm run build \
  && pm2 reload quadrant-backend && pm2 reload quadrant-frontend && pm2 ls'
# 然后执行 §5 验证清单
```

- 服务器可能有未收编漂移（git status 先看一眼），冲突时优先保服务器侧计费逻辑。
- admin 面板走 nginx Basic Auth；绕过测 UI：直连 19999 + localStorage 注入 admin 会话（详见团队记忆）。

## 7. 复盘纪律

- 每上线一个模型，把新踩的坑**追加到本文件 §4**。
- 「验证过」三个字只允许出现在：真实用户路径（浏览器+代理层）+ 生产端到端 + 计费手算核对 全部完成之后。
