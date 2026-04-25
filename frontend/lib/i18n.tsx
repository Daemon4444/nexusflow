"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

export type Locale = "zh" | "en" | "ja";

const translations = {
  // ======== Common ========
  loading: { zh: "加载中...", en: "Loading...", ja: "読み込み中..." },
  online: { zh: "在线", en: "Online", ja: "オンライン" },
  logOut: { zh: "退出", en: "Log out", ja: "ログアウト" },
  logIn: { zh: "登录", en: "Log in", ja: "ログイン" },
  signUp: { zh: "注册", en: "Sign up", ja: "新規登録" },
  save: { zh: "保存", en: "Save", ja: "保存" },
  cancel: { zh: "取消", en: "Cancel", ja: "キャンセル" },
  create: { zh: "创建", en: "Create", ja: "作成" },
  delete: { zh: "删除", en: "Delete", ja: "削除" },
  copy: { zh: "复制", en: "Copy", ja: "コピー" },
  copied: { zh: "已复制", en: "Copied", ja: "コピー済" },
  previous: { zh: "上一页", en: "Previous", ja: "前へ" },
  next: { zh: "下一页", en: "Next", ja: "次へ" },
  refresh: { zh: "刷新", en: "Refresh", ja: "更新" },
  noData: { zh: "暂无数据", en: "No data", ja: "データなし" },
  networkError: { zh: "网络错误", en: "Network error", ja: "ネットワークエラー" },
  records: { zh: "条记录", en: "records", ja: "件" },

  // ======== Header Nav ========
  navModels: { zh: "模型", en: "Models", ja: "モデル" },
  navPlayground: { zh: "体验", en: "Playground", ja: "プレイグラウンド" },
  navDocs: { zh: "文档", en: "Docs", ja: "ドキュメント" },
  navPricing: { zh: "定价", en: "Pricing", ja: "料金" },
  navKeys: { zh: "密钥", en: "Keys", ja: "キー" },
  navBilling: { zh: "账单", en: "Billing", ja: "請求" },
  navMonitor: { zh: "监控", en: "Monitor", ja: "監視" },
  navActivity: { zh: "统计", en: "Activity", ja: "アクティビティ" },
  navSettings: { zh: "设置", en: "Settings", ja: "設定" },

  // ======== Sidebar ========
  sidebarTitle: { zh: "设置", en: "Settings", ja: "設定" },
  sidebarAccount: { zh: "账户", en: "Account", ja: "アカウント" },
  sidebarAnalytics: { zh: "分析", en: "Analytics", ja: "分析" },
  sidebarProfile: { zh: "个人资料", en: "Profile", ja: "プロフィール" },
  sidebarApiKeys: { zh: "API 密钥", en: "API Keys", ja: "APIキー" },
  sidebarCredits: { zh: "余额", en: "Credits", ja: "クレジット" },
  sidebarActivity: { zh: "使用统计", en: "Activity", ja: "アクティビティ" },
  sidebarPerformance: { zh: "性能监控", en: "Performance", ja: "パフォーマンス" },
  sidebarRateLimits: { zh: "速率限制", en: "Rate Limits", ja: "レート制限" },
  sidebarTickets: { zh: "工单", en: "Tickets", ja: "チケット" },

  // ======== Settings Page ========
  settingsTitle: { zh: "个人资料", en: "Profile", ja: "プロフィール" },
  settingsDesc: { zh: "管理你的账户和安全设置", en: "Manage your account and security preferences", ja: "アカウントとセキュリティ設定を管理" },
  tabProfile: { zh: "资料", en: "Profile", ja: "プロフィール" },
  tabSecurity: { zh: "安全", en: "Security", ja: "セキュリティ" },
  balance: { zh: "余额", en: "Balance", ja: "残高" },
  memberSince: { zh: "注册时间", en: "Member since", ja: "登録日" },
  password: { zh: "密码", en: "Password", ja: "パスワード" },
  pwEnabled: { zh: "已设置", en: "Enabled", ja: "設定済" },
  pwNotSet: { zh: "未设置", en: "Not set", ja: "未設定" },
  editProfile: { zh: "编辑资料", en: "Edit Profile", ja: "プロフィール編集" },
  email: { zh: "邮箱", en: "Email", ja: "メール" },
  emailNoChange: { zh: "邮箱不可更改", en: "Email cannot be changed", ja: "メールアドレスは変更できません" },
  nickname: { zh: "昵称", en: "Nickname", ja: "ニックネーム" },
  nicknameEmpty: { zh: "昵称不能为空", en: "Nickname cannot be empty", ja: "ニックネームは必須です" },
  profileUpdated: { zh: "资料已更新", en: "Profile updated", ja: "プロフィールを更新しました" },
  updateFailed: { zh: "更新失败", en: "Update failed", ja: "更新に失敗しました" },
  saving: { zh: "保存中...", en: "Saving...", ja: "保存中..." },
  saveChanges: { zh: "保存修改", en: "Save changes", ja: "変更を保存" },
  changePassword: { zh: "修改密码", en: "Change Password", ja: "パスワード変更" },
  setPassword: { zh: "设置密码", en: "Set Password", ja: "パスワード設定" },
  changePwDesc: { zh: "输入当前密码和新密码。", en: "Enter your current password and a new password to update.", ja: "現在のパスワードと新しいパスワードを入力してください。" },
  setPwDesc: { zh: "设置密码以启用邮箱+密码登录。", en: "Set a password to enable email + password login.", ja: "メール+パスワードでのログインを有効にするためパスワードを設定してください。" },
  currentPassword: { zh: "当前密码", en: "Current Password", ja: "現在のパスワード" },
  newPassword: { zh: "新密码", en: "New Password", ja: "新しいパスワード" },
  confirmNewPassword: { zh: "确认新密码", en: "Confirm New Password", ja: "新しいパスワード（確認）" },
  pwMinLength: { zh: "新密码至少6个字符", en: "New password must be at least 6 characters", ja: "パスワードは6文字以上必要です" },
  pwNoMatch: { zh: "两次密码不一致", en: "Passwords do not match", ja: "パスワードが一致しません" },
  pwChanged: { zh: "密码已修改", en: "Password changed", ja: "パスワードを変更しました" },
  pwSet: { zh: "密码已设置", en: "Password set", ja: "パスワードを設定しました" },
  enterCurrentPw: { zh: "请输入当前密码", en: "Please enter current password", ja: "現在のパスワードを入力してください" },
  pwPlaceholder: { zh: "至少6个字符", en: "At least 6 characters", ja: "6文字以上" },
  pwConfirmPlaceholder: { zh: "再次输入新密码", en: "Re-enter new password", ja: "新しいパスワードを再入力" },
  sessions: { zh: "会话", en: "Sessions", ja: "セッション" },
  sessionDesc: { zh: "会话令牌有效期为7天。", en: "Session tokens expire after 7 days.", ja: "セッショントークンは7日後に期限切れになります。" },
  currentSession: { zh: "当前会话", en: "Current Session", ja: "現在のセッション" },
  activeNow: { zh: "活跃中", en: "Active now", ja: "アクティブ" },
  active: { zh: "活跃", en: "Active", ja: "アクティブ" },

  // ======== Billing / Credits Page ========
  creditsTitle: { zh: "余额", en: "Credits", ja: "クレジット" },
  creditsDesc: { zh: "管理余额和查看交易记录", en: "Manage your balance and view transaction history", ja: "残高管理と取引履歴の確認" },
  topUp: { zh: "充值", en: "Top up", ja: "チャージ" },
  availableBalance: { zh: "可用余额", en: "Available Balance", ja: "利用可能残高" },
  totalRecharged: { zh: "累计充值", en: "Total Recharged", ja: "累計チャージ" },
  totalSpent: { zh: "累计消费", en: "Total Spent", ja: "累計消費" },
  apiCalls: { zh: "API 调用", en: "API Calls", ja: "API呼び出し" },
  selectAmount: { zh: "选择金额", en: "Select Amount", ja: "金額を選択" },
  customAmount: { zh: "自定义金额 (¥)", en: "Custom Amount (¥)", ja: "カスタム金額 (¥)" },
  enterAmount: { zh: "输入金额", en: "Enter amount", ja: "金額を入力" },
  paymentMethod: { zh: "支付方式", en: "Payment Method", ja: "支払い方法" },
  testMode: { zh: "测试模式", en: "Test Mode", ja: "テストモード" },
  testModeDesc: { zh: "即时到账，无需支付", en: "Instant, no payment", ja: "即時、支払い不要" },
  alipayDesc: { zh: "扫码或跳转支付", en: "Scan QR or redirect", ja: "QRスキャンまたはリダイレクト" },
  processing: { zh: "处理中...", en: "Processing...", ja: "処理中..." },
  waitingPayment: { zh: "等待支付...", en: "Waiting for payment...", ja: "支払い待ち..." },
  payConfirmed: { zh: "支付确认", en: "Payment confirmed", ja: "支払い確認済" },
  topUpSuccess: { zh: "充值成功", en: "Top-up successful", ja: "チャージ成功" },
  topUpFailed: { zh: "充值失败", en: "Top-up failed", ja: "チャージ失敗" },
  invalidAmount: { zh: "请输入有效金额", en: "Please enter a valid amount", ja: "有効な金額を入力してください" },
  maxAmount: { zh: "单笔最多 ¥10,000", en: "Maximum ¥10,000 per transaction", ja: "1回あたり最大¥10,000" },
  payPageOpened: { zh: "支付页面已打开，等待确认...", en: "Payment page opened. Waiting for confirmation...", ja: "支払いページが開きました。確認待ち..." },
  testModeNote: { zh: "测试模式 — 余额即时到账，无需实际支付。", en: "Test mode — credits are added instantly without actual payment.", ja: "テストモード — 実際の支払いなしで即時チャージされます。" },
  transactions: { zh: "交易记录", en: "Transactions", ja: "取引履歴" },
  noTransactions: { zh: "暂无交易记录", en: "No transactions yet", ja: "取引履歴はまだありません" },
  txType: { zh: "类型", en: "Type", ja: "種類" },
  txDescription: { zh: "描述", en: "Description", ja: "説明" },
  txAmount: { zh: "金额", en: "Amount", ja: "金額" },
  txBalance: { zh: "余额", en: "Balance", ja: "残高" },
  txTime: { zh: "时间", en: "Time", ja: "時間" },
  txTopUp: { zh: "充值", en: "Top-up", ja: "チャージ" },
  txUsage: { zh: "消费", en: "Usage", ja: "利用" },
  txRefund: { zh: "退款", en: "Refund", ja: "返金" },

  // ======== Monitor Page ========
  perfTitle: { zh: "性能监控", en: "Performance", ja: "パフォーマンス" },
  perfDesc: { zh: "实时 API 性能 — TTFT、TPOT、延迟", en: "Real-time API performance — TTFT, TPOT, latency", ja: "リアルタイムAPIパフォーマンス — TTFT、TPOT、レイテンシ" },
  live: { zh: "实时", en: "Live", ja: "ライブ" },
  paused: { zh: "暂停", en: "Paused", ja: "一時停止" },
  loadingMetrics: { zh: "加载指标中...", en: "Loading metrics...", ja: "メトリクス読み込み中..." },
  avgTtft: { zh: "平均 TTFT", en: "Avg TTFT", ja: "平均TTFT" },
  avgTpot: { zh: "平均 TPOT", en: "Avg TPOT", ja: "平均TPOT" },
  avgLatency: { zh: "平均延迟", en: "Avg Latency", ja: "平均レイテンシ" },
  endToEnd: { zh: "端到端", en: "End-to-end", ja: "エンドツーエンド" },
  requests24h: { zh: "24h 请求", en: "Requests 24h", ja: "24h リクエスト" },
  errors: { zh: "错误", en: "Errors", ja: "エラー" },
  successRate: { zh: "成功率", en: "Success Rate", ja: "成功率" },
  last24h: { zh: "最近24小时", en: "Last 24 hours", ja: "過去24時間" },
  reqPerHour: { zh: "请求量/小时", en: "Requests / Hour", ja: "リクエスト/時間" },
  ttftPerHour: { zh: "TTFT/小时", en: "TTFT / Hour", ja: "TTFT/時間" },
  noDataYet: { zh: "暂无数据", en: "No data yet", ja: "データなし" },
  perfByModel: { zh: "模型性能", en: "Performance by Model", ja: "モデル別パフォーマンス" },
  model: { zh: "模型", en: "Model", ja: "モデル" },
  requests: { zh: "请求", en: "Requests", ja: "リクエスト" },
  latency: { zh: "延迟", en: "Latency", ja: "レイテンシ" },
  success: { zh: "成功", en: "Success", ja: "成功" },
  recentRequests: { zh: "最近请求", en: "Recent Requests", ja: "最近のリクエスト" },
  recentReqDesc: { zh: "最近 API 调用及性能明细", en: "Latest API calls with performance breakdown", ja: "最新のAPI呼び出しとパフォーマンス詳細" },
  noRequests: { zh: "暂无请求", en: "No requests yet", ja: "リクエストなし" },
  tokens: { zh: "Tokens", en: "Tokens", ja: "トークン" },

  // ======== Activity Page ========
  activityTitle: { zh: "使用统计", en: "Activity", ja: "アクティビティ" },
  activityDesc: { zh: "API 调用量、费用和模型使用分布", en: "API call volume, cost breakdown, and model usage distribution", ja: "API呼び出し量、コスト内訳、モデル使用分布" },
  failedLoad: { zh: "加载失败", en: "Failed to load data", ja: "データの読み込みに失敗しました" },
  totalRequests: { zh: "总请求", en: "Total Requests", ja: "総リクエスト" },
  totalTokens: { zh: "总 Token", en: "Total Tokens", ja: "総トークン" },
  totalCost: { zh: "总费用", en: "Total Cost", ja: "総コスト" },
  activeModels: { zh: "活跃模型", en: "Active Models", ja: "アクティブモデル" },
  dailyReq7d: { zh: "每日请求 (7天)", en: "Daily Requests (7 days)", ja: "日別リクエスト（7日間）" },
  modelDist: { zh: "模型分布", en: "Model Distribution", ja: "モデル分布" },
  dailyCost: { zh: "每日费用", en: "Daily Cost Breakdown", ja: "日別コスト" },
  date: { zh: "日期", en: "Date", ja: "日付" },
  cost: { zh: "费用", en: "Cost", ja: "コスト" },
  status: { zh: "状态", en: "Status", ja: "ステータス" },

  // ======== Keys Page ========
  keysTitle: { zh: "API 密钥", en: "API Keys", ja: "APIキー" },
  keysDesc: { zh: "管理你的 API 密钥，用于访问 Nexusflow 服务", en: "Manage your API keys for accessing Nexusflow services", ja: "NexusflowサービスにアクセスするためのAPIキーを管理" },
  createKey: { zh: "创建密钥", en: "Create Key", ja: "キーを作成" },
  createNewKey: { zh: "创建新密钥", en: "Create New Key", ja: "新しいキーを作成" },
  keyName: { zh: "密钥名称", en: "Key Name", ja: "キー名" },
  keyNamePlaceholder: { zh: "例如：生产环境密钥", en: "e.g., Production Key", ja: "例: 本番キー" },
  rateLimit: { zh: "速率限制 (次/分)", en: "Rate Limit (req/min)", ja: "レート制限（回/分）" },
  noKeys: { zh: "暂无 API 密钥", en: "No API keys yet", ja: "APIキーがありません" },
  createFirstKey: { zh: "创建第一个密钥", en: "Create your first key", ja: "最初のキーを作成" },
  created: { zh: "创建于", en: "Created", ja: "作成日" },
  calls: { zh: "次调用", en: "calls", ja: "回呼出" },
  deleteConfirm: { zh: "确定删除？此操作不可恢复。", en: "Are you sure? This action cannot be undone.", ja: "本当に削除しますか？この操作は取り消せません。" },
  securityTip: { zh: "安全提示", en: "Security", ja: "セキュリティ" },
  securityTipText: {
    zh: "API 密钥等同于访问权限，请勿在客户端代码、公共仓库或不安全的环境中暴露。建议为不同环境创建独立的密钥，并定期轮换。",
    en: "API keys grant access to your account. Never expose them in client-side code, public repos, or insecure environments. Create separate keys for different environments and rotate them regularly.",
    ja: "APIキーはアカウントへのアクセスを許可します。クライアントコード、公開リポジトリ、安全でない環境に公開しないでください。環境ごとに個別のキーを作成し、定期的にローテーションしてください。",
  },
  copyKeyPrompt: { zh: "请手动复制以下密钥：", en: "Copy this key:", ja: "このキーをコピーしてください：" },

  // ======== Rate Limits Page ========
  rateLimitsTitle: { zh: "速率限制", en: "Rate Limits", ja: "レート制限" },
  rateLimitsDesc: { zh: "查看你的 API 速率限制，提交工单申请提高限制", en: "View your API rate limits and submit tickets to request higher limits", ja: "APIレート制限を表示し、制限緩和のチケットを提出" },
  defaultLimits: { zh: "默认限制", en: "Default Limits", ja: "デフォルト制限" },
  customLimits: { zh: "自定义限制", en: "Custom Limits", ja: "カスタム制限" },
  qpm: { zh: "QPM（请求/分钟）", en: "QPM (Requests/min)", ja: "QPM（リクエスト/分）" },
  tpm: { zh: "TPM（Token/分钟）", en: "TPM (Tokens/min)", ja: "TPM（トークン/分）" },
  modelSpecific: { zh: "模型", en: "Model", ja: "モデル" },
  noCustomLimits: { zh: "暂无自定义限制", en: "No custom limits", ja: "カスタム制限なし" },
  submitTicket: { zh: "提交工单", en: "Submit Ticket", ja: "チケット提出" },
  submitTicketDesc: { zh: "如需更高的速率限制，请提交工单申请", en: "Submit a ticket to request higher rate limits", ja: "レート制限の緩和にはチケットを提出してください" },

  // ======== Tickets Page ========
  ticketsTitle: { zh: "工单", en: "Tickets", ja: "チケット" },
  ticketsDesc: { zh: "提交工单申请提高速率限制", en: "Submit tickets to request rate limit increases", ja: "レート制限緩和のチケットを提出" },
  newTicket: { zh: "新建工单", en: "New Ticket", ja: "新しいチケット" },
  ticketSubject: { zh: "工单标题", en: "Ticket Subject", ja: "チケット件名" },
  ticketSubjectPlaceholder: { zh: "简要描述你的需求", en: "Briefly describe your request", ja: "リクエストの概要を説明" },
  ticketDesc: { zh: "详细描述", en: "Description", ja: "詳細説明" },
  ticketDescPlaceholder: { zh: "详细说明你需要更高的限制及原因", en: "Explain why you need higher limits and for which use case", ja: "より高い制限が必要な理由と用途を説明" },
  targetModel: { zh: "目标模型（可选）", en: "Target Model (optional)", ja: "対象モデル（任意）" },
  targetModelPlaceholder: { zh: "留空表示所有模型", en: "Leave blank for all models", ja: "全モデルに適用する場合は空白" },
  requestedQpm: { zh: "期望 QPM", en: "Requested QPM", ja: "希望 QPM" },
  requestedTpm: { zh: "期望 TPM", en: "Requested TPM", ja: "希望 TPM" },
  ticketStatus: { zh: "状态", en: "Status", ja: "ステータス" },
  statusOpen: { zh: "待处理", en: "Open", ja: "未対応" },
  statusInProgress: { zh: "处理中", en: "In Progress", ja: "対応中" },
  statusResolved: { zh: "已解决", en: "Resolved", ja: "解決済" },
  statusRejected: { zh: "已拒绝", en: "Rejected", ja: "拒否" },
  adminReply: { zh: "管理员回复", en: "Admin Reply", ja: "管理者からの返信" },
  noTickets: { zh: "暂无工单", en: "No tickets yet", ja: "チケットなし" },
  createTicket: { zh: "创建工单", en: "Create Ticket", ja: "チケットを作成" },
  ticketCreated: { zh: "工单已创建", en: "Ticket created", ja: "チケットを作成しました" },
  ticketCreateFailed: { zh: "创建工单失败", en: "Failed to create ticket", ja: "チケットの作成に失敗しました" },
  reply: { zh: "回复", en: "Reply", ja: "返信" },
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
  const [locale, setLocaleState] = useState<Locale>("zh");

  useEffect(() => {
    const saved = localStorage.getItem("locale") as Locale | null;
    if (saved && ["zh", "en", "ja"].includes(saved)) {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
    document.documentElement.lang = l === "zh" ? "zh-CN" : l === "ja" ? "ja" : "en";
  }, []);

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
  ja: "日本語",
};
