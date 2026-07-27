import { NextFunction, Request, Response } from "express";
import { inspectApiKey } from "../data/apikeys";

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
    next();
  } catch (error) {
    next(error);
  }
}
