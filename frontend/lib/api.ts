const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/proxy";

export async function fetchAPI(path: string, options?: RequestInit & { signal?: AbortSignal }) {
  const { headers, signal, ...restOptions } = options || {};
  const isFormData = typeof FormData !== "undefined" && restOptions.body instanceof FormData;

  // Combine caller's signal with a 30s timeout — abort whichever fires first
  const timeoutSignal = AbortSignal.timeout(30000);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  const res = await fetch(`${API_BASE}${path}`, {
    ...restOptions,
    signal: combinedSignal,
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
