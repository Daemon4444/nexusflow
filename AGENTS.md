# AI Router Platform - 项目说明文档

## 项目概述

模仿 OpenRouter.ai 构建的 AI 模型聚合路由平台，提供统一的 OpenAI 兼容 API 接口，将多个上游 AI 服务商（阿里云百炼 DashScope、拍我AI PixVerse）整合为一个入口。

- **前端**: http://8.152.221.32:3000 — 管理面板（模型浏览、密钥管理、使用统计、Playground）
- **后端**: http://8.152.221.32:3001 — API 服务
- **部署服务器**: 阿里云 ECS 8.152.221.32（内网 172.16.0.141）

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Next.js (React) | 16.1.6 (React 19) |
| 前端样式 | Tailwind CSS + 自定义 CSS 暗色主题 | v4 |
| 后端框架 | Express (TypeScript) | v5 |
| 数据库 | SQLite (better-sqlite3) | v12 |
| 运行时 | Node.js | v20.x |
| 开发工具 | ts-node, nodemon | — |

---

## 目录结构

```
ai-router-platform/
├── AGENTS.md                    # 本文档
├── start.sh                     # 服务启动/停止脚本
├── backend/                     # Express 后端
│   ├── .env                     # 环境变量（API 密钥）
│   ├── package.json
│   ├── tsconfig.json
│   ├── data/                    # SQLite 数据库文件（运行时生成）
│   │   └── ai-router.db
│   └── src/
│       ├── index.ts             # 入口：Express 应用、路由注册、CORS
│       ├── db/
│       │   └── index.ts         # SQLite 初始化、建表（api_keys, usage_logs）
│       ├── data/
│       │   ├── models.ts        # 模型静态数据（27 个模型定义）
│       │   ├── apikeys.ts       # 密钥 CRUD（读写 SQLite api_keys 表）
│       │   └── usage.ts         # 调用日志读写（读写 SQLite usage_logs 表）
│       ├── routes/
│       │   ├── v1.ts            # ★ OpenAI 兼容 API: /v1/chat/completions, /v1/models
│       │   ├── pixverse.ts      # ★ PixVerse 视频 API: /v1/video/text, /v1/video/image, etc.
│       │   ├── chat.ts          # 管理面板用 chat 代理: /api/chat/completions
│       │   ├── models.ts        # 管理面板模型列表: /api/models
│       │   ├── keys.ts          # 管理面板密钥管理: /api/keys
│       │   └── usage.ts         # 管理面板统计数据: /api/usage
│       └── types/
│           └── better-sqlite3.d.ts  # SQLite 类型声明
├── frontend/                    # Next.js 前端
│   ├── .env                     # NEXT_PUBLIC_API_URL 指向后端
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── postcss.config.mjs
│   ├── lib/
│   │   └── api.ts               # fetchAPI 封装函数
│   ├── components/
│   │   └── Sidebar.tsx           # 左侧导航栏组件
│   └── app/
│       ├── layout.tsx            # 全局布局（含 Sidebar）
│       ├── globals.css           # 全局暗色主题样式
│       ├── page.tsx              # 首页（Hero + 特性介绍 + 代码示例）
│       ├── models/
│       │   ├── page.tsx          # 模型列表页（筛选、搜索、排序）
│       │   └── [...id]/
│       │       └── page.tsx      # 模型详情页
│       ├── keys/
│       │   └── page.tsx          # API 密钥管理页（创建、复制、删除）
│       ├── playground/
│       │   └── page.tsx          # Playground 对话测试页
│       └── activity/
│           └── page.tsx          # 使用统计仪表盘
└── node_modules/                 # 依赖（不上传 OSS，需 npm install 重建）
```

---

## 环境变量

### backend/.env

```env
DASHSCOPE_API_KEY=sk-your-dashscope-api-key   # 阿里云百炼 API Key
PIXVERSE_API_KEY=sk-your-pixverse-api-key    # 拍我AI (PixVerse) API Key
PORT=3001                                                # 后端端口
```

### frontend/.env

```env
NEXT_PUBLIC_API_URL=http://8.152.221.32:3001             # 后端 API 地址（改 IP 需同步修改）
```

---

## API 端点一览

