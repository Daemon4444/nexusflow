"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

export type Locale = "zh" | "en";

const translations = {
  // ======== Common ========
  loading: { zh: "Loading...", en: "Loading..." },
  online: { zh: "Online", en: "Online" },
  logOut: { zh: "Log out", en: "Log out" },
  logIn: { zh: "Log in", en: "Log in" },
  signUp: { zh: "Sign up", en: "Sign up" },
  save: { zh: "Save", en: "Save" },
  cancel: { zh: "Cancel", en: "Cancel" },
  create: { zh: "Create", en: "Create" },
  delete: { zh: "Delete", en: "Delete" },
  copy: { zh: "Copy", en: "Copy" },
  copied: { zh: "Copied", en: "Copied" },
  previous: { zh: "Previous", en: "Previous" },
  next: { zh: "Next", en: "Next" },
  refresh: { zh: "Refresh", en: "Refresh" },
  noData: { zh: "No data", en: "No data" },
  networkError: { zh: "Network error", en: "Network error" },
  records: { zh: "records", en: "records" },

  // ======== Onboarding ========
  onboardingWelcome: { zh: "Welcome to NexusFlow", en: "Welcome to NexusFlow" },
  onboardingDesc: { zh: "Unified AI model aggregation platform for 40+ models", en: "Unified AI model aggregation platform for 40+ models" },
  onboardingGetKey: { zh: "Get your API Key", en: "Get your API Key" },
  onboardingSelectModel: { zh: "Select a model", en: "Select a model" },
  onboardingStartTest: { zh: "Make your first call", en: "Make your first call" },
  quickTest: { zh: "Quick Test", en: "Quick Test" },

  // ======== Header Nav ========
  navModels: { zh: "Models", en: "Models" },
  navPlayground: { zh: "Playground", en: "Playground" },
  navDocs: { zh: "Docs", en: "Docs" },
  navPricing: { zh: "Pricing", en: "Pricing" },
  navKeys: { zh: "Keys", en: "Keys" },
  navBilling: { zh: "Billing", en: "Billing" },
  navMonitor: { zh: "Monitor", en: "Monitor" },
  navActivity: { zh: "Activity", en: "Activity" },
  navSettings: { zh: "Settings", en: "Settings" },

  // ======== Sidebar ========
  sidebarTitle: { zh: "Console", en: "Console" },
  sidebarAccount: { zh: "Account", en: "Account" },
  sidebarAnalytics: { zh: "Analytics", en: "Analytics" },
  sidebarProfile: { zh: "Profile", en: "Profile" },
  sidebarApiKeys: { zh: "API Keys", en: "API Keys" },
  sidebarCredits: { zh: "Credits", en: "Credits" },
  sidebarActivity: { zh: "Activity", en: "Activity" },
  sidebarPerformance: { zh: "Performance", en: "Performance" },
  sidebarRateLimits: { zh: "Rate Limits", en: "Rate Limits" },
  sidebarTickets: { zh: "Tickets", en: "Tickets" },

  // ======== Settings Page ========
  settingsTitle: { zh: "Profile", en: "Profile" },
  settingsDesc: { zh: "Manage your account and security preferences", en: "Manage your account and security preferences" },
  tabProfile: { zh: "Profile", en: "Profile" },
  tabSecurity: { zh: "Security", en: "Security" },
  balance: { zh: "Balance", en: "Balance" },
  memberSince: { zh: "Member since", en: "Member since" },
  password: { zh: "Password", en: "Password" },
  pwEnabled: { zh: "Enabled", en: "Enabled" },
  pwNotSet: { zh: "Not set", en: "Not set" },
  editProfile: { zh: "Edit Profile", en: "Edit Profile" },
  email: { zh: "Email", en: "Email" },
  emailNoChange: { zh: "Email cannot be changed", en: "Email cannot be changed" },
  nickname: { zh: "Nickname", en: "Nickname" },
  nicknameEmpty: { zh: "Nickname cannot be empty", en: "Nickname cannot be empty" },
  profileUpdated: { zh: "Profile updated", en: "Profile updated" },
  updateFailed: { zh: "Update failed", en: "Update failed" },
  saving: { zh: "Saving...", en: "Saving..." },
  saveChanges: { zh: "Save changes", en: "Save changes" },
  changePassword: { zh: "Change Password", en: "Change Password" },
  setPassword: { zh: "Set Password", en: "Set Password" },
  changePwDesc: { zh: "Enter your current password and a new password to update.", en: "Enter your current password and a new password to update." },
  setPwDesc: { zh: "Set a password to enable email + password login.", en: "Set a password to enable email + password login." },
  currentPassword: { zh: "Current Password", en: "Current Password" },
  newPassword: { zh: "New Password", en: "New Password" },
  confirmNewPassword: { zh: "Confirm New Password", en: "Confirm New Password" },
  pwMinLength: { zh: "New password must be at least 6 characters", en: "New password must be at least 6 characters" },
  pwNoMatch: { zh: "Passwords do not match", en: "Passwords do not match" },
  pwChanged: { zh: "Password changed", en: "Password changed" },
  pwSet: { zh: "Password set", en: "Password set" },
  enterCurrentPw: { zh: "Please enter current password", en: "Please enter current password" },
  pwPlaceholder: { zh: "At least 6 characters", en: "At least 6 characters" },
  pwConfirmPlaceholder: { zh: "Re-enter new password", en: "Re-enter new password" },
  sessions: { zh: "Sessions", en: "Sessions" },
  sessionDesc: { zh: "Session tokens expire after 7 days.", en: "Session tokens expire after 7 days." },
  currentSession: { zh: "Current Session", en: "Current Session" },
  activeNow: { zh: "Active now", en: "Active now" },
  active: { zh: "Active", en: "Active" },

  // ======== Billing / Credits Page ========
  creditsTitle: { zh: "Credits", en: "Credits" },
  creditsDesc: { zh: "Manage your balance and view transaction history", en: "Manage your balance and view transaction history" },
  topUp: { zh: "Top up", en: "Top up" },
  availableBalance: { zh: "Available Balance", en: "Available Balance" },
  totalRecharged: { zh: "Total Recharged", en: "Total Recharged" },
  totalSpent: { zh: "Total Spent", en: "Total Spent" },
  apiCalls: { zh: "API Calls", en: "API Calls" },
  selectAmount: { zh: "Select Amount", en: "Select Amount" },
  customAmount: { zh: "Custom Amount (¥)", en: "Custom Amount (¥)" },
  enterAmount: { zh: "Enter amount", en: "Enter amount" },
  paymentMethod: { zh: "Payment Method", en: "Payment Method" },
  testMode: { zh: "Test Mode", en: "Test Mode" },
  testModeDesc: { zh: "Instant, no payment", en: "Instant, no payment" },
  alipayDesc: { zh: "Scan QR or redirect", en: "Scan QR or redirect" },
  processing: { zh: "Processing...", en: "Processing..." },
  waitingPayment: { zh: "Waiting for payment...", en: "Waiting for payment..." },
  payConfirmed: { zh: "Payment confirmed", en: "Payment confirmed" },
  topUpSuccess: { zh: "Top-up successful", en: "Top-up successful" },
  topUpFailed: { zh: "Top-up failed", en: "Top-up failed" },
  invalidAmount: { zh: "Please enter a valid amount", en: "Please enter a valid amount" },
  maxAmount: { zh: "Maximum ¥10,000 per transaction", en: "Maximum ¥10,000 per transaction" },
  payPageOpened: { zh: "Payment page opened. Waiting for confirmation...", en: "Payment page opened. Waiting for confirmation..." },
  testModeNote: { zh: "Test mode — credits are added instantly without actual payment.", en: "Test mode — credits are added instantly without actual payment." },
  transactions: { zh: "Transactions", en: "Transactions" },
  noTransactions: { zh: "No transactions yet", en: "No transactions yet" },
  txType: { zh: "Type", en: "Type" },
  txDescription: { zh: "Description", en: "Description" },
  txAmount: { zh: "Amount", en: "Amount" },
  txBalance: { zh: "Balance", en: "Balance" },
  txTime: { zh: "Time", en: "Time" },
  txTopUp: { zh: "Top-up", en: "Top-up" },
  txUsage: { zh: "Usage", en: "Usage" },
  txRefund: { zh: "Refund", en: "Refund" },

  // ======== Monitor Page ========
  perfTitle: { zh: "Performance", en: "Performance" },
  perfDesc: { zh: "Real-time API performance — TTFT, TPOT, latency", en: "Real-time API performance — TTFT, TPOT, latency" },
  live: { zh: "Live", en: "Live" },
  paused: { zh: "Paused", en: "Paused" },
  loadingMetrics: { zh: "Loading metrics...", en: "Loading metrics..." },
  avgTtft: { zh: "Avg TTFT", en: "Avg TTFT" },
  avgTpot: { zh: "Avg TPOT", en: "Avg TPOT" },
  avgLatency: { zh: "Avg Latency", en: "Avg Latency" },
  endToEnd: { zh: "End-to-end", en: "End-to-end" },
  requests24h: { zh: "Requests 24h", en: "Requests 24h" },
  errors: { zh: "Errors", en: "Errors" },
  successRate: { zh: "Success Rate", en: "Success Rate" },
  last24h: { zh: "Last 24 hours", en: "Last 24 hours" },
  reqPerHour: { zh: "Requests / Hour", en: "Requests / Hour" },
  ttftPerHour: { zh: "TTFT / Hour", en: "TTFT / Hour" },
  noDataYet: { zh: "No data yet", en: "No data yet" },
  perfByModel: { zh: "Performance by Model", en: "Performance by Model" },
  model: { zh: "Model", en: "Model" },
  requests: { zh: "Requests", en: "Requests" },
  latency: { zh: "Latency", en: "Latency" },
  success: { zh: "Success", en: "Success" },
  recentRequests: { zh: "Recent Requests", en: "Recent Requests" },
  recentReqDesc: { zh: "Latest API calls with performance breakdown", en: "Latest API calls with performance breakdown" },
  noRequests: { zh: "No requests yet", en: "No requests yet" },
  tokens: { zh: "Tokens", en: "Tokens" },

  // ======== Activity Page ========
  activityTitle: { zh: "Activity", en: "Activity" },
  activityDesc: { zh: "API call volume, cost breakdown, and model usage distribution", en: "API call volume, cost breakdown, and model usage distribution" },
  failedLoad: { zh: "Failed to load data", en: "Failed to load data" },
  totalRequests: { zh: "Total Requests", en: "Total Requests" },
  totalTokens: { zh: "Total Tokens", en: "Total Tokens" },
  totalCost: { zh: "Total Cost", en: "Total Cost" },
  activeModels: { zh: "Active Models", en: "Active Models" },
  dailyReq7d: { zh: "Daily Requests (7 days)", en: "Daily Requests (7 days)" },
  modelDist: { zh: "Model Distribution", en: "Model Distribution" },
  dailyCost: { zh: "Daily Cost Breakdown", en: "Daily Cost Breakdown" },
  date: { zh: "Date", en: "Date" },
  cost: { zh: "Cost", en: "Cost" },
  status: { zh: "Status", en: "Status" },

  // ======== Keys Page ========
  keysTitle: { zh: "API Keys", en: "API Keys" },
  keysDesc: { zh: "Manage your API keys for accessing Nexusflow services", en: "Manage your API keys for accessing Nexusflow services" },
  createKey: { zh: "Create Key", en: "Create Key" },
  createNewKey: { zh: "Create New Key", en: "Create New Key" },
  keyName: { zh: "Key Name", en: "Key Name" },
  keyNamePlaceholder: { zh: "e.g., Production Key", en: "e.g., Production Key" },
  rateLimit: { zh: "Rate Limit (req/min)", en: "Rate Limit (req/min)" },
  noKeys: { zh: "No API keys yet", en: "No API keys yet" },
  createFirstKey: { zh: "Create your first key", en: "Create your first key" },
  created: { zh: "Created", en: "Created" },
  calls: { zh: "calls", en: "calls" },
  deleteConfirm: { zh: "Are you sure? This action cannot be undone.", en: "Are you sure? This action cannot be undone." },
  securityTip: { zh: "Security", en: "Security" },
  securityTipText: {
    zh: "API keys grant access to your account. Never expose them in client-side code, public repos, or insecure environments. Create separate keys for different environments and rotate them regularly.",
    en: "API keys grant access to your account. Never expose them in client-side code, public repos, or insecure environments. Create separate keys for different environments and rotate them regularly.",
  },
  copyKeyPrompt: { zh: "Copy this key:", en: "Copy this key:" },

  // ======== Rate Limits Page ========
  rateLimitsTitle: { zh: "Rate Limits", en: "Rate Limits" },
  rateLimitsDesc: { zh: "View your API rate limits and submit tickets to request higher limits", en: "View your API rate limits and submit tickets to request higher limits" },
  defaultLimits: { zh: "Default Limits", en: "Default Limits" },
  customLimits: { zh: "Custom Limits", en: "Custom Limits" },
  qpm: { zh: "QPM (Requests/min)", en: "QPM (Requests/min)" },
  tpm: { zh: "TPM (Tokens/min)", en: "TPM (Tokens/min)" },
  modelSpecific: { zh: "Model", en: "Model" },
  noCustomLimits: { zh: "No custom limits", en: "No custom limits" },
  submitTicket: { zh: "Submit Ticket", en: "Submit Ticket" },
  submitTicketDesc: { zh: "Submit a ticket to request higher rate limits", en: "Submit a ticket to request higher rate limits" },

  // ======== Tickets Page ========
  ticketsTitle: { zh: "Tickets", en: "Tickets" },
  ticketsDesc: { zh: "Submit tickets to request rate limit increases", en: "Submit tickets to request rate limit increases" },
  newTicket: { zh: "New Ticket", en: "New Ticket" },
  ticketSubject: { zh: "Ticket Subject", en: "Ticket Subject" },
  ticketSubjectPlaceholder: { zh: "Briefly describe your request", en: "Briefly describe your request" },
  ticketDesc: { zh: "Description", en: "Description" },
  ticketDescPlaceholder: { zh: "Explain why you need higher limits and for which use case", en: "Explain why you need higher limits and for which use case" },
  targetModel: { zh: "Target Model (optional)", en: "Target Model (optional)" },
  targetModelPlaceholder: { zh: "Leave blank for all models", en: "Leave blank for all models" },
  requestedQpm: { zh: "Requested QPM", en: "Requested QPM" },
  requestedTpm: { zh: "Requested TPM", en: "Requested TPM" },
  ticketStatus: { zh: "Status", en: "Status" },
  statusOpen: { zh: "Open", en: "Open" },
  statusInProgress: { zh: "In Progress", en: "In Progress" },
  statusResolved: { zh: "Resolved", en: "Resolved" },
  statusRejected: { zh: "Rejected", en: "Rejected" },
  adminReply: { zh: "Admin Reply", en: "Admin Reply" },
  noTickets: { zh: "No tickets yet", en: "No tickets yet" },
  createTicket: { zh: "Create Ticket", en: "Create Ticket" },
  ticketCreated: { zh: "Ticket created", en: "Ticket created" },
  ticketCreateFailed: { zh: "Failed to create ticket", en: "Failed to create ticket" },
  reply: { zh: "Reply", en: "Reply" },
} as const;

type TransKey = keyof typeof translations;

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TransKey) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key) => translations[key]?.en || key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "en";
    const saved = localStorage.getItem("locale") as Locale | null;
    return saved && ["zh", "en"].includes(saved) ? saved : "en";
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
  zh: "CN",
  en: "EN",
};
