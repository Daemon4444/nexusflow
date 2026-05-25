import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support Tickets",
  description: "Submit and track support requests on NexusFlow.",
  alternates: { canonical: "/tickets" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