### 对外 OpenAI 兼容 API（需 Bearer Token 鉴权，使用 sk-air-xxx 密钥）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/chat/completions` | 对话补全（代理到 DashScope），支持 stream |
| GET | `/v1/models` | 模型列表（OpenAI 格式） |

### 对外 PixVerse 视频 API（需 Bearer Token 鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/video/text` | 文生视频 |
| POST | `/v1/video/image` | 图生视频 |
| GET | `/v1/video/status/:taskId` | 查询视频生成任务状态 |
| POST | `/v1/video/upload` | 上传图片（传 image_url） |
| GET | `/v1/video/balance` | 查询 PixVerse 余额 |

### 管理面板内部 API（无鉴权，供前端页面调用）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/models` | 模型列表（支持 ?category=&provider=&search=&sort=） |
| GET | `/api/models/:id` | 模型详情 |
| GET | `/api/keys` | 获取所有密钥（含完整 key，支持复制） |
| POST | `/api/keys` | 创建密钥 `{name, rateLimit}` |
| DELETE | `/api/keys/:id` | 删除密钥 |
| POST | `/api/chat/completions` | Playground 对话（无鉴权版，供前端直接用） |
| GET | `/api/usage` | 使用统计（overview + daily + byModel + recent） |
| GET | `/api/health` | 健康检查 |

---

## 数据库结构 (SQLite)

文件位置: `backend/data/ai-router.db`（运行时自动创建）

### api_keys 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | 密钥名称 |
| key | TEXT UNIQUE | 完整密钥值 sk-air-xxx |
| created_at | TEXT | 创建时间 ISO |
| last_used | TEXT | 最后使用时间 |
| usage_count | INTEGER | 调用次数 |
| rate_limit | INTEGER | 速率限制（次/分） |

### usage_logs 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| api_key_id | TEXT FK | 关联 api_keys.id |
| model | TEXT | 调用的模型 ID |
| prompt_tokens | INTEGER | 输入 token 数 |
| completion_tokens | INTEGER | 输出 token 数 |
| total_tokens | INTEGER | 总 token 数 |
| cost | REAL | 费用（元） |
| status | TEXT | success / error |
| latency_ms | INTEGER | 延迟（毫秒） |
| created_at | TEXT | 调用时间 ISO |

---

## 模型列表

当前配置 27 个模型，数据定义在 `backend/src/data/models.ts`：

**大语言模型**: qwen3-max, qwen3.6-max-preview, qwen3.6-plus, qwen3.5-plus, qwen3.5-flash, qwen-plus, qwen-turbo, qwen-long, qwen-flash, qwen3-235b-a22b, qwen3-32b, deepseek-v3.2, deepseek-v3, glm-4.7, kimi-k2.5, MiniMax-M2.1

**推理模型**: qwq-plus, qvq-max, deepseek-r1

**多模态模型**: qwen-vl-max, qwen-vl-plus, qwen3-vl-plus, qwen3-vl-flash, qwen3-omni-flash

**编程模型**: qwen3-coder-plus, qwen3-coder-flash

**图像生成**: qwen-image-max

**视频生成 (PixVerse)**: pixverse-v4.5, pixverse-v4, pixverse-v3.5

---

## 上游 API 代理逻辑

### DashScope（文本对话）

- 代理地址: `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- 认证: `Authorization: Bearer {DASHSCOPE_API_KEY}`
- 路由文件: `backend/src/routes/v1.ts`（对外）和 `backend/src/routes/chat.ts`（管理面板）
- 支持 stream 和非 stream 两种模式
- 每次调用自动记录到 usage_logs 表

### PixVerse（视频生成）

- 代理地址: `https://app-api.pixverseai.cn/openapi/v2/`
- 认证: `Api-Key: {PIXVERSE_API_KEY}` + `Ai-Trace-Id` header
- 路由文件: `backend/src/routes/pixverse.ts`
- model 参数映射: pixverse-v4.5 -> v4.5, pixverse-v4 -> v4, pixverse-v3.5 -> v3.5
- 文生视频参数: prompt, model, duration(5/8), aspect_ratio(16:9/9:16/1:1), quality(540p/720p/1080p), style, negative_prompt, seed

---

## 鉴权机制

