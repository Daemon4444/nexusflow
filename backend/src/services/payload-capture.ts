/**
 * Full request/response capture (data return). Controlled by
 * payload_capture_users: a '*' row turns it on for everyone, a per-account
 * row overrides it (enabled = false opts out, archive_label renames the
 * archive directory). Sub-accounts are archived under their parent. Unlike the SLS telemetry it never truncates or
 * redacts: the request body and the exact bytes sent back to the client are
 * appended as one JSON line to a local hourly spool file, which
 * scripts/payload-capture-upload.sh encrypts and ships to R2.
 *
 * Capture must never affect the request: every failure is swallowed and
 * counted, and nothing here is awaited on the request path.
 */
import fs from "fs";
import path from "path";
import { db } from "../db/client";
import type { InferenceContext } from "../pipeline/context";

const CAPTURE_DIR = process.env.NF_PAYLOAD_CAPTURE_DIR || "/var/lib/nexusflow/payload-capture";
const REFRESH_MS = 60_000;
const NODE_ID = process.env.NEXUSFLOW_NODE_ID || process.env.HOSTNAME || "node";
/** Spool directory names come from the DB; keep them path-safe. */
const SAFE_LABEL = /^[A-Za-z0-9._-]{1,64}$/;

interface CaptureRule { enabled: boolean; label: string | null }
let rules = new Map<string, CaptureRule>(); // user_id or '*'
let loadedAt = 0;
let loading: Promise<void> | null = null;

export const payloadCaptureStats = { captured: 0, failed: 0 };

async function refresh(): Promise<void> {
  try {
    const result = await db.query<{ user_id: string; archive_label: string | null; enabled: boolean }>(
      "SELECT user_id, archive_label, enabled FROM payload_capture_users"
    );
    const next = new Map<string, CaptureRule>();
    for (const row of result.rows) {
      if (row.archive_label != null && !SAFE_LABEL.test(row.archive_label)) continue;
      next.set(row.user_id, { enabled: Boolean(row.enabled), label: row.archive_label });
    }
    rules = next;
  } catch (err: any) {
    // Keep the previous set: a DB blip must not silently stop the capture.
    console.error("[payload-capture] refresh failed:", err?.message || err);
  } finally {
    loadedAt = Date.now();
    loading = null;
  }
}

/** Archive directory for this caller, or null when capture is off for it. */
function labelFor(userId: string | null, parentUserId: string | null): string | null {
  if (Date.now() - loadedAt > REFRESH_MS && !loading) loading = refresh();
  const owner = parentUserId || userId;
  if (!owner) return null;
  // The most specific row decides whether to capture; the archive is always
  // the billing owner's, so a customer's sub-accounts land in one place.
  const rule = (userId && rules.get(userId)) || (parentUserId && rules.get(parentUserId)) || rules.get("*");
  if (!rule || !rule.enabled) return null;
  const label = rules.get(owner)?.label || owner;
  return SAFE_LABEL.test(label) ? label : null;
}

/** Loads the opt-in list at boot so the first requests are covered. */
export function warmPayloadCapture(): Promise<void> {
  loading = loading || refresh();
  return loading;
}

/** Beijing-time day and hour, matching how bills and usage are reported. */
function beijingParts(ms: number): { day: string; hour: string } {
  const iso = new Date(ms + 8 * 3600_000).toISOString();
  return { day: iso.slice(0, 10), hour: iso.slice(11, 13) };
}

// Appends to one file are chained so lines never interleave.
const writeChains = new Map<string, Promise<void>>();

function appendLine(file: string, line: string): void {
  const previous = writeChains.get(file) || Promise.resolve();
  const next = previous
    .then(async () => {
      await fs.promises.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await fs.promises.appendFile(file, line, { mode: 0o600 });
      payloadCaptureStats.captured += 1;
    })
    .catch((err) => {
      payloadCaptureStats.failed += 1;
      console.error("[payload-capture] write failed:", err?.message || err);
    });
  writeChains.set(file, next);
  void next.finally(() => {
    if (writeChains.get(file) === next) writeChains.delete(file);
  });
}

/**
 * Starts capturing this request if its caller opted in. Call right after
 * authentication, before anything is written to the response.
 */
export function beginPayloadCapture(ctx: InferenceContext): void {
  const caller = ctx.caller;
  if (!caller) return;
  const label = labelFor(caller.userId, caller.parentUserId);
  if (!label) return;

  let request: string;
  try {
    request = JSON.stringify(ctx.req.body ?? null);
  } catch {
    request = "null";
  }
  const res = ctx.res;
  const chunks: Buffer[] = [];
  const keep = (chunk: unknown, encoding?: unknown) => {
    if (chunk == null || typeof chunk === "function") return;
    try {
      chunks.push(Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as string, typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8"));
    } catch {
      // Unknown chunk type: the response still goes out unchanged.
    }
  };
  const write = res.write;
  const end = res.end;
  res.write = function (this: typeof res, chunk: any, ...rest: any[]) {
    keep(chunk, rest[0]);
    return (write as any).call(this, chunk, ...rest);
  } as typeof res.write;
  res.end = function (this: typeof res, chunk?: any, ...rest: any[]) {
    keep(chunk, rest[0]);
    return (end as any).call(this, chunk, ...rest);
  } as typeof res.end;

  let done = false;
  res.once("close", () => {
    if (done) return;
    done = true;
    const finishedAt = Date.now();
    const { day, hour } = beijingParts(ctx.startTime);
    const record = {
      log_id: ctx.logId,
      user_id: caller.userId,
      parent_user_id: caller.parentUserId,
      api_key_id: caller.apiKeyId,
      route: ctx.route,
      model: ctx.modelId || (ctx.req.body && typeof ctx.req.body.model === "string" ? ctx.req.body.model : null),
      node_id: NODE_ID,
      started_at: new Date(ctx.startTime).toISOString(),
      finished_at: new Date(finishedAt).toISOString(),
      http_status: res.statusCode,
      client_closed: ctx.clientClosed || !res.writableFinished,
      content_type: String(res.getHeader("content-type") || ""),
      request: "__REQUEST__",
      response: Buffer.concat(chunks).toString("utf8"),
    };
    // The request is already serialized: splice it in instead of re-encoding.
    const line = JSON.stringify(record).replace('"request":"__REQUEST__"', () => `"request":${request}`) + "\n";
    appendLine(path.join(CAPTURE_DIR, label, day, `${hour}-${NODE_ID}.jsonl`), line);
  });
}
