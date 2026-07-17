import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

function forwardedHeaders(request: NextRequest): HeadersInit {
  const headers: Record<string, string> = {};
  const auth = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");
  if (auth) headers.Authorization = auth;
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

async function readBody(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const text = await request.text();
    return text || undefined;
  }
  if (contentType.includes("multipart/form-data")) {
    return request.body;
  }
  const text = await request.text();
  return text || undefined;
}

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  // Next 已对每段做过 URL 解码，拼回时必须逐段重新编码，
  // 否则带斜杠的模型 ID（如 kimi%2Fkimi-k3）会被还原成多段路径导致后端 404
  const apiPath = "/" + path.map(encodeURIComponent).join("/");
  const search = request.nextUrl.search;

  try {
    const body = await readBody(request);
    const res = await fetch(`${BACKEND_URL}${apiPath}${search}`, {
      method: request.method,
      headers: forwardedHeaders(request),
      body,
      duplex: body instanceof ReadableStream ? "half" : undefined,
    } as RequestInit & { duplex?: "half" });

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    // Non-JSON (e.g. CSV/binary downloads): pass raw bytes through untouched so
    // the UTF-8 BOM and multi-byte characters (中文) survive intact.
    const buffer = await res.arrayBuffer();
    const passthroughHeaders: Record<string, string> = {
      "Content-Type": contentType || "application/octet-stream",
    };
    const disposition = res.headers.get("content-disposition");
    if (disposition) passthroughHeaders["Content-Disposition"] = disposition;
    return new NextResponse(buffer, {
      status: res.status,
      headers: passthroughHeaders,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Backend unavailable", code: "backend_unavailable" },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
