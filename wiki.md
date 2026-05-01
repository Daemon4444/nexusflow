# Nexusflow 项目 Wiki

## 项目概览

Nexusflow（原名 Quadrant AI Router Platform）是一个统一的 AI 模型聚合路由平台，类似 OpenRouter.ai。提供 OpenAI 兼容接口，将多个上游 AI 服务商（阿里云百炼 DashScope、拍我AI PixVerse、HappyHorse 等）整合为一个统一入口。

- **线上域名**: `https://nexusflow.hk`
- **GitHub**: `github.com/Daemon4444/nexusflow`
- **部署服务器**: 阿里云 ECS 8.152.221.32
- **前端端口**: 19999（Nginx 反代）
- **后端端口**: 3001

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | Next.js 16 (App Router) + React 19 + TypeScript | |
| 样式 | Tailwind CSS v4 + 自定义暗色主题 | |
| 后端 | Express 5 + TypeScript | |
| 数据库 | SQLite (better-sqlite3, WAL 模式) | v12 |
| 缓存 | Redis（可选，不可用时降级内存） | |
| 进程管理 | PM2 | |
| Node.js | v20.x / v24.x | |

---

## 核心功能

1. **OpenAI 兼容 API** — `/v1/chat/completions`、`/v1/models`、`/v1/embeddings`、`/v1/images/generations`
2. **45+ 模型聚合** — Qwen、DeepSeek、GLM、Kimi、MiniMax、PixVerse、HappyHorse、万相等
3. **智能路由** — 供应商级路由 + 双通道架构（百炼/官方）
4. **双层限流** — Provider 级 + Consumer 级 RPM/TPM 控制
5. **异步任务** — 图片/视频生成任务轮询 + Webhook 回调
6. **支付充值** — Alipay + mock，支持 page/qr 三种方式
7. **管理后台** — `/admin` 管理员入口，渠道管理、工单处理
8. **用量监控** — 用户侧 + 渠道侧监控，内存滑动窗口
9. **Playground** — 在线测试，支持文件上传、视频参数动态配置
10. **密钥加密** — AES-256-GCM 透明加密存储 provider API key

---

## 目录结构

```
nexusflow/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express 入口
│   │   ├── db/                   # SQLite 初始化 + 迁移
│   │   ├── data/                 # 数据层（models, providers, apikeys, usage, tasks...）
│   │   ├── routes/               # API 路由（v1, tasks, billing, provider, admin...）
│   │   ├── services/             # 业务服务（adapters, rate-limiter, alipay, webhook...）
│   │   ├── middleware/           # 中间件（auth, admin）
│   │   └── utils/                # 工具（provider-secrets 加密）
│   └── data/ai-router.db         # SQLite 数据库
├── frontend/
│   ├── app/
│   │   ├── (dashboard)/          # Dashboard（playground, models, keys, billing, activity...）
│   │   ├── admin/                # 管理后台
│   │   ├── api/                  # API Routes（upload, uploads proxy）
│   │   └── (landing)/            # Landing 页面
│   ├── components/               # 共享组件
│   └── lib/                      # API 工具
├── docker-compose.yml
├── ecosystem.config.js           # PM2 配置
└── start.sh                      # 启停脚本
```

---

## 核心业务链路

### API 调用链路（`/v1/chat/completions`）
1. API Key 校验 → 2. 限流检查 → 3. 余额校验 → 4. Provider 选择 → 5. 请求上游 → 6. 记录 usage + 扣费

### 异步任务链路（视频/图片生成）
创建任务 → 提交上游 → 轮询状态 → 回写结果 → Webhook 通知

### PixVerse 双通道架构
- **百炼渠道**: 通过阿里云百炼平台调用，adapter=dashscope
- **官方渠道**: 通过 PixVerse 官方 API 调用，adapter=pixverse
- 通过 `active_channel` 字段切换，任务轮询时根据 channelAdapter 选择对应 API key

### 支付充值
支持 mock/page/qr 三种方式，回调验签 + 幂等入账 + 主动查单兜底

---

## 模型分类统计（45 个）

