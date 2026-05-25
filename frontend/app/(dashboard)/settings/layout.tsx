import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your NexusFlow account settings and security preferences.",
  alternates: { canonical: "/settings" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
