# qwen3.7-flash 与 MiniMax/MiniMax-M3 上线记录（2026-08-03）

本文件是两模型接入的**验证记录与发布依据**，供 review 与发布执行对照。
新增坑已追加至 `docs/MODEL_ONBOARDING.md` §4（第 18–19 条）。

## 1. 模型事实

### qwen3.7-flash（官方价卡 + 上游实测）

| 项 | 值 |
|---|---|
| 上下文 / 最大输入 / 最大输出 | 1,000,000 / 991K（思考 983K）/ 131,072 |
| 三档价（输入/输出） | 0-32K：¥0.2/¥0.8；32K-256K：¥0.6/¥2.4；256K-1M：¥1.2/¥4.8 |
| 缓存（隐式/显式命中） | 0.04/0.02、0.12/0.06、0.24/0.12（全档=标准倍率 20%/10%） |
| 显式缓存创建 | 各档输入价 ×1.25（0.25/0.75/1.5），符合标准倍率 |
| 思考模式 | mixed，默认开（实测无参数时返回 reasoning_content），`enable_thinking:false` 可关 |
| 视觉 | 原生视觉语言模型，官方样例图 OCR 实测通过 |
| 思考单独价 | 无 |

### MiniMax/MiniMax-M3（官方价卡 + 上游实测）

| 项 | 值 |
|---|---|
| 上下文 / 最大输入 / 最大输出 | 1,000,000 / 1M / **524,288**（官方页显示"-"，用超额 max_tokens 探针从上游报错 `does not support max tokens > 524288` 取得） |
| 输入 / 输出 | ¥4.2 / ¥16.8 |
| 缓存 | **仅隐式**，命中 ¥0.84（=20% 标准倍率）；官方未公示显式价，实测 usage 自动带 `cached_tokens` |
| 思考模式 | always：实测 `enable_thinking:false` 仍返回 reasoning_content，不可关 |
| 视觉 | 原生多模态，官方样例图实测通过 |

## 2. 上游协议探测（生产 dashscope cn-beijing 渠道凭据，标准域名）

| 端点 | qwen3.7-flash | MiniMax/MiniMax-M3 |
|---|---|---|
| `compatible-mode/v1/chat/completions` | 200 | 200 |
| `apps/anthropic/v1/messages` | 200（thinking 块） | InvalidParameter（不支持） |
| `compatible-mode/v1/responses` | 200 | Unsupported model |

结论：flash 保持默认直通、宣告 responses（qwen 前缀自动覆盖）；M3 配置
`anthropicPassThrough: false` 走协议转换桥，不宣告 responses（`model-protocols.ts`
非 qwen 前缀自动不宣告，无需改动）。两者均走标准 `dashscope.aliyuncs.com`，
无需新增渠道、不改出网白名单。用户示例代码中的专属 maas 域名经确认不需要。

## 3. 随行披露扩展：仅隐式缓存模型

`ModelCapabilities` 新增 `supports_explicit_context_caching`：

- 显式缓存开关（`cache_control` / `enable_context_caching`）按官方模型白名单披露，不能按厂商前缀推断；
- `supports_context_caching` 扩展覆盖 MiniMax chat 模型与 `kimi-k3`
  （后者为 qwen3.8-max 上线记录遗留 #2，本次一并修复：¥2/M 隐式价此前收费但从未披露）；
- `buildCachePricing` 对仅隐式模型只披露 `implicitHit`，不虚构官方未公示的
  显式命中/创建价；前端详情页、pricing 页对无显式字段自适应渲染；
- 仅隐式模型不宣告 `enable_context_caching` 参数；
- 计费不受影响：`resolveCachePricing` 的显式价回落隐式价，M3 即便被传入
  cache_control 也按 ¥0.84 结算，不多收不少收。

## 4. 本地验证（全部通过）

```bash
npm --workspace backend run test:official-pricing   # 44 模型 0 偏差（42→44）
npx tsx backend/scripts/test-model-catalog.ts        # 含两模型专项断言
npm --workspace backend run test:billing
npm --workspace backend run test:stream-reliability
cd backend && npx tsc --noEmit
npm run build:backend && npm run build:frontend
```

本地 pg-mem 实例（`USE_PG_MEM=true PORT=3207`）实测 `/api/models`：

- 总数 69 → **71**；
- `qwen3.7-flash`：三档 cachePricing（隐式/显式/创建）逐档正确，thinking mixed 默认开，
  三协议宣告齐全，`enable_context_caching` 在 allowed_parameters；
- `MiniMax/MiniMax-M3`：cachePricing 仅 `implicitHit: 0.84`，thinking always，
  仅 chat+messages 两协议，`enable_context_caching` 不在 allowed_parameters；
- `kimi-k3`：cachePricing `implicitHit: 2` 首次披露；
- `GET /api/models/MiniMax%2FMiniMax-M3` 编码路径详情正常。

## 5. 未做的事（有意）

- **Provider 成本价本一行未动**：两模型 `provider_cost = NULL`、
  `provider_cost_resolution = missing_version`，毛利栏空白，待源可溯的价本行发布。
- **浏览器真实点击路径未跑**（agent-browser 回归属发布前动作，本次仅代码交付）；
  生产端到端与计费手算需发布后按 `MODEL_ONBOARDING.md` §5 执行。
- **未 push、未发布**。首页与推荐位未动（两模型非首页主推）。

## 6. 已知遗留

1. `docs/api/minimax/page.tsx` 的 M2.5 行 context 写 "192K" 与目录 204800 不一致（历史遗留，本次未动其他模型行）。
2. MiniMax-M3 官方价卡的 Batch 半价（Batch File/Batch Chat）与 qwen3.7-flash 的 Batch 价平台无字段表达，未纳入（平台不提供 Batch 通道）。

## 7. 发布前独立 review 勘误（2026-08-03）

独立 review 直接读取阿里云当前官方价格页
`https://help.aliyun.com/zh/model-studio/model-pricing`，发现初始接入把
qwen3.7-flash 第一档误抄成 0-128K。官方当前值为 **0-32K**，第二档为
**32K-256K**；目录、机器校验基准和专项测试均已改正。若不修正，32K-128K
输入会错误套用最低档并少收。
