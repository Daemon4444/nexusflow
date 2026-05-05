# Quadrant AI Router Platform

> One API. Every Model. — 统一的 AI 模型聚合路由平台

## 项目简介

Quadrant 是一个类似 OpenRouter 的 AI 模型聚合路由平台，提供 OpenAI、Anthropic Messages、Gemini-compatible 等公共兼容协议，支持多供应商、多模型的智能路由和负载均衡。

### 核心特性

- **多协议兼容 API** — 支持 OpenAI Chat/Images/Embeddings、Anthropic Messages、Gemini-compatible GenerateContent
- **多供应商聚合** — 通义千问、DeepSeek、Kimi、GLM、MiniMax、PixVerse、HappyHorse 等 40+ 模型
- **智能 Fallback** — 上游故障自动切换备用供应商，保障服务可用性
- **流式响应** — SSE 实时输出，支持 Playground 在线测试
- **双层限流** — Provider 级 + Consumer 级 RPM/TPM 控制
- **语义缓存** — 相似请求智能复用，降低成本和延迟
- **Webhook 回调** — 异步任务完成自动通知
- **用量统计** — Token 消耗、费用计算、请求日志

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js 16)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Landing │ │  Models  │ │ Playground│ │  API Docs        │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP/SSE
┌─────────────────────────────▼───────────────────────────────┐
│                    Backend (Express + TypeScript)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Router  │ │ Fallback │ │ RateLimit│ │  Semantic Cache  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────────────┬───────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼───────┐     ┌───────▼───────┐     ┌───────▼───────┐
│     Redis     │     │  PostgreSQL   │     │   Providers   │
│  Rate Limit   │     │   User Data   │     │ Qwen/DS/GLM/...│
│  Session Cache│     │  API Keys     │     │  Kimi/GLM/... │
└───────────────┘     └───────────────┘     └───────────────┘
```

## 目录结构

```
ai-router-platform/
├── frontend/                    # Next.js 前端
│   ├── app/
│   │   ├── (dashboard)/         # Dashboard 页面组
│   │   │   ├── models/          # 模型列表 & 详情
│   │   │   ├── playground/      # 在线测试
│   │   │   ├── docs/api/        # API 文档
│   │   │   ├── keys/            # API Key 管理
│   │   │   └── billing/         # 账单 & 用量
│   │   └── (landing)/           # Landing 页面
│   ├── components/              # 共享组件
│   └── lib/                     # API 工具函数
│
├── backend/                     # Express 后端
│   ├── src/
│   │   ├── routes/              # API 路由
│   │   │   ├── v1.ts            # OpenAI 兼容接口
│   │   │   ├── protocols.ts     # Anthropic / Gemini 兼容接口
│   │   │   ├── models.ts        # 模型管理
│   │   │   ├── keys.ts          # API Key 管理
│   │   │   └── tasks.ts         # 异步任务
│   │   ├── services/
│   │   │   ├── fallback.ts      # Fallback 机制
│   │   │   ├── rate-limiter.ts  # 双层限流
│   │   │   ├── redis.ts         # Redis 服务
│   │   │   └── webhook.ts       # Webhook 回调
│   │   ├── db/
│   │   │   ├── pg.ts            # PostgreSQL 数据层
│   │   │   └── migrations/      # 数据库迁移
│   │   └── data/                # 内存数据 (开发)
│   └── dist/                    # 编译产物
│
├── docker-compose.yml           # Docker 服务编排
├── ecosystem.config.js          # PM2 进程配置
└── package.json                 # Monorepo 配置
```

## 快速开始

### 1. 环境准备

```bash
# 安装依赖
npm install

# 启动 Docker 服务 (Redis + PostgreSQL)
docker compose up -d
```

### 2. 配置环境变量

后端 `.env` 文件：

```env
# 服务端口
PORT=3001
NODE_ENV=production

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379

# PostgreSQL 配置
DATABASE_URL=postgresql://quadrant:quadrant_dev@localhost:5432/quadrant

# 上游 API Keys (按需配置)
DASHSCOPE_API_KEY=sk-xxx      # DashScope 兼容网关（Qwen / DeepSeek / GLM / Kimi / MiniMax / HappyHorse 等）
```

前端 `.env.local` 文件：

```env
NEXT_PUBLIC_API_URL=http://your-ip:3001
```

### 3. 启动服务

**开发模式：**
```bash
# 后端
cd backend && npm run dev

# 前端
cd frontend && npm run dev
```

**生产部署：**
```bash
# 构建
npm run build

# PM2 启动
pm2 start ecosystem.config.js

# 保存进程列表 (开机自启)
pm2 save
```

### 4. 验证服务

```bash
# 检查后端健康
curl http://localhost:3001/api/health

# 检查模型列表
curl http://localhost:3001/api/models
```

## API 使用示例

### 获取模型列表

```bash
curl https://nexusflow.hk/v1/models \
  -H "Authorization: Bearer $API_KEY"
```

### 聊天补全 (非流式)

```bash
curl https://nexusflow.hk/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.5-plus",
    "messages": [{"role": "user", "content": "你好！"}]
  }'
```

### 聊天补全 (流式)

```bash
curl https://nexusflow.hk/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-r1",
    "messages": [{"role": "user", "content": "解释量子计算"}],
    "stream": true
  }'
