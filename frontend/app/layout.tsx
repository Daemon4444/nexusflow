import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: {
    default: "NexusFlow - Unified AI Model Gateway",
    template: "%s | NexusFlow",
  },
  description: "Unified AI model aggregation platform providing OpenAI-compatible API access to leading text, vision, image and video models.",
  metadataBase: new URL("https://nexusflow.hk"),
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    siteName: "NexusFlow",
    title: "NexusFlow - Unified AI Model Gateway",
    description: "Unified AI model aggregation platform providing OpenAI-compatible API access to leading text, vision, image and video models.",
    url: "https://nexusflow.hk",
  },
  twitter: {
    card: "summary_large_image",
    title: "NexusFlow - Unified AI Model Gateway",
    description: "Unified AI model aggregation platform providing OpenAI-compatible API access to leading text, vision, image and video models.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <I18nProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
