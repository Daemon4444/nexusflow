# 子账号体系 Spec（主账号 → 子账号）

> 状态：设计稿 v1（2026-07-17）
> 基线代码：main `5d4168f`

## 0. 一句话

主账号可以创建子账号分发给不同用户；子账号用「用户名 + 密码」登录，登录后可绑定邮箱；子账号的所有消费**实时扣主账号余额**，主账号可给每个子账号设消费限额、看分账账单；子账号只能看到和管理自己的东西。

## 1. 目标 / 非目标

**目标（v1）**
- 主账号创建/停用/管理子账号，重置其密码，设置消费限额
- 子账号：用户名+密码登录 → 之后可绑定邮箱（绑定后也可用邮箱登录、走邮箱找回密码）
- 钱只在主账号一处：子账号消费扣主账号余额，无资金划拨、无碎片
- 账单三视角：主账号总账、主账号分账（按子账号拆）、子账号自己的明细
- 权限边界清晰（见 §5 权限矩阵）
- 对存量用户零行为差异，可随时上线

**非目标（v1，将来再说）**
- 多层级（子账号再建子账号）——只允许一层
- 子账号独立充值 / 余额划拨模式
- 把已注册的存量独立用户转成某主账号的子账号（涉及存量余额归属，v2）
- 组织/团队多管理员角色（Owner/Admin/Member 那套）

## 2. 账号模型

### 2.1 数据结构（migration 008）

```sql
-- 子账号关系与登录
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id TEXT REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;           -- 子账号登录名；主账号可为 NULL
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';  -- active | suspended | deleted

-- 限额（只对子账号有意义）
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_limit NUMERIC;            -- NULL = 不限额，单位与 balance 一致（CNY）
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_used NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_period TEXT;              -- 'total' | 'monthly'（NULL 视为 total）
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_reset_at TIMESTAMPTZ;     -- monthly 模式的上次重置时间

-- 账单：钱记在主账号名下，但要知道是谁花的
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS actor_user_id TEXT;      -- 实际发起消费的账号（子账号 id；主账号自己消费=自己 id 或 NULL）

CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_transactions_actor ON transactions(actor_user_id);
```

全部新列可空/有默认值 → **存量数据零改动，部署即兼容**（现有用户 parent_user_id 全 NULL = 主账号）。

### 2.2 规则

- `parent_user_id IS NULL` = 主账号；非 NULL = 子账号
- **只允许一层**：创建子账号的接口校验发起者自身 `parent_user_id IS NULL`
- `username` 规则：3–32 位 `[a-zA-Z0-9_-]`，全局唯一（唯一索引兜底），保留字黑名单（admin/root/api/system/nexusflow…）
- 子账号创建时 `email = NULL`、`phone = NULL`、`balance = 0`（且永远保持 0，见 §3）
- 子账号数量上限：每个主账号默认 20 个（env `SUB_ACCOUNT_LIMIT` 可调），防滥用

### 2.3 登录与邮箱绑定

| 路径 | 谁能用 | 说明 |
|---|---|---|
| `POST /api/auth/login-username` (新增) | 子账号（主账号有 username 也可用） | username + password → 复用现有 sessions |
| `POST /api/auth/login-password`（现有） | 绑定了邮箱的任何账号 | email + password |
| `POST /api/auth/login`（现有，邮箱验证码） | 绑定了邮箱的任何账号 | **注意**：现有逻辑是"邮箱不存在则注册新号"，保持不变——但绑定校验保证一个邮箱只属于一个账号 |
| `POST /api/auth/bind-email` (新增) | 已登录且 email IS NULL | 走现有 send-code 验证码验证归属；邮箱已被其他账号占用 → 409 拒绝 |

- 初始密码由主账号创建时设置（前端默认生成随机强密码，展示一次）；子账号可随时在 Settings 自行改密码，不强制
- 忘记密码：绑了邮箱 → 邮箱验证码重置；没绑 → 找主账号重置（`POST /api/sub-accounts/:id/reset-password`）
- 停用/删除子账号时**立即删除其全部 sessions**（踢下线）

## 3. 钱的设计（核心不变量）

### 3.1 原则

> **钱只存在于主账号一处。** 子账号 `balance` 恒为 0：不可充值、不可调账、不可退款到子账号。所有资金动作（充值/消费扣款/管理员调账/退款）的主体都是主账号。

