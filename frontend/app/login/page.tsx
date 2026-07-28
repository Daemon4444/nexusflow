"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const isRegister = searchParams.get("tab") === "register";
  const returnTo = safeReturnTo(searchParams.get("returnTo") || searchParams.get("callbackUrl"));
  const [mode, setMode] = useState<LoginMode>("code");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { login, loginWithPassword, loginWithUsername, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace(returnTo);
  }, [user, router, returnTo]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSendCode = useCallback(async () => {
    setError("");
    setInfo("");
    if (!isValidEmail) {
      setError("请输入正确的邮箱地址");
      return;
    }

    setSendingCode(true);
    try {
      const res = await fetchAPI("/api/auth/send-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (res.success) {
        const nextChallengeToken = typeof res.data?.challengeToken === "string"
          ? res.data.challengeToken
          : "";
        if (!nextChallengeToken) {
          setChallengeToken("");
          setError("验证码会话创建失败，请重新获取");
          return;
        }
        setChallengeToken(nextChallengeToken);
        setCode("");
        setCountdown(60);
        setInfo(res.message);
      } else {
        setChallengeToken("");
        setError(res.message || "发送失败");
      }
    } catch {
      setChallengeToken("");
      setError("网络错误，请重试");
    } finally {
      setSendingCode(false);
    }
  }, [email, isValidEmail]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (mode !== "username" && !isValidEmail) { setError("请输入正确的邮箱地址"); return; }

    setSubmitting(true);
    let result;

    if (mode === "code") {
      if (!code || code.length < 4) { setError("请输入验证码"); setSubmitting(false); return; }
      if (!challengeToken) {
        setError("验证码会话已失效，请重新获取验证码");
        setSubmitting(false);
        return;
      }
      result = await login(email, code, challengeToken);
    } else if (mode === "username") {
      if (!username || username.length < 3) { setError("请输入用户名"); setSubmitting(false); return; }
      if (!password || password.length < 6) { setError("密码至少 6 位"); setSubmitting(false); return; }
      result = await loginWithUsername(username, password);
    } else {
      if (!password || password.length < 6) { setError("密码至少 6 位"); setSubmitting(false); return; }
      result = await loginWithPassword(email, password);
    }

    setSubmitting(false);
    if (result.success) router.replace(returnTo);
    else setError(result.message);
  }

  function switchMode(newMode: LoginMode) {
    setMode(newMode);
    setError("");
    setInfo("");
    if (newMode !== "code") {
      setCode("");
      setChallengeToken("");
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, background: "var(--bg-elevated)", fontFamily: "var(--font-sans)",
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {/* Back */}
        <button
          type="button"
          onClick={() => router.push("/")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            marginBottom: 20, padding: "6px 2px",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
            fontFamily: "inherit", transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12L6 8l4-4" />
          </svg>
          返回
        </button>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <NexusflowLogo size={28} color="var(--text-primary)" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6, letterSpacing: "-0.3px" }}>
            {isRegister ? "注册 nexusflow" : "登录 nexusflow"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {isRegister ? "输入邮箱，验证后即刻创建账户" : mode === "code" ? "使用邮箱验证码登录" : mode === "username" ? "使用子账号用户名和密码登录" : "使用邮箱和密码登录"}
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>

            {/* Mode Tabs — 注册语境只有验证码一种方式，隐藏切换 */}
            {!isRegister && (
            <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "var(--bg-elevated)", borderRadius: 8, padding: 3, border: "1px solid var(--border)" }}>
              {([["code", "验证码"], ["password", "密码"], ["username", "子账号"]] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  style={{
                    flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 600,
                    border: "none", borderRadius: 6, cursor: "pointer",
                    fontFamily: "inherit", transition: "all 0.15s",
                    background: mode === m ? "var(--bg-card)" : "transparent",
                    color: mode === m ? "var(--text-primary)" : "var(--text-tertiary)",
                    boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            )}

            {/* Email or Username */}
            {mode === "username" ? (
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7, letterSpacing: "0.02em" }}>用户名</label>
                <input
                  className="input"
                  type="text"
                  placeholder="子账号用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.trim())}
                  autoComplete="username"
                  style={{ fontSize: 16 }}
                />
              </div>
            ) : (
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7, letterSpacing: "0.02em" }}>邮箱</label>
              <input
                className="input"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value.trim());
                  setCode("");
                  setChallengeToken("");
                  setCountdown(0);
                }}
                autoComplete="email"
                style={{ fontSize: 16 }}
              />
            </div>
            )}

            {/* Code or Password */}
            {mode === "code" ? (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7, letterSpacing: "0.02em" }}>验证码</label>
                <div className="login-code-row" style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    type="text"
                    placeholder="请输入验证码"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    style={{ flex: 1, fontSize: 16, letterSpacing: "2px" }}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin(e)}
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={sendingCode || countdown > 0 || !isValidEmail}
                    style={{
                      flexShrink: 0,
                      padding: "9px 14px",
                      background: (sendingCode || countdown > 0 || !isValidEmail)
                        ? "var(--bg-elevated)" : "#111",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: (sendingCode || countdown > 0 || !isValidEmail)
                        ? "var(--text-tertiary)" : "#fff",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: (sendingCode || countdown > 0 || !isValidEmail)
                        ? "default" : "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                      transition: "all 0.15s",
                    }}
                  >
                    {sendingCode ? "发送中..." : countdown > 0 ? `${countdown}s` : "获取验证码"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7, letterSpacing: "0.02em" }}>密码</label>
                <input
                  className="input"
                  type="password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ fontSize: 16 }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin(e)}
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                marginBottom: 14, padding: "9px 12px",
                background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
                borderRadius: 7, color: "var(--danger)", fontSize: 13,
              }}>
                {error}
              </div>
            )}

            {/* Info */}
            {info && !error && (
              <div style={{
                marginBottom: 14, padding: "9px 12px",
                background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)",
                borderRadius: 7, color: "#059669", fontSize: 13,
              }}>
                {info}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              style={{
                width: "100%", padding: "12px 20px", fontSize: 14,
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {isRegister ? (submitting ? "创建中..." : "创建账户") : submitting ? "登录中..." : "登录 / 注册"}
            </button>
          </div>
        </form>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
          {isRegister ? "已有账户？输入邮箱验证码即可直接登录" : mode === "code" ? "首次登录将自动创建账户" : mode === "username" ? "子账号由主账号创建并分发，忘记密码请联系主账号重置" : "请先通过验证码登录并设置密码"}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
