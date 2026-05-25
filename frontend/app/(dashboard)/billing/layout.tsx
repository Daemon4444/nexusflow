import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing",
  description: "View your NexusFlow balance, transaction history, and top up your account.",
  alternates: { canonical: "/billing" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
