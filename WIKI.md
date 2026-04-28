# Nexusflow Wiki (Unified)

本文档是 `ai-router-platform` 的统一项目文档，覆盖当前代码库的真实逻辑、运行链路、管理后台、支付、监控与部署说明。

更新时间：2026-04-28

---

## 1. 项目定位

Nexusflow 是一个统一 AI 网关平台，提供 OpenAI 兼容接口，对接多个模型能力（当前以 DashScope 统一入口为主），并包含：

- 用户认证与会话
- API Key 管理
- 用量统计与性能监控
- 充值与交易（Alipay + mock）
- 内部渠道管理（provider）
- 管理后台与工单处理

线上域名：`https://nexusflow.hk`

---

## 2. 技术与运行时

### 2.1 技术栈

- 前端：Next.js 16（App Router）+ React + TypeScript
- 后端：Express + TypeScript
- 主库：SQLite（`better-sqlite3`，WAL 模式）
- 缓存/限流：Redis（可选，不可用时降级到内存）
- 进程：Node + PM2（或手动启动）

### 2.2 关键端口

- 前端：`19999`（当前线上 Nginx 反代到该端口）
- 后端：`3001`

说明：仓库中存在旧文档提到 `3000` 入口，当前线上实际以 Nginx 指向 `19999` 为准。

---

## 3. 目录结构（核心）

```txt
ai-router-platform/
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   ├── db/
│   │   ├── data/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   └── utils/
│   └── data/ai-router.db
├── frontend/
│   ├── app/
│   ├── components/
│   └── lib/
└── ecosystem.config.js
```

---

## 4. 核心业务链路

### 4.1 API 调用链路（`/v1/chat/completions`）

1. API Key 校验（`validateApiKey`）
2. 用户/模型限流 + API Key 限流
3. 余额校验
4. provider 选择（当前模型统一路由到 `dashscope`）
5. 请求上游，返回 OpenAI 兼容响应
6. 记录 usage、扣费、交易记录
7. 更新 provider 级流量统计（RPM/TPM）

关键文件：

- [v1.ts](/root/distiny/ai-router-platform/backend/src/routes/v1.ts)
- [providers.ts](/root/distiny/ai-router-platform/backend/src/services/providers.ts)
- [rate-limiter.ts](/root/distiny/ai-router-platform/backend/src/services/rate-limiter.ts)
- [usage.ts](/root/distiny/ai-router-platform/backend/src/data/usage.ts)

### 4.2 异步任务链路（`/v1/tasks`）

- 图片/视频模型走异步任务接口
- 创建任务 -> 提交上游 -> 轮询状态 -> 回写任务结果

关键文件：

- [tasks.ts](/root/distiny/ai-router-platform/backend/src/routes/tasks.ts)
- [tasks.ts](/root/distiny/ai-router-platform/backend/src/data/tasks.ts)
- [adapters.ts](/root/distiny/ai-router-platform/backend/src/services/adapters.ts)

### 4.3 支付与充值链路

- 支持 `mock`、`page`、`qr` 三种充值方式
- `payment_orders` 持久化存单
- 回调验签 + 幂等入账 + 主动查单兜底

关键文件：

- [billing.ts](/root/distiny/ai-router-platform/backend/src/routes/billing.ts)
- [paymentOrders.ts](/root/distiny/ai-router-platform/backend/src/data/paymentOrders.ts)
- [alipay.ts](/root/distiny/ai-router-platform/backend/src/services/alipay.ts)

---

## 5. 数据模型（当前有效）

### 5.1 用户与认证

- `users`：用户信息、余额、密码哈希
- `sessions`：登录会话（Bearer token）
- `api_keys`：用户 API Key（`sk-air-...`）

### 5.2 用量与计费

- `usage_logs`：请求日志、token、cost、latency、ttft、tpot
- `transactions`：充值/消费流水
- `payment_orders`：支付订单状态机

### 5.3 内部渠道管理

- `providers`
- `provider_models`
- `provider_capacity`
- `provider_health`

### 5.4 限流与工单

- `user_rate_limits`
- `tickets`
- `async_tasks`

数据库初始化与迁移：

- [db/index.ts](/root/distiny/ai-router-platform/backend/src/db/index.ts)
- [001_initial_schema.sql](/root/distiny/ai-router-platform/backend/src/db/migrations/001_initial_schema.sql)

---

## 6. 鉴权与权限模型

### 6.1 用户鉴权

- 普通业务接口（`/api/keys`、`/api/usage`、`/api/tickets`）使用 session Bearer token

### 6.2 管理员鉴权

- 管理员能力通过白名单控制：
  - `ADMIN_EMAILS`
  - `ADMIN_USER_IDS`
