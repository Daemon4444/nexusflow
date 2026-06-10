# 海外区域支持 — 上线与迭代清单

> 代码已完成于分支 `feature/overseas-region-support`（2026-06-10），本文档是后续迭代的唯一依据。
> 状态标记：✅ 已完成 / ⏸ 等待外部条件 / 🔲 待开发

## 一、已完成的能力（代码层）

- ✅ `backend/src/services/upstream.ts`：`resolveUpstream(modelId, { region })` 统一上游解析。
  选择逻辑：显式区域过滤 → `model_allowlist` 过滤 → `priority` 降序。渠道配置缺失或不可用时
  回退静态配置 + 环境变量，存量行为不变。
- ✅ 渠道数据模型（`data/provider-channels.ts`）：`region` / `workspace_id` / `enabled` /
  `priority` / `model_allowlist`；新加坡、法兰克福 URL 的 `{WorkspaceId}` 占位符替换与保存校验。
- ✅ 预置 dashscope 四区域渠道（首次访问 admin provider 接口时种子化）：

  | channelId | region | base_url | 默认状态 |
  |---|---|---|---|
  | `cn-beijing` | cn-beijing | `https://dashscope.aliyuncs.com/compatible-mode/v1` | enabled, priority 100 |
  | `ap-southeast-1` | ap-southeast-1 | `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | disabled |
  | `us-east-1` | us-east-1 | `https://dashscope-us.aliyuncs.com/compatible-mode/v1` | disabled |
  | `eu-central-1` | eu-central-1 | `https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1` | disabled |

- ✅ 用户侧协议：请求头 `X-NF-Region: <region>` 显式指定区域；区域不可用/模型不在区域内
  返回 400 `region_unavailable`，**绝不静默回退**到其他区域（合规考虑）。
- ✅ 接线完成：`/v1/chat/completions`、`/v1/embeddings`、`/v1/images/generations`、
  `/v1/messages`（Anthropic 协议）、Playground。
- ✅ 管理接口：`PUT /api/provider/:providerId/channels/:channelId`（admin），body 字段：
  `name` / `apiBaseUrl` / `apiKey`（留空保持原值）/ `region` / `workspaceId` / `enabled` /
  `priority` / `modelAllowlist`。渠道摘要接口返回 `usable` 标志。
- ✅ 用量对账：`usage_logs.region` 列（migration 006），SLS 日志同步透传 region 字段。
- ✅ 顺手修复：删除死代码 `services/fallback.ts`；`findProvider` 移除 dashscope 兜底；
  补声明缺失依赖 `@alicloud/log`；migration 006 幂等补录 `cached_tokens` 两列。

## 二、关键实测结论（2026-06-10，生产 key）

| 测试 | 结果 |
|---|---|
| 国内 key → 北京 | 200 正常 |
| 国内 key → 美国（dashscope-us） | **401 invalid_api_key** |
| 国内 key → 新加坡（dashscope-intl 旧版） | **401 invalid_api_key** |

**结论：国内 DASHSCOPE_API_KEY 无法调用海外区域，每个海外区域必须单独获取 API Key。**
代码已按此收紧：环境变量 key 回退仅对 `cn-beijing` 生效，海外渠道未配独立 key 时按
`region_unavailable` 拒绝。

另：新加坡旧版 URL `dashscope-intl.aliyuncs.com` 官方公告即将下线，渠道预置的是新版
`{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`，不要改回旧版。

## 三、上线步骤（拿到海外 key 后照做）

### Step 1 合并部署（不依赖海外 key，可先做）

```bash
git checkout main && git merge feature/overseas-region-support
# 部署到 nexus 服务器后：
npm install            # 新增依赖 @alicloud/log
npm run db:migrate     # migration 006：usage_logs.region
pm2 restart quadrant-backend
```

合并部署后线上行为与之前完全一致（海外渠道 disabled，默认全走北京）。

### Step 2 开通区域、获取凭证（⏸ 当前卡在这里）

百炼控制台 → 右上角地域切换器 → 选目标地域：

