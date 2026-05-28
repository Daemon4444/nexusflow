# NexusFlow — 项目说明文档

## 项目概述

NexusFlow 是一个 AI 模型聚合路由平台，提供统一的多协议 API 接口，将多个上游 AI 服务商整合为一个入口。

- **网站**: https://nexusflow.hk
- **API Base URL**: https://nexusflow.hk/v1
- **部署服务器**: 阿里云 ECS（内网 172.16.0.141 / 公网 8.152.221.32）
- **项目根目录**: `/root/distiny/nexusflow`

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Next.js (React) | 16.2.4 (React 19) |
| 前端样式 | Tailwind CSS v4 + 自定义暗色主题 | — |
| 后端框架 | Express v5 (TypeScript, ts-node) | — |
| 数据库 | PostgreSQL 16 (Docker) | — |
| 缓存/限流 | Redis 7 (Docker) | — |
| 进程管理 | PM2 | v6 |
| 反向代理 | nginx + Certbot SSL | — |
| 运行时 | Node.js | v24 |

---

## 部署架构

```
外网 HTTPS (443)
    └── nginx (nexusflow.hk)
            ├── /admin → http://127.0.0.1:19999 (HTTP Basic Auth 保护)
            ├── /       → http://127.0.0.1:19999 (Next.js 前端)
            ├── /api/   → http://127.0.0.1:3001  (Express 后端)
            └── /v1/    → http://127.0.0.1:3001  (OpenAI 兼容 API)

PM2 进程
    ├── quadrant-frontend  (port 19999, Next.js start)
    └── quadrant-backend   (port 3001, ts-node src/index.ts)

Docker 容器
    ├── quadrant-postgres  (port 5432, postgres:16-alpine)
    └── quadrant-redis     (port 6379, redis:7-alpine)
```

### 端口占用汇总

| 端口 | 服务 |
|------|------|
| 443 | nginx HTTPS (nexusflow.hk) |
| 80 | nginx → 301 重定向到 HTTPS |
| 19999 | Next.js 前端 (PM2) |
| 3001 | Express 后端 (PM2, ts-node) |
| 5432 | PostgreSQL (Docker) |
| 6379 | Redis (Docker) |
| 9999 | nginx 内网直通（前端+后端，无 SSL） |
| 8080 | nginx → instreet-clone（另一个项目） |
| 8888 | nginx → 缘分配对等项目 |

### nginx 配置
`/etc/nginx/conf.d/` — nexusflow.hk server block 含 SSL（Certbot 管理，证书路径 `/etc/letsencrypt/live/nexusflow.hk/`）。`/admin` 路径额外启用 HTTP Basic Auth（`/etc/nginx/.htpasswd`）。

---

## 目录结构

```
nexusflow/
├── AGENTS.md                      # 本文档
├── ecosystem.config.js            # PM2 配置（backend dist/index.js，frontend next start -p 19999）
├── docker-compose.yml             # Docker 服务（Redis + Postgres）
├── backend/
│   ├── .env                       # 环境变量（见下节）
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts               # 入口：Express 应用、路由注册、安全响应头
│       ├── app.ts                 # Express app 配置
│       ├── types.ts               # 全局 TypeScript 类型定义
│       ├── routes/                # 路由处理器（22 个文件）
│       ├── services/              # 业务逻辑服务（12 个文件）
│       ├── data/                  # 数据访问层（14 个文件）
│       ├── middleware/            # Express 中间件（5 个文件）
│       ├── utils/                 # 工具函数（5 个文件）
│       └── db/
│           ├── client.ts          # 统一 DB 客户端（支持 pg / pg-mem）
│           ├── pg.ts              # PostgreSQL 连接池
│           ├── memory.ts          # 内存数据库适配器（测试/开发用）
│           ├── migrate.ts         # SQL 迁移执行器
│           └── migrations/        # SQL 迁移文件（001~004）
└── frontend/
    ├── .env                       # NEXT_PUBLIC_API_URL 等前端环境变量
    ├── package.json
    ├── next.config.ts
    ├── tailwind.config.ts
    ├── app/                       # Next.js App Router
    │   ├── (dashboard)/           # 主应用路由组（含 layout、sidebar）
    │   ├── login/                 # 登录页
    │   ├── admin/                 # 管理员面板
    │   └── api/                   # Next.js API Routes（代理/上传）
    ├── components/                # React 组件（12+ 文件）
    └── lib/                       # 客户端工具库（models.ts、api.ts、money.ts 等）
```

