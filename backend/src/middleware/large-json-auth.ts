import { NextFunction, Request, Response } from "express";
import express from "express";
import { inspectApiKey } from "../data/apikeys";
import { getTrustedClientIp } from "../utils/client-ip";
import { isProductionRuntime } from "../utils/runtime-safety";
import {
  releaseRequestBodyAdmission,
  reserveRequestBodyAdmission,
} from "../services/request-body-admission";

const LARGE_JSON_BYTES = 50 * 1024 * 1024;
const STANDARD_JSON_BYTES = 1024 * 1024;
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
  parser(req, res, next);
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
    if (isProductionRuntime() && (transferEncoding || rawContentLength === undefined)) {
      res.status(411).json({
        error: {
          message: "A valid Content-Length header is required for JSON requests.",
          type: "invalid_request_error",
          code: "content_length_required",
        },
      });
      return;
    }
    const declaredBytes = rawContentLength === undefined
      ? maxBytes
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
      const unavailable = admission.reason === "redis_unavailable";
      res.status(unavailable ? 503 : 429).json({
        error: {
          message: unavailable
            ? "Request-body admission control is temporarily unavailable."
            : "Too many concurrent or oversized request bodies.",
          type: unavailable ? "server_error" : "rate_limit_error",
          code: unavailable ? "body_admission_unavailable" : "body_admission_exceeded",
        },
      });
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
    if (typeof res.once === "function") {
      res.once("finish", release);
      res.once("close", release);
    }
    next();
  } catch (error) {
    next(error);
  }
}
