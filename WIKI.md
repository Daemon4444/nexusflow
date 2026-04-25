# Nexusflow Wiki (Unified)

本文档是 `ai-router-platform` 的统一项目文档，覆盖当前代码库的真实逻辑、运行链路、管理后台、支付、监控与部署说明。

更新时间：2026-04-24

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

## 8. 渠道密钥安全

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

