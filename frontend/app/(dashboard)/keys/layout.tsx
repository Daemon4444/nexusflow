import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Keys",
  description: "Manage your NexusFlow API keys — create, revoke, and configure rate limits.",
  alternates: { canonical: "/keys" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
