# Nexusflow 项目交互问题总结

本文档记录了在维护和升级 Nexusflow AI 路由器平台过程中遇到的所有问题及解决方案。

---

## 1. PixVerse 模型管理问题

### 1.1 模型重复显示
**问题**: 前端 Playground 和模型列表页面显示多个相同的 PixVerse V6 模型。

**原因**: `getAllModels()` 函数简单合并了静态模型（`models.ts`）和数据库中的供应商模型（`provider_models` 表），导致相同 `model_id` 的模型出现两次。

**解决**: 在 `backend/src/routes/models.ts` 中使用 `Map` 去重，数据库模型覆盖同名静态模型：
```typescript
const modelMap = new Map<string, AIModel>();
for (const m of models) modelMap.set(m.id, m);
for (const m of dynamicModels) modelMap.set(m.id, m);
return Array.from(modelMap.values());
```

### 1.2 不需要的模型未清理
**问题**: 用户只想保留 pixverse-v6，但代码和数据库中存在 v5.5, v5, v4, v3.5 等旧模型。

**解决**:
- 从 `models.ts` 中删除不需要的模型定义
- 从 `adapters.ts` 和 `tasks.ts` 中删除对应的模型映射
- 从数据库中删除：`DELETE FROM provider_models WHERE model_id IN ('pixverse-v5.5', 'pixverse-v5', 'pixverse-v4', 'pixverse-v3.5');`

### 1.3 PixVerse 旧版本模型不可用
**问题**: 尝试添加旧版本 PixVerse 模型时，百炼平台返回 "User does not exist" 或模型不可用错误。

**原因**: 当前百炼 API Key 对应的账号可能未开通该模型，或模型名称不正确。

**解决**: 移除旧版本 PixVerse 模型，只保留 `pixverse-v6`。

---

## 2. 双通道架构问题

### 2.1 管理后台缺少渠道切换 UI
**问题**: PixVerse 支持百炼和官方两个渠道，但管理后台没有切换渠道的界面。

**解决**: 
- 在 `admin/page.tsx` 的渠道详情卡片中添加渠道下拉选择器
- 添加 `handleSwitchChannel()` 函数调用后端 API
- 后端添加 `POST /api/provider/:providerId/switch-channel` 接口

### 2.2 渠道配置数据结构
**PixVerse 渠道配置存储格式**:
```json
{
  "active_channel": "official",
  "channels": {
    "bailian": {
      "name": "百炼渠道",
      "adapter": "dashscope",
      "api_base_url": "https://dashscope.aliyuncs.com/api/v1",
      "api_key": "sk-your-dashscope-api-key"
    },
    "official": {
      "name": "拍我官方",
      "adapter": "pixverse",
      "api_base_url": "https://app-api.pixverseai.cn/openapi/v2",
      "api_key": "sk-your-pixverse-api-key"
    }
  }
}
```

---

## 3. API Key 和余额问题

### 3.1 百炼渠道 "Account in arrears"
**问题**: 使用百炼 API Key (`sk-your-dashscope-api-key`) 调用 pixverse-v6 时返回 "Your account is in arrears. Please check your account status."

**原因**: 阿里云百炼账号欠费了。

**状态**: 需要在阿里云控制台充值才能恢复使用。

**备注**: `pixverse-v6` 模型是可用的，但账号欠费会导致无法调用。

### 3.2 官方渠道 "Insufficient balance"
**问题**: 使用 PixVerse 官方 API 时返回余额不足。

**原因**: PixVerse 官方账号需要充值。

**解决**: 需要在 PixVerse 平台充值后才能使用官方渠道。

---

## 4. 代码编辑和构建问题

### 4.1 数据库路径问题
**问题**: 在项目根目录运行 `sqlite3 data/ai-router.db` 报错 "unable to open database"。

**原因**: 数据库文件实际路径是 `backend/data/ai-router.db`。

**解决**: 使用完整路径：`sqlite3 /root/distiny/nexusflow/backend/data/ai-router.db`

### 4.2 构建和重启服务
**正确的构建和重启流程**:
```bash
cd /root/distiny/nexusflow/backend
npm run build
pm2 restart quadrant-backend
```

### 4.3 PM2 进程名称
**问题**: 使用 `pm2 restart nexusflow-backend` 报错进程不存在。

**原因**: 实际 PM2 进程名称是 `quadrant-backend`，不是 `nexusflow-backend`。

**解决**: 使用 `pm2 list` 查看实际进程名称。

---

## 5. 前端和后端代码问题

### 5.1 渠道切换 API 缺失
**问题**: 前端添加了渠道切换 UI，但后端没有对应的 API 接口。

**解决**: 在 `backend/src/routes/provider.ts` 中添加：
```typescript
router.post("/:providerId/switch-channel", (req, res) => {
  const { channel } = req.body;
  switchProviderChannel(providerId, channel);
  res.json({ success: true, data: { channel, channelName } });
});
```

### 5.2 编辑代码时的重复代码问题
**问题**: 使用 Edit 工具修改代码时，有时会产生重复或孤立的代码块。

**原因**: `old_string` 匹配不够精确或文件内容在编辑之间发生了变化。

**解决**: 
1. 编辑前先用 Read 工具确认最新文件内容
2. 确保 `old_string` 包含足够的上下文使其唯一
3. 编辑后用 Read 工具验证结果

---

## 6. 模型测试验证

### 6.1 成功的测试（历史记录）
- **pixverse-v6 (百炼渠道)**: 之前曾成功生成视频，返回视频 URL
- **任务轮询**: 修复了渠道感知的 API Key 选择逻辑，百炼渠道使用 DashScope Key 和轮询方法

### 6.2 最新的测试结果（2026-04-27 22:24）
- **pixverse-v6 (百炼渠道)**: 失败 - "Your account is in arrears. Please check your account status."
  - 说明模型是可用的，但阿里云账号欠费
  
### 6.3 失败的测试
- **pixverse-v6 (官方渠道)**: "Insufficient balance" - PixVerse 官方账号需要充值

---

## 7. 待办事项

1. [ ] **阿里云账号充值** - 百炼渠道因欠费无法使用
2. [ ] **为 PixVerse 官方渠道充值** - 官方渠道余额不足
3. [ ] 测试渠道切换功能是否正常工作
4. [ ] 考虑是否需要为其他供应商（如 HappyHorse）实现双通道支持

---

*文档生成时间: 2026-04-27*
