# NexusFlow

One API for leading text, multimodal, embedding, audio, image and video models.

NexusFlow 是一个 AI 模型聚合、协议兼容、Provider 路由与统一计费平台。它提供 OpenAI Chat、Anthropic Messages、OpenAI Responses、Embeddings、Images、Audio 和异步 Tasks 等接口，并包含用户控制台、Playground、主/子账号、账单、限流和管理后台。

- Website: `https://nexusflow.hk`
- API Base: `https://nexusflow.hk/v1`
- 完整项目架构与运维入口：[`WIKI.md`](WIKI.md)
- Agent 协作规则：[`AGENTS.md`](AGENTS.md)
- 新模型上线流程：[`docs/MODEL_ONBOARDING.md`](docs/MODEL_ONBOARDING.md)

## Architecture

| Layer | Stack |
| --- | --- |
| Frontend | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Express 5, TypeScript |
| Database | PostgreSQL 16 |
| Cache / shared limits | Redis 7 |
| Runtime | Node.js 24, PM2 |
| Edge | nginx + TLS |

Production runs the compiled backend at `backend/dist/index.js`, with two PM2 backend workers and one frontend process.

## Public API

| Capability | Endpoint |
| --- | --- |
| Models | `GET /v1/models` |
| Chat Completions | `POST /v1/chat/completions` |
| Anthropic Messages | `POST /v1/messages` |
| OpenAI Responses | `POST /v1/responses` |
| Embeddings | `POST /v1/embeddings` |
| Images | `POST /v1/images/generations` |
| Videos | `POST /v1/videos/generations` |
| Async tasks | `POST /v1/tasks`, `GET /v1/tasks/:id` |
| Audio | `/v1/audio/*` |

Protocol compatibility is model-specific. Do not assume every model works on every endpoint. The live runtime catalog is available from `GET /api/models`.

## Local setup

```bash
npm ci
docker compose up -d postgres redis
npm run build
```

Use environment files outside Git. A minimal shape is:

```env
NODE_ENV=development
PORT=3001
POSTGRES_PASSWORD=replace_me

PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=quadrant
PG_PASSWORD=replace_me
PG_DATABASE=quadrant

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

DASHSCOPE_API_KEY=
PIXVERSE_API_KEY=
ANTHROPIC_API_KEY=
PROVIDER_SECRET_KEY=
```

For a lightweight in-memory backend:

```bash
cd backend
USE_PG_MEM=true PORT=3201 npx ts-node src/index.ts
```

## Validation

```bash
npm --workspace backend run test:billing
npm run build:backend
npm run build:frontend
npm audit --omit=dev --audit-level=high
```

Model and protocol changes also require browser-path, real-upstream and billing verification described in `docs/MODEL_ONBOARDING.md`.

## Production

```bash
ssh nexus
cd /root/distiny/nexusflow
git pull --ff-only origin main
bash scripts/deploy-production.sh
```

After deployment, verify:

```bash
curl -fsS https://nexusflow.hk/api/health
curl -fsS https://nexusflow.hk/api/version
```

See [`WIKI.md`](WIKI.md) for the complete topology, billing and security invariants, migrations, backup layout, known limits and current priorities.