| 分类 | 数量 | 代表模型 |
|------|------|----------|
| 大语言模型 | 21 | Qwen3 系列、DeepSeek、GLM、Kimi、MiniMax |
| 推理模型 | 4 | QwQ Plus、DeepSeek R1、Qwen Math Plus |
| 多模态模型 | 5 | Qwen VL 系列、Qwen Omni |
| 编程模型 | 2 | Qwen3 Coder Plus/Flash |
| 专业模型 | 1 | Qwen MT Plus（翻译） |
| 向量模型 | 1 | Text Embedding V3 |
| 图像生成 | 1 | 万相 2.6 文生图 |
| 视频生成 | 11 | PixVerse V6、万相视频、HappyHorse 系列 |

### 免费模型
- `qwen3-vl-flash`、`qwen3-coder-flash`、`qwen3-8b`、`pixverse-v6`

---

## 关键 API 端点

### OpenAI 兼容
- `GET /v1/models`、`POST /v1/chat/completions`、`POST /v1/embeddings`、`POST /v1/tasks`

### 认证
- `POST /api/auth/send-code`、`POST /api/auth/login`、`GET /api/auth/me`

### 密钥/计费/用量
- `GET/POST /api/keys`、`GET /api/billing/*`、`GET /api/usage/*`

### 内部渠道管理
- `GET/PUT /api/provider/admin/providers`、`POST /api/provider/admin/models/:id/enable`

### 渠道监控
- `GET /api/provider-monitor/overview`

---

## 环境变量（关键）

| 变量 | 说明 |
|------|------|
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key |
| `PIXVERSE_API_KEY` | PixVerse 官方 API Key |
| `ADMIN_EMAILS` / `ADMIN_USER_IDS` | 管理员白名单 |
| `PROVIDER_SECRET_KEY` | 渠道密钥加密密钥（AES-256-GCM） |
| `ALIPAY_*` | 支付宝支付配置 |
| `REDIS_HOST/PORT/PASSWORD` | Redis 配置 |

---

## 部署运维

### 构建
```bash
cd backend && npm run build
cd frontend && npm run build -- --webpack
```

### PM2 启动
```bash
pm2 start ecosystem.config.js
pm2 save
# 进程名: quadrant-backend
```

### 健康检查
```bash
curl http://127.0.0.1:3001/api/health
curl -I http://127.0.0.1:19999
```

---

## 与 Qoder CLI 的完整协作历史

### 对话记录来源

Qoder CLI 的对话记录存储在以下位置：
- **会话文件**: `/root/.qoder/projects/-root/*.jsonl` — 完整的对话历史（JSONL 格式）
- **运行日志**: `/root/.qoder/logs/runs/*/qodercli.log` — 遥测数据（token计数、工具调用等）
- **文件历史**: `/root/.qoder/file-history/*/` — 代码快照

以下对话内容直接从 Qoder CLI 会话文件中提取，按时间顺序排列。

---

### 阶段一：项目初始化与 DNS 配置（2026-03）

**Session: 0d4b9208 (3.1MB, 19 条用户消息)**

1. **DNS 解析配置**: 用户提供了阿里云 DNS 解析截图，要求将域名解析到 router 服务（公网 IP: 47.93.204.160）
2. **首页美化需求**: "我想你给这个项目做的更美观一些，首页做一些色块在背后流动的那种感觉 你能做到吗"
3. **去掉色块方案**: "算了 还是别用色块了 去掉吧 然后两个问题：模型列表是空的 log in之后没有返回的"
4. **登录页改进**: "log页面按理说应该 点击返回一下的按钮吧"
5. **前端重新设计**: "我想设计一个新的页面前端 你先单独几个页面 html我看看 然后我来选择，你可以使用skills 来设计美观的前端 我觉得现在比较小气 没有突出重点"
6. **选择设计方案**: "http://47.93.204.160:8899/design-2.html这个还不错 按照这个来吧 对接起来所有逻辑"
7. **首页模型滚动效果**: "搞成一个滚动的列表，再往下滚动 有所有的模型，然后形状是一个内敛的状态，有点类似于一个圆柱的侧面的那种感觉"
8. **圆柱效果增强**: "是这个感觉 但是可以半径更大 显示的模型更多，然后可以侧着的那种感觉 圆柱的背面也能被看到"
9. **项目 Code Review**: "ai-router-platform 这个项目 你/review一下看看 有什么问题 你先指出"
10. **验证码与密码**: "未注册的邮箱将自动创建账户 / 未配置 SMTP 时，验证码固定为 8888 这个去掉 然后进去了 个人账户应该设置密码吧需要 设计整个逻辑"
11. **个人信息系统**: "我想你设计一个更全面的个人信息系统，比如充值支付板块 比如监控看板 ttft tpot的监控 比如个人信息 改密码等等"

