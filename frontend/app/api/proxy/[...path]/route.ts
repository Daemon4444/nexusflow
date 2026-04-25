import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const apiPath = "/" + path.join("/");
  const search = request.nextUrl.search;
  
  try {
    const res = await fetch(`${BACKEND_URL}${apiPath}${search}`, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ success: false, error: "Backend unavailable" }, { status: 502 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const apiPath = "/" + path.join("/");
  
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}${apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ success: false, error: "Backend unavailable" }, { status: 502 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const apiPath = "/" + path.join("/");
  
  try {
    const res = await fetch(`${BACKEND_URL}${apiPath}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ success: false, error: "Backend unavailable" }, { status: 502 });
  }
}
