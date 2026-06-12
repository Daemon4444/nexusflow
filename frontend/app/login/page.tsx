"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import { NexusflowLogo } from "@/components/QuadrantLogo";

type LoginMode = "code" | "password";

function LoginPageInner() {
  const searchParams = useSearchParams();
  const isRegister = searchParams.get("tab") === "register";
  const [mode, setMode] = useState<LoginMode>("code");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { login, loginWithPassword, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.push("/billing");
  }, [user, router]);

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
      setError("Please enter a valid email address");
      return;
    }

    setSendingCode(true);
    try {
      const res = await fetchAPI("/api/auth/send-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (res.success) {
        setCountdown(60);
        setInfo(res.message);
      } else {
        setError(res.message || "Failed to send code");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSendingCode(false);
    }
  }, [email, isValidEmail]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!isValidEmail) { setError("Please enter a valid email address"); return; }

    setSubmitting(true);
    let result;

    if (mode === "code") {
      if (!code || code.length < 4) { setError("Please enter the verification code"); setSubmitting(false); return; }
      result = await login(email, code);
    } else {
      if (!password || password.length < 6) { setError("Password must be at least 6 characters"); setSubmitting(false); return; }
      result = await loginWithPassword(email, password);
    }

    setSubmitting(false);
    if (result.success) router.push("/billing");
    else setError(result.message);
  }

  function switchMode(newMode: LoginMode) {
    setMode(newMode);
    setError("");
    setInfo("");
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
          Back
        </button>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <NexusflowLogo size={28} color="var(--text-primary)" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6, letterSpacing: "-0.3px" }}>
            {isRegister ? "Sign up for nexusflow" : "Sign in to nexusflow"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {isRegister ? "Enter your email and verify to create an account" : mode === "code" ? "Sign in with email verification code" : "Sign in with email and password"}
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>

            {/* Mode Tabs — registration only supports verification code, hide the toggle */}
            {!isRegister && (
            <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "var(--bg-elevated)", borderRadius: 8, padding: 3, border: "1px solid var(--border)" }}>
              {([["code", "Code login"], ["password", "Password login"]] as const).map(([m, label]) => (
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

            {/* Email */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7, letterSpacing: "0.02em" }}>Email</label>
              <input
                className="input"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                autoComplete="email"
                style={{ fontSize: 16 }}
              />
            </div>

            {/* Code or Password */}
            {mode === "code" ? (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7, letterSpacing: "0.02em" }}>Verification code</label>
                <div className="login-code-row" style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    type="text"
                    placeholder="Enter the code"
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
                    {sendingCode ? "Sending..." : countdown > 0 ? `${countdown}s` : "Send code"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7, letterSpacing: "0.02em" }}>Password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Enter your password"
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
              {isRegister ? (submitting ? "Creating..." : "Create account") : submitting ? "Signing in..." : "Sign in / Sign up"}
            </button>
          </div>
        </form>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
          {isRegister ? "Already have an account? Just enter your email and verification code to sign in." : mode === "code" ? "First-time sign-in will create an account automatically." : "Sign in with a verification code first to set a password."}
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
