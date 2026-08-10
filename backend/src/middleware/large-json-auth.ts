import { NextFunction, Request, Response } from "express";
import express from "express";
import { inspectApiKey } from "../data/apikeys";
import { getTrustedClientIp } from "../utils/client-ip";
import { isProductionRuntime } from "../utils/runtime-safety";
import { logToSLS } from "../services/sls";
import {
  increaseRequestBodyAdmission,
  releaseRequestBodyAdmission,
  reserveRequestBodyAdmission,
  RequestBodyAdmissionReason,
} from "../services/request-body-admission";

export const BODY_ADMISSION_RELEASE = Symbol("bodyAdmissionRelease");
export const BODY_ADMISSION_CONTEXT = Symbol("bodyAdmissionContext");

type BodyAdmissionContext = {
  apiKeyId: string;
  userId: string | null;
  clientIp: string;
  leaseId: string;
  reservedBytes: number;
  dynamic: boolean;
};
type RequestWithAdmission = Request & {
  [BODY_ADMISSION_RELEASE]?: () => void;
  [BODY_ADMISSION_CONTEXT]?: BodyAdmissionContext;
};

const LARGE_JSON_BYTES = 50 * 1024 * 1024;
const STANDARD_JSON_BYTES = 1024 * 1024;
const DYNAMIC_ADMISSION_WINDOW_BYTES = 256 * 1024;
const largeJsonParser = express.json({
  limit: LARGE_JSON_BYTES,
  verify: verifyDeclaredJsonLength,
});
const standardJsonParser = express.json({
  limit: STANDARD_JSON_BYTES,
  verify: verifyDeclaredJsonLength,
});

function extractApiToken(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }

  const anthropicKey = req.headers["x-api-key"];
  if (typeof anthropicKey === "string" && anthropicKey.trim()) {
    return anthropicKey.trim();
  }

  return null;
}

function normalizedPublicPath(req: Request): string {
  const raw = req.originalUrl || req.path || "";
  return raw.split("?")[0].replace(/^\/v1/, "") || "/";
}

export function getPublicJsonBodyLimitBytes(req: Request): number {
  const path = normalizedPublicPath(req);
  return ["/chat/completions", "/responses", "/messages"].includes(path)
    ? LARGE_JSON_BYTES
    : STANDARD_JSON_BYTES;
}

export function verifyDeclaredJsonLength(
  req: Request,
  _res: Response,
  buffer: Buffer
): void {
  const raw = req.headers["content-length"];
  if (raw === undefined) return;
  const declared = typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(declared) || declared < 0 || buffer.length > declared) {
    const error = new Error("JSON body exceeds its declared Content-Length") as Error & {
      status?: number;
      type?: string;
    };
    error.status = 400;
    error.type = "entity.length.mismatch";
    throw error;
  }
}

export function parsePublicApiJson(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const parser = getPublicJsonBodyLimitBytes(req) === LARGE_JSON_BYTES
    ? largeJsonParser
    : standardJsonParser;
  const admittedRequest = req as RequestWithAdmission;
  const release = admittedRequest[BODY_ADMISSION_RELEASE];
  if (typeof release !== "function") {
    parser(req, res, next);
    return;
  }
  const admission = admittedRequest[BODY_ADMISSION_CONTEXT];
  if (admission?.dynamic) {
    void parseDynamicallyAdmittedJson(req, admission, getPublicJsonBodyLimitBytes(req))
      .then(() => {
        release();
        next();
      })
      .catch((error: unknown) => {
        release();
        if (error instanceof BodyAdmissionRejectedError) {
          sendBodyAdmissionRejection(req, res, admission, error.reason);
          return;
        }
        next(error);
      });
    return;
  }
  // The admission lease only guards the in-memory buffering of the JSON body;
  // release it as soon as parsing settles instead of holding it through the
  // (potentially minutes-long) upstream call and streamed response.
  parser(req, res, (error?: unknown) => {
    release();
    next(error);
  });
}

class BodyAdmissionRejectedError extends Error {
  constructor(public readonly reason: RequestBodyAdmissionReason) {
    super(`request-body admission rejected: ${reason}`);
  }
}

function requestBodyError(status: number, type: string, message: string): Error {
  return Object.assign(new Error(message), { status, type });
}

