"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Button, Result, Skeleton } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { adminGet, AdminApiError } from "../client";
import type { AdminSession } from "../contracts";

interface AdminSessionContextValue {
  session: AdminSession;
  can: (permission: string) => boolean;
  refresh: () => void;
}

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

function normalizeSession(payload: AdminSession | { session?: AdminSession }): AdminSession {
  const raw = "session" in payload && payload.session ? payload.session : payload as AdminSession;
  const role = raw.role || raw.roles?.[0] || "viewer";
  return {
    ...raw,
    role,
    roles: raw.roles?.length ? raw.roles : [role],
    permissions: Array.isArray(raw.permissions) ? raw.permissions : [],
  };
}

function permissionMatches(granted: string, requested: string): boolean {
  if (granted === "*" || granted === requested) return true;
  if (granted.endsWith(".*")) return requested.startsWith(granted.slice(0, -1));
  return false;
}

export function useAdminSession(): AdminSessionContextValue {
  const value = useContext(AdminSessionContext);
  if (!value) throw new Error("useAdminSession must be used inside AdminGate");
  return value;
}

export function Permission({ name, children, fallback = null }: {
  name: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { can } = useAdminSession();
  return can(name) ? children : fallback;
}

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminApiError | null>(null);
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loginHref = `/login?returnTo=${encodeURIComponent(pathname || "/admin/overview")}`;

  useEffect(() => {
    const onExpired = () => router.replace(loginHref);
    window.addEventListener("nexusflow:admin-session-expired", onExpired);
    return () => window.removeEventListener("nexusflow:admin-session-expired", onExpired);
  }, [loginHref, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(loginHref);
      return;
    }

    const controller = new AbortController();
    adminGet<AdminSession | { session?: AdminSession }>("/api/admin/session", controller.signal)
      .then((payload) => {
        setSession(normalizeSession(payload));
        setError(null);
        setCheckedUserId(user.id);
      })
      .catch((reason: unknown) => {
        const next = reason instanceof AdminApiError
          ? reason
          : new AdminApiError(reason instanceof Error ? reason.message : "管理员会话验证失败");
        setSession(null);
        setError(next);
        setCheckedUserId(user.id);
        if (next.status === 401) router.replace(loginHref);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [authLoading, loginHref, refreshKey, router, user]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setRefreshKey((key) => key + 1);
  }, []);

  const can = useCallback((permission: string) => {
    if (!session) return false;
    return session.permissions.some((granted) => permissionMatches(granted, permission));
  }, [session]);

  const value = useMemo(() => session ? {
    session,
    can,
    refresh,
  } : null, [can, refresh, session]);

  if (authLoading || loading || (user && checkedUserId !== user.id)) {
    return (
      <div className="nf-admin-gate nf-admin-gate-loading" aria-busy="true" aria-label="正在验证管理员权限">
        <div className="nf-admin-gate-card">
          <div className="nf-admin-gate-mark">N</div>
          <Skeleton active paragraph={{ rows: 3 }} />
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (error?.status === 403) {
    return (
      <div className="nf-admin-gate">
        <Result
          status="403"
          title="无管理员权限"
          subTitle="当前账号没有进入 NexusFlow Operations Control Plane 的权限。"
          extra={<Button href="/">返回主站</Button>}
        />
      </div>
    );
  }

  if (error || !value) {
    return (
      <div className="nf-admin-gate">
        <Result
          status="error"
          title="管理员会话验证失败"
          subTitle={error?.message || "无法确认当前权限，请重试。"}
          extra={<Button type="primary" onClick={refresh}>重试</Button>}
        />
      </div>
    );
  }

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}