- 中间件：
  - [admin.ts](/root/distiny/ai-router-platform/backend/src/middleware/admin.ts)

### 6.3 已收敛后台入口

- 主后台：`/admin`
- `/admin/dashboard` 重定向到 `/admin`

关键前端文件：

- [admin/page.tsx](/root/distiny/ai-router-platform/frontend/app/admin/page.tsx)
- [admin/dashboard/page.tsx](/root/distiny/ai-router-platform/frontend/app/admin/dashboard/page.tsx)

---

## 7. 内部渠道状态语义

已从旧审核语义切换为内部语义：

- `draft`：待配置
- `enabled`：已启用
- `disabled`：已停用

兼容说明：

- 运行时对旧值 `pending/approved/rejected` 做归一化兼容
- 启动迁移会将旧值自动改写为新值

关键文件：

- [providers.ts](/root/distiny/ai-router-platform/backend/src/data/providers.ts)
- [provider.ts](/root/distiny/ai-router-platform/backend/src/routes/provider.ts)

---

## 8. PixVerse 双通道架构

### 8.1 概述

PixVerse（拍我AI）作为独立供应商集成到平台，支持通过两个渠道调用：

- **百炼渠道**：通过阿里云百炼平台调用 PixVerse 模型
- **官方渠道**：通过 PixVerse 官方 API 调用

### 8.2 支持的模型

| 模型ID | 名称 | 特性 |
|--------|------|------|
| `pixverse-v6` | PixVerse V6 | 旗舰模型，文生视频/图生视频，5秒/8秒时长 |

### 8.3 渠道配置

渠道配置存储在 `providers.config` 字段（JSON 格式）：

```json
{
  "active_channel": "official",
  "channels": {
    "bailian": {
      "name": "百炼渠道",
      "adapter": "dashscope",
      "api_base_url": "https://dashscope.aliyuncs.com/api/v1",
      "api_key": "sk-27b3ca3cb4944f379c214b6444e08210"
    },
    "official": {
      "name": "拍我官方",
      "adapter": "pixverse",
      "api_base_url": "https://app-api.pixverseai.cn/openapi/v2",
      "api_key": "sk-b2803a285c787974e5eb786435dce3c1"
    }
  }
}
```

### 8.4 渠道切换逻辑

- 通过数据库更新 `active_channel` 字段切换渠道
- 任务轮询时根据模型的 `channelAdapter` 字段选择对应的 API key 和轮询方法
- 百炼渠道使用 `pollDashScopeTask`，官方渠道使用 `pollPixVerseTask`

### 8.5 关键文件

- [providers.ts](/root/distiny/nexusflow/backend/src/data/providers.ts) - 渠道配置与切换
- [tasks.ts](/root/distiny/nexusflow/backend/src/routes/tasks.ts) - 渠道感知任务轮询
- [adapters.ts](/root/distiny/nexusflow/backend/src/services/adapters.ts) - PixVerse API 适配器

---

## 9. 渠道密钥安全

`providers.api_key` 支持透明加密存储：

- 算法：`AES-256-GCM`
- 触发条件：配置 `PROVIDER_SECRET_KEY`
- 向后兼容：未配置时保留兼容模式
- 自动迁移：启动时会尝试把历史明文 key 转密文

关键文件：

- [provider-secrets.ts](/root/distiny/ai-router-platform/backend/src/utils/provider-secrets.ts)
- [providers.ts](/root/distiny/ai-router-platform/backend/src/data/providers.ts)
- [db/index.ts](/root/distiny/ai-router-platform/backend/src/db/index.ts)

---

## 9. 监控体系（当前状态）

### 9.1 用户侧监控（已可用）

用户可通过：

- `/api/usage`
- `/api/usage/overview`
- `/api/usage/by-model`
- `/api/usage/recent`
- `/api/usage/monitor/*`

查看个人请求与性能数据。

### 9.2 渠道侧监控（已接通基础链路）

管理员可通过：

- `/api/provider-monitor/overview`
- `/api/provider-monitor/provider/:providerId`

查看渠道运行状态、容量命中率、路由健康、告警信息。

说明：

- 监控数据主要来自内存滑动窗口与健康记录，服务重启后窗口计数会重置
- 已将 `v1/chat/completions` 的 provider 统计对接到监控，`dashscope` 可看到实时 RPM/TPM 变化

关键文件：

- [provider-monitor.ts](/root/distiny/ai-router-platform/backend/src/routes/provider-monitor.ts)
- [v1.ts](/root/distiny/ai-router-platform/backend/src/routes/v1.ts)
- [rate-limiter.ts](/root/distiny/ai-router-platform/backend/src/services/rate-limiter.ts)

