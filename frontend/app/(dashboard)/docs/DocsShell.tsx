"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import DocsNavSidebar from "./DocsNav";

interface TocItem { id: string; text: string; level: 2 | 3 }

export default function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState("");
  const [progress, setProgress] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // Build the "on this page" outline from the rendered article headings.
  useEffect(() => {
    const article = articleRef.current;
    const main = mainRef.current;
    if (!article || !main) return;
    main.scrollTop = 0;
    let headings: HTMLElement[] = [];
    const onScroll = () => {
      const max = main.scrollHeight - main.clientHeight;
      setProgress(max > 0 ? Math.min(1, main.scrollTop / max) : 0);
      if (!headings.length) return;
      // Active = last heading that has scrolled past the top quarter of the pane;
      // at the very bottom, the last heading wins even if it never gets there.
      const line = main.getBoundingClientRect().top + main.clientHeight * 0.25;
      let current = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= line) current = heading;
      }
      if (max > 0 && main.scrollTop >= max - 2) current = headings[headings.length - 1];
      setActiveId(current.id);
    };
    const timer = window.setTimeout(() => {
      headings = [...article.querySelectorAll<HTMLElement>("h2, h3")].filter((el) => el.textContent?.trim());
      const items = headings.map((el, index) => {
        if (!el.id) el.id = `section-${index + 1}`;
        return { id: el.id, text: el.textContent!.trim(), level: el.tagName === "H3" ? 3 : 2 } as TocItem;
      });
      // The docs landing page is its own index; articles get an outline.
      setToc(items.length >= 3 && pathname !== "/docs" ? items : []);
      onScroll();
    }, 60);
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.clearTimeout(timer); main.removeEventListener("scroll", onScroll); };
  }, [pathname]);

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

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
      <main className="docs-main" ref={mainRef}>
        <div className="docs-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden />
        <div className={`docs-frame${toc.length ? " has-toc" : ""}`}>
          <div className="docs-article" ref={articleRef}>{children}</div>
          {toc.length > 0 && (
            <aside className="docs-toc" aria-label="本页目录">
              <span>本页目录</span>
              <ol>
                {toc.map((item) => (
                  <li key={item.id} className={`is-h${item.level}${activeId === item.id ? " is-active" : ""}`}>
                    <a href={`#${item.id}`} onClick={(event) => { event.preventDefault(); jump(item.id); }}>{item.text}</a>
                  </li>
                ))}
              </ol>
              <a className="docs-toc-top" href="#" onClick={(event) => { event.preventDefault(); mainRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}>↑ 回到顶部</a>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
