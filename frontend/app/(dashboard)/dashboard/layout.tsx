import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your NexusFlow dashboard — balance overview, usage stats, and quick access to API keys.",
  alternates: { canonical: "/dashboard" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
