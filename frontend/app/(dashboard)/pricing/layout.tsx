import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Transparent pay-as-you-go pricing for all AI models on NexusFlow. No subscriptions, no hidden fees.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing",
    description: "Transparent pay-as-you-go pricing for all AI models on NexusFlow.",
    url: "/pricing",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