---

## 环境变量 (`backend/.env`)

| 变量 | 说明 |
|------|------|
| `PORT` | 后端端口，默认 3001 |
| `NODE_ENV` | production / development |
| `ADMIN_USER_IDS` | 管理员用户 ID（逗号分隔） |
| `ADMIN_EMAILS` | 管理员邮箱（逗号分隔） |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis 连接信息 |
| `DATABASE_URL` / `PG_HOST` / `PG_PORT` / `PG_USER` / `PG_PASSWORD` / `PG_DB` | PostgreSQL 连接信息 |
| `PUBLIC_BASE_URL` | 公开访问地址（https://nexusflow.hk） |
| `DASHSCOPE_API_KEY` | 阿里云百炼 DashScope API Key |
| `PIXVERSE_API_KEY` | PixVerse API Key |
| `PROVIDER_SECRET_KEY` | AES-256-GCM 加密 Provider API key 用的对称密钥 |
| `ALIPAY_APP_ID` / `ALIPAY_PRIVATE_KEY` / `ALIPAY_PUBLIC_KEY` / `ALIPAY_GATEWAY` / `ALIPAY_NOTIFY_URL` / `ALIPAY_RETURN_URL` | 支付宝支付配置 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP 邮件发送配置 |

---

## 数据库结构 (PostgreSQL)

数据库名：`quadrant`，用户：`quadrant`，密码：见 `.env`

### 主要表

| 表名 | 说明 |
|------|------|
| `users` | 用户（email、nickname、balance NUMERIC、password_hash scrypt） |
| `sessions` | 登录会话（token=`sess-xxx`，7 天过期） |
| `api_keys` | API 密钥（`key` 字段存掩码，`key_hash` 存 SHA-256，用于验证鉴权） |
| `transactions` | 充值/消费流水（NUMERIC(18,6) 金融精度） |
| `payment_orders` | 支付宝订单（created/pending/paid/failed/closed/expired） |
| `usage_logs` | 调用日志（model、tokens、cost、latency_ms、ttft_ms、tpot_ms） |
| `user_rate_limits` | 用户自定义 QPM/TPM 限制（per user per model） |
| `rate_limit_requests` | 用户申请提升限流的工单 |
| `providers` | 上游 provider 配置（API key AES-256-GCM 加密存储） |
| `provider_models` | Provider 可用模型映射 |
| `provider_capacity` | Provider 容量/并发配置 |
| `provider_channel_configs` | Provider 多通道配置（百炼/官方等） |
| `provider_health` | Provider 健康状态记录 |
| `provider_cost_versions` | Provider 成本版本管理 |
| `route_change_audits` | 路由策略变更审计日志 |
| `provider_sla_snapshots` | Provider SLA 快照 |
| `customer_route_policies` | 用户级路由策略（weighted/priority/lowest_cost/highest_sla/pinned） |
| `async_tasks` | 异步任务追踪（图片/视频生成） |
| `user_model_discounts` | 用户模型折扣率（per user per model） |
| `tickets` | 工单系统（open/in_progress/resolved/rejected） |
| `webhooks` / `webhook_deliveries` | Webhook 配置和投递记录 |

### 安全存储方式

| 数据 | 存储方式 |
|------|----------|
| 用户密码 | scrypt 哈希，格式 `salt:hash` |
| API key | 创建时返回明文 `sk-air-xxx`，DB 存掩码（中间替换为 `••••••••`）+ SHA-256 hash |
| Provider API key | AES-256-GCM 加密，需 `PROVIDER_SECRET_KEY` 环境变量解密 |

---

## API 架构

