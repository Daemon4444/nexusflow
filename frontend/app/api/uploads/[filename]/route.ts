import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  if (
    !filename
    || filename.length > 255
    || !/^[A-Za-z0-9._-]+$/.test(filename)
    || filename === "."
    || filename === ".."
  ) {
    return Response.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/uploads/${encodeURIComponent(filename)}`,
      { signal: request.signal, redirect: "manual" }
    );

    if (!res.ok) {
      return Response.json(
        { error: res.status === 404 ? "File not found" : "File unavailable" },
        { status: res.status === 404 ? 404 : 502 }
      );
    }

    const headers = new Headers({
      "Content-Type": res.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${filename}"`,
    });
    for (const name of ["content-length", "etag", "last-modified"]) {
      const value = res.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(res.body, { status: 200, headers });
  } catch {
    return Response.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