### 阶段二：HappyHorse 模型接入（2026-04）

**Session: 66b52aeb (2.6MB, 20 条用户消息)**

1. **HappyHorse 接入**: "你可以看看wiki，然后我有一个新的模型 happyHorse，你可以往上搜些公开材料 然后接入进去 先有名字 后续模型接入api我再提供，然后在首页做个标志 一只快乐小马 可以做个动态的过程"
2. **502 错误排查**: "502 Bad Gateway nginx/1.20.1 怎么打不开了"
3. **小马动画迭代**: "这是一个视频模型 然后继续迭代吧 你反复迭代 然后再次review 进行测试 确保美观好看 我去吃饭了"
4. **简笔画小马**: "这个马太丑了 做一个简笔画 从左到右 画出一匹奔跑的 有张力的 飞驰的骏马 然后标注上happyhorses"
5. **Dashboard 位置纠正**: "你理解错了 nexusflow Models Playground Docs Pricing Dashboard 是放在首页 最上面这一栏 dashscope的左边"
6. **去掉 DashScope 标识**: "放错了 dashboard 旁边 dashcope这个去掉吧"

### 阶段三：前端全面重构与多协议支持（2026-04-27 ~ 04-28）

**Session: 8595c3cf (5.3MB, 16 条用户消息)**

1. **Router 项目优化**: "再次优化router整个项目，review他，让他变得更美观精致 但是风格不要改 你要扣细节扣逻辑，比如标题首页的表现力，组件的逻辑"
2. **导航与 Logo 重构**: "1:Models Playground Docs Pricing 首页是这个，模型列表 API 文档 在线体验点进去就变成这个了 2:重新设计一下logo 参考一下fronted skills 需要更美观夺目 然后具有设计感"
3. **首页重构反馈**: "这个更丑了 你要重构排版，logo就是nexusflow，可以那种淡入淡出的光影效果，然后第二个问题是：字体有点low，可以利用scrapling抓取一下https://openrouter.ai/"
4. **首页再次重构**: "nexusflow / 50+ 模型已接入 · 全部可用 / One API to rule all models / 首页太丑了 很不协调 使用frontend-design再次重构 强调平台意识"
5. **Pricing 页面修复**: "Models Playground Docs Pricing pricing这个有问题 点击过去了就没有了 要保证点击过去还有这个界面 所有你要新增一个页面"
6. **个人信息系统细化**: "我想你设计一个更全面的个人信息系统，比如充值支付板块 比如监控看板 ttft tpot的监控 比如个人信息 改密码等等"
7. **UI 细节调整**: "Online Keys Billing Activity li liuyang0 ¥500.00 Log out API Keys API 密钥管理 看着没变化呀"
8. **去掉金额显示**: "li liuyang0 ¥500.00 这看着有点丑 可以去掉金额"
9. **多语言切换**: "可以对整个网页进行中英文改造，在右上角进行中文 英文 日文的切换，模型本身名字不用改，其他需要改。然后对整个网页进行测试，测试这些功能是否可用，然后个人看板这一块也可以写入到wiki里"
10. **Activity 页面错误**: "Application error: a client-side exception has occurred while loading nexusflow.hk 点活动就变成这样了"
11. **速率限制与工单**: "应该还要做一些速率限制吧 就是比如qpm tpm 限制 这些模型默认的qpm tpm限流 按照1000 1000000 这个应该在看板能看到 然后能够提工单申请 你也需要构建一下工单系统"

### 阶段四：多协议接入与烟雾测试（2026-04-28）

**Session: 09bf7e8e (3.9MB, 24 条用户消息)**