### 对外 API（需 `Authorization: Bearer sk-air-xxx`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/models` | 模型列表（OpenAI 格式） |
| POST | `/v1/chat/completions` | 对话补全（支持 stream、tools、thinking、search） |
| POST | `/v1/messages` | Anthropic Messages 兼容接口 |
| POST | `/v1beta/models/:model:generateContent` | Gemini GenerateContent 兼容接口 |
| POST | `/v1/embeddings` | 文本向量嵌入 |
| POST | `/v1/images/generations` | 图像生成 |
| POST | `/v1/tasks` | 提交异步任务（图片/视频） |
| GET | `/v1/tasks/:id` | 查询异步任务状态 |
| GET | `/v1/tasks` | 列出用户任务 |

### 前端内部 API（需登录 session `sess-xxx`）

| 路径前缀 | 说明 |
|----------|------|
| `/api/auth/*` | 注册/登录/登出/改密（邮箱验证码 + 密码双模式） |
| `/api/keys/*` | API 密钥增删查 |
| `/api/models/*` | 模型列表/详情（支持 category/provider/search/sort 筛选） |
| `/api/usage/*` | 使用统计、日志、性能监控 |
| `/api/billing/*` | 账单、充值、支付宝支付/回调 |
| `/api/playground/*` | Playground 对话（session 鉴权，无需 API key） |
| `/api/rate-limits/*` | 限流配置查询和提升申请 |
| `/api/tickets/*` | 工单提交/查看 |
| `/api/upload` | 文件上传（multer + sharp 自动压缩大图） |
| `/api/image/*` / `/api/video/*` | Playground 图片/视频生成 |

### 管理员 API（需 admin session）

| 路径前缀 | 说明 |
|----------|------|
| `/api/admin/users/*` | 用户列表、详情、余额调整、账单导出 CSV |
| `/api/admin/providers/*` | Provider/通道/路由策略/成本管理 |
| `/api/admin/rate-limits/*` | 审批用户限流申请 |
| `/api/admin/user-model-discounts/*` | 管理用户折扣率 |
| `/api/monitor/*` | Provider 健康/饱和度/告警监控 |

---

## 路由处理器一览 (`backend/src/routes/`)

| 文件 | 挂载路径 | 职责 |
|------|----------|------|
| `v1.ts` | `/v1` | 核心 OpenAI 兼容 API，含限流/计费/流式/tools/thinking |
| `messages.ts` | `/v1/messages` | Anthropic Messages 格式转换（**必须在 v1 之前挂载**） |
| `protocols.ts` | `/v1beta` | Gemini GenerateContent 格式转换代理 |
| `auth.ts` | `/api/auth` | 邮箱验证码登录、密码登录、session 管理 |
| `keys.ts` | `/api/keys` | API key CRUD（`sk-air-` 前缀，SHA-256 哈希） |
| `models.ts` | `/api/models` | 模型列表/详情，支持 category/provider/search/sort 筛选 |
| `usage.ts` | `/api/usage` | 使用统计/日志/性能监控 |
| `billing.ts` | `/api/billing` | 充值、流水、支付宝支付/回调 |
| `admin.ts` | `/api/admin` | 用户管理、余额调整、账单 CSV 导出 |
| `provider.ts` | `/api/admin` | Provider/通道/路由策略/成本管理（最复杂路由） |
| `provider-monitor.ts` | `/api/monitor` | Provider 健康/饱和度/告警监控 |
| `ratelimits.ts` | `/api/rate-limits` | 限流配置查询、申请/审批 |
| `discounts.ts` | `/api/admin` | 用户模型折扣管理 |
| `tickets.ts` | `/api/tickets` | 工单系统 |
| `playground.ts` | `/api/playground` | Playground 对话（session 鉴权，无需 API key） |
| `tasks.ts` | `/v1/tasks` | 异步任务提交/查询 |
| `image.ts` | `/api/image` | Playground 图片生成 |
| `video.ts` | `/api/video` | Playground 视频生成 |
| `upload.ts` | `/api/upload` | 文件上传（multer + sharp 压缩） |
| `pixverse.ts` | `/api/pixverse` | PixVerse 独立路由（历史遗留） |
| `chat.ts` | — | **已废弃**，返回 410 Gone |