---

## 10. 前端信息架构（当前）

### 10.1 公共站点

- 首页：`/`
- 文档：`/docs/*`
- 模型页：`/models/*`
- 登录：`/login`

### 10.2 用户看板

- `/keys`
- `/billing`
- `/activity`
- `/monitor`
- `/rate-limits`
- `/tickets`
- `/settings`

### 10.3 管理后台

- `/admin`（单一入口）

---

## 11. 关键 API 一览

### 11.1 OpenAI 兼容

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/embeddings`
- `POST /v1/tasks`
- `GET /v1/tasks/:id`

### 11.2 认证

- `POST /api/auth/send-code`
- `POST /api/auth/login`
- `POST /api/auth/login-password`
- `GET /api/auth/me`

### 11.3 密钥

- `GET /api/keys`
- `POST /api/keys`
- `DELETE /api/keys/:id`

### 11.4 计费

- `GET /api/billing/summary`
- `GET /api/billing/transactions`
- `POST /api/billing/recharge`
- `GET /api/billing/order/status`
- `GET /api/billing/payment/config`
- `POST /api/billing/alipay/notify`

### 11.5 使用统计

- `GET /api/usage`
- `GET /api/usage/overview`
- `GET /api/usage/by-model`
- `GET /api/usage/recent`
- `GET /api/usage/monitor/overview`
- `GET /api/usage/monitor/recent`

### 11.6 内部渠道管理

- `GET /api/provider/admin/providers`
- `GET /api/provider/admin/providers/:id`
- `PUT /api/provider/admin/providers/:id`
- `POST /api/provider/admin/providers/:id/enable`
- `POST /api/provider/admin/providers/:id/disable`
- `GET /api/provider/admin/models`
- `POST /api/provider/admin/models/:id/enable`
- `POST /api/provider/admin/models/:id/disable`
- `PUT /api/provider/:providerId/capacity/:modelId`（管理员）

### 11.7 渠道监控

- `GET /api/provider-monitor/overview`
- `GET /api/provider-monitor/provider/:providerId`

---

## 12. 环境变量（必须关注）

### 12.1 后端基础

- `PORT`
- `NODE_ENV`
- `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`

### 12.2 管理员权限

- `ADMIN_EMAILS`
- `ADMIN_USER_IDS`

### 12.3 模型上游

- `DASHSCOPE_API_KEY`
- `PIXVERSE_API_KEY`

### 12.4 支付

- `ALIPAY_APP_ID`
- `ALIPAY_PRIVATE_KEY`
- `ALIPAY_PUBLIC_KEY`
- `ALIPAY_NOTIFY_URL`
- `ALIPAY_RETURN_URL`
- `ALIPAY_EXPECT_APP_ID`（可选）
- `ALIPAY_EXPECT_SELLER_ID`（可选）

### 12.5 渠道密钥加密

- `PROVIDER_SECRET_KEY`

模板文件：

- [backend/.env.example](/root/distiny/ai-router-platform/backend/.env.example)

---

## 13. 部署与运维

### 13.1 构建

```bash
cd backend && npm run build
cd frontend && npm run build -- --webpack
```

### 13.2 启动（手动）

```bash
cd backend && node dist/index.js
cd frontend && npx next start -H 0.0.0.0 -p 19999
```

### 13.3 健康检查

```bash
curl http://127.0.0.1:3001/api/health
curl -I http://127.0.0.1:19999
curl -I https://nexusflow.hk/
```

---

## 14. 当前已知限制 / 风险

1. `provider-monitor` 目前主要基于内存窗口与健康记录，不是持久化时序库，重启后窗口会重置。
2. 管理后台存在 Nginx 层 Basic Auth + 应用层管理员鉴权双层控制，后续可统一体验。
3. 渠道监控中的趋势数据当前是轻量近实时视图，不等同于完整历史分析系统。
4. 如果未配置 `PROVIDER_SECRET_KEY`，渠道 key 仍会走兼容模式，不会强制加密存储。

---

## 15. 推荐后续迭代

1. 给监控指标落库（按分钟聚合），补 1h/24h 趋势图与告警历史。
2. 将告警联动到通知通道（邮件/飞书/webhook）。
3. 将渠道监控与工单自动关联，异常自动提示关联问题单。
4. 统一后台认证入口（Basic Auth 与应用角色体系融合）。

---

## 16. Playground 视频生成与文件上传（2026-04-28 更新）

### 16.1 视频参数动态配置

Playground 视频生成参数面板根据选择的模型类型动态显示正确的选项：

| 模型 | 时长选项 | 分辨率选项 | 宽高比选项 |
|------|----------|------------|------------|
| HappyHorse 系列 | 3/5/8/10/12/15秒 | 720p, 1080p | 16:9, 9:16, 1:1, 4:3, 3:4 |
| PixVerse V6 | 5秒, 8秒 | 360p, 540p, 720p, 1080p | 16:9, 9:16, 1:1 |
| 万相 2.6 系列 | 3/5/8/10/12/15秒 | 720p, 1080p | 16:9, 9:16, 1:1 |

关键改动：
- 删除了重复的视频参数面板（空消息区域的），只保留底部输入区域上方的一个
- 参数选项根据模型动态渲染，避免用户选择不支持的参数导致 API 错误

### 16.2 文件上传功能

#### 上传 API 代理架构

前端通过 Next.js API Route 代理文件上传请求到后端：

```
前端 Playground
    ↓ POST /api/upload (FormData)
