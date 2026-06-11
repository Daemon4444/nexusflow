# NexusFlow 控制台 UI 改版 Spec

> 参考目标：token.aihezu.dev 控制台风格（深色侧边栏 + 浅灰内容区 + 专业 API 管理平台感）
> 当前状态：亮白底、inline style 满天飞、KPI 卡无层次、侧边栏无深度感

---

## 一、设计语言

### 1.1 配色方案

**侧边栏（深色）**
| Token | 值 | 用途 |
|---|---|---|
| `--sb-bg` | `#0d1117` | 侧边栏背景 |
| `--sb-bg-hover` | `#161b22` | 导航项 hover |
| `--sb-bg-active` | `#1c2128` | 活跃项背景 |
| `--sb-border` | `#21262d` | 侧边栏内分隔线 |
| `--sb-text` | `#8b949e` | 普通导航文字 |
| `--sb-text-active` | `#e6edf3` | 活跃项文字 |
| `--sb-accent` | `#2f81f7` | 活跃项左侧竖条 |

**内容区（浅色）**
| Token | 值 | 用途 |
|---|---|---|
| `--page-bg` | `#f6f8fa` | 页面背景 |
| `--card-bg` | `#ffffff` | 卡片/section 背景 |
| `--card-border` | `#d0d7de` | 卡片边框 |
| `--card-header-bg` | `#f6f8fa` | section header 背景 |
| `--table-header-bg` | `#f6f8fa` | 表头背景 |
| `--row-hover` | `#f6f8fa` | 表格行 hover |

**强调色（彩色 KPI 卡顶部描边）**
| 颜色 | 色值 | 用于 |
|---|---|---|
| teal | `#0d9488` | 余额、主要指标 |
| blue | `#2f81f7` | API Keys |
| green | `#16a34a` | 成功、调用量 |
| purple | `#9333ea` | 模型数量 |
| orange | `#ea580c` | 消耗、费用 |
| amber | `#d97706` | 警告 |

**语义色**
| 状态 | 文字色 | 背景 | 边框 |
|---|---|---|---|
| success | `#1a7f37` | `rgba(26,127,55,.1)` | `rgba(26,127,55,.2)` |
| danger | `#cf222e` | `rgba(207,34,46,.1)` | `rgba(207,34,46,.2)` |
| warning | `#9a6700` | `rgba(154,103,0,.1)` | `rgba(154,103,0,.2)` |
| info | `#0969da` | `rgba(9,105,218,.1)` | `rgba(9,105,218,.2)` |

### 1.2 字体
- 正文：现有 Inter + PingFang SC 不变
- 数字/金额：`font-variant-numeric: tabular-nums`
- KPI 数字：28px, weight 700, `--ink-0`
- 标签/描述：12px, weight 500, `--sb-text`

### 1.3 圆角 & 间距
- 卡片/Section：`border-radius: 8px`
- 徽章：`border-radius: 6px`（不用 9999 胶囊，更专业）
- 按钮：`border-radius: 7px`
- 侧边栏导航项：`border-radius: 6px`
- 卡片 padding：`20px 24px`
- 页面内容区 padding：`28px 32px`

---

## 二、组件规范

### 2.1 侧边栏
```
宽度：240px，深色 #0d1117
结构：
  ├── Logo 区（16px 上下 padding）：Logo图标 + "nexusflow" + "AI Model Router"
  ├── 分割线 #21262d
  ├── 导航区（flex: 1, overflow-y: auto, padding: 8px）
  │   ├── [分组标签] ACCOUNT —— 10px uppercase #484f58
  │   ├── [导航项] 概览 / API 密钥 / 账单 / Playground / 账户设置 / 限速 / 工单
  │   ├── [分组标签] ANALYTICS
  │   └── [导航项] 用量统计 / 性能监控
  └── 用户卡片区（border-top #21262d, padding: 12px 8px）
      └── 头像（渐变色）+ 昵称 + 余额（绿色 #3fb950）

导航项样式：
  - 默认：height 34px, text #8b949e, icon opacity 0.6
  - hover：background #161b22, text #e6edf3
  - active：background #1c2128, border 1px solid #30363d, 
            left 3px solid #2f81f7 竖条, text #e6edf3, icon teal色
```

### 2.2 KPI 卡片
```
.usr-metric {
  background: #fff
  border: 1px solid #d0d7de
  border-top: 3px solid [强调色]  ← 核心特征
  border-radius: 8px
  padding: 18px 20px
  box-shadow: 0 1px 3px rgba(0,0,0,.04)
}

hover: box-shadow 加强 + translateY(-1px)

内部结构：
  图标（36x36，对应 tint 色淡背景）+ 标签（12px uppercase）+ 数字（28px bold）+ 副文本
```