---

## 服务层一览 (`backend/src/services/`)

| 文件 | 职责 |
|------|------|
| `providers.ts` | 静态 provider 注册表，模型 ID 前缀 → provider 映射，API key 解析 |
| `rate-limiter.ts` | 两层限流：Redis 滑动窗口（QPM/TPM per user per model）+ 内存 RPM per API key |
| `adapters.ts` | 上游 API 格式适配（文本/图片/视频/嵌入/HappyHorse/PixVerse），含 DashScope 异步任务轮询 |
| `alipay.ts` | 支付宝集成（电脑网站支付、当面付扫码、RSA2 签名验证、订单查询） |
| `async-billing.ts` | 异步任务计费（图片/视频按分辨率/时长定价） |
| `redis.ts` | Redis 服务（滑动窗口 Lua 脚本、语义缓存、session 缓存、任务状态缓存） |
| `scheduler.ts` | 后台健康检查调度，Provider 加权评分选择（健康/策略/成本/可用性） |
| `email.ts` | Nodemailer SMTP 邮件（验证码 6 位，5 分钟有效，60 秒发送间隔，HTML 模板） |
| `webhook.ts` | Webhook 投递（HMAC-SHA256 签名，最多 3 次重试） |
| `fallback.ts` | 上游健康监测和自动故障转移 |
| `sms.ts` | 阿里云 Dysmsapi 短信（测试模式固定验证码 `8888`） |
| `pixverse-channel.ts` | PixVerse 通道解析（百炼通道 vs 官方通道） |

---

## 工具层一览 (`backend/src/utils/`)

| 文件 | 职责 |
|------|------|
| `model-capabilities.ts` | 模型能力矩阵（thinking 模式分类、tools/vision/search 支持、参数白名单） |
| `chat-request.ts` | 构建上游请求体，按模型能力白名单过滤入参 |
| `model-protocols.ts` | 返回每个模型支持的协议列表（OpenAI/Anthropic/Gemini/Embeddings/Image/Tasks） |
| `public-protocols.ts` | Gemini API ↔ OpenAI 格式转换层（请求/响应/SSE 全链路） |
| `provider-secrets.ts` | AES-256-GCM 加密/解密 Provider API key |

---

## 限流机制

两层限流在 `v1.ts` 中顺序执行：

1. **API key RPM**（内存，per API key）：默认 60 次/分钟，来自 `api_keys.rate_limit` 字段
2. **用户 QPM/TPM**（Redis 滑动窗口，per user per model）：
   - 优先级：model-specific → user default → 系统默认（QPM=60，TPM=100,000）
   - 配置来源：`user_rate_limits` 表
   - 管理员可在 Admin 面板直接配置；用户可提交申请（需审批）

**Token 计费时机**：响应结束后异步 reconcile（`reconcileTokensAsync`），不阻塞响应流。

---

## 模型能力 (`backend/src/utils/model-capabilities.ts`)

### 思考模式分类

| 分类 | 说明 | 包含模型 |
|------|------|----------|
| `ALWAYS_THINKING` | 始终返回 reasoning_content，不能关闭 | qwq-plus, deepseek-r1 |
| `MIXED_THINKING_DEFAULT_ON` | 默认开启思考，可通过 `enable_thinking=false` 关闭 | qwen3.7-max, qwen3.6-max-preview, qwen3.6-plus, qwen3.6-flash, qwen3.5-plus, qwen3.5-flash, deepseek-v4-pro, deepseek-v4-flash, glm-5.1, glm-5, glm-4.7 |
| `MIXED_THINKING_DEFAULT_OFF` | 默认不思考，可通过 `enable_thinking=true` 开启 | qwen3-max, qwen3-plus, qwen3-flash, qwen3-turbo, qwen3-32b, qwen3-8b, deepseek-v3.2, kimi-k2.6, kimi-k2.5 |

### 特殊参数透传范围

