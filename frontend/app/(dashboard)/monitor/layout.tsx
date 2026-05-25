import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Monitor",
  description: "Real-time provider health, latency, and capacity monitoring for NexusFlow.",
  alternates: { canonical: "/monitor" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