前端 Next.js API Route (app/api/upload/route.ts)
    ↓ 转发 FormData
后端 Express (routes/upload.ts + multer)
    ↓ 存储文件到 backend/uploads/
    ↓ 返回 URL
前端 API Route 转换 URL 为前端可访问路径
    ↓ 返回 /api/uploads/{filename}
```

#### 关键文件

| 文件 | 作用 |
|------|------|
| `frontend/app/api/upload/route.ts` | 上传代理，转换后端 URL 为前端路径 |
| `frontend/app/api/uploads/[filename]/route.ts` | 文件访问代理，从后端获取上传的文件 |
| `backend/src/routes/upload.ts` | multer 文件上传处理，支持图片和视频 |
| `backend/uploads/` | 文件存储目录 |

#### 上传限制

- 文件大小：最大 100MB
- 图片格式：JPG, PNG, WebP, GIF, BMP
- 视频格式：MP4, MOV, WebM, AVI

#### 模型上传要求

| 模型类型 | 上传要求 |
|----------|----------|
| 图生视频 (i2v) | 1张图片作为首帧，建议分辨率与输出一致 |
| 参考生视频 (r2v) | 1-9张参考图片，人物/物体将作为主角 |
| 视频编辑 (video-edit) | 1个视频(3-60秒)，可选0-5张参考图片 |
| PixVerse V6 | 可选1张图片进行图生视频，否则文生视频 |

#### 上传状态显示

- **上传中**：spinner + "上传中"文字 + 蓝色边框
- **成功**：绿色勾号 ✓ + 绿色边框
- **失败**：红色叉号 ✕ + "失败"文字 + 红色边框

### 16.3 视频生成 API 参数映射

前端发送的参数名称与后端 API 期望的参数名称映射：

| 前端参数 | PixVerse API 参数 | HappyHorse API 参数 |
|----------|-------------------|---------------------|
| `duration` | `duration` | `duration` |
| `resolution` | `quality` | `resolution` |
| `ratio` | `aspect_ratio` | `ratio` |

关键修复文件：
- `backend/src/routes/video.ts` - 参数映射逻辑

### 16.4 数据库模型配置修正

PixVerse V6 的 `maxOutput` 从错误的 1 秒修正为 8 秒：

```sql
UPDATE provider_models SET max_output = 8 WHERE model_id = 'pixverse-v6';
```

---

## 17. 本次更新改动汇总（2026-04-28）

### 新增文件

1. `frontend/app/api/upload/route.ts` - 文件上传代理
2. `frontend/app/api/uploads/[filename]/route.ts` - 文件访问代理

### 修改文件

1. `frontend/app/(dashboard)/playground/page.tsx`
   - 删除重复的视频参数面板
   - 视频参数根据模型动态渲染选项
   - 增强上传状态显示（成功/失败/上传中）
   - 添加上传限制提示说明
   - 修复上传响应 URL 处理

2. `backend/src/routes/video.ts`
   - 修复 PixVerse API 参数映射 (resolution→quality, ratio→aspect_ratio)

3. `backend/src/data/models.ts`
   - PixVerse V6 maxOutput 从 1 改为 8

4. `backend/data/ai-router.db`
   - provider_models 表 pixverse-v6 max_output 更新为 8

### API 新增端点

| 端点 | 方法 | 作用 |
|------|------|------|
| `/api/upload` | POST | 前端上传代理 |
| `/api/uploads/{filename}` | GET | 前端文件访问代理 |

---

## 18. 部署验证清单

每次更新后建议验证：

1. 基础页面访问：首页、模型列表、定价、文档
2. Playground API Key 强制填写是否生效
3. 视频生成：选择视频模型后参数面板是否显示正确选项
4. 文件上传：上传图片/视频是否显示状态并成功
5. 视频生成请求：是否正常提交任务并返回 task_id
6. 管理后台：是否正常访问

