import { fetchAPI } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import type { Paginated, Pagination } from "./contracts";

export class AdminApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

type AdminRequestOptions = RequestInit & { signal?: AbortSignal };

export async function adminRequest<T>(path: string, options: AdminRequestOptions = {}): Promise<T> {
  const result = await fetchAPI(path, {
    ...options,
    headers: {
      ...authHeaders(),
      ...options.headers,
    },
  });

  if (!result?.success) {
    const status = Number(result?.status || 500);
    const nestedError = result?.error && typeof result.error === "object"
      ? result.error as { message?: unknown; code?: unknown }
      : null;
    const message = typeof result?.message === "string"
      ? result.message
      : typeof nestedError?.message === "string"
        ? nestedError.message
        : status === 403
          ? "没有权限执行此操作"
          : "请求失败";
    const code = typeof result?.code === "string"
      ? result.code
      : typeof nestedError?.code === "string"
        ? nestedError.code
        : undefined;
    if (status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("nexusflow:admin-session-expired"));
    }
    throw new AdminApiError(message, status, code);
  }

  return result.data as T;
}

export function adminGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return adminRequest<T>(path, { method: "GET", signal });
}

export function adminPost<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return adminRequest<T>(path, {
    method: "POST",
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function extractItems<T>(
  payload: T[] | Paginated<T> | { items?: T[]; rows?: T[]; data?: T[]; pagination?: Partial<Pagination>; page?: number; pageSize?: number; total?: number },
  fallbackPage = 1,
  fallbackPageSize = 20
): Paginated<T> {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      pagination: {
        page: fallbackPage,
        pageSize: fallbackPageSize,
        total: payload.length,
        totalPages: Math.max(1, Math.ceil(payload.length / fallbackPageSize)),
      },
    };
  }

  const objectPayload = payload as {
    items?: T[];
    rows?: T[];
    data?: T[];
    pagination?: Partial<Pagination>;
    page?: number;
    pageSize?: number;
    total?: number;
  };
  const items = objectPayload.items || objectPayload.rows || objectPayload.data || [];
  const page = Number(objectPayload.pagination?.page ?? objectPayload.page ?? fallbackPage);
  const pageSize = Number(objectPayload.pagination?.pageSize ?? objectPayload.pageSize ?? fallbackPageSize);
  const total = Number(objectPayload.pagination?.total ?? objectPayload.total ?? items.length);
  const totalPages = Number(objectPayload.pagination?.totalPages ?? Math.max(1, Math.ceil(total / Math.max(1, pageSize))));

  return {
    items,
    pagination: { page, pageSize, total, totalPages },
    page,
    pageSize,
    total,
  };
}

export function appendQuery(path: string, params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