| 参数 | 透传条件 |
|------|----------|
| `enable_thinking` | thinking_mode = mixed 或 always |
| `thinking_budget` | ID 前缀为 `qwen3.7-` / `qwen3.6-` / `qwen3.5-` / `qwen3-vl-` / `qwen3-` 且有思考模式 |
| `preserve_thinking` | qwen3.7-max, qwen3.6-max-preview, qwen3.6-plus, kimi-k2.6 |
| `enable_search` / `search_options` | 通义千问文本类模型（非 VL / math / mt 系列） |
| `seed`, `top_k`, `logprobs`, `repetition_penalty` | 通义千问文本类模型 |
| `parallel_tool_calls` | 通义千问 + DeepSeek + GLM + Anthropic |

---

## 前端页面说明

| 路径 | 页面 | 功能 |
|------|------|------|
| `/` | 首页 | Hero 展示、特性介绍、支持供应商、API 示例代码 |
| `/login` | 登录 | 邮箱验证码 + 密码双模式登录 |
| `/dashboard` | 仪表盘 | 余额/用量概览、推荐模型、快速操作 |
| `/models` | 模型列表 | 按 category/provider/tags 筛选、排序、卡片展示 |
| `/models/:id` | 模型详情 | 参数、分级定价、协议、API 调用示例 |
| `/playground` | Playground | 选模型对话，支持流式/thinking/图片生成，session 鉴权无需 API key |
| `/keys` | 密钥管理 | 创建/删除 `sk-air-xxx` 密钥（创建时返回唯一一次明文） |
| `/billing` | 账单 | 余额、流水、充值（支付宝电脑支付/扫码） |
| `/activity` | 使用记录 | 调用日志、token 统计、费用明细 |
| `/rate-limits` | 限流 | 查看当前限制，提交提升申请（需管理员审批） |
| `/tickets` | 工单 | 提交/查看支持工单 |
| `/settings` | 设置 | 个人信息修改、修改密码 |
| `/monitor` | 监控 | Provider 健康/延迟/饱和度实时监控 |
| `/pricing` | 定价 | 所有模型分级定价表 |
| `/admin` | 管理后台 | 用户管理、余额调整、限流审批、Provider 配置（nginx HTTP Basic Auth 额外保护） |
| `/docs/*` | 文档中心 | API 文档、模型介绍、快速开始、参数矩阵、各 provider API 参考 |

---

## 日常操作

### 重启服务

```bash
# 后端（ts-node 直接运行，改代码后重启即可，无需编译）
pm2 restart quadrant-backend

# 前端（改了源码必须先 build，否则生效的是旧构建）
cd /root/distiny/nexusflow/frontend && npx next build
pm2 restart quadrant-frontend
```

### 查看日志

```bash
pm2 logs quadrant-backend --lines 50 --nostream
pm2 logs quadrant-frontend --lines 50 --nostream
```

### 数据库连接

```bash
docker exec -it quadrant-postgres psql -U quadrant -d quadrant
```

### 添加新模型（完整流程）

1. `backend/src/data/models.ts` — 在数组合适位置加模型定义（数组顺序 = 页面默认展示顺序）
2. `backend/src/utils/model-capabilities.ts` — 配置 thinking 分类、thinking_budget 前缀、preserve_thinking、search 等能力
3. `frontend/lib/models.ts` — 在 `getRecommendedModels` 和 `pickDefaultPlaygroundModel` 的 preferredIds 中加入
4. 更新 `frontend/app/(dashboard)/docs/` 相关文档页（models 列表、api 参考、parameters 矩阵）
5. `pm2 restart quadrant-backend`
6. `cd frontend && npx next build && pm2 restart quadrant-frontend`

### 重置用户密码

```bash
# 生成 scrypt hash 后更新（见 backend/src/data/users.ts 的 hashPassword 函数）
# 或直接用后台管理面板操作
docker exec quadrant-postgres psql -U quadrant -d quadrant \
  -c "UPDATE users SET password_hash = '...' WHERE email = 'user@example.com';"
```

---

## 模型列表（静态数据，截至 2026-05-22）

定义在 `backend/src/data/models.ts`，共约 50 个模型：

