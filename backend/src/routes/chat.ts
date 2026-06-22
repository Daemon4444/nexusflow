import { Router, Request, Response } from "express";
import { validateApiKey } from "../data/apikeys";
import { validateSession } from "../data/users";

const router = Router();

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function hasValidCredential(req: Request): Promise<boolean> {
  const token = extractToken(req);
  if (!token) return false;
  return !!(await validateApiKey(token)) || !!(await validateSession(token));
}

// Legacy endpoint kept only to return an explicit deprecation response.
// Use /v1/chat/completions for API-key calls, or /api/playground/chat/completions for session playground calls.
router.post("/completions", async (req: Request, res: Response) => {
  if (!(await hasValidCredential(req))) {
    res.status(401).json({
      success: false,
      message: "Please use a valid API Key or login session.",
      code: "invalid_credential",
    });
    return;
  }

  res.status(410).json({
    success: false,
    message: "This legacy endpoint has been disabled. For API calls use /v1/chat/completions, for Playground use /api/playground/chat/completions.",
    code: "legacy_endpoint_disabled",
  });
});

export default router;
