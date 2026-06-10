# NexusFlow 支付模块接入操作文档

> 更新时间: 2026-05-09
> 适用项目: NexusFlow AI 平台

---

## 一、项目现状

项目已具备完整的支付宝支付模块，无需额外开发：

| 组件 | 文件路径 | 说明 |
|------|----------|------|
| 支付服务 | `backend/src/services/alipay.ts` | 支付宝 SDK 封装 |
| API路由 | `backend/src/routes/billing.ts` | 充值、回调、查询接口 |
| 订单数据 | `backend/src/data/paymentOrders.ts` | 支付订单 CRUD |
| 账户数据 | `backend/src/data/billing.ts` | 充值/消费流水 |
| 数据库表 | `payment_orders`, `transactions`, `users.balance` | 已预建 |
| 前端页面 | `frontend/app/(dashboard)/billing/page.tsx` | 充值界面 |

---

## 二、支付宝开放平台配置（必做）

### 步骤 1：创建支付宝应用

1. 登录 **支付宝开放平台**: https://open.alipay.com/
2. 进入 **控制台** → **创建应用**
3. 选择应用类型：**网页/移动应用**
4. 添加能力：**电脑网站支付** 或 **手机网站支付**
   - 需签约，需营业执照
   - 个人开发者可用 **沙箱环境** 先测试

### 步骤 2：生成 RSA2 密钥对

1. 下载密钥工具：https://opendocs.alipay.com/common/02kipl
2. 选择 **RSA2(SHA256)** 密钥格式
3. 生成密钥对：
   - **应用私钥** → 保存到 `.env` 文件
   - **应用公钥** → 上传到支付宝开放平台

### 步骤 3：获取支付宝公钥

1. 在支付宝开放平台 → 你的应用 → 开发设置
2. 上传 **应用公钥** 后
3. 系统会显示 **支付宝公钥** → 复制保存

> ⚠️ 注意：支付宝公钥 ≠ 你的应用公钥

### 步骤 4：配置回调地址

在应用设置中填写：
- **异步通知地址**: `https://api.nexusflow.io/api/billing/alipay/notify`
- **同步返回地址**: `https://nexusflow.io/billing?pay=success`

---

## 三、密钥对照表

| 密钥类型 | 你持有的 | 放在支付宝平台 | 填到项目 `.env` |
|----------|----------|----------------|-----------------|
| 应用私钥 | ✅ | ❌ 绝不上传 | `ALIPAY_PRIVATE_KEY` |
| 应用公钥 | ✅ | ✅ 上传到平台 | ❌ 不填 |
| 支付宝公钥 | 平台给你 | 平台生成 | `ALIPAY_PUBLIC_KEY` |

---

## 四、后端环境变量配置

编辑 `backend/.env`：

```bash
# ============================
# 支付宝支付配置（必填）
# ============================

# 应用 APPID
ALIPAY_APP_ID=你的AppID

# 应用私钥（RSA2格式）
ALIPAY_PRIVATE_KEY=你的应用私钥内容

# 支付宝公钥（从平台获取）
ALIPAY_PUBLIC_KEY=支付宝公钥内容

# 网关地址
# 正式环境：https://openapi.alipay.com/gateway.do
# 沙箱环境：https://openapi-sandbox.dl.alipaydev.com/gateway.do
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do

# 异步回调地址（后端公网可访问）
ALIPAY_NOTIFY_URL=https://api.nexusflow.io/api/billing/alipay/notify

# 同步返回地址（用户支付后跳转）
ALIPAY_RETURN_URL=https://nexusflow.io/billing?pay=success

# ============================
# 可选强校验（推荐）
# ============================
ALIPAY_EXPECT_APP_ID=你的AppID
ALIPAY_EXPECT_SELLER_ID=你的商户PID
```

---

## 五、沙箱环境测试

如无营业执照，可先用沙箱：

1. 进入沙箱：https://open.alipay.com/develop/sandbox/app
2. 使用沙箱的 AppID 和密钥
3. 设置网关：
   ```bash
   ALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do
   ```
4. 使用沙箱买家账号测试支付

---

## 六、本地开发模拟支付

不配置支付宝时，可开启模拟模式：

```bash
ENABLE_MOCK_PAYMENT=true
NODE_ENV=development
```

充值即时到账，不走真实支付流程。

---

## 七、密钥格式

**私钥**（两种都支持）：

PEM 格式：
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----
```

纯 Base64：
```
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
```

**公钥**：
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAg...
-----END PUBLIC KEY-----
```

---

## 八、API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/billing/summary` | GET | 账单概览 |
| `/api/billing/transactions` | GET | 交易记录 |
| `/api/billing/payment/config` | GET | 支付配置状态 |
| `/api/billing/recharge` | POST | 创建充值订单 |
| `/api/billing/alipay/notify` | POST | 支付宝异步回调 |
| `/api/billing/order/status` | GET | 查询订单状态 |

**充值请求示例**：

```json
POST /api/billing/recharge
{
  "amount": 100,
  "method": "page"   // "page"网页支付 | "qr"扫码 | "mock"模拟
}
```

---

## 九、常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| "支付服务暂未配置" | 环境变量未填 | 补充 ALIPAY_* 配置 |
| 回调签名验证失败 | 公钥错误 | 检查 ALIPAY_PUBLIC_KEY |
| 支付成功余额未增加 | 回调未到达 | 前端轮询订单状态接口 |
| 订单过期 | 超15分钟未支付 | 订单自动关闭，重新发起 |

---

## 十、上线前检查清单

- [ ] ALIPAY_APP_ID 已填写
- [ ] ALIPAY_PRIVATE_KEY 已填写（应用私钥）
- [ ] ALIPAY_PUBLIC_KEY 已填写（支付宝公钥）
- [ ] ALIPAY_NOTIFY_URL 公网可访问
- [ ] ALIPAY_RETURN_URL 前端页面地址
- [ ] ALIPAY_GATEWAY 正确（正式/沙箱）
- [ ] ENABLE_MOCK_PAYMENT 生产环境禁用
- [ ] 支付宝应用已签约"电脑网站支付"

---

## 十一、扩展：接入其他支付渠道

如需接入微信支付，需新增：

1. `backend/src/services/wechat.ts` - 微信支付 SDK
2. `backend/src/routes/billing.ts` - 新增微信回调路由
3. `backend/.env` - 微信支付配置变量
4. 数据库 `payment_orders.channel` 支持 `wechat`

如需帮助可继续规划。