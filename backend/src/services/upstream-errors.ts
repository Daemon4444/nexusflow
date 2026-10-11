/**
 * Upstream error bodies, made safe to show a customer.
 *
 * A 4xx from the provider almost always describes the customer's own request
 * ("max_tokens must be >= 16", "messages: role 'system' is not allowed").
 * Hiding it behind "Upstream API error" leaves the customer unable to fix
 * the call, so the provider's message is passed on after redaction: upstream
 * model ids become the public id, and request ids, URLs, key-shaped strings,
 * e-mail addresses and long numbers are removed. Authorization failures,
 * rate limits and 5xx stay generic: those are about our account, not theirs.
 */
import { rewriteUpstreamModelAliasText } from "../utils/upstream-model-aliases";

const MAX_MESSAGE_CHARS = 300;
/** Statuses whose message describes the caller's request. */
const CLIENT_ERROR_STATUSES = new Set([400, 404, 409, 413, 415, 422]);

function pickMessage(body: unknown): string | null {
  if (typeof body === "string") return body.trim() || null;
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, any>;
  const candidates = [
    b.error?.message,          // OpenAI / Anthropic: { error: { message } }
    typeof b.error === "string" ? b.error : undefined,
    b.message,                 // DashScope native: { code, message, request_id }
    Array.isArray(b.errors) ? b.errors[0]?.message : undefined,
    typeof b.detail === "string" ? b.detail : undefined,
  ];
  const found = candidates.find((value) => typeof value === "string" && value.trim());
  return found ? found.trim() : null;
}

export function redactUpstreamMessage(message: string, publicModelId: string, upstreamModelId?: string | null): string {
  let text = rewriteUpstreamModelAliasText(message, publicModelId);
  if (upstreamModelId && upstreamModelId !== publicModelId) text = text.split(upstreamModelId).join(publicModelId);
  text = text
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b(sk|ak|key|token)[-_][A-Za-z0-9_-]{8,}\b/gi, "[redacted]")
    .replace(/\bLTAI[A-Za-z0-9]{10,}\b/g, "[redacted]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\b(request[_ -]?id|req[_-]?id)\s*[:=]?\s*\S+/gi, "")
    .replace(/\b\d{8,}\b/g, "[n]")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS)}…` : text;
}

/**
 * The redacted provider message for a client-side rejection, or null when
 * the status is not a client error or the body carries no message.
 */
export function upstreamClientErrorMessage(
  status: number,
  body: unknown,
  ids: { publicModelId: string; upstreamModelId?: string | null }
): string | null {
  if (!CLIENT_ERROR_STATUSES.has(status)) return null;
  const message = pickMessage(body);
  if (!message) return null;
  const redacted = redactUpstreamMessage(message, ids.publicModelId, ids.upstreamModelId);
  return redacted || null;
}

/** Parses an upstream error body for logs and for upstreamClientErrorMessage. */
export function parseUpstreamErrorBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 2_000);
  }
}
