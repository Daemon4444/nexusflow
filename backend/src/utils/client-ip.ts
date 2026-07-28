import type { Request } from "express";
import { isIP } from "node:net";
import { parseEnvList } from "./env-list";

function normalizeIp(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}

function isTrustedProxy(address: string): boolean {
  const trusted = new Set([
    "127.0.0.1",
    "::1",
    ...parseEnvList(process.env.TRUSTED_PROXY_IPS).map(normalizeIp),
  ]);
  return trusted.has(normalizeIp(address));
}

/**
 * Resolve a client IP without trusting caller-controlled forwarding headers.
 * Nginx/Next may pass one normalized X-Real-IP only when the immediate socket
 * peer is a configured ingress address (loopback by default).
 */
export function getTrustedClientIp(req: Request): string {
  const peer = normalizeIp(req.socket?.remoteAddress || "unknown");
  const realIp = req.headers["x-real-ip"];
  if (
    isTrustedProxy(peer)
    && typeof realIp === "string"
    && isIP(normalizeIp(realIp)) > 0
  ) {
    return normalizeIp(realIp);
  }
  return isIP(peer) > 0 ? peer : "unknown";
}