**大语言模型（通义千问）**：qwen3.7-max, qwen3-max, qwen3.6-max-preview, qwen3.6-plus, qwen3.6-flash, qwen3.5-plus, qwen3.5-flash, qwen-plus, qwen-turbo, qwen-long, qwen-flash, qwen3-235b-a22b, qwen3-32b

**推理模型**：qwq-plus, qvq-max, deepseek-r1

**多模态（视觉）**：qwen-vl-max, qwen-vl-plus, qwen3-vl-plus, qwen3-vl-flash, qwen3-omni-flash

**编程模型**：qwen3-coder-plus, qwen3-coder-flash

**大语言模型（其他厂商）**：deepseek-v4-pro, deepseek-v4-flash, deepseek-v3.2, deepseek-v3, glm-5.1, glm-5, glm-4.7, kimi-k2.6, kimi-k2.5, MiniMax-M2.5, MiniMax-M2.1, claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5

**嵌入**：text-embedding-v4

**图像生成**：wan2.6-t2i, qwen-image-max

**视频生成**：wan2.6-t2v, wan2.6-i2v, wan2.6-r2v, pixverse-v6, happyhorse-1.0-t2v, happyhorse-1.0-i2v, happyhorse-1.0-r2v, happyhorse-1.0-video-edit

---

## 已知问题和注意事项

1. **后端以 ts-node 运行**：ecosystem.config.js 指向 `dist/index.js`，但实际 PM2 启动命令是 `npx ts-node src/index.ts`；修改 `.ts` 文件后直接 `pm2 restart` 即可，**无需编译**。
2. **前端必须 build**：修改源码后必须先 `npx next build` 再重启，否则生效的是旧构建产物。
3. **API key 明文不可恢复**：`key` 字段存掩码，创建后只能看到一次完整 key；需要测试时创建新 key 并在测试完成后删除。
4. **管理后台双层鉴权**：nginx 层 HTTP Basic Auth（`/etc/nginx/.htpasswd`）+ 应用层 admin session，两层独立。
5. **支付宝支付**：需配置 `ALIPAY_*` 环境变量；`isMockPaymentAllowed()` 在 dev 环境允许 mock 支付绕过真实签名。
6. **Provider API key 加密**：存入 DB 前用 AES-256-GCM 加密，需 `PROVIDER_SECRET_KEY` 才能解密，丢失该密钥则无法读取 Provider 配置。
7. **短信验证**：需配置阿里云 SMS；`NODE_ENV != production` 时验证码固定为 `8888`。
8. **SSL 证书**：Certbot 管理，到期前会自动续期；证书路径 `/etc/letsencrypt/live/nexusflow.hk/`。
9. **CORS**：后端只允许 `localhost:3000` 和 `nexusflow.hk`，从其他域直接调 `/api/*` 会被拒。

---

## 最近更新（2026-05-24 ~ 2026-05-28）

### 1. 统一 Provider 路由调度

**变更**：所有模型（包括 PixVerse 视频生成）统一走 `scheduler.ts` 的 `selectProvider()` 调度。

- 后台 `provider_capacity` 表中的"启用/停用、优先级、权重"对所有模型真正生效
- 支持自动 fallback：高优先级 provider 不可用时自动切换到次优
- 健康检查、并发追踪与 provider 评分机制全部启用

**影响文件**：`backend/src/routes/tasks.ts`, `backend/src/routes/video.ts`, `backend/src/services/pixverse-channel.ts`

### 2. 参数完整透传

全面审计并修复了所有模型的参数透传：

**视频/图片模型新增透传参数**：
- PixVerse 官方：`style`, `camera_movement`, `water_mark`, `audio`
- DashScope wan2.6-t2v：`seed`, `watermark`, `audio`, `shot_type`, `audio_url`
- DashScope wan2.6-i2v：正确使用 `resolution`(720P/1080P) 而非 `size`
- 图像生成：`seed`, `image_url`

**文本模型参数白名单扩展**：
- GLM：`top_k`, `seed`, `repetition_penalty`
- DeepSeek：`enable_search`, `thinking_budget`, `repetition_penalty`(v3.1/v3.2)
- MiniMax：`enable_search`

**影响文件**：`backend/src/services/adapters.ts`, `backend/src/utils/model-capabilities.ts`, `backend/src/routes/image.ts`

