# NexusFlow 全面优化 Spec

## Context
NexusFlow（nexusflow.hk）是一个面向中国市场的 AI 模型聚合路由平台，用户通过一个 API Key 和一套计费体系访问 45+ 模型（Qwen、DeepSeek、GLM、Kimi、MiniMax、PixVerse、HappyHorse、Claude 等）。支持 OpenAI Chat / Anthropic Messages / Responses API 三协议兼容。

经过多轮迭代，核心 API 能力已 production-grade（PostgreSQL 事务计费、流式传输、折扣引擎、速率限制、支付宝集成、Admin 大盘）。前端功能全面（文档、Playground、定价、密钥、账单、Admin）。但在安全性、代码可维护性、用户体验和产品完整度上仍有明显短板。

本 spec 从 **安全/架构、前端 UX、产品功能** 三个维度，按 **P0（必须立即修复）/ P1（高优先级）/ P2（打磨优化）** 梳理所有优化项，并给出具体文件、行号和修复方案。

---

## 一、P0 — 必须立即修复

### P0-1. 内部错误信息泄露到客户端 🔒
**维度**：安全
**问题**：多个路由直接 `res.json({ message: err.message })`，可能暴露内网地址、文件路径、堆栈信息。

| 文件 | 行号 | 问题代码 |
|------|------|----------|
| `routes/pixverse.ts` | 96,154,205,237,295,328 | `"Upstream request failed: ${err.message}"` |
| `routes/messages.ts` | 570-573 | 同上模式 |
| `routes/tasks.ts` | 225,319,450 | raw `err.message` |
| `routes/upload.ts` | 188,192 | `err.message` 直接暴露 |
| `routes/admin.ts` | 360 | `"SLS 查询失败: " + err.message` |
| `routes/usage.ts` | 190 | 同上 |

`v1.ts` 和 `billing.ts` 已正确使用 `sanitizeError()`。

**修复**：
1. 将 `v1.ts` 中的 `sanitizeError()` 提取到 `backend/src/utils/sanitize-error.ts`
2. 全局替换所有 catch 块中的 `err.message` 响应为 `sanitizeError(err)`

### P0-2. 前端无全局错误边界 💥
**维度**：前端稳定性
**问题**：整个 app 没有 `error.tsx`、`global-error.tsx` 或 React `ErrorBoundary`。任何未捕获的渲染错误导致白屏。也没有自定义 404 页面（`not-found.tsx`）。

**修复**：
1. 创建 `app/error.tsx` — 路由级错误边界，显示友好错误信息 + 重试按钮
2. 创建 `app/global-error.tsx` — 全局错误边界（捕获 layout 错误）
3. 创建 `app/not-found.tsx` — 自定义 404 页面，带导航链接

### P0-3. Webhook 功能半成品 🔌
**维度**：产品
**问题**：`webhooks` + `webhook_deliveries` 表已建，`services/webhook.ts` 有 `sendWebhook`、HMAC 签名、重试逻辑。但：
- 投递日志存在内存数组（`DELIVERY_LOGS: DeliveryLog[] = []`，MAX 1000，注释自承"生产环境应存数据库"）
- 无 REST 路由让用户 CRUD webhook
- 无前端管理页面
- `notifyTaskCompletion()` 在 `tasks.ts` 中未被调用 — 异步任务完成无法推送，用户只能轮询

**修复**：
1. 持久化投递到 `webhook_deliveries` 表
2. 新增 `/api/webhooks` CRUD 路由
3. 新增前端 webhook 管理页
4. 在异步任务完成时调用 `notifyTaskCompletion()`

### P0-4. Admin 页面 2,997 行不可维护 📦
**维度**：代码质量
**问题**：`app/admin/page.tsx` 包含 65 个 React hooks、35+ state 变量、渲染 10 个 tab 视图。修改一个 tab 需要理解整个文件。

**修复**：
1. 拆分为子组件：`AdminOverview`、`AdminProviders`、`AdminUsers`、`AdminTickets`、`AdminLogs`、`AdminOperations`
2. 接口定义抽到 `admin/types.ts`
3. 用 `next/dynamic` 按 tab 懒加载

---

## 二、P1 — 高优先级改进

### 🔒 安全类

#### P1-S1. Auth 端点无速率限制
**文件**：`routes/auth.ts`
**问题**：`/api/auth/send-code`、`/api/auth/login`、`/api/auth/login-password` 无速率限制。6 位验证码（1M 组合）可被暴力枚举。
**修复**：添加 per-IP rate limit（send-code: 5/min，login: 10/min），失败 N 次后锁定账户 15 分钟。

