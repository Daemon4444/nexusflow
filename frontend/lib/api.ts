const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/proxy";

export async function fetchAPI(path: string, options?: RequestInit) {
  const { headers, ...restOptions } = options || {};
  const isFormData = typeof FormData !== "undefined" && restOptions.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...restOptions,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
  });

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await res.json();
    if (data && typeof data === "object") {
      return { ...data, ok: res.ok, status: res.status };
    }
    return data;
  }

  const text = await res.text();
  return {
    success: false,
    ok: res.ok,
    status: res.status,
    message: text || `Request failed with status ${res.status}`,
  };
}
