"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import { NexusflowLogo } from "@/components/QuadrantLogo";

type LoginMode = "code" | "password" | "username";

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  try {
    const parsed = new URL(value, "https://nexusflow.hk");
    if (parsed.origin !== "https://nexusflow.hk" || parsed.pathname === "/login") return "/dashboard";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login, loginWithPassword, loginWithUsername, user } = useAuth();
  const isRegister = searchParams.get("tab") === "register";
  const returnTo = safeReturnTo(searchParams.get("returnTo") || searchParams.get("callbackUrl"));
  const modeReturnTo = encodeURIComponent(returnTo);

  const [mode, setMode] = useState<LoginMode>("code");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  useEffect(() => { if (user) router.replace(returnTo); }, [user, router, returnTo]);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const resetFeedback = () => { setError(""); setInfo(""); };
  const switchMode = (nextMode: LoginMode) => {
    setMode(nextMode);
    resetFeedback();
    if (nextMode !== "code") { setCode(""); setChallengeToken(""); }
  };

  const handleSendCode = useCallback(async () => {
    resetFeedback();
    if (!isValidEmail) { setError("请输入正确的邮箱地址"); return; }
    setSendingCode(true);
    try {
      const response = await fetchAPI("/api/auth/send-code", { method: "POST", body: JSON.stringify({ email }) });
      if (!response.success) { setChallengeToken(""); setError(response.message || "发送失败"); return; }
      const token = typeof response.data?.challengeToken === "string" ? response.data.challengeToken : "";
      if (!token) { setChallengeToken(""); setError("验证码会话创建失败，请重新获取"); return; }
      setChallengeToken(token);
      setCode("");
      setCountdown(60);
      setInfo("验证码已发送，请检查邮箱");
    } catch {
      setChallengeToken("");
      setError("网络错误，请稍后重试");
    } finally {
      setSendingCode(false);
    }
  }, [email, isValidEmail]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    resetFeedback();
    if (mode !== "username" && !isValidEmail) { setError("请输入正确的邮箱地址"); return; }
    setSubmitting(true);
    let result: { success: boolean; message: string };
    if (mode === "code") {
      if (code.length < 4) { setError("请输入验证码"); setSubmitting(false); return; }
      if (!challengeToken) { setError("验证码会话已失效，请重新获取验证码"); setSubmitting(false); return; }
      result = await login(email, code, challengeToken);
    } else if (mode === "username") {
      if (username.length < 3) { setError("请输入用户名"); setSubmitting(false); return; }
      if (password.length < 6) { setError("密码至少 6 位"); setSubmitting(false); return; }
      result = await loginWithUsername(username, password);
    } else {
      if (password.length < 6) { setError("密码至少 6 位"); setSubmitting(false); return; }
      result = await loginWithPassword(email, password);
    }
    setSubmitting(false);
    if (result.success) router.replace(returnTo);
    else setError(result.message);
  }

  const submitLabel = isRegister
    ? submitting ? "正在创建账户…" : "创建账户"
    : submitting ? "正在登录…" : mode === "code" ? "继续" : mode === "username" ? "登录子账号" : "登录";

  return (
    <main className="nf-login-page" id="main-content">
      <header className="nf-login-header">
        <Link href="/" className="nf-login-brand"><NexusflowLogo size={22} color="var(--text-primary)" /></Link>
        <div><span>{isRegister ? "已有账户？" : "还没有账户？"}</span><Link href={`/login?${isRegister ? "" : "tab=register&"}returnTo=${modeReturnTo}`}>{isRegister ? "登录" : "注册"}</Link></div>
      </header>

      <section className="nf-login-stage">
        <div className="nf-login-context">
          <Link href="/" className="nf-login-back"><ArrowLeftOutlined />返回首页</Link>
          <span className="nf-login-eyebrow">NEXUSFLOW CONSOLE</span>
          <h1>一套凭据，连接<br />你需要的 AI 模型。</h1>
          <p>管理 API 密钥、模型权限、用量与账单。登录后会安全返回你刚才访问的页面。</p>
          <ul>
            <li><CheckCircleFilled />OpenAI、Anthropic 与 Responses 兼容接口</li>
            <li><CheckCircleFilled />主账号与子账号独立权限</li>
            <li><CheckCircleFilled />按请求追踪用量、延迟与费用</li>
          </ul>
        </div>

        <div className="nf-login-card-wrap">
          <div className="nf-login-card">
            <div className="nf-login-title">
              <span className="nf-login-mark">N</span>
              <h2>{isRegister ? "创建 NexusFlow 账户" : "欢迎回来"}</h2>
              <p>{isRegister ? "邮箱验证完成后即可开始使用" : "登录你的 NexusFlow 工作区"}</p>
            </div>

            {!isRegister && (
              <div className="nf-login-tabs" role="tablist" aria-label="登录方式">
                {([['code', '验证码'], ['password', '密码'], ['username', '子账号']] as const).map(([item, label]) => (
                  <button key={item} type="button" role="tab" aria-selected={mode === item} tabIndex={mode === item ? 0 : -1} className={mode === item ? "active" : ""} onClick={() => switchMode(item)}>{label}</button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <label className="nf-login-field">
                <span>{mode === "username" ? "用户名" : "邮箱"}</span>
                <div><i>{mode === "username" ? <UserOutlined /> : <MailOutlined />}</i><input type={mode === "username" ? "text" : "email"} value={mode === "username" ? username : email} onChange={(event) => { resetFeedback(); if (mode === "username") setUsername(event.target.value.trim()); else { setEmail(event.target.value.trim()); setCode(""); setChallengeToken(""); setCountdown(0); } }} placeholder={mode === "username" ? "子账号用户名" : "name@company.com"} autoComplete={mode === "username" ? "username" : "email"} autoFocus /></div>
              </label>

              {mode === "code" ? (
                <label className="nf-login-field">
                  <span>验证码</span>
                  <div className="nf-code-control"><i><SafetyCertificateOutlined /></i><input type="text" inputMode="numeric" maxLength={6} value={code} onChange={(event) => { resetFeedback(); setCode(event.target.value.replace(/\D/g, "")); }} placeholder="6 位验证码" autoComplete="one-time-code" /><button type="button" onClick={handleSendCode} disabled={!isValidEmail || sendingCode || countdown > 0}>{sendingCode ? "发送中…" : countdown > 0 ? `${countdown}s` : "获取验证码"}</button></div>
                </label>
              ) : (
                <label className="nf-login-field">
                  <span>密码</span>
                  <div><i><LockOutlined /></i><input type={passwordVisible ? "text" : "password"} value={password} onChange={(event) => { resetFeedback(); setPassword(event.target.value); }} placeholder="至少 6 位" autoComplete="current-password" /><button type="button" className="nf-password-toggle" onClick={() => setPasswordVisible((value) => !value)} aria-label={passwordVisible ? "隐藏密码" : "显示密码"}>{passwordVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}</button></div>
                </label>
              )}

              {error && <div className="nf-login-alert error" role="alert">{error}</div>}
              {info && !error && <div className="nf-login-alert success" role="status">{info}</div>}
              <button type="submit" className="nf-login-submit" disabled={submitting}>{submitLabel}</button>
            </form>

            <p className="nf-login-note">{mode === "code" ? "邮箱未注册时，验证后将自动创建账户。" : mode === "username" ? "子账号由主账号创建；无法登录时请联系主账号重置密码。" : "尚未设置密码？请切换到验证码登录。"}</p>
            {mode === "code" && <p className="nf-login-legal">继续即表示你同意 <Link href="/terms">服务条款</Link> 与 <Link href="/privacy">隐私政策</Link>。</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="nf-auth-loading">正在加载登录页面…</div>}><LoginPageInner /></Suspense>;
}
