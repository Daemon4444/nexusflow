import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  try {
    const res = await fetch(`${BACKEND_URL}/api/uploads/${filename}`);

    if (!res.ok) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Get content type from response
    const contentType = res.headers.get("content-type") || "application/octet-stream";

    // Get the file data
    const data = await res.arrayBuffer();

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}