function decodeStrictJson(buffer: Buffer, req: Request): unknown {
  const contentType = String(req.headers["content-type"] || "");
  const charsetMatch = /charset\s*=\s*"?([^;"\s]+)/i.exec(contentType);
  const charset = (charsetMatch?.[1] || "utf-8").toLowerCase();
  if (!charset.startsWith("utf-")) {
    throw requestBodyError(415, "charset.unsupported", `unsupported charset ${charset}`);
  }

  let body: string;
  try {
    body = new TextDecoder(charset).decode(buffer);
  } catch {
    throw requestBodyError(415, "charset.unsupported", `unsupported charset ${charset}`);
  }
  if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);
  if (body.length === 0) return {};
  if (!/^[\x20\x09\x0a\x0d]*[\[{]/.test(body)) {
    throw Object.assign(new SyntaxError("strict JSON body must be an object or array"), {
      status: 400,
      type: "entity.parse.failed",
    });
  }
  try {
    return JSON.parse(body);
  } catch (error) {
    throw Object.assign(
      error instanceof SyntaxError ? error : new SyntaxError("malformed JSON"),
      { status: 400, type: "entity.parse.failed" }
    );
  }
}

function readDynamicallyAdmittedBody(
  req: Request,
  admission: BodyAdmissionContext,
  maxBytes: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
      req.removeListener("aborted", onAborted);
    };
    const drain = () => {
      // The response can be returned before a rejected client finishes its
      // upload. Drain without retaining bytes so the connection can close
      // cleanly; nginx still enforces the route's hard body-size ceiling.
      req.on("error", () => undefined);
      req.resume();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      drain();
      reject(error);
    };
    const onData = (value: Buffer | string) => {
      if (settled) return;
      req.pause();
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const nextTotal = totalBytes + chunk.length;
      if (nextTotal > maxBytes) {
        fail(requestBodyError(413, "entity.too.large", "request entity too large"));
        return;
      }

      void (async () => {
        if (nextTotal > admission.reservedBytes) {
          const targetBytes = Math.min(
            maxBytes,
            Math.ceil(nextTotal / DYNAMIC_ADMISSION_WINDOW_BYTES)
              * DYNAMIC_ADMISSION_WINDOW_BYTES
          );
          let admittedTargetBytes = targetBytes;
          let increase = await increaseRequestBodyAdmission({
            apiKeyId: admission.apiKeyId,
            clientIp: admission.clientIp,
            leaseId: admission.leaseId,
            deltaBytes: targetBytes - admission.reservedBytes,
          });
          // A 256 KiB look-ahead avoids a Redis round trip for every network
          // chunk. If only the speculative headroom exceeds a byte pool,
          // retry with the exact bytes already received so valid bodies near a
          // pool boundary are not rejected early.
          if (
            !increase.allowed
            && increase.reason.endsWith("_bytes")
            && targetBytes > nextTotal
          ) {
            admittedTargetBytes = nextTotal;
            increase = await increaseRequestBodyAdmission({
              apiKeyId: admission.apiKeyId,
              clientIp: admission.clientIp,
              leaseId: admission.leaseId,
              deltaBytes: nextTotal - admission.reservedBytes,
            });
          }
          if (!increase.allowed) throw new BodyAdmissionRejectedError(increase.reason);
          admission.reservedBytes = admittedTargetBytes;
        }
        totalBytes = nextTotal;
        chunks.push(chunk);
        if (!settled) req.resume();
      })().catch(fail);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks, totalBytes));
    };
    const onError = (error: Error) => fail(error);
    const onAborted = () => fail(requestBodyError(400, "request.aborted", "request aborted"));

    req.on("data", onData);
    req.once("end", onEnd);
    req.once("error", onError);
    req.once("aborted", onAborted);
  });
}

async function parseDynamicallyAdmittedJson(
  req: Request,
  admission: BodyAdmissionContext,
  maxBytes: number
): Promise<void> {
  const body = await readDynamicallyAdmittedBody(req, admission, maxBytes);
  req.body = decodeStrictJson(body, req);
}

function sendBodyAdmissionRejection(
  req: Request,
  res: Response,
  admission: BodyAdmissionContext,
  reason: RequestBodyAdmissionReason
): void {
  const unavailable = reason === "redis_unavailable" || reason === "lease_expired";
  logToSLS({
    apiKeyId: admission.apiKeyId,
    userId: admission.userId,
    status: "rejected",
    errorReason: `body_admission_${reason}`,
    clientIp: admission.clientIp,
    path: normalizedPublicPath(req),
    declaredBytes: admission.reservedBytes,
  });
  res.status(unavailable ? 503 : 429).json({
    error: {
      message: unavailable
        ? "Request-body admission control is temporarily unavailable."
        : `Too many concurrent or oversized request bodies (${reason}).`,
      type: unavailable ? "server_error" : "rate_limit_error",
      code: unavailable ? "body_admission_unavailable" : "body_admission_exceeded",
    },
  });
}

/**
 * Authenticate JSON-writing public API calls before express.json() buffers and
 * parses bodies up to 50 MB. GET/DELETE/OPTIONS calls have no large JSON body
 * and continue to their existing route-level authentication.
 */
