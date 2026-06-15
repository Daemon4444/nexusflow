import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://nexusflow.hk";
  const now = new Date();

  const staticPages = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" as const },
    { path: "/models", priority: 0.9, changeFrequency: "daily" as const },
    { path: "/pricing", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/playground", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/docs", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/docs/quickstart", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/docs/principles", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/multi-protocol", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/provider-routing", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/model-fallback", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/api-keys", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/faq", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/api/parameters", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/docs/api/tasks", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/api/anthropic", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/api/responses", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/api/errors", priority: 0.4, changeFrequency: "monthly" as const },
    { path: "/docs/api/limits", priority: 0.4, changeFrequency: "monthly" as const },
    { path: "/docs/api/qwen", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/docs/api/deepseek", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/docs/api/glm", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/api/kimi", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/api/minimax", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/api/embeddings", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/api/images", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/api/videos", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/api/pixverse", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/api/happyhorse", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/models/qwen/intro", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/models/deepseek/intro", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/models/pixverse/intro", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/docs/models/happyhorse", priority: 0.5, changeFrequency: "monthly" as const },
  ];

  return staticPages.map((page) => ({
    url: `${base}${page.path}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