```

### 异步任务 (图像/视频生成)

```bash
# 创建任务
curl -X POST https://nexusflow.hk/v1/tasks \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"model": "wan2.6-t2i", "prompt": "生成风景图"}'

# 查询任务状态
curl https://nexusflow.hk/v1/tasks/$TASK_ID \
  -H "Authorization: Bearer $API_KEY"
```

## 核心功能详解

### Fallback 机制

当上游供应商故障时，自动切换到备用供应商：

```typescript
// 供应商配置示例
const providers = [
  { id: "qwen-primary", priority: 1, weight: 70 },
  { id: "qwen-backup", priority: 2, weight: 30 },
  { id: "deepseek", priority: 3, weight: 50 },
];
```

- 健康检测：60s 心跳检测供应商状态
- 自动切换：故障时按 priority + weight 选择备用
- 重试机制：最多 3 次重试，递增延迟

### 双层限流

```
┌─────────────────────────────────────┐
│         Consumer Level              │
│   API Key: 100 RPM / 10000 TPM      │
├─────────────────────────────────────┤
│         Provider Level              │
│   Qwen: 500 RPM / 50000 TPM         │
│   DeepSeek: 300 RPM / 30000 TPM     │
└─────────────────────────────────────┘
```

- Redis 滑动窗口算法
- 超限返回 429 + Retry-After

### 语义缓存

相似请求复用历史结果：

```typescript
// 配置
SEMANTIC_CACHE_ENABLED=true
SEMANTIC_CACHE_THRESHOLD=0.95   // 相似度阈值
SEMANTIC_CACHE_TTL=3600         // 缓存时长 (秒)
```

## 部署指南

### Docker 部署

```bash
# 启动基础设施
docker compose up -d

# 查看容器状态
docker compose ps

# Redis 测试
redis-cli ping  # => PONG

# PostgreSQL 测试
psql -U quadrant -d quadrant -c "SELECT 1"
```

### PM2 进程管理

```bash
pm2 status              # 查看进程状态
pm2 logs                # 查看日志
pm2 restart all         # 重启所有服务
pm2 restart quadrant-backend   # 重启后端
pm2 monit               # 实时监控
```

### Git 提交与服务器部署速查

提交前建议先跑构建，避免把不能启动的代码推到服务器：

```bash
cd /path/to/nexusflow
npm run build
git status --short
git add <changed-files>
git commit -m "Update model catalog and API docs"
git push origin main
```

如果新机器第一次提交时提示 `Author identity unknown`，在仓库内配置本地身份即可：

```bash
git config user.name "Codex"
git config user.email "codex@nexusflow.local"
```

另一台服务器首次部署：

```bash
git clone git@github.com:Daemon4444/nexusflow.git
cd nexusflow
npm install
cat > backend/.env <<'EOF'
DASHSCOPE_API_KEY=your-dashscope-key
PORT=3001
EOF
npm run build
pm2 start ecosystem.config.js
pm2 save
```

已有部署更新：

```bash
cd /path/to/nexusflow
git pull origin main
npm install
npm run build
pm2 restart all
```

### Nginx 反向代理 (可选)

```nginx
server {
    listen 80;
    server_name nexusflow.hk;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }

    location /v1/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_buffering off;  # 流式响应
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
    }
}
```

## 数据库表结构

### 主要表

| 表名 | 说明 |
|------|------|
| `users` | 用户账户 |
| `api_keys` | API Key 管理 |
| `transactions` | 交易流水 |
| `tasks` | 异步任务记录 |
| `webhooks` | Webhook 配置 |
| `webhook_deliveries` | Webhook 发送记录 |

### 迁移脚本

```bash
# 执行迁移
psql -U quadrant -d quadrant -f backend/src/db/migrations/001_initial_schema.sql
```

## 前端页面

| 页面 | 路径 | 说明 |
|------|------|------|
| Landing | `/` | 产品首页 |
| 模型列表 | `/models` | 50+ 模型浏览 |
| 模型详情 | `/models/[id]` | 参数、定价、API 示例 |
| Playground | `/playground` | 在线测试模型 |
| API 文档 | `/docs/api` | 交互式 API 参考 |
| API Key | `/keys` | 创建/管理密钥 |
| 账单 | `/billing` | 用量统计、充值 |

## 技术栈

| 层级 | 技术 |
|------|------|
| Frontend | Next.js 16, Turbopack, TypeScript |
| Backend | Express 5, TypeScript |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Process | PM2 |
| Container | Docker Compose |

## 开发指南

### 添加新模型供应商

1. 在 `backend/src/data/models.ts` 添加模型定义
2. 在 `backend/src/services/fallback.ts` 配置供应商
3. 添加对应 API Key 到 `.env`

### 添加新 API 端点

1. 在 `backend/src/routes/` 创建路由文件
2. 在 `backend/src/index.ts` 注册路由
3. 在 `frontend/app/(dashboard)/docs/api/page.tsx` 添加文档

## 许可证

MIT License

## 联系方式

- GitHub Issues: 项目问题反馈
- Email: support@nexusflow.ai

---

**Quadrant** — 让 AI 模型调用更简单。