这样保住现有对账不变量：`主账号 totalRecharge − totalConsumption ± 调账 = balance`，且停用/删除子账号**不涉及任何资金移动**。

### 3.2 扣费链路改造（唯一入口 `consume()`，backend/src/data/billing.ts:131）

```
consume(actorUserId, amount, desc, ...)
  1. 读 actor：得 parent_user_id、status
  2. billingOwnerId = parent_user_id ?? actorUserId
  3. 事务内：
     a. SELECT balance FROM users WHERE id = billingOwnerId FOR UPDATE   -- 只锁主账号一行，锁序全局一致
     b. balance < amount → 返回 null（上层报 402，行为同现状）
     c. 若 actor 是子账号且有限额：
        UPDATE users SET quota_used = quota_used + :amt
        WHERE id = :actorId
          AND status = 'active'
          AND (quota_limit IS NULL OR quota_used + :amt <= quota_limit)
        RETURNING id
        -- 原子条件更新：0 行 = 超限/已停用 → 整个事务回滚，返回限额错误
        -- （monthly 模式先做 lazy 重置，见 3.3）
     d. 扣主账号 balance
     e. INSERT transactions(user_id = billingOwnerId, actor_user_id = actorUserId, ...)
```

- **transactions.user_id 记主账号**：`balance_after` 的语义是"扣完后的余额"，只有主账号有余额；记子账号会让对账断裂。谁花的看 `actor_user_id`。
- `hasSufficientBalance()`（预检）同样 resolve parent + 检查限额余量（非事务快速检查，最终一致由 consume 的事务保证）。
- `recharge()` / `adminAdjustBalance()` / 支付下单接口：**发起者是子账号直接 403**。
- 死锁安全：每次事务最多锁两行且顺序固定（先主账号 FOR UPDATE，再子账号条件 UPDATE），全局一致无环。

### 3.3 限额（quota）

- `quota_limit`：CNY 金额上限；NULL = 不限（默认）
- `quota_period`：
  - `total`（默认）：累计消费上限，用完主账号手动调高或清零
  - `monthly`：自然月上限。**lazy 重置**：consume 时若 `quota_reset_at` 早于本月 1 号 → 先 `quota_used = 0, quota_reset_at = now()` 再做条件更新（同事务），不依赖 cron
- 超限行为：请求返回 402 + 明确错误 `sub_account_quota_exceeded`（区别于主账号余额不足的 `insufficient_balance`），子账号控制台展示限额进度条
- 主账号改限额即时生效（下一次 consume 就按新值判）

### 3.4 折扣归属

`user_model_discounts` 计费折扣以**主账号**为准（商务主体是主账号）：计费处查折扣时用 `billingOwnerId` 查。禁止给子账号单独建折扣行（admin 接口校验）。

### 3.5 主账号欠费/停用的传导

- 主账号余额不足 → 全部子账号请求 402（自然传导，无需额外逻辑）
- 主账号被管理员停用 → 子账号 key 一并失效（见 §5 停用语义）

## 4. 账单设计

### 4.1 数据来源分工

| 数据 | 来源 | 说明 |
|---|---|---|
| 金额级流水（对账口径） | `transactions`（user_id=主账号, actor_user_id=谁花的） | 钱的唯一事实 |
| 用量明细（token/模型/key 级） | `usage_logs`（user_id=子账号本人, api_key_id） | 现有结构天然按账号隔离，**零改动** |
| 限额进度 | `users.quota_used / quota_limit` | 实时 |

### 4.2 主账号视角

- **总账**：现有 `getBillingSummary` 不用改口径——所有消费本来就记在主账号 transactions 里，totalConsumption 天然=全家总消耗
- **分账报表（新增）** `GET /api/billing/sub-breakdown?start&end`：
  每个子账号一行：消费金额（transactions 按 actor_user_id 聚合）、调用次数、token 数（usage_logs 按 user_id 聚合）、限额使用率。含主账号自己消耗的一行（actor = 自己/NULL）
- **明细导出**：`getBillingUsageExport` 加"归属账号"列；支持 `?subAccountId=` 过滤；主账号可导出任意子账号或全量
- **流水页**：transactions 列表加"操作账号"列（actor 的 username/nickname）

### 4.3 子账号视角

