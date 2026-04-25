"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { fetchAPI } from "@/lib/api";

interface User {
  id: string;
  email: string;
  nickname: string;
  balance: number;
  hasPassword: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, code: string) => Promise<{ success: boolean; message: string }>;
  loginWithPassword: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({ success: false, message: "" }),
  loginWithPassword: async () => ({ success: false, message: "" }),
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

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetchAPI("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.success) {
        setUser(res.data);
      } else {
        clearToken();
        setUser(null);
      }
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, code: string) => {
    try {
      const res = await fetchAPI("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
      if (res.success) {
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
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithPassword, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
