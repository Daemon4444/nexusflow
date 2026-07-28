import type { NextConfig } from "next";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const fullGitSha = /^[0-9a-f]{40}$/i;

function resolveBuildSha(): string {
  const fromEnvironment = (process.env.BUILD_SHA || "").trim();
  if (fullGitSha.test(fromEnvironment)) return fromEnvironment.toLowerCase();

  try {
    const fromGit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: path.join(configDir, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (fullGitSha.test(fromGit)) return fromGit.toLowerCase();
  } catch {
    // Release archives do not contain .git and must receive BUILD_SHA.
  }

  throw new Error(
    "NexusFlow frontend builds require BUILD_SHA to be a full 40-character Git SHA"
  );
}

const buildSha = resolveBuildSha();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.join(configDir, "../"),
  generateBuildId: async () => buildSha,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-NexusFlow-Build-Sha", value: buildSha },
        ],
      },
      {
        source: "/docs/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/((?!_next/static|_next/image|favicon.ico|docs).*)",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.nexusflow.hk" }],
        destination: "https://nexusflow.hk/:path*",
        permanent: true,
      },
      {
        source: "/register",
        destination: "/login?tab=register",
        permanent: false,
      },
      {
        source: "/signup",
        destination: "/login?tab=register",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
      {
        source: "/v1/:path*",
        destination: `${backend}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