- **看不到**主账号余额、其他子账号的任何数据
- Billing 页替换为「用量与限额」：本月/累计消费（usage_logs 聚合自己的 cost）、限额进度条（若设了）、明细表、导出自己的 CSV
- 充值入口隐藏，显示"余额由主账号统一管理"
- `GET /api/auth/me` 返回增加：`accountType: 'main'|'sub'`、`parentNickname`、`quota: {limit, used, period}`；子账号响应中 **balance 字段返回 0 或不返回**（避免前端误显示）

### 4.4 对账不变量（验收必测）

1. 主账号 `totalRecharge − totalConsumption ± adjustment = balance`（现状不变量，改造后仍成立）
2. `Σ transactions(consumption).amount` = `Σ usage_logs.cost`（主+全部子，现有 rounding 逻辑照旧）
3. `Σ transactions where actor=某子账号` ≈ `Σ usage_logs where user_id=该子账号`（分账两口径互验）
4. 子账号 `quota_used`（total 模式）= 该子账号历史消费之和

## 5. 权限矩阵

| 能力 | 主账号 | 子账号 |
|---|---|---|
| 用户名/邮箱登录 | ✓ | ✓（邮箱需先绑定） |
| 充值 / 收退款 / 被调账 | ✓ | ✗（接口 403） |
| 创建/删除自己的 API key | ✓ | ✓ |
| 调用 /v1 等推理 API | ✓ | ✓（须 active 且限额未超且主账号有钱） |
| 看自己的用量/明细/导出 | ✓ | ✓ |
| 看主账号余额 | ✓ | ✗ |
| 看子账号列表/分账/任一子账号明细 | ✓ | ✗ |
| 创建/停用/恢复/删除子账号 | ✓ | ✗（不能二级分号） |
| 设置子账号限额 | ✓ | ✗ |
| 重置子账号密码 | ✓ | 改自己的密码 ✓ |
| 绑定邮箱 / 改昵称 | ✓ | ✓ |
| 限流配置（user_rate_limits，admin 管） | 按账号独立挂 | 按账号独立挂（子账号是独立 user_id，现有机制直接生效） |
| 提额申请 / 工单 | ✓ | ✓（admin 侧展示所属主账号） |
| 平台 admin 面板 | 按 ADMIN_EMAILS，与本功能正交 | ✗ |

### 停用/删除语义

- `suspended`：登录拒绝、已有 sessions 删除、**API key 调用即时 401**、数据保留、可恢复
- `deleted`：**软删除**（status='deleted'），不物理删行
  - ⚠️ 原因：`api_keys.user_id` 是 `ON DELETE CASCADE`、`usage_logs.user_id` 是 `ON DELETE SET NULL`（001_initial_schema.sql:72,124）——物理删除会级联删 key 并把历史用量的归属抹掉，**分账历史就断了**。软删保历史。
  - 删除时：踢 sessions + 该子账号全部 api_keys 置失效（直接删 api_keys 行可以，key 没有历史价值，usage_logs.api_key_id SET NULL 但 user_id 还在，分账不受影响）
  - username 释放策略：deleted 后 username 改写为 `{username}#deleted#{ts}` 腾出唯一位

### 强制点：validateApiKey 改造

现状 `validateApiKey()`（data/apikeys.ts:35）只查 key 表、**完全不看用户状态**。改为 join users：

```sql
SELECT k.*, u.status AS user_status, u.parent_user_id
FROM api_keys k JOIN users u ON u.id = k.user_id
WHERE k.key_hash = ? ...
```

- `user_status != 'active'` → 401
- 若是子账号，再查主账号 status != 'active' → 401（主账号停用全家停）
  - 实现可用一次 self-join 或二次查询 + 短 TTL 内存缓存（该函数在每次 API 调用热路径上，注意别加太多查询；一次 LEFT JOIN parent 即可）

## 6. API 清单

### 新增 — 子账号管理（登录态 + 校验发起者是主账号）

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/sub-accounts` | `{username, password, nickname?, quotaLimit?, quotaPeriod?}` → 创建 |
| GET | `/api/sub-accounts` | 列表：username/nickname/status/quota_used/quota_limit/key 数/最近活跃/本月消费 |
| PATCH | `/api/sub-accounts/:id` | 改 nickname / quotaLimit / quotaPeriod / status(active⇄suspended) |
| POST | `/api/sub-accounts/:id/reset-password` | `{password}`，重置后踢该子账号 sessions |
| DELETE | `/api/sub-accounts/:id` | 软删除（须先 suspended，防误删） |
| GET | `/api/billing/sub-breakdown?start&end` | 分账报表 |

### 新增 — 认证

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/auth/login-username` | `{username, password}` |
| POST | `/api/auth/bind-email` | `{email, code}`，登录态，email 未占用 |

