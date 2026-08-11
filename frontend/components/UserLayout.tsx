"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoadingOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth";
import UserSidebar from "./UserSidebar";

export default function UserLayout({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      const returnTo = pathname && pathname !== "/login" ? pathname : "/dashboard";
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [loading, user, router, pathname]);

  useEffect(() => {
    const publish = (open: boolean) => window.dispatchEvent(new CustomEvent("nexusflow:console-menu-state", { detail: { open } }));
    const toggle = () => setMobileOpen((value) => { const next = !value; publish(next); return next; });
    const close = () => { setMobileOpen(false); publish(false); };
    window.addEventListener("nexusflow:toggle-console-menu", toggle);
    window.addEventListener("nexusflow:close-console-menu", close);
    return () => {
      window.removeEventListener("nexusflow:toggle-console-menu", toggle);
      window.removeEventListener("nexusflow:close-console-menu", close);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 780px)");
    const update = () => { setIsMobile(media.matches); if (!media.matches) setMobileOpen(false); };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (loading) {
    return <div className="nf-auth-loading"><LoadingOutlined spin /><span>正在恢复登录状态…</span></div>;
  }
  if (!user) return null;

  return (
    <div className={`usr-layout quiet-console-layout nf-console-shell ${mobileOpen ? "mobile-open" : ""}`}>
      {mobileOpen && <button className="nf-console-backdrop" aria-label="关闭控制台菜单" onClick={() => { setMobileOpen(false); window.dispatchEvent(new CustomEvent("nexusflow:console-menu-state", { detail: { open: false } })); }} />}
      <UserSidebar inert={isMobile && !mobileOpen} />
      <div className={wide ? "usr-content-wide" : "usr-content"}>{children}</div>
    </div>
  );
}