### 2.3 Section 卡片
```
.usr-section {
  background: #fff
  border: 1px solid #d0d7de
  border-radius: 8px
  box-shadow: 0 1px 3px rgba(0,0,0,.04)
}

.usr-section-header {
  background: #f6f8fa
  border-bottom: 1px solid #d0d7de
  padding: 14px 20px
}
```

### 2.4 表格
```
表头：background #f6f8fa, text 11px uppercase #57606a, padding 10px 16px
数据行：padding 11px 16px, border-bottom #d0d7de
hover：background #f6f8fa
```

### 2.5 徽章
```
badge-success:  background rgba(26,127,55,.1),  color #1a7f37,  border rgba(26,127,55,.2)
badge-danger:   background rgba(207,34,46,.1),  color #cf222e,  border rgba(207,34,46,.2)
badge-warning:  background rgba(154,103,0,.1),  color #9a6700,  border rgba(154,103,0,.2)
badge-info:     background rgba(9,105,218,.1),  color #0969da,  border rgba(9,105,218,.2)
padding: 2px 8px, border-radius: 6px, font-size: 11px, font-weight: 600
```

### 2.6 页面标题区
```
.usr-page-header {
  border-bottom: 1px solid #d0d7de
  padding-bottom: 20px
  margin-bottom: 24px
}
h1: 22px, weight 700, color #0d1117
p:  13.5px, color #57606a
```

---

## 三、各页面改造要求

### 3.1 Dashboard（主控制台）
**优先级：最高**

改造点：
- [ ] KPI 卡片加顶部彩色描边（余额=teal, Keys=blue, 调用=green, 模型=purple）
- [ ] 数字从 22px 升到 28px
- [ ] 最近请求表格加状态徽章（实心填充色，不只是文字颜色）
- [ ] 推荐模型卡片 hover 有 border-left teal 描边效果
- [ ] 页面整体背景从白色改为 #f6f8fa

### 3.2 Billing（账单）
**优先级：高**

改造点：
- [ ] 顶部余额英雄卡（深色渐变）数字加大 + 副统计右侧对齐
- [ ] 充值按钮移到右上角更显眼（保持现有逻辑不变）
- [ ] 账单导出 section 更紧凑
- [ ] 交易记录表格：类型徽章统一新样式，折扣信息更清晰
- [ ] 分页控件样式升级

### 3.3 Keys（API 密钥）
**优先级：高**

改造点：
- [ ] 密钥列表每行升级为卡片样式（white bg + border），去掉 table-row
- [ ] 新创建 Key 成功提示框加醒目警告（只显示一次），字体更大
- [ ] Rate limit 显示用徽章而不是普通文字
- [ ] 创建表单改为右侧 slide-over 或顶部内联展开（而不是页面内下拉）

### 3.4 Activity（用量统计）
**优先级：中**

改造点：
- [ ] KPI 卡片加彩色顶部描边
- [ ] 日请求量柱状图从 `#333` 改为 teal 渐变色
- [ ] 模型分布进度条用彩色而不是全灰
- [ ] 最近请求表格 status 列改实心徽章
- [ ] tab 切换样式升级（更清晰的下划线 active 态）

### 3.5 Settings（账户设置）
**优先级：低**

改造点：
- [ ] 用户信息卡片升级（头像更大，信息排布更宽松）
- [ ] 表单 label 统一风格
- [ ] 保存按钮右对齐

### 3.6 Monitor（性能监控）
**优先级：低**

改造点：
- [ ] KPI 卡片加彩色顶部描边
- [ ] 图表颜色统一到设计系统

---

## 四、实施策略

### CSS 实现方式
不重写页面组件，只在 `globals.css` 末尾追加覆盖层（CSS specificity 胜出）。
组件文件只改：
- UserSidebar.tsx（加余额显示、Logo）
- Dashboard page.tsx（KPI 卡片加 class）
- 其他页面只加 class，不改逻辑

### 迭代顺序
```
Iter 1: CSS 变量 + 侧边栏深色 + 页面背景 #f6f8fa
Iter 2: KPI 卡片顶部彩色描边 + 数字升大
Iter 3: 表格 + 徽章统一
Iter 4: Dashboard 推荐模型卡 + 近期请求
Iter 5: Billing 页面
Iter 6: Keys 页面
Iter 7: Activity 页面
Iter 8: Settings + Monitor
```

### 本地验证方式
每次迭代后运行：
```bash
export PATH="/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH"
cd ~/nexusflow/frontend && npx tsc --noEmit 2>&1
```
TypeScript 零错误 = 可 commit。
（构建环境 lightningcss native binding 签名问题不影响服务器构建，只影响本机 build）

---

## 五、不改动的部分
- 所有后端 API 逻辑
- 路由结构
- 认证流程
- i18n 文本
- 业务功能（充值、密钥管理等）
- 服务器不上线，直到手动确认
