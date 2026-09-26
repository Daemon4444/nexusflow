# qwen3.8-max 上线记录（2026-08-03）

本文件是 `qwen3.8-max` 接入与随之发现的计费修正的**发布依据与验证记录**，供 review 与发布执行对照。
`docs/MODEL_ONBOARDING.md` §4 已追加本次新增的坑（第 9–15 条）。

## 1. 模型事实（以官方全量价本 CSV 为准）

| 项 | 值 |
|---|---|
| 模型 ID | `qwen3.8-max`（`qwen3.8` 返回 404，不是有效 ID） |
| 上下文 / 最大输入 / 最大输出 | 1,000,000 / 991,808 / 131,072 |
| 输入 / 输出 | ¥12 / ¥36 每百万 token |
| 输入（缓存命中，隐式） | ¥1.5 |
| 显式缓存创建 / 命中 | ¥15 / ¥1 |
| 思考模式 | 默认开启（实测返回 `reasoning_tokens`） |

上游实测（生产 dashscope `cn-beijing` 渠道凭据）：

- `compatible-mode/v1/chat/completions` → 200
- `apps/anthropic/v1/messages` → 200（返回 thinking 块）
- `compatible-mode/v1/responses` → 200

结论：保持默认直通，**不设** `anthropicPassThrough: false`，`model-protocols.ts` 无需改动。
无需 workspace id、无需新建 provider 渠道、无需改出网白名单（`dashscope.aliyuncs.com` 已在允许列表）。

## 2. 官方价本比对结果

新增 `backend/scripts/verify-official-pricing.ts`（`npm --workspace backend run test:official-pricing`），
逐字段比对 42 个在售模型。首轮查出 **26 处不一致**，已全部按官方价本修正，现为 **0 偏差**。

`qwen3.8-max` 自身零偏差。

### 2.1 停止多收客户

| 模型 | 项目 | 原 | 官方 |
|---|---|---|---|
| `qwen3.7-plus` | 档2（>256K）输入/输出 | ¥8 / ¥32 | **¥6 / ¥24** |
| `qwen3.7-max` | 显式缓存命中 | ¥2.4 | **¥1.2** |
| `deepseek-v3.2` | 显式缓存命中 | ¥0.4 | **¥0.2** |
| `kimi-k2.5` / `kimi-k2.6` | 显式缓存命中 | ¥0.8 / ¥1.3 | **¥0.4 / ¥0.65** |
| `glm-5.1` | 两档缓存 | 1.3 / 2 | **1.2·0.6 / 1.6·0.8** |
| `glm-4.7` | 两档缓存 | 未配（走倍率） | **0.6 / 0.8** |

### 2.2 补回漏收

官方对部分模型的思考模式单独定价，平台此前无此概念。

| 模型 | 非思考输出 | 思考输出 |
|---|---|---|
| `qwen-plus` | ¥2 / ¥20 / ¥48（分档） | **¥8 / ¥24 / ¥64** |
| `qwen3-235b-a22b`、`qwen3-32b` | ¥8 | **¥20** |
| `qwen3-8b` | ¥2 | **¥5** |

### 2.3 上下文 / 最大输出错配

`deepseek-v4-pro` 16K→**384K**（差 24 倍，客户拿不到长输出）、
`kimi-k2.5`/`k2.6` 98K→**16K**（原超上游上限，请求会失败且多占余额）、
`deepseek-v3` 上下文 131K→**64K**、`glm-4.7` 上下文→202752 且档2 边界→202752、
`MiniMax-M2.5` 上下文与输出、`qwen3.7-max`/`plus` 输出→131072、
`qwen3-235b-a22b`→16384、`qwen3.6-35b-a3b`→65536、`qwen-math-plus`→3072。

> `glm-4.7` 与 `MiniMax-M2.5` 原先把官方的「最大输入」误填成了「上下文」。

## 3. 四条计费路径的显式缓存判定（统一后）

| 路径 | 判定来源 |
|---|---|
| `/v1/chat/completions` | `isExplicitCacheRequested(messages, req.body)` |
| `/v1/responses` | `isExplicitCacheRequested(input, requestBody)` |
| `/v1/messages` | `isExplicitCacheRequested([messages, system], req.body)` |
| `playground` | 硬编码 `false`（不透传用户 body，事实正确） |

均共用 `cache-billing.ts` 的同一助手，不会各自漂移。要点见 `MODEL_ONBOARDING.md` §4 第 10 条。

## 4. 本地验证（全部通过）

