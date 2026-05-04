# NexusFlow AI 平台模型文档

本文档详细记录 NexusFlow AI 平台支持的所有模型，包括参数、价格、协议支持和底层渠道信息。

## 目录

- [平台概述](#平台概述)
- [模型分类统计](#模型分类统计)
- [渠道架构](#渠道架构)
- [大语言模型](#大语言模型)
- [推理模型](#推理模型)
- [多模态模型](#多模态模型)
- [编程模型](#编程模型)
- [专业模型](#专业模型)
- [向量模型](#向量模型)
- [图像生成模型](#图像生成模型)
- [视频生成模型](#视频生成模型)
- [协议支持](#协议支持)
- [API 端点](#api-端点)

---

## 平台概述

NexusFlow 是一个统一的 AI 模型路由平台，提供以下功能：

- **45+ 模型**: 涵盖大语言模型、推理模型、多模态模型、编程模型、向量模型、图像生成和视频生成
- **OpenAI 协议兼容**: 支持 OpenAI Chat Completions、Embeddings、Image Generations 协议
- **多协议支持**: 同时支持 Anthropic Messages 和 Google Generate Content 协议
- **统一计费**: 按 Token 或按生成数量计费，价格透明
- **Playground 体验**: 提供可视化界面直接体验各模型能力

---

## 模型分类统计

| 分类 | 模型数量 | 说明 |
|------|----------|------|
| 大语言模型 | 21 | 通用对话、文本生成 |
| 推理模型 | 4 | 数学、逻辑、复杂推理 |
| 多模态模型 | 5 | 视觉理解、图像输入 |
| 编程模型 | 2 | 代码生成、代码补全 |
| 专业模型 | 1 | 翻译专用 |
| 向量模型 | 1 | 文本嵌入、语义搜索 |
| 图像生成 | 1 | 文生图、图像编辑 |
| 视频生成 | 11 | 文生视频、图生视频、视频编辑 |
| **总计** | **45** | |

---

## 渠道架构

### 后端 API 渠道

| 渠道名称 | API 基础地址 | 主要服务 | 状态 |
|----------|--------------|----------|------|
| DashScope (阿里云百炼) | `https://dashscope.aliyuncs.com/api/v1` | Qwen系列、DeepSeek、GLM、Kimi、MiniMax、万相视频、HappyHorse | **活跃** |
| PixVerse 官方 | `https://app-api.pixverse.ai/openapi/v2` | PixVerse V6 视频生成 | **活跃** |

### PixVerse 双渠道架构

PixVerse 模型支持两种渠道切换：

| 渠道 ID | 名称 | Adapter | API 地址 | 说明 |
|---------|------|---------|----------|------|
| `bailian` | 百炼渠道 | dashscope | DashScope API | 通过百炼平台代理调用 |
| `official` | 拍我官方 | pixverse | PixVerse Official API | **当前激活渠道** |

当前激活渠道: `official` (PixVerse 官方 API)

### API Key 配置

```bash
# 阿里云百炼 API Key (DashScope)
DASHSCOPE_API_KEY=sk-27b3ca3cb4944f379c214b6444e08210

# PixVerse 官方 API Key
PIXVERSE_API_KEY=sk-bdb524726ddf7104e5c5a80f3188ea64
```

---

## 大语言模型

### 通义千问 Qwen 系列

| 模型 ID | 名称 | 上下文窗口 | 最大输出 | 输入价格 | 输出价格 | 特性 |
|---------|------|------------|----------|----------|----------|------|
| `qwen3-max` | Qwen3 Max | 262K | 16K | ¥2.5/M | ¥10/M | 旗舰，思考模式 |
| `qwen3.6-max-preview` | Qwen3.6 Max Preview | 262K | 65K | ¥9/M | ¥54/M | 预览版，强推理 |
| `qwen3.6-plus` | Qwen3.6 Plus | 1M | 65K | ¥2/M | ¥12/M | 百万上下文 |
| `qwen3.5-plus` | Qwen3.5 Plus | 1M | 16K | ¥0.8/M | ¥4.8/M | 高性价比 |
| `qwen3.5-flash` | Qwen3.5 Flash | 1M | 16K | ¥0.2/M | ¥2/M | 极速低成本 |
| `qwen-plus` | Qwen Plus | 131K | 16K | ¥0.8/M | ¥2/M | 经典平衡 |
| `qwen-turbo` | Qwen Turbo | 131K | 16K | ¥0.3/M | ¥0.6/M | 最快最便宜 |
| `qwen-long` | Qwen Long | **10M** | 8K | ¥0.5/M | ¥2/M | 超长文本 |

### Qwen3 开源系列

| 模型 ID | 名称 | 上下文窗口 | 最大输出 | 输入价格 | 输出价格 | 特性 |
|---------|------|------------|----------|----------|----------|------|
| `qwen3-235b-a22b` | Qwen3 235B-A22B | 131K | 8K | ¥1/M | ¥4/M | MoE架构，思考模式 |
| `qwen3-32b` | Qwen3 32B | 131K | 8K | ¥0.5/M | ¥2/M | 开源密集模型 |
| `qwen3-8b` | Qwen3 8B | 131K | 8K | **免费** | **免费** | 轻量边缘部署 |

### DeepSeek 系列

| 模型 ID | 名称 | 上下文窗口 | 最大输出 | 输入价格 | 输出价格 | 特性 |
|---------|------|------------|----------|----------|----------|------|
| `deepseek-v4-flash` | DeepSeek V4 Flash | 131K | 16K | ¥1/M | ¥4/M | 高速低延迟 |
| `deepseek-v3.2` | DeepSeek V3.2 | 131K | 16K | ¥1/M | ¥4/M | 最新通用 |
| `deepseek-v3` | DeepSeek V3 | 65K | 8K | ¥0.5/M | ¥2/M | MoE架构 |

### 智谱 GLM 系列

| 模型 ID | 名称 | 上下文窗口 | 最大输出 | 输入价格 | 输出价格 | 特性 |
|---------|------|------------|----------|----------|----------|------|
| `glm-4.7` | GLM 4.7 | 131K | 8K | ¥1/M | ¥4/M | 中文优化 |
| `glm-5` | GLM 5 | 131K | 16K | ¥2/M | ¥8/M | 旗舰 |
| `glm-5.1` | GLM 5.1 | 131K | 16K | ¥2.5/M | ¥10/M | 增强旗舰 |

### Kimi 系列

| 模型 ID | 名称 | 上下文窗口 | 最大输出 | 输入价格 | 输出价格 | 特性 |
|---------|------|------------|----------|----------|----------|------|
| `kimi-k2.5` | Kimi K2.5 | 131K | 8K | ¥1/M | ¥4/M | 长文本理解 |
| `kimi-k2.6` | Kimi K2.6 | 262K | 16K | ¥2/M | ¥8/M | 旗舰长文本 |

### MiniMax 系列

| 模型 ID | 名称 | 上下文窗口 | 最大输出 | 输入价格 | 输出价格 | 特性 |
|---------|------|------------|----------|----------|----------|------|
| `MiniMax-M2.1` | MiniMax M2.1 | 131K | 8K | ¥1/M | ¥4/M | 创意写作 |
| `MiniMax-M2.5` | MiniMax M2.5 | 131K | 16K | ¥1.5/M | ¥6/M | 推理增强 |

---

## 推理模型

| 模型 ID | 名称 | 上下文窗口 | 最大输出 | 输入价格 | 输出价格 | 特性 |
|---------|------|------------|----------|----------|----------|------|
| `qwq-plus` | QwQ Plus | 131K | 16K | ¥1/M | ¥4/M | 思考链，数学逻辑 |
| `deepseek-v4-pro` | DeepSeek V4 Pro | 131K | 16K | ¥4/M | ¥16/M | V4旗舰推理 |
| `deepseek-r1` | DeepSeek R1 | 65K | 8K | ¥2/M | ¥8/M | 思考链，数学编程 |
| `qwen-math-plus` | Qwen Math Plus | 4K | 4K | ¥4/M | ¥12/M | 数学专用，LaTeX |

---

## 多模态模型

| 模型 ID | 名称 | 上下文窗口 | 最大输出 | 输入价格 | 输出价格 | 支持输入 |
|---------|------|------------|----------|----------|----------|----------|
| `qwen-vl-max` | Qwen VL Max | 32K | 8K | ¥3/M | ¥9/M | 文本、图像 |
| `qwen-vl-plus` | Qwen VL Plus | 32K | 8K | ¥1.5/M | ¥4.5/M | 文本、图像 |
| `qwen3-vl-plus` | Qwen3 VL Plus | 262K | 8K | ¥1/M | ¥10/M | 文本、图像(高分辨率) |
| `qwen3-vl-flash` | Qwen3 VL Flash | 131K | 8K | **免费** | **免费** | 文本、图像 |
| `qwen3-omni-flash` | Qwen3 Omni Flash | 65K | 8K | ¥1.8/M | ¥6.9/M | 文本、图像、视频 |

---

## 编程模型

| 模型 ID | 名称 | 上下文窗口 | 最大输出 | 输入价格 | 输出价格 | 特性 |
|---------|------|------------|----------|----------|----------|------|
| `qwen3-coder-plus` | Qwen3 Coder Plus | 1M | 16K | ¥4/M | ¥16/M | 百万上下文，工具调用 |
| `qwen3-coder-flash` | Qwen3 Coder Flash | 131K | 8K | **免费** | **免费** | 快速补全 |

---

## 专业模型

| 模型 ID | 名称 | 上下文窗口 | 最大输出 | 输入价格 | 输出价格 | 特性 |
|---------|------|------------|----------|----------|----------|------|
| `qwen-mt-plus` | Qwen MT Plus | 16K | 8K | ¥1.8/M | ¥5.4/M | 92语种翻译 |

---

## 向量模型

| 模型 ID | 名称 | 上下文窗口 | 输出维度 | 输入价格 | 输出价格 | 应用场景 |
|---------|------|------------|----------|----------|----------|----------|
| `text-embedding-v3` | Text Embedding V3 | 8K | 高维向量 | ¥0.7/M | ¥0/M | 语义搜索、聚类 |

---

## 图像生成模型

| 模型 ID | 名称 | 最大提示词长度 | 价格 | 支持功能 |
|---------|------|----------------|------|----------|
| `wan2.6-t2i` | 万相 2.6 文生图 | 4000 tokens | ¥0.2/张 | 文生图、图文混排、图像编辑 |

**分辨率支持**: 多种分辨率和宽高比
**特性**: 可渲染中英文本，高清写实图片

---

## 视频生成模型

### 万相 (Wan) 系列 - DashScope 渠道

| 模型 ID | 名称 | 最大时长 | 价格 | 分辨率 | 特性 |
|---------|------|----------|------|----------|------|
| `wan2.6-t2v` | 万相 2.6 文生视频 | 15秒 | ¥0.25/秒/1080P | 720P/1080P | 多镜头叙事 |
| `wan2.6-i2v` | 万相 2.6 图生视频 | 15秒 | ¥0.25/秒/1080P | 720P/1080P | 首帧驱动，自动配音 |
| `wan2.6-i2v-flash` | 万相 2.6 图生视频 Flash | 15秒 | ¥0.18/秒/1080P | 720P/1080P | 快速版 |
| `wan2.6-r2v` | 万相 2.6 参考生视频 | 10秒 | ¥0.25/秒/1080P | 720P/1080P | 多模态输入 |
| `wan2.6-r2v-flash` | 万相 2.6 参考生视频 Flash | 10秒 | ¥0.18/秒/1080P | 720P/1080P | 快速版 |

**RPS限制**: 5, **并发限制**: 5

### PixVerse 系列 - PixVerse 官方渠道

| 模型 ID | 名称 | 最大时长 | 价格 | 分辨率 | 宽高比 |
|---------|------|----------|------|----------|----------|
| `pixverse-v6` | PixVerse V6 | 15秒 | **免费** | 360p/540p/720p/1080p | 1:1, 16:9, 9:16, 4:3, 3:4 |

**渠道**: PixVerse 官方 API (`https://app-api.pixverse.ai/openapi/v2`)
**支持**: 文生视频、图生视频

### HappyHorse 系列 - DashScope 渠道

| 模型 ID | 名称 | 时长范围 | 价格 | 分辨率 | 特性 |
|---------|------|----------|------|----------|------|
| `happyhorse-1.0-t2v` | HappyHorse 1.0 文生视频 | 3-15秒 | ¥0.28/秒/1080P | 720P/1080P | 榜单第一，音频直出 |
| `happyhorse-1.0-i2v` | HappyHorse 1.0 图生视频 | 3-15秒 | ¥0.28/秒/1080P | 720P/1080P | 首帧驱动，音频直出 |
| `happyhorse-1.0-r2v` | HappyHorse 1.0 参考生视频 | 3-15秒 | ¥0.28/秒/1080P | 720P/1080P | 1-9张参考图 |
| `happyhorse-1.0-video-edit` | HappyHorse 1.0 视频编辑 | 输入3-60秒 | ¥0.26/秒/1080P | 720P/1080P | AI编辑，0-5张参考图 |

**特性**: 阿里巴巴2026年最新视频生成模型，榜单排名第一，默认带音频输出

---

## 视频模型参数对照表

### PixVerse V6 参数

| 前端参数 | 后端参数 | 可选值 |
|----------|----------|--------|
| duration | duration | 1-15 秒 |
| resolution | quality | 360p, 540p, 720p, 1080p |
| aspect_ratio | aspect_ratio | 1:1, 16:9, 9:16, 4:3, 3:4 |
| img_url | img_url | 图片URL (图生视频必需) |

### HappyHorse 参数

| 参数 | 说明 | 可选值 |
|------|------|--------|
| duration | 时长 | 3-15 秒 |
| resolution | 分辨率 | 720P, 1080P |
| aspect_ratio | 宽高比 | 多种 |
| img_url | 单图URL | 图生视频必需 |
| img_urls | 多图URL数组 | 参考生视频1-9张 |
| video_url | 视频URL | 视频编辑必需 |
| audio_setting | 音频设置 | 可配置 |
| seed | 随机种子 | 可选 |

### 万相 2.6 参数

| 参数 | 说明 | 可选值 |
|------|------|--------|
| prompt | 提示词 | 必需 |
| size | 分辨率 | 如 1280*720 |
| duration | 时长 | 2-15 秒 |
| img_url | 图片URL | 图生视频必需 |
| prompt_extend | 扩展改写 | true (默认) |

---

## 协议支持

### 各类模型支持的协议

| 模型类型 | 支持协议 |
|----------|----------|
| 大语言模型 | `openai/chat-completions`, `anthropic/messages`, `google/generate-content` |
| 推理模型 | `openai/chat-completions`, `anthropic/messages`, `google/generate-content` |
| 多模态模型 | `openai/chat-completions`, `anthropic/messages`, `google/generate-content` |
| 编程模型 | `openai/chat-completions`, `anthropic/messages`, `google/generate-content` |
| 专业模型 | `openai/chat-completions`, `anthropic/messages`, `google/generate-content` |
| 向量模型 | `openai/embeddings` |
| 图像生成 | `openai/image-generations`, `nexusflow/tasks` |
| 视频生成 | `nexusflow/tasks` |

---

## API 端点

### 对话 API

```
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "model": "qwen3-max",
  "messages": [
    {"role": "user", "content": "你好"}
  ]
}
```

### 向量 API

```
POST /v1/embeddings
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "model": "text-embedding-v3",
  "input": "需要嵌入的文本"
}
```

### 图像生成 API

```
POST /v1/images/generations
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "model": "wan2.6-t2i",
  "prompt": "一只可爱的猫咪",
  "size": "1024x1024"
}
```

### 视频生成 API (Playground)

```
POST /api/video/generate
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "model": "pixverse-v6",
  "prompt": "描述视频内容",
  "duration": 5,
  "resolution": "720p",
  "aspect_ratio": "16:9"
}
```

### 视频状态查询 API

```
GET /api/video/status/:taskId
Authorization: Bearer YOUR_API_KEY
```

---

## 服务提供商汇总

| 提供商 | 模型数量 | 主要模型 |
|--------|----------|----------|
| 通义千问 | 21 | Qwen系列、万相、QwQ、Math、MT |
| DeepSeek | 5 | V3、V3.2、V4、R1 |
| 拍我AI (PixVerse) | 1 | PixVerse V6 |
| 阿里巴巴 (Alibaba) | 4 | HappyHorse 系列 |
| 智谱AI | 3 | GLM 4.7、GLM 5、GLM 5.1 |
| 月之暗面 | 2 | Kimi K2.5、Kimi K2.6 |
| MiniMax | 2 | M2.1、M2.5 |

---

## 技术架构

```
用户请求 → NexusFlow 路由层 → 渠道选择 → 上游 API
                                    ↓
                            ┌───────────────────┐
                            │ DashScope (百炼)   │ ← Qwen/DeepSeek/GLM/Kimi/MiniMax/Wan/HappyHorse
                            │ PIXVERSE Official │ ← PixVerse V6
                            └───────────────────┘
```

---

## 更新日期

文档生成时间: 2026-04-28
模型数据来源: `/api/models` API + 代码配置文件

---

## 免费模型列表

以下模型可免费使用：

| 模型 ID | 名称 | 类型 |
|---------|------|------|
| `qwen3-vl-flash` | Qwen3 VL Flash | 多模态 |
| `qwen3-coder-flash` | Qwen3 Coder Flash | 编程 |
| `qwen3-8b` | Qwen3 8B | 大语言 |
| `pixverse-v6` | PixVerse V6 | 视频生成 |

---

## 旗舰推荐模型

| 模型 ID | 名称 | 分类 | 推荐场景 |
|---------|------|------|----------|
| `qwen3-max` | Qwen3 Max | 大语言 | 通用对话、复杂推理 |
| `qwen3-coder-plus` | Qwen3 Coder Plus | 编程 | 代码生成、大型代码库 |
| `qwen-vl-max` | Qwen VL Max | 多模态 | 图像理解、OCR |
| `deepseek-r1` | DeepSeek R1 | 推理 | 数学、逻辑推理 |
| `wan2.6-t2v` | 万相 2.6 文生视频 | 视频 | 高质量视频生成 |
| `pixverse-v6` | PixVerse V6 | 视频 | 多分辨率视频生成 |
| `happyhorse-1.0-t2v` | HappyHorse 1.0 文生视频 | 视频 | 榜单第一，音频直出 |