import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Models",
  description: "Browse and compare AI models available on NexusFlow — text, vision, image, video, and embedding models from leading providers.",
  alternates: { canonical: "/models" },
  openGraph: {
    title: "Models",
    description: "Browse and compare AI models available on NexusFlow.",
    url: "/models",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
