import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const MAX_UPLOAD_REQUEST_BYTES = 101 * 1024 * 1024;
const MAX_UPLOAD_RESPONSE_BYTES = 256 * 1024;

type UploadResponse = {
  success?: boolean;
  data?: {
    filename?: unknown;
    url?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function uploadError(status: number, message: string, code: string) {
  return NextResponse.json({ success: false, message, code }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ") || auth.length > 8_192) {
    return uploadError(401, "上传需要有效凭证", "upload_auth_required");
  }
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return uploadError(415, "上传必须使用 multipart/form-data", "invalid_upload_content_type");
  }
  const rawLength = request.headers.get("content-length");
  if (!rawLength) {
    return uploadError(411, "上传必须提供 Content-Length", "upload_length_required");
  }
  if (!/^\d+$/.test(rawLength)) {
    return uploadError(400, "Content-Length 无效", "invalid_content_length");
  }
  const contentLength = Number(rawLength);
  if (!Number.isSafeInteger(contentLength) || contentLength > MAX_UPLOAD_REQUEST_BYTES) {
    return uploadError(413, "上传请求过大", "upload_body_too_large");
  }
  if (!request.body) {
    return uploadError(400, "未收到上传内容", "upload_body_missing");
  }

  try {
    const headers = new Headers({
      Authorization: auth,
      "Content-Type": contentType,
      "Content-Length": String(contentLength),
    });
    const realIp = request.headers.get("x-real-ip")?.trim() || "";
    if (isIP(realIp)) headers.set("X-Real-IP", realIp);
    const res = await fetch(`${BACKEND_URL}/api/upload`, {
      method: "POST",
      headers,
      body: request.body,
      signal: request.signal,
      redirect: "manual",
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const responseLength = Number(res.headers.get("content-length") || "0");
    if (Number.isFinite(responseLength) && responseLength > MAX_UPLOAD_RESPONSE_BYTES) {
      return uploadError(502, "上传服务响应异常", "upload_response_too_large");
    }
    const raw = await res.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_UPLOAD_RESPONSE_BYTES) {
      return uploadError(502, "上传服务响应异常", "upload_response_too_large");
    }
    let data: UploadResponse;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return uploadError(502, "上传服务响应异常", "invalid_upload_response");
      }
      data = parsed as UploadResponse;
    } catch {
      return uploadError(502, "上传服务响应异常", "invalid_upload_response");
    }

    if (data.success && data.data?.filename) {
      data.data.url = `/api/uploads/${encodeURIComponent(String(data.data.filename))}`;
    }
    return NextResponse.json(data, {
      status: res.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return uploadError(502, "上传服务暂不可用", "upload_backend_unavailable");
  }
}
