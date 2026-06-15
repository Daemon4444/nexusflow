"use client";

import UserSidebar from "./UserSidebar";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function UserLayout({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div style={{ padding: "80px 32px", textAlign: "center", color: "var(--text-tertiary)" }}>
        Loading...
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="usr-layout quiet-console-layout">
      <UserSidebar />
      <div className={wide ? "usr-content-wide" : "usr-content"}>
        {children}
      </div>
    </div>
  );
}
