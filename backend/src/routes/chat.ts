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
      message: "请使用有效的 API Key 或登录会话。",
      code: "invalid_credential",
    });
    return;
  }

  res.status(410).json({
    success: false,
    message: "该旧接口已停用。API 调用请使用 /v1/chat/completions，Playground 请使用 /api/playground/chat/completions。",
    code: "legacy_endpoint_disabled",
  });
});

export default router;
