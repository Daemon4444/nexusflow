# Nexusflow

> One API for leading text, vision, image and video models.

Nexusflow 是统一 AI 模型聚合路由平台，提供 OpenAI、Anthropic Messages、Gemini-compatible 等公共兼容协议，并把阿里云百炼、PixVerse、HappyHorse、万相等上游能力收敛到一个入口。

线上域名：`https://nexusflow.hk`

## 核心能力

- **多协议公共 API**：OpenAI Chat/Images/Embeddings、Anthropic Messages、Gemini GenerateContent、Nexusflow Tasks。
- **多模型聚合**：Qwen、DeepSeek、GLM、Kimi、MiniMax、万相、PixVerse、HappyHorse 等文本、向量、图像、视频模型。
- **异步任务**：图像/视频任务通过 `/v1/tasks` 创建和轮询；public API 当前不依赖 webhook 回调。
- **限流与计费**：API Key 鉴权、Provider/Consumer 双层限流、用量记录、余额扣费。
- **用户与管理后台**：API Key、账单、用量、工单、Provider 管理、渠道监控。
- **内部模型源文档**：`internal/model-sources/aliyun-bailian-2026-05-05.md` 保存阿里云百炼模型/价格原始资料，供后续迭代补模型用，不在前端文档中直接展示。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| Frontend | Next.js 16 App Router, React, TypeScript, Tailwind CSS |
| Backend | Express, TypeScript |
| Database | PostgreSQL 16, `pg` connection pool |
| Cache | Redis，可不可用降级 |
| Process | PM2 |
| Upstream | DashScope/百炼、PixVerse Official |

## 目录结构

```txt
nexusflow/
├── backend/
│   ├── src/
│   │   ├── db/                  # PostgreSQL client, migrations, sqlite-to-pg migration tools
│   │   ├── data/                # users, keys, usage, tasks, providers
│   │   ├── routes/              # v1, protocols, tasks, billing, provider, admin
│   │   ├── services/            # adapters, rate limiter, providers, alipay
│   │   └── utils/               # protocol helpers, provider secret encryption
│   └── dist/
├── frontend/
│   ├── app/
│   │   ├── (dashboard)/docs/    # public docs pages
│   │   ├── (dashboard)/models/
│   │   ├── (dashboard)/playground/
│   │   └── admin/
│   └── components/
├── internal/model-sources/      # upstream source docs for internal iteration
├── MODELS.md                    # model catalog and pricing notes
├── WIKI.md
├── wiki.md
└── docker-compose.yml
```

## 环境变量

```env
PORT=3001
NODE_ENV=production

# PostgreSQL
PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=quadrant
PG_PASSWORD=quadrant_dev_password
PG_DATABASE=quadrant

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Upstream providers
DASHSCOPE_API_KEY=sk-xxx
PIXVERSE_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx

# Admin
ADMIN_EMAILS=admin@example.com
ADMIN_USER_IDS=

# Optional provider key encryption
PROVIDER_SECRET_KEY=
```

`DATABASE_URL` 不是当前主链路读取项；当前代码通过 `PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DATABASE` 初始化 PostgreSQL 连接池。

## 启动与部署

```bash
npm install
docker compose up -d postgres redis
npm run build
pm2 start ecosystem.config.js
pm2 save
```

健康检查：

```bash
curl http://127.0.0.1:3001/api/health
curl -I http://127.0.0.1:19999
curl -I https://nexusflow.hk/
```

已有线上部署更新：

```bash
git pull origin main
npm install
npm run build
pm2 restart all
```

## Public API

所有 Bearer 鉴权接口使用用户自己的 Nexusflow API Key：

```bash
export API_KEY="sk-air-..."
```

### 协议边界

