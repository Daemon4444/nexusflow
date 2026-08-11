import type { Metadata } from "next";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";

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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=(t==='dark'||t==='light')?t:'light';}catch(e){document.documentElement.dataset.theme='light';}})();",
          }}
        />
      </head>
      <body className="antialiased">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "NexusFlow",
            "url": "https://nexusflow.hk",
            "description": "Unified AI model aggregation platform providing OpenAI-compatible API access to leading text, vision, image and video models.",
            "applicationCategory": "DeveloperApplication",
            "operatingSystem": "Any"
          }) }}
        />
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
