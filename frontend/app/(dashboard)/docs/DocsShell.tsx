"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import DocsNavSidebar from "./DocsNav";

export default function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  return (
    <div className="docs-layout">
      <button
        type="button"
        className="docs-mobile-toc"
        aria-expanded={open}
        aria-controls="docs-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <small>Documentation</small>
          文档目录
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <aside id="docs-navigation" className={`docs-sidebar${open ? " is-open" : ""}`}>
        <DocsNavSidebar />
      </aside>
      {open && <button className="docs-nav-backdrop" aria-label="关闭文档目录" onClick={() => setOpen(false)} />}
      <main className="docs-main">{children}</main>
    </div>
  );
}
