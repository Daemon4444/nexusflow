import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Playground",
  description: "Test AI models interactively in the NexusFlow Playground — no API key required.",
  alternates: { canonical: "/playground" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