#### P1-S2. API Key 验证支持明文回退
**文件**：`data/apikeys.ts:37`
**问题**：`validateApiKey()` 查询 `WHERE key_hash = ? OR key = ?`，fallback `key = ?` 意味着仍支持明文比对。
**修复**：过渡期后移除 `OR key=?`，仅用 hash 验证。

#### P1-S3. ChatCompletionSchema 已定义但未接入
**文件**：`middleware/validation.ts`、`routes/v1.ts`
**问题**：Zod schema 已定义但 `/v1/chat/completions` 路由未使用 `validateBody()` 中间件。
**修复**：接入验证中间件，拦截畸形请求。

#### P1-S4. dangerouslySetInnerHTML 渲染支付宝表单
**文件**：`billing/page.tsx:405`
**问题**：直接渲染后端返回的 HTML，存在 XSS 风险。
**修复**：改用 iframe 隔离或 CSP nonce 策略。

### 🏗️ 后端架构类

#### P1-B1. 无优雅停机
**文件**：`index.ts`
**问题**：进程被 kill 时 HTTP server 不关闭、DB/Redis 连接不释放、流式请求被截断。仅 `sls.ts` 有 SIGTERM handler。
**修复**：
```typescript
process.on('SIGTERM', async () => {
  server.close();     // 停止接受新连接
  await closeDb();    // 释放 PG 连接池
  await closeRedis(); // 释放 Redis 连接
  process.exit(0);
});
```

#### P1-B2. ensureInternalProviders() 每次 admin 请求执行 80+ 查询
**文件**：`routes/provider.ts:270,279,715,849,932,950,976,1005`
**问题**：遍历 40+ 静态模型，每个调用 `getCapacity()` + 可能 `upsertCapacity()`。每次 admin 页面加载产生 80+ 查询。
**修复**：加 60s TTL 内存缓存，或改为仅启动时执行一次。

#### P1-B3. 并发跟踪是进程本地的
**文件**：`services/scheduler.ts:39`
**问题**：`concurrentRequests` 是 `Map<string, number>`，多实例部署时每个实例独立跟踪，并发上限被 N 倍放大。
**修复**：迁移到 Redis `INCR/DECR` + TTL。

#### P1-B4. selectProvider() N+1 健康查询
**文件**：`services/scheduler.ts:147`
**问题**：对每个候选端点单独 `getHealthRecord()`。5 个供应商 = 5 次额外查询。
**修复**：批量查询 `SELECT * FROM provider_health WHERE (provider_id, model_id) IN (...)`。

#### P1-B5. sessions 表缺 expires_at 索引
**文件**：`migrations/001`
**问题**：`cleanExpiredSessions()` 执行 `DELETE FROM sessions WHERE expires_at <= NOW()` — 无索引全表扫描。
**修复**：`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`。

#### P1-B6. 三种错误响应格式混用
**文件**：所有 routes
**问题**：
1. OpenAI 格式：`{ error: { message, type, code } }` — `v1.ts`
2. Anthropic 格式：`{ type: "error", error: { type, message } }` — `messages.ts`
3. Internal 格式：`{ success: false, message }` — admin/billing/auth

大多数路由在本地 catch 并直接响应，绕过了集中的 `errorHandler` 中间件。
**修复**：按 API 面标准化，使用 `next(err)` 委托错误中间件。

#### P1-B7. 健康检查不验证 DB/Redis 连通性
**文件**：`index.ts:101`
**问题**：`GET /api/health` 返回 `{ status: "ok" }` 但不检查数据库或 Redis。DB 挂了仍报告健康。
**修复**：添加依赖健康检查（短超时，3s）。

#### P1-B8. 无 PM2 配置文件
**问题**：缺少 `ecosystem.config.js`。进程管理无文档化配置。
**修复**：创建配置文件，定义 cluster 模式、max_memory_restart、日志轮转。

#### P1-B9. God Files 过大
| 文件 | 行数 | 建议拆分 |
|------|------|----------|
| `routes/provider.ts` | 1,268 | `provider-admin.ts` / `provider-capacity.ts` / `provider-operations.ts` |
| `routes/v1.ts` | 1,208 | `v1-chat.ts` / `v1-images.ts` / `v1-embeddings.ts` |
| `data/models.ts` | 932 | 主要是静态数据，可接受 |
| `routes/messages.ts` | 866 | 可接受（单协议适配） |

