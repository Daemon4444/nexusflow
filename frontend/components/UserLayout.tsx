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

  // Tell the header (menu button icon) whenever the drawer opens or closes.
  // Done in an effect: dispatching from a state updater would update Header
  // while UserLayout is rendering.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("nexusflow:console-menu-state", { detail: { open: mobileOpen } }));
  }, [mobileOpen]);

  useEffect(() => {
    const toggle = () => setMobileOpen((value) => !value);
    const close = () => setMobileOpen(false);
    window.addEventListener("nexusflow:toggle-console-menu", toggle);
    window.addEventListener("nexusflow:close-console-menu", close);
    return () => {
      window.removeEventListener("nexusflow:toggle-console-menu", toggle);
      window.removeEventListener("nexusflow:close-console-menu", close);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 919px)");
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
      {mobileOpen && <button className="nf-console-backdrop" aria-label="关闭控制台菜单" onClick={() => setMobileOpen(false)} />}
      <UserSidebar inert={isMobile && !mobileOpen} />
      <div className={wide ? "usr-content-wide" : "usr-content"}>{children}</div>
    </div>
  );
}
