import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    // Get the form data from the request
    const formData = await request.formData();

    // Forward to backend
    const auth = request.headers.get("authorization");
    const res = await fetch(`${BACKEND_URL}/api/upload`, {
      method: "POST",
      headers: auth ? { Authorization: auth } : undefined,
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    // Convert backend URL to frontend accessible URL
    // Backend returns: http://localhost:3001/api/uploads/{filename}
    // Frontend needs: /api/uploads/{filename}
    if (data.success && data.data?.url) {
      const filename = data.data.url.split("/").pop();
      data.data.url = `/api/uploads/${filename}`;
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json(
      { success: false, message },
      { status: 502 }
    );
  }
}
