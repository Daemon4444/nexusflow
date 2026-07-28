import { isIP } from "node:net";
import type { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const STANDARD_BODY_LIMIT = 1024 * 1024;

function jsonError(status: number, message: string, code: string): Response {
  return Response.json({ success: false, message, code }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizedBackendUrl(path: string, search: string): URL {
  const base = new URL(BACKEND_URL);
  if (
    process.env.NODE_ENV === "production"
    && !["127.0.0.1", "::1", "localhost"].includes(base.hostname)
  ) {
    throw new Error("production BACKEND_URL must use a loopback host");
  }
  return new URL(`${path}${search}`, base);
}

function normalizedPath(path: string[]): string | null {
  if (
    path.length === 0
    || path.some((part) => (
      !part
      || part === "."
      || part === ".."
      || part.includes("\\")
      || part.includes("\0")
    ))
  ) {
    return null;
  }
  const encoded = `/${path.map(encodeURIComponent).join("/")}`;
  return encoded.length <= 2_048 ? encoded : null;
}

function isForbiddenAlias(path: string[]): boolean {
  const logical = path.join("/").split("/").filter(Boolean);
  const first = logical[0]?.toLowerCase();
  const second = logical[1]?.toLowerCase();
  return (
    first === "v1"
    || (
      first === "api"
      && (second === "upload" || second === "uploads")
    )
  );
}

function forwardedHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  const auth = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");
  const idempotencyKey = request.headers.get("idempotency-key");
  const requestId = request.headers.get("x-request-id");
  const realIp = request.headers.get("x-real-ip")?.trim() || "";
  if (auth) headers.set("Authorization", auth);
  if (contentType) headers.set("Content-Type", contentType);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  if (requestId) headers.set("X-Request-Id", requestId);
  if (isIP(realIp)) headers.set("X-Real-IP", realIp);
  return headers;
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const name of [
    "content-type",
    "content-disposition",
    "cache-control",
    "etag",
    "last-modified",
    "x-request-id",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("cache-control")) headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function declaredBodyLength(request: NextRequest): number | null | "invalid" {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) return "invalid";
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : "invalid";
}

function boundedBody(
  request: NextRequest,
  state: { exceeded: boolean }
): ReadableStream<Uint8Array> | undefined {
  if (request.method === "GET" || request.method === "HEAD" || !request.body) {
    return undefined;
  }
  let bytes = 0;
  return request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > STANDARD_BODY_LIMIT) {
        state.exceeded = true;
        controller.error(new Error("proxy_body_too_large"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
}

export async function proxyBackendRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await params;
  if (isForbiddenAlias(path)) {
    return jsonError(
      404,
      "This API path is not available through the browser proxy.",
      "proxy_path_not_available"
    );
  }
  const apiPath = normalizedPath(path);
  if (!apiPath) return jsonError(400, "Invalid API path.", "invalid_proxy_path");
  if (request.headers.get("content-encoding")) {
    return jsonError(
      415,
      "Compressed request bodies are not accepted by the browser proxy.",
      "unsupported_content_encoding"
    );
  }
  const contentType = request.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonError(
      415,
      "Multipart uploads must use the dedicated upload endpoint.",
      "multipart_proxy_not_allowed"
    );
  }
  const length = declaredBodyLength(request);
  if (length === "invalid") {
    return jsonError(400, "Invalid Content-Length.", "invalid_content_length");
  }
  if (length !== null && length > STANDARD_BODY_LIMIT) {
    return jsonError(413, "Request body is too large.", "proxy_body_too_large");
  }

  const bodyState = { exceeded: false };
  const body = boundedBody(request, bodyState);
  try {
    const upstream = await fetch(
      normalizedBackendUrl(apiPath, request.nextUrl.search),
      {
        method: request.method,
        headers: forwardedHeaders(request),
        body,
        signal: request.signal,
        redirect: "manual",
        duplex: body ? "half" : undefined,
      } as RequestInit & { duplex?: "half" }
    );
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
  } catch {
    if (bodyState.exceeded) {
      return jsonError(413, "Request body is too large.", "proxy_body_too_large");
    }
    return jsonError(502, "Backend unavailable.", "backend_unavailable");
  }
}