#### P1-B10. 死代码未清理
| 文件 | 行数 | 说明 |
|------|------|------|
| `services/fallback.ts` | 517 | 完整 fallback 系统但从未被导入 |
| `db/pg.ts` | 426 | 遗留 DB 客户端，`client.ts` 已替代 |
| `routes/chat.ts` | ~50 | 未在 `index.ts` 中导入 |

**修复**：删除或集成。

#### P1-B11. 环境变量启动时不验证
**文件**：`index.ts`
**问题**：服务器可在缺少关键环境变量时启动，请求时才报错。
**修复**：添加 `validateEnv()` 函数，启动时检查必需变量。

#### P1-B12. 无单元测试
**问题**：仅 `scripts/smoke.ts` 集成测试（需真实 API key）。无数据层、服务层、工具函数的单元测试。
**修复**：用 `pg-mem`（已是 devDependency）mock DB，覆盖 billing、rate-limit、scheduler、api-key 逻辑。

### 🎨 前端 UX 类

#### P1-F1. 3,621 个 inline style 对象
**文件**：全局（admin 页 ~2000，login ~100，billing ~80，其余分散）
**问题**：无法用 CSS `:hover`（需 JS `onMouseEnter`/`onMouseLeave`，共 12 处），无法用媒体查询，无法统一主题。
**修复**：逐步迁移到 CSS classes。优先级：login → billing → keys → admin。

#### P1-F2. 登录后跳转 /billing 而非 /dashboard
**文件**：`login/page.tsx:25,81`
**问题**：新用户登录后直接看到充值页，尚未了解平台功能。
**修复**：改为 `router.push("/dashboard")`。

#### P1-F3. Footer 组件存在但从未被导入
**文件**：`components/Footer.tsx`（存在但无 import）
**问题**：着陆页无 footer，缺少法律链接和社交链接。
**修复**：在 `app/page.tsx`（landing）底部引入 `<Footer />`。

#### P1-F4. /terms 和 /privacy 链接指向不存在的页面
**文件**：`components/Footer.tsx:28-29`
**修复**：创建对应页面或暂时移除链接。

#### P1-F5. Dashboard 侧边栏 768-1024px 间隐藏且无替代导航
**文件**：`globals.css:1458`（隐藏侧边栏）、`globals.css:2227`（汉堡菜单在 768px 才出现）
**问题**：768-1024px 窗口宽度下，侧边栏消失但汉堡菜单未出现，用户无法导航。
**修复**：添加折叠导航或将汉堡菜单断点对齐到 1024px。

#### P1-F6. Playground 无加载状态
**文件**：`playground/page.tsx`
**问题**：模型列表为空直到 API 响应，用户看到的是空白下拉框。
**修复**：添加 `<LoadingState />` 或 skeleton placeholder。

#### P1-F7. recharts 未动态导入（~200KB）
**文件**：`admin/page.tsx:9`
**问题**：`recharts` 仅 `AdminDashboard.tsx` 使用，但被 eagerly 加载到 admin bundle。
**修复**：`const AdminDashboard = dynamic(() => import('./AdminDashboard'), { ssr: false })`。

#### P1-F8. 无 loading.tsx 文件
**问题**：Next.js App Router 约定提供 `loading.tsx` 做自动 Suspense 边界。全 app 无一个。路由切换时白屏直到 hydration。
**修复**：为主要路由组添加 `loading.tsx`（dashboard、playground、billing、keys、activity）。

#### P1-F9. 仅 8 个 aria-* 属性
**文件**：全局
**问题**：57 页面 + 23 组件仅 8 个 ARIA 属性。表单输入缺 `aria-label`，错误消息缺 `aria-live`，下拉菜单缺 `aria-expanded`，删除弹窗无 focus trap。
**修复**：补充 ARIA 属性，添加 focus management。

#### P1-F10. document.execCommand("copy") 已废弃
**文件**：`keys/page.tsx:118`
**修复**：改用 `navigator.clipboard.writeText()`（其他文件已正确使用）。

#### P1-F11. Playground 1,858 行
**文件**：`playground/page.tsx`
**问题**：第二大文件，混合 Markdown 渲染、侧边栏、聊天消息、上传面板。
**修复**：拆分 `MarkdownBlock`、`PlaygroundSidebar`、`ChatMessage`、`UploadPanel` 为独立组件。