```bash
cd backend && npx tsc --noEmit
npm --workspace backend run test:official-pricing   # 必须 0 偏差
npm --workspace backend run test:model-catalog      # 不在 CI，必须手跑
npm --workspace backend run test:billing
npm --workspace backend run test:stream-reliability
npm --workspace backend run test:audio-pricing
npm --workspace backend run test:provider-cost-import
npm --workspace backend run test:managed-routing
npm --workspace backend run test:admin-control-plane
npm --workspace backend run test:demo-admin
npm run build:backend && npm run build:frontend
npm audit --registry=https://registry.npmjs.org --omit=dev --audit-level=high  # 0 vulnerabilities
```

浏览器真实路径（本地 pg-mem 实例 + `agent-browser`，非生产）：

- `/models/qwen3.8-max`：首阶输入 ¥12、输出 ¥36、隐式缓存 ¥1.5、显式缓存 ¥1、缓存创建 ¥15 —— 与官方一致
- `/models/qwen-plus`：首阶非思考 ¥2 / 思考 ¥8，三档 ¥2→¥8、¥20→¥24、¥48→¥64 全对
- `/pricing`：缓存披露行 37 条，与支持缓存的模型数一致
- 首页：主推卡 `Qwen3.8 Max`、`2.4T`、`Flagship LLM`、`¥1/M` 正常渲染

## 5. 未做的事（有意为之）

- **Provider 成本价本一行未动**。`qwen3.8-max` 的 `usage_logs.provider_cost` 为 `NULL`、
  `provider_cost_resolution = missing_version`，即毛利栏空白。这不违反「成本不得当作 0」，
  但该模型没有毛利数据。若要补，需新的源工作表 → 新 `source.sha256` → 新 `PRICE_BOOK_ID`
  → 同步改 `scripts/deploy-all-production.sh` 的 4 个期望常量。
- **历史订单不追溯**。只修向前。
- **未发布**。

## 6. 发布方式

分两阶段，阶段一放行门 = 生产计费手算核对通过。
完整步骤、文件清单与手算核对表见发布方案（随本次 review 一并提供）。

⚠ 两个阶段都需要 `NEXUSFLOW_PROVIDER_COST_MANIFEST`（即使不改价本，`deploy-all-production.sh`
也会强制校验），路径须为 `/run/nexusflow-provider-cost.<random>/manifest.json`，
目录 root:root `0700` 且**只含** `manifest.json` 一个文件。

## 7. 已知遗留（本次未纳入范围）

1. `scripts/smoke.ts:50` 用 `getAllKeys()` 的 `key` 列做 Bearer token，但该列自 hash-only 改造后只存掩码，
   导致冒烟测试 71 项全部失败（`Authorization` 头含 `•` U+2022）。既存缺陷。
2. `kimi-k3` 官方有缓存折扣，但 `supports_context_caching` 判定只覆盖 qwen/GLM/deepseek-v4，
   其缓存价**不会被披露**（计费仍按配置的 ¥2 走）。
3. 官方「思考模式最大输入」（如 qwen3.8-max 983K）全站无字段可存，`docs/api/limits` 只有三列。
4. `glm-5.1` 本次是**涨价**（原售价低于官方，毛利被压得很薄），是唯一对客户涨价且幅度可观的项，建议单独评估。

## 8. 勘误（2026-08-03 晚，发布前复核）

§2.3 的「上下文/最大输出错配」批次中有 **5 处校准是错的**（把官方价本相邻行的数字抄了过来），
已在后续提交按官方存档（`docs/pricing/bailian-official-model-catalog-2026-08-03.md`）与上游
超额 max_tokens 探针实证后改回：

| 模型 | §2.3 错改为 | 正确值（存档+探针） | 错源 |
|---|---|---|---|
| `kimi-k2.5` / `kimi-k2.6` maxOutput | 16,384 | **98,304**（k2.5 实测 cap=98304） | 抄了 kimi-k2-thinking 行 |
| `MiniMax-M2.5` ctx/maxOut | 204,800/131,072 | **196,608/32,768**（实测 cap=32768） | 抄了 MiniMax-M2.7 行 |
| `glm-4.7` ctx/档2边界 | 202,752 | **169,984**（档2=166K，与官方阶梯表自洽） | 抄了 glm-5 行 |
| `deepseek-v3` ctx | 65,536 | **131,072** | 未知 |

价格类修正（§2.1/§2.2）经逐项复核全部正确。教训见 `MODEL_ONBOARDING.md` §4 第 20 条。