- **新加坡**：开通后获取该地域 API Key + 业务空间的 Workspace ID（形如 `llm-xxxx`）
- **美国（弗吉尼亚）**：获取该地域 API Key（无需 Workspace ID）
- **法兰克福**：同新加坡

注意：海外地域可能要求国际站（alibabacloud.com）账号，以实际控制台为准（实测美国区错误
信息链接指向国际站文档）。

### Step 3 配置并启用渠道

```bash
# 以新加坡为例（admin 鉴权）
curl -X PUT https://nexusflow.hk/api/provider/dashscope/channels/ap-southeast-1 \
  -H "Content-Type: application/json" -H "Authorization: Bearer <admin-session>" \
  -d '{"apiKey": "sk-新加坡key", "workspaceId": "llm-xxxx", "enabled": true}'

# 美国区
curl -X PUT .../channels/us-east-1 -d '{"apiKey": "sk-美国key", "enabled": true}'
```

### Step 4 验收

```bash
# 1. 显式区域调用应 200，且响应来自对应区域
curl https://nexusflow.hk/v1/chat/completions \
  -H "Authorization: Bearer <用户key>" -H "X-NF-Region: ap-southeast-1" \
  -d '{"model": "qwen-plus", "messages": [{"role": "user", "content": "hi"}]}'

# 2. 不带 region 头仍走北京（usage_logs.region = cn-beijing）
# 3. 区域外模型显式请求应 400 region_unavailable（如 deepseek-v3.2 + ap-southeast-1）
# 4. SELECT region, count(*), sum(cost) FROM usage_logs GROUP BY region; 能分区域对账
```

### Step 5 核正模型 allowlist（启用区域后立刻做）

当前海外渠道预置 allowlist 为 `["qwen", "qwq", "text-embedding"]`，是按"三方直供仅限国内"
推测的。开通后对照该区域控制台实际上架模型清单，通过 `modelAllowlist` 字段修正。
已知约束：DeepSeek/GLM/Kimi/MiniMax 三方直供、wan/wanx 图像视频仅在国内地域。

## 四、待开发迭代（按优先级）

1. 🔲 **海外定价**（上线放量前必须）：海外区域上游成本与北京不同（大概率 USD 计价）。
   决策点：统一售价吸收差价 vs 按区域差异化定价。若差异化，需要 `models.ts` 价格体系
   支持按 region 区分（或 `pricingByRegion` 字段），计费链路 `calculateTokenCost` /
   `user-discounts` 同步改造。usage 已有 region 字段，成本核算数据是齐的。
2. 🔲 **API Key 级默认区域**：`api_keys` 表加 `default_region` 列，控制台创建 key 时可选；
   `resolveUpstream` 的 region 来源优先级改为：请求头 > key 设置 > 不限。海外用户免带头。
3. 🔲 **管理后台渠道编辑 UI**：渠道管理页（frontend `app/admin`）增加区域渠道的
   增删/启停/填 key 表单，对接已有的 PUT channels 接口。当前只能 curl。
4. 🔲 **用户文档**：docs 页新增"区域路由"章节：`X-NF-Region` 用法、各区域模型表、
   `region_unavailable` 错误说明。
5. 🔲 **跨区域容灾**（显式路由稳定后再做）：北京 5xx/超时自动重试海外区域。
   注意只对非流式安全重试；流式请求已开始输出后不可重试。
6. 🔲 **仓库卫生**：`WIKI.md` 与 `wiki.md` 大小写冲突，macOS 工作区永远显示脏改动，
   挑一个删掉。

## 五、相关文件索引

| 文件 | 职责 |
|---|---|
| `backend/src/services/upstream.ts` | 区域解析核心 + 四区域种子 + `X-NF-Region` 读取 |
| `backend/src/data/provider-channels.ts` | 渠道模型 / 校验 / WorkspaceId 占位符 |
| `backend/src/routes/provider.ts` | 渠道管理接口（PUT channels / switch-channel / 摘要） |
| `backend/src/db/migrations/006_usage_region.sql` | usage region 列 |
| `backend/src/routes/{v1,messages,playground}.ts` | 各协议入口接线点 |
