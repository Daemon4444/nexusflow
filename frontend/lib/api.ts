const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export async function fetchAPI(path: string, options?: RequestInit) {
  const { headers, ...restOptions } = options || {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...restOptions,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
  return res.json();
}