#### P1-F12. 着陆页圆柱动画持续运行
**文件**：`app/page.tsx:90-101`
**问题**：`requestAnimationFrame` 持续计算 16 张模型卡片的三角函数位置，手机端 CSS 隐藏时仍消耗 CPU。
**修复**：用 `IntersectionObserver` 或 `matchMedia("(min-width: 920px)")` 控制动画启停。

#### P1-F13. 路由冲突 models/[id] vs models/[...id]
**问题**：`[id]` 捕获单段，`[...id]` 永远不可达（死代码）。
**修复**：删除 `[...id]` 或合并逻辑。

### 🚀 产品功能类

#### P1-P1. 模型降级标记"Coming Soon"但未实现
**问题**：路由器可靠性核心功能。`provider_health` 表已有 `consecutive_failures`、`avg_latency_ms`。`services/fallback.ts` 存在但未集成。
**修复**：用 `provider_health` + `provider_capacity.priority/weight` 实现 fallback 路由。当主供应商 `consecutive_failures >= 3` 时自动降级到次选。

#### P1-P2. 仅支持支付宝，无微信支付
**问题**：中国市场微信支付近必需。
**修复**：新增 `services/wechat.ts`，接入微信支付 JSAPI/Native。

#### P1-P3. 无用量告警
**问题**：余额不足、消费异常无邮件/短信通知。`services/email.ts` 和 `services/sms.ts` 存在但无告警调用方。
**修复**：余额 20%/5% 阈值时发邮件告警 + 每日消费摘要。添加消费上限设置。

#### P1-P4. 无团队/组织支持
**问题**：`users` 表无 `org_id`。无团队共享计费、角色权限、团队 API Key。阻止 B2B 采用。
**修复**：实现 `organizations` 表 + 共享计费 + 角色权限（admin/member/viewer）+ 团队 API Key。

#### P1-P5. 新用户无免费额度
**问题**：注册后必须充值才能调用 API。竞品（OpenRouter、Together）通常给 $1-5 免费额度。4 个免费模型存在但未在注册流程中突出。
**修复**：邮箱验证后自动赠送 ¥1-5 额度，或在 FirstRunPanel 中突出免费模型。

#### P1-P6. 无 OpenAPI spec
**问题**：文档全手动，无法自动生成 SDK、Postman 导入、交互式 API 浏览器。
**修复**：从路由定义生成 OpenAPI 3.1 spec。

#### P1-P7. 无 Changelog 页面
**问题**：用户无法了解新功能、模型上线、API 变更。
**修复**：添加 `/docs/changelog` 页面 + repo `CHANGELOG.md`。

#### P1-P8. 无模型对比功能
**问题**：45+ 模型难以选择。layout meta 提到"compare"但无实现。
**修复**：添加 side-by-side 对比：价格、上下文长度、速度（TTFT/TPOT）、能力标签。

#### P1-P9. 用户侧无用量分析页
**问题**：用户只能看日志列表，无时间序列消费/token 图表、按 API Key 分组。
**修复**：新增 `/usage` 页面，复用 admin dashboard 的 recharts 组件。

---

## 三、P2 — 优化打磨

### 代码质量
| # | 问题 | 文件 | 修复 |
|---|------|------|------|
| P2-C1 | 91 处 `: any` 类型 | 全局 | 逐步添加类型定义，DAL 层使用泛型 |
| P2-C2 | `?` → `$N` SQL 规范化层 | `db/client.ts` | 迁移到原生 `$N` 后移除 |
| P2-C3 | 健康记录 read-modify-write 非原子 | `scheduler.ts:57-96` | 改用 `ON CONFLICT DO UPDATE SET field = table.field + 1` |
| P2-C4 | 无结构化日志 | 全局 | 引入 `pino` logger + request correlation ID |
| P2-C5 | CORS origins 硬编码 | `index.ts:46` | 改为 `CORS_ORIGINS` 环境变量 |
| P2-C6 | v1.ts / messages.ts 重复代码 | routes/ | 提取共享中间件 + `streamUpstreamResponse()` |
| P2-C7 | 3 个空 catch 块 | `v1.ts:705,781`、`billing.ts:407` | 添加 `console.debug()` |

