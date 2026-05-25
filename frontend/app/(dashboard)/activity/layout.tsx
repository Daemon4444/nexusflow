import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activity",
  description: "View your NexusFlow API usage logs, token consumption, and cost breakdown.",
  alternates: { canonical: "/activity" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
