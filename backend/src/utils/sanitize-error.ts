/**
 * Sanitize error messages for client responses.
 * Never expose internal hostnames, file paths, stack traces, or network details.
 *
 * Returns a user-safe message based on error type, or a generic fallback.
 */
export function sanitizeError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as any;
    if (e.name === "AbortError" || e.code === "ABORT_ERR") return "Request timed out.";
    if (e.code === "ECONNREFUSED") return "Service unavailable.";
    if (e.code === "ENOTFOUND") return "Service unreachable.";
    if (e.code === "ETIMEDOUT") return "Request timed out.";
    if (e.code === "ECONNRESET") return "Connection reset. Please try again.";
  }
  return "An internal error occurred. Please try again.";
}

/**
 * Sanitize upstream error messages (for proxy routes like v1, pixverse, tasks).
 * Same as sanitizeError but with upstream-specific wording.
 */
export function sanitizeUpstreamError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as any;
    if (e.name === "AbortError" || e.code === "ABORT_ERR") return "Upstream request timed out.";
    if (e.code === "ECONNREFUSED") return "Upstream service unavailable.";
    if (e.code === "ENOTFOUND") return "Upstream service unreachable.";
    if (e.code === "ETIMEDOUT") return "Upstream request timed out.";
    if (e.code === "ECONNRESET") return "Upstream connection reset. Please try again.";
  }
  return "An internal error occurred. Please try again.";
}
