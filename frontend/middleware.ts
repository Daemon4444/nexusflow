import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    "default-src 'self'",
    `connect-src 'self' https://nexusflow.hk`,
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    `style-src 'self' 'unsafe-inline'`,
    "font-src 'self'",
    `script-src 'self' 'unsafe-inline'`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const response = NextResponse.next();
  response.headers.set("x-nonce", nonce);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
