import type { Metadata } from "next";
import DocsNavSidebar from "./DocsNav";

export const metadata: Metadata = {
  title: "Documentation",
  description: "NexusFlow developer documentation — API reference, quickstart guides, model capabilities, and integration examples.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "Documentation",
    description: "NexusFlow developer documentation — API reference, quickstart guides, and integration examples.",
    url: "/docs",
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-layout" style={{ display: "flex", minHeight: "calc(100vh - 56px)" }}>
      <aside className="docs-sidebar" style={{
        width: 240,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--bg)",
        position: "sticky",
        top: 56,
        height: "calc(100vh - 56px)",
        overflowY: "auto",
      }}>
        <DocsNavSidebar />
      </aside>
      <main className="docs-main" style={{ flex: 1, minWidth: 0, background: "var(--bg)" }}>
        {children}
      </main>
    </div>
  );
}
