import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sub Accounts",
  description: "Create and manage sub-accounts with spending quotas under your NexusFlow account.",
  alternates: { canonical: "/sub-accounts" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
