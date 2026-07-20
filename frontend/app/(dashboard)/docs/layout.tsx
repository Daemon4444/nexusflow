import type { Metadata } from "next";
import DocsShell from "./DocsShell";

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
  return <DocsShell>{children}</DocsShell>;
}