### 前端
| # | 问题 | 文件 | 修复 |
|---|------|------|------|
| P2-F1 | Admin 硬编码 hex 颜色 | `admin/page.tsx` | 统一使用 CSS 变量 |
| P2-F2 | Landing CTA 中英混杂 | `page.tsx:226,295` | 统一使用 i18n `t()` |
| P2-F3 | `--text-tertiary: #999` 对比度 2.85:1 | `globals.css:46` | 改为 `#666` |
| P2-F4 | 无 `next/image` 使用 | 全局 | 替换 `<img>` 为 `<Image>` |
| P2-F5 | Playground 自定义 Markdown 215 行 | `playground/page.tsx:66-280` | 改用 `react-markdown` |
| P2-F6 | 支付轮询 3 秒过于激进 | `billing/page.tsx:77` | 改为 5-10 秒 |
| P2-F7 | 定价页无成本计算器 | `pricing/` | 添加交互式计算器 |
| P2-F8 | Delete 弹窗无 focus trap | `keys/page.tsx:344-355` | 添加 focus management |

### 运维
| # | 问题 | 修复 |
|---|------|------|
| P2-O1 | 无状态页面 | 用 GitHub Pages 搭建 status.nexusflow.hk |
| P2-O2 | 无维护模式 | 添加 feature flag + 503 标准响应 |
| P2-O3 | 图片生成同步轮询最长 90 秒 | 支持 async 模式返回 task ID |
| P2-O4 | 无 API 版本策略 | 定义 Sunset/Deprecation header 规范 |
| P2-O5 | 无事件广播 | 添加全局 banner 组件 |

---

## 四、迭代节奏

### Sprint 1（1-2 天）— 安全 & 稳定性基础
| 序号 | 项目 | 预计工时 |
|------|------|----------|
| 1 | P0-1: sanitizeError 全局化 | 30 min |
| 2 | P0-2: 错误边界 + 404 页面 | 1 hr |
| 3 | P1-B1: 优雅停机 | 30 min |
| 4 | P1-S1: Auth 速率限制 | 1 hr |
| 5 | P1-F2: 登录重定向修复 | 5 min |
| 6 | P1-F10: execCommand 替换 | 5 min |
| 7 | P1-B5: sessions 索引 | 5 min |

### Sprint 2（2-3 天）— 代码重构 & 性能
| 序号 | 项目 | 预计工时 |
|------|------|----------|
| 1 | P0-4: Admin 页面拆分 | 4 hr |
| 2 | P1-B10: 删除死代码 | 30 min |
| 3 | P1-B2: ensureInternalProviders 缓存 | 1 hr |
| 4 | P1-F7: recharts 动态导入 | 15 min |
| 5 | P1-F8: loading.tsx 文件 | 1 hr |
| 6 | P1-F11: Playground 拆分 | 3 hr |

### Sprint 3（3-5 天）— 核心产品功能
| 序号 | 项目 | 预计工时 |
|------|------|----------|
| 1 | P0-3: Webhook 完整实现 | 6 hr |
| 2 | P1-P1: 模型降级路由 | 4 hr |
| 3 | P1-P3: 用量告警 | 3 hr |
| 4 | P1-P5: 新用户免费额度 | 1 hr |
| 5 | P1-P7: Changelog 页面 | 1 hr |
| 6 | P1-F3/F4: Footer + 法律页面 | 2 hr |

### Sprint 4（5-7 天）— 增长 & 扩展
| 序号 | 项目 | 预计工时 |
|------|------|----------|
| 1 | P1-P2: 微信支付 | 8 hr |
| 2 | P1-P4: 团队/组织支持 | 12 hr |
| 3 | P1-P6: OpenAPI spec | 4 hr |
| 4 | P1-P8: 模型对比 | 4 hr |
| 5 | P1-P9: 用户用量分析 | 4 hr |

---

## 五、竞争力分析

**vs OpenRouter 的优势：**
- ✅ 中国供应商深度覆盖（DashScope 百炼聚合、HappyHorse、PixVerse、万相）
- ✅ 视频生成模型（OpenRouter 无）
- ✅ 三协议兼容（OpenAI Chat / Anthropic Messages / Responses API；OpenRouter 仅 OpenAI）
- ✅ 人民币定价 + 支付宝（中国用户体验更好）

**vs OpenRouter 的差距（P1 可逐步补齐）：**
- ❌ 无团队/组织支持 → P1-P4
- ❌ 无模型对比 → P1-P8
- ❌ 无用户用量分析 → P1-P9
- ❌ 无模型降级 → P1-P1

**结论：** 平台已适合个人开发者使用，距 B2B 规模化需补齐：Webhook（P0-3）、模型降级（P1-P1）、微信支付（P1-P2）、团队支持（P1-P4）。
