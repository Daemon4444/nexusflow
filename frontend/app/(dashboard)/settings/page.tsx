"use client";

import { useState, useEffect } from "react";
import { useAuth, authHeaders } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatCny } from "@/lib/money";
import UserLayout from "@/components/UserLayout";

type Tab = "profile" | "security";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { t, locale } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  const [nickname, setNickname] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (user) setNickname(user.nickname);
  }, [user]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    if (!nickname.trim()) {
      setProfileMsg({ type: "error", text: t("nicknameEmpty") });
      return;
    }
    setProfileSaving(true);
    try {
      const res = await fetchAPI("/api/auth/profile", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      if (res.success) {
        setProfileMsg({ type: "success", text: t("profileUpdated") });
        await refreshUser();
      } else {
        setProfileMsg({ type: "error", text: res.message || t("updateFailed") });
      }
    } catch {
      setProfileMsg({ type: "error", text: t("networkError") });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (user?.hasPassword && !oldPassword) {
      setPwMsg({ type: "error", text: t("enterCurrentPw") });
      return;
    }
    if (newPassword.length < 6) {
      setPwMsg({ type: "error", text: t("pwMinLength") });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "error", text: t("pwNoMatch") });
      return;
    }
    setPwSaving(true);
    try {
      let res;
      if (user?.hasPassword) {
        res = await fetchAPI("/api/auth/change-password", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ oldPassword, newPassword }),
        });
      } else {
        res = await fetchAPI("/api/auth/set-password", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ password: newPassword }),
        });
      }
      if (res.success) {
        setPwMsg({ type: "success", text: user?.hasPassword ? t("pwChanged") : t("pwSet") });
        setOldPassword(""); setNewPassword(""); setConfirmPassword("");
        await refreshUser();
      } else {
        setPwMsg({ type: "error", text: res.message || t("updateFailed") });
      }
    } catch {
      setPwMsg({ type: "error", text: t("networkError") });
    } finally {
      setPwSaving(false);
    }
  }

  const joined = user ? new Date(user.createdAt).toLocaleDateString(
    locale === "zh" ? "zh-CN" : "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  ) : "";

  return (
    <UserLayout>
      <div className="usr-page-header">
        <h1>{t("settingsTitle")}</h1>
        <p>{t("settingsDesc")}</p>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: "1px solid var(--border)" }}>
        {([
          { key: "profile" as Tab, label: t("tabProfile") },
          { key: "security" as Tab, label: t("tabSecurity") },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 20px", fontSize: 13,
              fontWeight: activeTab === tab.key ? 600 : 450,
              color: activeTab === tab.key ? "var(--text-primary)" : "var(--text-tertiary)",
              background: "transparent", border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--text-primary)" : "2px solid transparent",
              cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit", marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "profile" && user && (
        <div className="animate-fadeIn">
          <div className="usr-section" style={{ marginBottom: 20 }}>
            <div style={{ padding: "20px 20px 16px", display: "flex", alignItems: "center", gap: 14, background: "linear-gradient(135deg, #fafaf9, #f5f5f4)" }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                {user.nickname.slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>{user.nickname}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 1 }}>{user.email}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>{t("balance")}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>{formatCny(user.balance + (user.creditBalance || 0))}</div>
                {user.creditBalance > 0 && <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 2 }}>含信控 {formatCny(user.creditBalance)}</div>}
              </div>
            </div>
            <div style={{ padding: "12px 20px", display: "flex", gap: 28 }}>
              <div>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{t("memberSince")}</span>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", marginTop: 2 }}>{joined}</div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{t("password")}</span>
                <div style={{ marginTop: 2 }}>
                  <span className={user.hasPassword ? "badge-success" : "badge-warning"} style={{ fontSize: 11 }}>
                    {user.hasPassword ? t("pwEnabled") : t("pwNotSet")}
                  </span>
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>User ID</span>
                <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", marginTop: 3 }}>{user.id.slice(0, 8)}...</div>
              </div>
            </div>
          </div>

          <div className="usr-section">
            <div className="usr-section-header"><h3>{t("editProfile")}</h3></div>
            <div className="usr-section-body">
              <form onSubmit={handleSaveProfile}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{t("email")}</label>
                  <input className="input" type="text" value={user.email || ""} disabled style={{ fontSize: 13, opacity: 0.6, cursor: "not-allowed" }} />
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, display: "block" }}>{t("emailNoChange")}</span>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{t("nickname")}</label>
                  <input className="input" type="text" maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} style={{ fontSize: 13 }} />
                </div>
                {profileMsg && (
                  <div style={{ marginBottom: 14, padding: "9px 12px", borderRadius: 7, fontSize: 12.5, background: profileMsg.type === "success" ? "var(--success-bg)" : "var(--danger-bg)", border: `1px solid ${profileMsg.type === "success" ? "var(--success-border)" : "var(--danger-border)"}`, color: profileMsg.type === "success" ? "var(--success)" : "var(--danger)" }}>
                    {profileMsg.text}
                  </div>
                )}
                <button type="submit" className="btn-primary" disabled={profileSaving || nickname === user.nickname} style={{ padding: "8px 22px", fontSize: 13 }}>
                  {profileSaving ? t("saving") : t("saveChanges")}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {activeTab === "security" && user && (
        <div className="animate-fadeIn">
          <div className="usr-section" style={{ marginBottom: 20 }}>
            <div className="usr-section-header">
              <h3>{user.hasPassword ? t("changePassword") : t("setPassword")}</h3>
            </div>
            <div className="usr-section-body">
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 20px", lineHeight: 1.6 }}>
                {user.hasPassword ? t("changePwDesc") : t("setPwDesc")}
              </p>
              <form onSubmit={handleChangePassword}>
                {user.hasPassword && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{t("currentPassword")}</label>
                    <input className="input" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" style={{ fontSize: 13 }} />
                  </div>
                )}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{t("newPassword")}</label>
                  <input className="input" type="password" placeholder={t("pwPlaceholder")} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" style={{ fontSize: 13 }} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{t("confirmNewPassword")}</label>
                  <input className="input" type="password" placeholder={t("pwConfirmPlaceholder")} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" style={{ fontSize: 13 }} />
                </div>
                {pwMsg && (
                  <div style={{ marginBottom: 14, padding: "9px 12px", borderRadius: 7, fontSize: 12.5, background: pwMsg.type === "success" ? "var(--success-bg)" : "var(--danger-bg)", border: `1px solid ${pwMsg.type === "success" ? "var(--success-border)" : "var(--danger-border)"}`, color: pwMsg.type === "success" ? "var(--success)" : "var(--danger)" }}>
                    {pwMsg.text}
                  </div>
                )}
                <button type="submit" className="btn-primary" disabled={pwSaving || !newPassword || !confirmPassword} style={{ padding: "8px 22px", fontSize: 13 }}>
                  {pwSaving ? t("saving") : user.hasPassword ? t("changePassword") : t("setPassword")}
                </button>
              </form>
            </div>
          </div>

          <div className="usr-section">
            <div className="usr-section-header"><h3>{t("sessions")}</h3></div>
            <div className="usr-section-body">
              <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 14px", lineHeight: 1.6 }}>{t("sessionDesc")}</p>
              <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{t("currentSession")}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{t("activeNow")}</div>
                </div>
                <span className="badge-success" style={{ fontSize: 11 }}>{t("active")}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </UserLayout>
  );
}