| 能力 | Public endpoint | 状态 | 说明 |
| --- | --- | --- | --- |
| Models | `GET /v1/models` | 可用 | OpenAI 风格模型列表 |
| Chat | `POST /v1/chat/completions` | 可用 | OpenAI Chat Completions |
| Messages | `POST /v1/messages` | 可用 | Anthropic Messages 兼容层，不代表托管 Claude 原生模型 |
| Gemini | `POST /v1beta/models/:model:generateContent` | 可用 | Gemini GenerateContent 兼容层 |
| Embeddings | `POST /v1/embeddings` | 可用 | OpenAI Embeddings |
| Images | `POST /v1/images/generations` | 可用 | OpenAI Images 风格，当前接万相图像 |
| Tasks | `POST /v1/tasks`, `GET /v1/tasks/:id` | 可用 | 图像/视频异步任务 |
| Videos alias | `POST /v1/videos/generations` | 可用 | 兼容用户直觉路径，内部复用任务/视频路由 |

### OpenAI Chat

```bash
curl https://nexusflow.hk/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.5-flash",
    "messages": [{"role": "user", "content": "Reply only OK"}],
    "max_tokens": 8
  }'
```

### Anthropic Messages

```bash
curl https://nexusflow.hk/v1/messages \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.5-flash",
    "max_tokens": 8,
    "messages": [{"role": "user", "content": "Reply only OK"}]
  }'
```

### Gemini GenerateContent

```bash
curl "https://nexusflow.hk/v1beta/models/qwen3.5-flash:generateContent?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{"text": "Reply only OK"}]
    }],
    "generationConfig": {"maxOutputTokens": 8}
  }'
```

### Embeddings

```bash
curl https://nexusflow.hk/v1/embeddings \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-v4",
    "input": "Nexusflow routes models through one API."
  }'
```

### Image Generation

```bash
curl https://nexusflow.hk/v1/images/generations \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "wan2.6-t2i",
    "prompt": "A small red cube on a white table, product photo, clean lighting",
    "size": "1024x1024",
    "n": 1
  }'
```

### Video Task

```bash
TASK_ID=$(
  curl -s https://nexusflow.hk/v1/tasks \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "wan2.6-t2v",
      "prompt": "A small red cube slowly rotating on a white table, clean studio lighting",
      "size": "1280*720",
      "duration": 3,
      "prompt_extend": false
    }' | jq -r '.id'
)

curl https://nexusflow.hk/v1/tasks/$TASK_ID \
  -H "Authorization: Bearer $API_KEY"
```

## Model Catalog

模型和价格有三层资料：

1. `backend/src/data/models.ts`：运行时静态模型定义。
2. `MODELS.md`：当前平台展示/售卖口径的模型目录和价格说明。
3. `internal/model-sources/aliyun-bailian-2026-05-05.md`：阿里云百炼原始参考资料，用于后续补充模型和阶梯定价，不直接展示给用户。

新增模型时至少同步：

1. `backend/src/data/models.ts`
2. `MODELS.md`
3. 对应前端 docs 页面
4. 必要时补 `internal/model-sources/*` 原始来源
5. 线上部署后用 `/v1/models` 和真实协议调用复测

## 2026-05-05 线上验证

域名：`https://nexusflow.hk`

| 项目 | 结果 |
| --- | --- |
| `GET /v1/models` | 200 |
| `POST /v1/chat/completions` | 200 |
| `POST /v1/messages` | 200 |
| `POST /v1beta/models/qwen3.6-flash:generateContent` | 200 |
| `POST /v1/embeddings` | 200 |
| `POST /v1/images/generations` | 200，真实返回图片 URL |
| `POST /v1/tasks` with `wan2.6-t2v` | 202，轮询后 `succeeded`，真实返回 mp4 URL |
| `/docs/api`, `/docs/multi-protocol`, `/docs/api/qwen` | 200 |

验证说明：

- 图片测试使用 `wan2.6-t2i`，生成 1 张 1024x1024 图片。
- 视频测试使用 `wan2.6-t2v`，生成 3 秒 720P 视频任务，最终成功。
- 文档和示例中只使用 `$API_KEY` 占位符，不记录真实用户密钥。

## License

MIT