export async function requireApiKeyBeforeLargeJson(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!["POST", "PUT", "PATCH"].includes(req.method)) {
    next();
    return;
  }

  const contentType = req.headers["content-type"] || "";
  if (!String(contentType).toLowerCase().includes("application/json")) {
    next();
    return;
  }

  try {
    const token = extractApiToken(req);
    const apiKey = token ? await inspectApiKey(token) : null;
    if (!apiKey) {
      if (req.path === "/messages") {
        res.status(401).json({
          type: "error",
          error: {
            type: "authentication_error",
            message: "Invalid API key provided.",
          },
        });
        return;
      }
      res.status(401).json({
        error: {
          message: "Invalid API key provided.",
          type: "invalid_request_error",
          code: "invalid_api_key",
        },
      });
      return;
    }

    const maxBytes = getPublicJsonBodyLimitBytes(req);
    const transferEncoding = req.headers["transfer-encoding"];
    const rawContentLength = req.headers["content-length"];
    const contentEncoding = req.headers["content-encoding"];
    if (
      isProductionRuntime()
      && contentEncoding
      && String(contentEncoding).toLowerCase() !== "identity"
    ) {
      res.status(415).json({
        error: {
          message: "Compressed JSON request bodies are not supported.",
          type: "invalid_request_error",
          code: "unsupported_content_encoding",
        },
      });
      return;
    }
    const transferCodings = transferEncoding === undefined
      ? []
      : Array.isArray(transferEncoding)
        ? transferEncoding.flatMap((value) => value.split(","))
        : String(transferEncoding).split(",");
    const normalizedTransferCodings = transferCodings
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (rawContentLength !== undefined && normalizedTransferCodings.length > 0) {
      res.status(400).json({
        error: {
          message: "Content-Length and Transfer-Encoding cannot be used together.",
          type: "invalid_request_error",
          code: "ambiguous_request_framing",
        },
      });
      return;
    }
    if (
      normalizedTransferCodings.length > 0
      && !(
        normalizedTransferCodings.length === 1
        && normalizedTransferCodings[0] === "chunked"
      )
    ) {
      res.status(400).json({
        error: {
          message: "Only chunked Transfer-Encoding is supported for JSON requests.",
          type: "invalid_request_error",
          code: "unsupported_transfer_encoding",
        },
      });
      return;
    }
    // HTTP/2 and streaming HTTP/1.1 clients may legitimately omit
    // Content-Length. They enter with a zero-byte lease and grow it in bounded
    // increments as bytes arrive; fixed-length requests retain exact up-front
    // admission. Both paths keep aggregate buffering bounded without turning
    // every small chunked request into a synthetic 50 MiB reservation.
    const declaredBytes = rawContentLength === undefined
      ? 0
      : typeof rawContentLength === "string" && /^\d+$/.test(rawContentLength)
        ? Number(rawContentLength)
        : Number.NaN;
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      res.status(400).json({
        error: {
          message: "Content-Length must be a non-negative integer.",
          type: "invalid_request_error",
          code: "invalid_content_length",
        },
      });
      return;
    }
    if (declaredBytes > maxBytes) {
      res.status(413).json({
        error: {
          message: "Request body too large.",
          type: "invalid_request_error",
          code: "payload_too_large",
        },
      });
      return;
    }

    const clientIp = getTrustedClientIp(req);
    const admission = await reserveRequestBodyAdmission({
      apiKeyId: apiKey.id,
      clientIp,
      declaredBytes,
    });
    if (!admission.allowed) {
      sendBodyAdmissionRejection(req, res, {
        apiKeyId: apiKey.id,
        userId: apiKey.user_id,
        clientIp,
        leaseId: "",
        reservedBytes: declaredBytes,
        dynamic: rawContentLength === undefined,
      }, admission.reason);
      return;
    }

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      void releaseRequestBodyAdmission({
        apiKeyId: apiKey.id,
        clientIp,
        leaseId: admission.leaseId,
      }).catch((error) => {
        console.warn(
          "[BodyAdmission] lease release failed:",
          error instanceof Error ? error.message : String(error)
        );
      });
    };
    (req as RequestWithAdmission)[BODY_ADMISSION_RELEASE] = release;
    (req as RequestWithAdmission)[BODY_ADMISSION_CONTEXT] = {
      apiKeyId: apiKey.id,
      userId: apiKey.user_id,
      clientIp,
      leaseId: admission.leaseId,
      reservedBytes: declaredBytes,
      dynamic: rawContentLength === undefined,
    };
    if (typeof res.once === "function") {
      // Backstop for requests that never reach parsePublicApiJson (e.g. the
      // socket dies mid-upload); the normal release happens after body parse.
      res.once("close", release);
    }
    next();
  } catch (error) {
    next(error);
  }
}