1. 用户在管理面板创建 API 密钥 -> 生成 `sk-air-xxx` 格式密钥存入 SQLite
2. 调用 /v1/* 接口时需携带 `Authorization: Bearer sk-air-xxx`
3. 后端从 SQLite 查找匹配密钥，验证通过后代理到上游 API
4. 每次成功调用更新密钥的 last_used 和 usage_count

---

## 前端页面说明

| 路径 | 页面 | 功能 |
|------|------|------|
| `/` | 首页 | Hero 展示、特性介绍、支持供应商、API 示例代码 |
| `/models` | 模型列表 | 按分类/供应商筛选、搜索、排序，卡片式展示 |
| `/models/:id` | 模型详情 | 完整参数、定价、API 调用示例 |
| `/keys` | 密钥管理 | 创建/删除密钥，显示完整密钥值，复制按钮（execCommand 兼容 HTTP） |
| `/playground` | Playground | 选模型 + 对话测试，实时显示 token 用量和费用 |
| `/activity` | 使用统计 | 概览卡片 + 日调用量柱状图 + 模型分布 + 最近请求列表 |

### 前端样式

- 暗色主题，参考 GitHub Dark 配色
- 背景 #0d1117，文字 #e6edf3，边框 #30363d
- CSS 类定义在 `frontend/app/globals.css`
- 响应式侧边栏 240px 固定宽度

### 复制功能注意

因为部署在 HTTP（非 HTTPS），`navigator.clipboard` 不可用。复制功能使用 `textarea + execCommand("copy")` 降级方案，最终兜底用 `window.prompt()` 让用户手动复制。

---

## 部署和运行

### 首次部署（从 OSS 下载后）

```bash
# 1. 安装后端依赖
cd /root/ai-router-platform/backend && npm install

# 2. 安装前端依赖
cd /root/ai-router-platform/frontend && npm install

# 3. 构建前端
cd /root/ai-router-platform/frontend && npx next build

# 4. 启动服务
/root/ai-router-platform/start.sh start
```

### 日常启停

```bash
/root/ai-router-platform/start.sh start    # 启动
/root/ai-router-platform/start.sh stop     # 停止
/root/ai-router-platform/start.sh restart  # 重启
```

### 修改代码后重新部署

```bash
# 后端改动 -> 重启后端即可（ts-node 直接运行 TypeScript）
fuser -k 3001/tcp; sleep 2
cd /root/ai-router-platform/backend && \
  DASHSCOPE_API_KEY=sk-your-dashscope-api-key \
  PIXVERSE_API_KEY=sk-your-pixverse-api-key \
  PORT=3001 \
  nohup node node_modules/.bin/ts-node --project tsconfig.json src/index.ts > /tmp/backend.log 2>&1 &

# 前端改动 -> 需要重新 build
cd /root/ai-router-platform/frontend && npx next build
fuser -k 3000/tcp; sleep 2
cd /root/ai-router-platform/frontend && nohup npx next start -H 0.0.0.0 -p 3000 > /tmp/frontend.log 2>&1 &
```

---

## 已知问题和注意事项

1. **安全组**: 阿里云 ECS 安全组需要放行 3000（前端）和 3001（后端）端口
2. **PixVerse 余额**: 当前 PixVerse 账户余额为 0，视频生成会返回 Insufficient balance
3. **HTTP 环境**: 前端运行在 HTTP 上，clipboard API 不可用，已用 execCommand 降级
4. **内存中无数据**: node_modules 不上传 OSS，部署后需要 `npm install`
5. **数据库**: SQLite 文件在 backend/data/ai-router.db，首次运行自动建表并创建 2 个默认密钥
6. **公网 IP 自测**: 从 ECS 内部 curl 公网 IP 会失败（阿里云 NAT 特性），这是正常的

---

## 扩展指南

### 添加新的上游 AI 供应商

1. 在 `backend/.env` 添加新的 API Key
2. 在 `backend/src/data/models.ts` 添加模型定义
3. 创建 `backend/src/routes/新供应商.ts` 路由文件
4. 在 `backend/src/index.ts` 注册路由
5. 重启后端

### 添加新的前端页面

1. 在 `frontend/app/新页面/page.tsx` 创建页面组件
2. 在 `frontend/components/Sidebar.tsx` 添加导航链接
3. 执行 `npx next build` 重新构建
4. 重启前端