### 3. 折扣系统（通配符匹配）

支持三层优先级的折扣匹配：

```
精确匹配 > 前缀通配 > 全局通配

示例：
  * → 0.9（全局九折）
  qwen* → 0.75（Qwen 系列 75 折）
  qwen3.7-max → 0.5（精确匹配五折）
```

- 管理员在 Admin 面板 → 用户 → 模型折扣中配置
- `model_id` 支持精确值、`前缀*` 通配、`*` 全局
- 账单页交易记录显示折扣角标（~~原价~~ 折后价 + X折标签）

**影响文件**：`backend/src/data/user-discounts.ts`, `backend/src/routes/billing.ts`, `frontend/app/(dashboard)/billing/page.tsx`

### 4. 上下文缓存（Context Cache）

**显式缓存**：在 `messages[].content[]` 中添加 `cache_control: {type: "ephemeral"}` 标记（需 ≥1024 tokens）。
**隐式缓存**：自动生效，无需参数。

功能支持：
- API 响应返回 `usage.prompt_tokens_details.cached_tokens` 和 `cache_creation_input_tokens`
- `usage_logs` 表记录 `cached_tokens` 和 `cache_creation_tokens`
- Activity 页面显示蓝色「缓存命中」和橙色「创建缓存」角标
- Overview 统计区显示「缓存命中」总 token 数
- 新建 `/docs/api/cache` 文档页，包含模型支持矩阵和计费说明

**支持显式缓存的模型**：qwen3.7-max, qwen3.6系列, qwen3.5系列, qwen3-coder系列, qwen3-vl系列, deepseek-v4系列, deepseek-v3.2, glm-5.1, kimi-k2.6, kimi-k2.5, MiniMax-M2.5

**影响文件**：`backend/src/data/usage.ts`, `backend/src/routes/v1.ts`, `frontend/app/(dashboard)/activity/page.tsx`, `frontend/app/(dashboard)/docs/api/cache/page.tsx`

### 5. Admin 按模型视图

渠道控制台新增「按模型」视图切换：
- 列出所有模型及其背后的 provider 路由
- 支持搜索和分类筛选
- 每个模型直接编辑路由（优先级/权重/启停）

**影响文件**：`frontend/app/admin/page.tsx`

### 6. 限流配置可搜索

后台为用户配置模型限流时，model_id 输入框改为可搜索的 combobox 下拉（输入关键词过滤匹配）。

### 7. 前端布局修复

- 侧边栏用户信息固定在底部，不再随内容滚动
- 移除 dashboard 内的 Footer（只属于营销页）
- 使用记录页面改为全宽布局

### 8. 时区修正

`usage_logs` 查询时间统一转换为北京时间（`AT TIME ZONE 'Asia/Shanghai'`）。

---

## 当前用户概况（截至 2026-05-28）

| 用户 | 累计充值 | 当前余额 | 折扣配置 |
|------|---------|---------|---------|
| TokenDance | ¥5,000 | ~¥9,995 | qwen* 75折, deepseek*/glm*/kimi* 9折, qwen3.7-max 5折 |
| 24728436 | ¥1.21 | ~¥4.97 | 同 TokenDance |
| 其他 | 测试账号 | — | 无 |

**TokenDance 限流配置**：QPM=20,000 / TPM=20,000,000

---

## Provider 配置（截至 2026-05-28）

| Provider ID | 名称 | API Base URL | 状态 |
|-------------|------|-------------|------|
| dashscope | 阿里云百炼 | https://dashscope.aliyuncs.com/compatible-mode/v1 | enabled |
| pixverse | PixVerse | https://app-api.pixverse.ai/openapi/v2 | enabled |

**pixverse-v6 路由**：
- pixverse（官方）：priority=20, weight=100 → 默认走这条
- dashscope（百炼）：priority=10, weight=100 → fallback

---

## Git 分支

- `main` — 生产分支，所有部署从这里出
- `codex/nexusflow-developer-conversion` — 开发分支

**远程仓库**：`git@github.com:Daemon4444/nexusflow.git`
