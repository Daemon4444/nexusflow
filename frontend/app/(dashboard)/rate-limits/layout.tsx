import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rate Limits",
  description: "View and manage your NexusFlow API rate limits per model.",
  alternates: { canonical: "/rate-limits" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