1. **Codex 网络问题**: "stream disconnected before completion: Transport error: network error: error decoding response body 用codex经常出现这个"
2. **文档与协议构建**: "现在内容比较匮乏 尤其是文档和协议的构建，https://tokendance.space/ 你可以爬到这个网站吗"
3. **参考 tokendance 改造**: "除了这些 模型也可以参考他 基本都一样 只是我的都是通过百炼接入的，甚至模型的价格和上下文长度这些内容，你也可以抄袭他...可以对我的进行大刀阔斧的改造 我睡觉去了 你保持不停的迭代吧"
4. **协议策略**: "以及路由的策略 我只用接入openai协议和claude gemini暂时不用 完成整个项目后进行冒烟测试 review"
5. **重命名为 Nexusflow**: "帮我把rouer这个项目改个名字 就叫nexusflow 就是文件夹的名字 然后上传到github上"
6. **GitHub SSH 配置**: 用户在终端配置 SSH key 上传到 GitHub (`Daemon4444/nexusflow`)
7. **阶段总结需求**: "给我总结一下我需要继续迭代的 第六阶段：模型接入 & 测试 / 第七阶段：多协议支持"
8. **Playwright 测试**: 使用 webapp-testing skill 进行全站自动化测试

### 阶段五：PixVerse 双通道架构（2026-04-27 ~ 04-28）

**Session: 5acc1510 (4.6MB)** — 从上下文摘要提取：
1. **PixVerse 模型集成**: 接入 PixVerse 视频生成模型（v6, v5.5, v5, v4, v3.5）
2. **双通道架构**: 实现百炼渠道 + 官方渠道的双通道
3. **HappyHorse 全量接入**: 集成 4 种 HappyHorse 视频模型（t2v, i2v, r2v, video-edit）

### 阶段六：管理后台与 Playgroud 优化（2026-04-28 ~ 04-29）

**Session: caa584ca (3.9MB, 6 条用户消息)** — 从上下文摘要提取：
1. **管理员权限修复**: 修复 `/admin` 页面 "管理员权限不足" 问题
2. **Admin UI 改进**: 替换浏览器 prompt() 为更好的交互
3. **Playground 文件上传**: 实现文件上传功能，支持 HappyHorse 和 PixVerse V6
4. **全站图片模型测试**: 测试所有 image 和 video 模型
5. **视频生成调试**: 修复 Playground 视频生成卡在 "processing" 状态

### 阶段七：代码质量与最终交付（2026-04-28 ~ 04-29）

1. **Simplify Skill 审查**: 使用 Qoder CLI 的 simplify skill 进行代码质量审查
2. **Playwright 自动化测试**: 18/19 项测试通过（94%）
3. **部署验证**: 每次重大更新后执行部署验证清单

---

## 协作中积累的关键经验

### 代码编辑
1. Edit 工具修改时需要精确的 `old_string` 匹配，否则会产生重复代码
2. 编辑前先用 Read 工具确认最新内容
3. 编辑后必须用 Read 验证结果

### 数据库操作
1. 数据库路径: `backend/data/ai-router.db`（不是 `data/ai-router.db`）
2. 修改模型配置后需要同步更新数据库和代码

### 部署运维
1. PM2 进程名是 `quadrant-backend`，不是 `nexusflow-backend`
2. 每次代码更新后必须 `npm run build` + `pm2 restart`
3. 前端改动需要重新 build，后端 ts-node 可直接重启

### 上游服务问题
1. 百炼渠道曾因阿里云账号欠费不可用
2. 官方渠道 PixVerse 余额不足
3. 旧版本 PixVerse 模型（v3.5/v4/v5）在当前百炼 Key 下不可用

---

## 当前已知限制

1. `provider-monitor` 基于内存窗口，重启后窗口计数重置
2. 管理后台存在 Nginx Basic Auth + 应用层管理员鉴权双层控制
3. 渠道监控趋势数据是轻量近实时视图，非完整历史分析
4. 未配置 `PROVIDER_SECRET_KEY` 时渠道 key 走兼容模式（不强制加密）
5. 百炼渠道和官方渠道余额可能不足

---

## 后续迭代建议

1. 监控指标落库（按分钟聚合），补 1h/24h 趋势图与告警历史
2. 告警联动通知通道（邮件/飞书/webhook）
3. 渠道监控与工单自动关联
4. 统一后台认证入口
5. 百炼渠道和 PixVerse 官方渠道充值

---

*最后更新: 2026-05-01*
