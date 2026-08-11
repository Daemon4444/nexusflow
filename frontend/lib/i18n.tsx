"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

export type Locale = "zh" | "en";

const translations = {
  // ======== Common ========
  loading: { zh: "加载中...", en: "Loading..." },
  online: { zh: "在线", en: "Online" },
  logOut: { zh: "退出", en: "Log out" },
  logIn: { zh: "登录", en: "Log in" },
  signUp: { zh: "注册", en: "Sign up" },
  save: { zh: "保存", en: "Save" },
  cancel: { zh: "取消", en: "Cancel" },
  create: { zh: "创建", en: "Create" },
  delete: { zh: "删除", en: "Delete" },
  copy: { zh: "复制", en: "Copy" },
  copied: { zh: "已复制", en: "Copied" },
  previous: { zh: "上一页", en: "Previous" },
  next: { zh: "下一页", en: "Next" },
  refresh: { zh: "刷新", en: "Refresh" },
  noData: { zh: "暂无数据", en: "No data" },
  networkError: { zh: "网络错误", en: "Network error" },
  records: { zh: "条记录", en: "records" },

  // ======== Onboarding ========
  onboardingWelcome: { zh: "欢迎使用 NexusFlow", en: "Welcome to NexusFlow" },
  onboardingDesc: { zh: "一站式 AI 模型聚合平台，让你轻松调用 40+ 模型", en: "Unified AI model aggregation platform for 40+ models" },
  onboardingGetKey: { zh: "获取你的 API Key", en: "Get your API Key" },
  onboardingSelectModel: { zh: "选择一个模型", en: "Select a model" },
  onboardingStartTest: { zh: "开始第一次调用", en: "Make your first call" },
  quickTest: { zh: "快速测试", en: "Quick Test" },

  // ======== Header Nav ========
  navModels: { zh: "Models", en: "Models" },
  navPlayground: { zh: "Playground", en: "Playground" },
  navDocs: { zh: "Docs", en: "Docs" },
  navPricing: { zh: "Pricing", en: "Pricing" },
  navKeys: { zh: "密钥", en: "Keys" },
  navBilling: { zh: "账单", en: "Billing" },
  navMonitor: { zh: "监控", en: "Monitor" },
  navActivity: { zh: "统计", en: "Activity" },
  navSettings: { zh: "设置", en: "Settings" },

  // ======== Sidebar ========
  sidebarTitle: { zh: "控制台", en: "Console" },
  sidebarAccount: { zh: "账户", en: "Account" },
  sidebarAnalytics: { zh: "分析", en: "Analytics" },
  sidebarProfile: { zh: "个人资料", en: "Profile" },
  sidebarApiKeys: { zh: "API 密钥", en: "API Keys" },
  sidebarCredits: { zh: "账单", en: "Billing" },
  sidebarActivity: { zh: "使用统计", en: "Activity" },
  sidebarPerformance: { zh: "性能监控", en: "Performance" },
  sidebarRateLimits: { zh: "速率限制", en: "Rate Limits" },
  sidebarTickets: { zh: "工单", en: "Tickets" },

  // ======== Settings Page ========
  settingsTitle: { zh: "个人资料", en: "Profile" },
  settingsDesc: { zh: "管理你的账户和安全设置", en: "Manage your account and security preferences" },
  tabProfile: { zh: "资料", en: "Profile" },
  tabSecurity: { zh: "安全", en: "Security" },
  balance: { zh: "余额", en: "Balance" },
  memberSince: { zh: "注册时间", en: "Member since" },
  password: { zh: "密码", en: "Password" },
  pwEnabled: { zh: "已设置", en: "Enabled" },
  pwNotSet: { zh: "未设置", en: "Not set" },
  editProfile: { zh: "编辑资料", en: "Edit Profile" },
  email: { zh: "邮箱", en: "Email" },
  emailNoChange: { zh: "邮箱不可更改", en: "Email cannot be changed" },
  nickname: { zh: "昵称", en: "Nickname" },
  nicknameEmpty: { zh: "昵称不能为空", en: "Nickname cannot be empty" },
  profileUpdated: { zh: "资料已更新", en: "Profile updated" },
  updateFailed: { zh: "更新失败", en: "Update failed" },
  saving: { zh: "保存中...", en: "Saving..." },
  saveChanges: { zh: "保存修改", en: "Save changes" },
  changePassword: { zh: "修改密码", en: "Change Password" },
  setPassword: { zh: "设置密码", en: "Set Password" },
  changePwDesc: { zh: "输入当前密码和新密码。", en: "Enter your current password and a new password to update." },
  setPwDesc: { zh: "设置密码以启用邮箱+密码登录。", en: "Set a password to enable email + password login." },
  currentPassword: { zh: "当前密码", en: "Current Password" },
  newPassword: { zh: "新密码", en: "New Password" },
  confirmNewPassword: { zh: "确认新密码", en: "Confirm New Password" },
  pwMinLength: { zh: "新密码至少12个字符，建议使用16位以上长密码", en: "Use at least 12 characters; 16+ is recommended" },
  pwNoMatch: { zh: "两次密码不一致", en: "Passwords do not match" },
  pwChanged: { zh: "密码已修改", en: "Password changed" },
  pwSet: { zh: "密码已设置", en: "Password set" },
  enterCurrentPw: { zh: "请输入当前密码", en: "Please enter current password" },
  pwPlaceholder: { zh: "至少12个字符，或使用16位以上长密码", en: "12+ characters, or a 16+ character passphrase" },
  pwConfirmPlaceholder: { zh: "再次输入新密码", en: "Re-enter new password" },
  sessions: { zh: "会话", en: "Sessions" },
  sessionDesc: { zh: "会话令牌有效期为7天。", en: "Session tokens expire after 7 days." },
  currentSession: { zh: "当前会话", en: "Current Session" },
  activeNow: { zh: "活跃中", en: "Active now" },
  active: { zh: "活跃", en: "Active" },

  // ======== Billing / Credits Page ========
  creditsTitle: { zh: "账单", en: "Billing" },
  creditsDesc: { zh: "管理余额和查看交易记录", en: "Manage your balance and view transaction history" },
  topUp: { zh: "充值", en: "Top up" },
  availableBalance: { zh: "可用余额", en: "Available Balance" },
  totalRecharged: { zh: "累计充值", en: "Total Recharged" },
  totalSpent: { zh: "累计消费", en: "Total Spent" },
  apiCalls: { zh: "API 调用", en: "API Calls" },
  selectAmount: { zh: "选择金额", en: "Select Amount" },
  customAmount: { zh: "自定义金额 (¥)", en: "Custom Amount (¥)" },
  enterAmount: { zh: "输入金额", en: "Enter amount" },
  paymentMethod: { zh: "支付方式", en: "Payment Method" },
  testMode: { zh: "测试模式", en: "Test Mode" },
  testModeDesc: { zh: "即时到账，无需支付", en: "Instant, no payment" },
  alipayDesc: { zh: "扫码或跳转支付", en: "Scan QR or redirect" },
  processing: { zh: "处理中...", en: "Processing..." },
  waitingPayment: { zh: "等待支付...", en: "Waiting for payment..." },
  payConfirmed: { zh: "支付确认", en: "Payment confirmed" },
  topUpSuccess: { zh: "充值成功", en: "Top-up successful" },
  topUpFailed: { zh: "充值失败", en: "Top-up failed" },
  invalidAmount: { zh: "请输入有效金额", en: "Please enter a valid amount" },
  maxAmount: { zh: "单笔最多 ¥200,000", en: "Maximum ¥200,000 per transaction" },
  payPageOpened: { zh: "支付页面已打开，等待确认...", en: "Payment page opened. Waiting for confirmation..." },
  testModeNote: { zh: "测试模式 — 余额即时到账，无需实际支付。", en: "Test mode — credits are added instantly without actual payment." },
  transactions: { zh: "交易记录", en: "Transactions" },
  noTransactions: { zh: "暂无交易记录", en: "No transactions yet" },
  txType: { zh: "类型", en: "Type" },
  txDescription: { zh: "描述", en: "Description" },
  txAmount: { zh: "金额", en: "Amount" },
  txBalance: { zh: "余额", en: "Balance" },
  txTime: { zh: "时间", en: "Time" },
  txAccount: { zh: "发起账号", en: "Account" },
  txSelf: { zh: "本人", en: "You" },
  txTopUp: { zh: "充值", en: "Top-up" },
  txUsage: { zh: "消费", en: "Usage" },
  txRefund: { zh: "退款", en: "Refund" },

  // ======== Monitor Page ========
  perfTitle: { zh: "性能监控", en: "Performance" },
  perfDesc: { zh: "实时 API 性能 — TTFT、TPOT、延迟", en: "Real-time API performance — TTFT, TPOT, latency" },
  live: { zh: "实时", en: "Live" },
  paused: { zh: "暂停", en: "Paused" },
  loadingMetrics: { zh: "加载指标中...", en: "Loading metrics..." },
  avgTtft: { zh: "平均 TTFT", en: "Avg TTFT" },
  avgTpot: { zh: "平均 TPOT", en: "Avg TPOT" },
  avgLatency: { zh: "平均延迟", en: "Avg Latency" },
  endToEnd: { zh: "端到端", en: "End-to-end" },
  requests24h: { zh: "24h 请求", en: "Requests 24h" },
  errors: { zh: "错误", en: "Errors" },
  successRate: { zh: "成功率", en: "Success Rate" },
  last24h: { zh: "最近24小时", en: "Last 24 hours" },
  reqPerHour: { zh: "请求量/小时", en: "Requests / Hour" },
  ttftPerHour: { zh: "TTFT/小时", en: "TTFT / Hour" },
  noDataYet: { zh: "暂无数据", en: "No data yet" },
  perfByModel: { zh: "模型性能", en: "Performance by Model" },
  model: { zh: "模型", en: "Model" },
  requests: { zh: "请求", en: "Requests" },
  latency: { zh: "延迟", en: "Latency" },
  success: { zh: "成功", en: "Success" },
  recentRequests: { zh: "最近请求", en: "Recent Requests" },
  recentReqDesc: { zh: "最近 API 调用及性能明细", en: "Latest API calls with performance breakdown" },
  noRequests: { zh: "暂无请求", en: "No requests yet" },
  tokens: { zh: "Tokens", en: "Tokens" },

  // ======== Activity Page ========
  activityTitle: { zh: "使用统计", en: "Activity" },
  activityDesc: { zh: "API 调用量、费用和模型使用分布", en: "API call volume, cost breakdown, and model usage distribution" },
  failedLoad: { zh: "加载失败", en: "Failed to load data" },
  totalRequests: { zh: "总请求", en: "Total Requests" },
  totalTokens: { zh: "总 Token", en: "Total Tokens" },
  totalCost: { zh: "总费用", en: "Total Cost" },
  activeModels: { zh: "活跃模型", en: "Active Models" },
  dailyReq7d: { zh: "每日请求 (7天)", en: "Daily Requests (7 days)" },
  modelDist: { zh: "模型分布", en: "Model Distribution" },
  dailyCost: { zh: "每日费用", en: "Daily Cost Breakdown" },
  date: { zh: "日期", en: "Date" },
  cost: { zh: "费用", en: "Cost" },
  status: { zh: "状态", en: "Status" },

  // ======== Keys Page ========
  keysTitle: { zh: "API 密钥", en: "API Keys" },
  keysDesc: { zh: "管理你的 API 密钥，用于访问 Nexusflow 服务", en: "Manage your API keys for accessing Nexusflow services" },
  createKey: { zh: "创建密钥", en: "Create Key" },
  createNewKey: { zh: "创建新密钥", en: "Create New Key" },
  keyName: { zh: "密钥名称", en: "Key Name" },
  keyNamePlaceholder: { zh: "例如：生产环境密钥", en: "e.g., Production Key" },
  rateLimit: { zh: "速率限制 (次/分)", en: "Rate Limit (req/min)" },
  noKeys: { zh: "暂无 API 密钥", en: "No API keys yet" },
  createFirstKey: { zh: "创建第一个密钥", en: "Create your first key" },
  created: { zh: "创建于", en: "Created" },
  calls: { zh: "次调用", en: "calls" },
  deleteConfirm: { zh: "确定删除？此操作不可恢复。", en: "Are you sure? This action cannot be undone." },
  securityTip: { zh: "安全提示", en: "Security" },
  securityTipText: {
    zh: "API 密钥等同于访问权限，请勿在客户端代码、公共仓库或不安全的环境中暴露。建议为不同环境创建独立的密钥，并定期轮换。",
    en: "API keys grant access to your account. Never expose them in client-side code, public repos, or insecure environments. Create separate keys for different environments and rotate them regularly.",
  },
  copyKeyPrompt: { zh: "请手动复制以下密钥：", en: "Copy this key:" },

  // ======== Rate Limits Page ========
  rateLimitsTitle: { zh: "速率限制", en: "Rate Limits" },
  rateLimitsDesc: { zh: "查看你的 API 速率限制，提交工单申请提高限制", en: "View your API rate limits and submit tickets to request higher limits" },
  defaultLimits: { zh: "默认限制", en: "Default Limits" },
  customLimits: { zh: "自定义限制", en: "Custom Limits" },
  qpm: { zh: "QPM（请求/分钟）", en: "QPM (Requests/min)" },
  tpm: { zh: "TPM（Token/分钟）", en: "TPM (Tokens/min)" },
  modelSpecific: { zh: "模型", en: "Model" },
  noCustomLimits: { zh: "暂无自定义限制", en: "No custom limits" },
  allModelsLimits: { zh: "各模型限流", en: "Per-Model Limits" },
  allModelsLimitsDesc: { zh: "每个模型当前生效的 QPM / TPM 及其来源", en: "Effective QPM / TPM per model and its source" },
  searchModel: { zh: "搜索模型名称或 ID", en: "Search model name or ID" },
  colSource: { zh: "来源", en: "Source" },
  colAction: { zh: "操作", en: "Action" },
  sourceCustom: { zh: "自定义", en: "Custom" },
  sourceUserDefault: { zh: "账号默认", en: "Account Default" },
  sourceSystemDefault: { zh: "系统默认", en: "System Default" },
  applyIncrease: { zh: "申请扩容", en: "Request Increase" },
  noModelsMatch: { zh: "没有匹配的模型", en: "No matching models" },
  myModels: { zh: "我的可用模型", en: "My Available Models" },
  myModelsDesc: { zh: "由主账号授权，仅可调用以下模型", en: "Granted by the main account; only these models are callable" },
  allModelsGranted: { zh: "已授权全部模型", en: "All models granted" },
  noModelsGranted: { zh: "暂无授权模型，请联系主账号开通", en: "No models granted yet — contact your main account" },
  submitTicket: { zh: "提交工单", en: "Submit Ticket" },
  submitTicketDesc: { zh: "如需更高的速率限制，请提交工单申请", en: "Submit a ticket to request higher rate limits" },

  // ======== Tickets Page ========
  ticketsTitle: { zh: "工单", en: "Tickets" },
  ticketsDesc: { zh: "提交工单申请提高速率限制", en: "Submit tickets to request rate limit increases" },
  newTicket: { zh: "新建工单", en: "New Ticket" },
  ticketSubject: { zh: "工单标题", en: "Ticket Subject" },
  ticketSubjectPlaceholder: { zh: "简要描述你的需求", en: "Briefly describe your request" },
  ticketDesc: { zh: "详细描述", en: "Description" },
  ticketDescPlaceholder: { zh: "详细说明你需要更高的限制及原因", en: "Explain why you need higher limits and for which use case" },
  targetModel: { zh: "目标模型（可选）", en: "Target Model (optional)" },
  targetModelPlaceholder: { zh: "留空表示所有模型", en: "Leave blank for all models" },
  requestedQpm: { zh: "期望 QPM", en: "Requested QPM" },
  requestedTpm: { zh: "期望 TPM", en: "Requested TPM" },
  ticketStatus: { zh: "状态", en: "Status" },
  statusOpen: { zh: "待处理", en: "Open" },
  statusInProgress: { zh: "处理中", en: "In Progress" },
  statusResolved: { zh: "已解决", en: "Resolved" },
  statusRejected: { zh: "已拒绝", en: "Rejected" },
  adminReply: { zh: "管理员回复", en: "Admin Reply" },
  noTickets: { zh: "暂无工单", en: "No tickets yet" },
  createTicket: { zh: "创建工单", en: "Create Ticket" },
  ticketCreated: { zh: "工单已创建", en: "Ticket created" },
  ticketCreateFailed: { zh: "创建工单失败", en: "Failed to create ticket" },
  reply: { zh: "回复", en: "Reply" },

  // ======== Pricing Page ========
  pricingLabel: { zh: "定价", en: "Pricing" },
  pricingTitle: { zh: "模型定价", en: "Model Pricing" },
  pricingSubtitle: {
    zh: "按量计费，无最低消费。文本按百万 token 计费，视频按秒计费（Seedance 系列按火山 token 用量换算，仅成功生成才计费），图像按张计费。",
    en: "Pay as you go, no minimum spend. Text is billed per million tokens, video per second (Seedance series is converted from Volcengine token usage and billed only on successful generation), images per generation.",
  },
  pricePayg: { zh: "按量计费", en: "Pay as you go" },
  pricePaygDesc: { zh: "无需订阅", en: "No subscriptions required" },
  priceRealtime: { zh: "实时用量追踪", en: "Real-time tracking" },
  priceRealtimeDesc: { zh: "随时监控用量", en: "Monitor usage instantly" },
  priceNoLockin: { zh: "自由切换", en: "No lock-in" },
  priceNoLockinDesc: { zh: "随时更换模型", en: "Switch models freely" },
  allModels: { zh: "全部模型", en: "All Models" },
  thModel: { zh: "模型", en: "Model" },
  thCategory: { zh: "类别", en: "Category" },
  thPricing: { zh: "价格", en: "Pricing" },
  modelsCountSuffix: { zh: "个模型", en: "models" },
  freeLabel: { zh: "免费", en: "Free" },
  inputShort: { zh: "输入", en: "In" },
  outputShort: { zh: "输出", en: "Out" },
  ctaReady: { zh: "准备好开始了吗？", en: "Ready to start?" },
  ctaReadyDesc: { zh: "注册账号，几秒内获取 API 密钥。", en: "Create an account and get your API key in seconds." },
  getStartedFree: { zh: "免费开始", en: "Get Started Free" },
  readDocs: { zh: "查看文档", en: "Read the docs" },
  pricingNotesTitle: { zh: "计费说明：", en: "Pricing Notes:" },
} as const;

type TransKey = keyof typeof translations;

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TransKey) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "zh",
  setLocale: () => {},
  t: (key) => translations[key]?.zh || key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "zh";
    const saved = localStorage.getItem("locale") as Locale | null;
    return saved && ["zh", "en"].includes(saved) ? saved : "zh";
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
    document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const t = useCallback((key: TransKey): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[locale] || entry.en || key;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export const localeLabels: Record<Locale, string> = {
  zh: "中文",
  en: "EN",
};