### 修改

| 位置 | 改动 |
|---|---|
| `data/billing.ts` `consume` / `hasSufficientBalance` | resolve billingOwner + 限额原子校验（§3.2） |
| `data/apikeys.ts` `validateApiKey` | join users 状态（§5） |
| `/api/auth/me` | 返回 accountType / quota / parentNickname |
| 计费处折扣查询 | 用 billingOwnerId 查 `user_model_discounts` |
| `/api/billing/recharge*`、支付下单、admin 调账 | 子账号 403 |
| `getBillingUsageExport` | 加归属列 + subAccountId 过滤 |
| `routes/keys.ts` | 无需改（本来就按 user_id 隔离） |

## 7. 前端

- **登录页**：加「用户名登录」tab（与邮箱登录并列）
- **主账号控制台**：新增「子账号」页（`(dashboard)/sub-accounts`）：
  - 列表（状态徽章/限额进度/本月消费/最近活跃）
  - 创建弹窗（自动生成随机密码，创建成功一次性展示凭据 + 复制按钮）
  - 行操作：改限额、停用/恢复、重置密码、删除
  - 分账报表卡（时间范围选择 + 导出 CSV）
- **子账号控制台**（同一套 dashboard，按 `me.accountType` 条件渲染）：
  - 隐藏：充值入口、余额卡（换成限额卡）、子账号页
  - Billing 页 → 「用量与限额」视图
  - Settings 加「绑定邮箱」块（改密码用现有 change-password）
- **i18n**：全部新文案走 `useI18n().t(key)` 双语（zh/en 同步加 key）

## 8. 边界 & 风控

- 主账号余额不足 → 子账号请求 402 `insufficient_balance`（错误信息不暴露主账号余额数字）
- 子账号超限 → 402 `sub_account_quota_exceeded`
- 并发：限额用原子条件 UPDATE（§3.2c），高并发下不会超扣；极端情况下最后一笔以实际 cost 结算可能轻微超出 quota_limit（预检用估算值、结算用实际值，与现有余额逻辑同一容忍度），可接受
- username 枚举防护：login-username 失败统一报"用户名或密码错误"，走现有限流
- 审计：子账号管理操作（创建/停用/重置密码/改限额）打 SLS 结构化日志（复用现有 SLS 通道），v1 不建审计表
- pg-mem 本地联调（USE_PG_MEM）需同步支持 migration 008 的列

## 9. 分期与验收

**P0 — 后端核心（可独立部署，无 UI 也可用 curl 验收）**
1. migration 008（存量零影响）
2. `consume`/`hasSufficientBalance` 改造 + 限额
3. `validateApiKey` 状态校验
4. 子账号 CRUD API + login-username
5. 充值/调账对子账号 403

**P1 — 账单**
6. 分账报表 API + 导出加归属列
7. transactions 流水加 actor 展示

**P2 — 前端**
8. 登录页用户名 tab、主账号「子账号」页、子账号视角改造

**P3 — 体验补全**
9. bind-email、邮箱找回

**验收核心用例**
- [ ] 存量用户部署前后行为逐字节一致（对照 §4.4 不变量 1/2）
- [ ] 主建子 → 子 username 登录 → 建 key → 调 /v1 成功 → 主账号余额减少、transactions.user_id=主 & actor=子、usage_logs.user_id=子
- [ ] 设限额 5 元 → 消费到 5 元 → 第 N+1 笔 402 quota_exceeded；主账号调高后恢复
- [ ] monthly 限额跨月自动归零（lazy）
- [ ] 停用子账号 → session 失效 + key 调用 401；恢复后正常
- [ ] 主账号余额 0 → 子账号 402；充值后恢复
- [ ] 子账号访问 /api/sub-accounts、充值接口 → 403
- [ ] 绑定已占用邮箱 → 409；绑定成功后邮箱+密码可登录
- [ ] 软删除后：分账报表历史仍在、username 可复用规则生效
- [ ] 并发 20 请求打限额边界，quota_used 无超扣（条件 UPDATE 原子性）
