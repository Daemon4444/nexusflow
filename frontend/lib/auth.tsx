"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { fetchAPI } from "@/lib/api";

interface UserQuota {
  limit: number | null;
  used: number;
  period: string | null;
}

interface User {
  id: string;
  email: string | null;
  username?: string | null;
  nickname: string;
  balance: number;
  creditBalance: number;
  accountType?: "main" | "sub";
  quota?: UserQuota | null;
  allowedModels?: string[] | null;
  demoAdminAccess?: boolean;
  hasPassword: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authError: string;
  login: (email: string, code: string, challengeToken: string) => Promise<{ success: boolean; message: string }>;
  loginWithPassword: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  loginWithUsername: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  authError: "",
  login: async () => ({ success: false, message: "" }),
  loginWithPassword: async () => ({ success: false, message: "" }),
  loginWithUsername: async () => ({ success: false, message: "" }),
  logout: async () => {},
  refreshUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("air_session_token");
}

function setToken(token: string) {
  localStorage.setItem("air_session_token", token);
}

function clearToken() {
  localStorage.removeItem("air_session_token");
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const refreshUser = useCallback(async () => {
    setAuthError("");
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchAPI("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (getToken() !== token) return;
      if (res.success) {
        setUser(res.data);
      } else if (res.status === 401) {
        clearToken();
        setUser(null);
      } else {
        setAuthError("暂时无法验证登录状态，请重试。");
      }
    } catch {
      if (getToken() === token) setAuthError("无法连接登录服务，请检查网络后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, code: string, challengeToken: string) => {
    try {
      const res = await fetchAPI("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, code, challengeToken }),
      });
      if (res.success) {
        setAuthError("");
        setToken(res.data.token);
        setUser(res.data.user);
        return { success: true, message: res.message };
      }
      return { success: false, message: res.message || "登录失败" };
    } catch {
      return { success: false, message: "网络错误，请重试" };
    }
  };

  const loginWithPassword = async (email: string, password: string) => {
    try {
      const res = await fetchAPI("/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (res.success) {
        setAuthError("");
        setToken(res.data.token);
        setUser(res.data.user);
        return { success: true, message: res.message };
      }
      return { success: false, message: res.message || "登录失败" };
    } catch {
      return { success: false, message: "网络错误，请重试" };
    }
  };

  const loginWithUsername = async (username: string, password: string) => {
    try {
      const res = await fetchAPI("/api/auth/login-username", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      if (res.success) {
        setAuthError("");
        setToken(res.data.token);
        setUser(res.data.user);
        return { success: true, message: res.message };
      }
      return { success: false, message: res.message || "登录失败" };
    } catch {
      return { success: false, message: "网络错误，请重试" };
    }
  };

  const logout = async () => {
    const token = getToken();
    if (token) {
      try {
        await fetchAPI("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    clearToken();
    setAuthError("");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, login, loginWithPassword, loginWithUsername, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
