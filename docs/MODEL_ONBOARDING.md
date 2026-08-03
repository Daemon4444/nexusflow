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
9. **别把缓存倍率当配置用（qwen3.8-max，2026-08-03）**：平台按 DashScope 标准倍率兜底（隐式 20% / 显式 10% / 创建 125%），这三个数是官方规则、对多数模型是对的，但官方对个别模型另有定价。qwen3.8-max 就是例外（隐式 ¥1.5=12.5%、显式 ¥1=8.3%）。用官方全量价本逐字段机器比对，别肉眼看：`npm --workspace backend run test:official-pricing` 必须 0 偏差。首次跑该脚本在 42 个在售模型里查出 **26 处偏差**（11 个模型售价错、5 个模型上下文/最大输出错）。
10. **拆开「显式/隐式」两个缓存价会引爆四条下游路径（同上）**：两个价原本相等时，下面这些判定错了也没后果；一旦不等，全部变成真金白银的错账。加价格字段时必须同时检查：
    - `explicitCache` 的判定源：显式缓存有 **两条** 开启途径 —— Anthropic 风格的 `messages[].cache_control` **和** DashScope 的 `enable_context_caching` 参数。只认前者会把显式命中按隐式价收（多收 50%~100%）。统一走 `cache-billing.ts` 的 `isExplicitCacheRequested(messages, requestBody)`。
    - `/v1/responses` 曾把 `explicitCache` 硬编码为 `false`，而该路由把整个 `req.body` 透传上游，等于用户开了显式缓存却按隐式价结算。
    - `/v1/messages` **不能** 凭 `usage.cache_read_input_tokens` 非零就按显式价：`anthropic-openai-bridge.ts` 会把 OpenAI 的隐式 `cached_tokens` 映射进该字段（少收 33%~50%）。必须按请求判定。
    - `playground` 硬编码 `false` 是对的 —— 它不透传用户 body，不存在缓存开关。
11. **思考模式可能是另一个价（同上）**：官方对部分模型的思考模式单独定价，且「思维链+回答」整体按思考价计费（`qwen-plus` 分档 ¥8/¥24/¥64 vs 非思考 ¥2/¥20/¥48，`qwen3-32b`/`qwen3-235b-a22b` ¥20 vs ¥8）。用 `thinkingCompletionPrice` 表达，判定信号是上游 `completion_tokens_details.reasoning_tokens > 0`（已实测流式末 chunk 也带该字段）。
    ⚠ **断流估费会丢这个信号**：`estimate-stream-usage.ts` 原本只返回三个计数，思考模式断流请求会掉回非思考价（少收 4 倍）。估费必须一并输出 `completion_tokens_details.reasoning_tokens`。
12. **新价格字段必须同步登记 `model-overrides` 白名单（同上）**：`sanitizeModelDoc` 是白名单，未登记的字段被**静默丢弃**，后台改价即失效。这是 `74bc436d` 修过的同类漏损，`cacheReadExplicitPrice` / `thinkingCompletionPrice` 又踩了一次。已加断言把 5 个价格字段 + `anthropicPassThrough` 全部纳入回归门。
13. **披露价必须与实扣价同源（同上）**：平台对 37 个模型收缓存费但从未公示过价格。现由 `resolveCachePricing` / `resolveCompletionPrice` 作为唯一入口，计费与 `/api/models` 的 `cachePricing`/`thinkingPricing` 共用，前端只渲染不重算倍率。披露边界记得按账本精度取整（曾输出 `0.16000000000000003`）。
14. **`/api/models` 的动态合并会吞掉计费字段（同上）**：模型同时存在于静态目录与 `provider_models` 时，合并只回填了 `promptPrice`/`completionPrice`/三个 tier 字段，把 `cacheReadPrice`、音频价、`anthropicPassThrough`、`defaultOutputReservation` 全丢了。计费不受影响（直接 import `models`），但披露会错。
15. **思考价不能用 max() 兜底（review 补充）**：曾在 `/v1/messages` 用 `max(非思考价, 思考价)` 结算，理由是"Anthropic usage 没有思维链细分"。这是**实扣**而非预占，会让非思考请求被多收（`qwen-plus` 档1 是 4 倍），且与"披露价=实收价"自相矛盾。解法：桥路径由 `openAiUsageToAnthropic` 透传 `reasoning_tokens`；直通路径看响应内容（流式 `thinking_delta`、非流式 content 里的 `thinking` 块）。`calculateTokenCost` 现有显式 `opts.isThinking`，省略才走 max()，**账单重算类场景必须显式传入**，否则 `list_amount_cny` 虚高、`discount_rate` 出现虚假折扣。
16. **`resolveCachePricing.explicitCreation` 目前固定 `promptPrice × 1.25`**，无可配字段。当前 42 模型 0 偏差，若将来官方出现偏离该倍率的模型，schema 无法表达 —— `test:official-pricing` 会抓到，届时再加字段即可，不必提前造。
17. **`npm audit` 要显式指定官方源**：本机默认源是 npmmirror，不实现 audit 端点，会报 `[NOT_IMPLEMENTED]` 被误判成门失败。用 `npm audit --registry=https://registry.npmjs.org --omit=dev --audit-level=high`。
18. **「仅隐式缓存」的模型不能套显式披露模板（MiniMax-M3 / kimi-k3，2026-08-03）**：MiniMax 和 kimi 官方只有隐式缓存折扣，无显式开关。`resolveCachePricing` 的显式价会回落隐式价（计费正确），但披露层若照常输出 `explicitHit`/`explicitCreation`，等于**虚构官方未公示的价格**（创建价还会按 ×1.25 显示成一个不存在的收费项）。用 `supports_explicit_context_caching` 区分：仅隐式模型只披露 `implicitHit`、不宣告 `enable_context_caching` 参数，前端对无显式字段自适应。kimi/kimi-k3 的 ¥2/M 隐式价曾收费 3 周而从未披露（上次记录遗留 #2）。
19. **思考开关和输出上限必须实测，官方页会缺（同上）**：官方示例传 `enable_thinking: True` 不代表默认关（qwen3.7-flash 实测默认就开）；传 `enable_thinking: false` 返回 200 也不代表关掉了（MiniMax-M3 实测仍返回 reasoning_content，必须归入 ALWAYS 集合，否则 capabilities 宣告"可关"误导用户）。官方价卡"最大输出"可能显示"-"：用超额 `max_tokens` 探针，上游报错会明示上限（M3 报 `does not support max tokens > 524288`）。

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
