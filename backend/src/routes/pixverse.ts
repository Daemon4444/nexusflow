import { Router, Request, Response } from "express";
import { validateApiKey } from "../data/apikeys";
import { logUsage } from "../data/usage";
import { getUserById } from "../data/users";

const router = Router();

/*
 * 上游：阿里云百炼 DashScope
 * 文档：https://help.aliyun.com/zh/model-studio/pixverse-text-to-video-api-reference
 */
const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1";

function getDashScopeKey(): string {
  return process.env.DASHSCOPE_API_KEY || "";
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return auth.trim();
}

// ── 创建视频生成任务 ──────────────────────────────────────────────
// POST /v1/video/text          (简洁路径)
// POST /v1/video/video-synthesis (兼容百炼路径 /v1/services/aigc/video-generation/video-synthesis)
async function handleVideoSynthesis(req: Request, res: Response) {
  const token = extractToken(req);
  const keyRecord = token ? validateApiKey(token) : null;
  if (!token || !keyRecord) {
    res.status(401).json({ error: { message: "Invalid API key.", code: "invalid_api_key" } });
    return;
  }

  // 余额检查
  if (keyRecord.user_id) {
    const owner = getUserById(keyRecord.user_id);
    if (owner && owner.balance <= 0) {
      res.status(402).json({
        error: { message: "Insufficient balance. Please recharge your account.", type: "billing_error", code: "insufficient_balance" },
      });
      return;
    }
  }

  const apiKey = getDashScopeKey();
  if (!apiKey) {
    res.status(500).json({ error: { message: "DashScope API key not configured.", code: "upstream_error" } });
    return;
  }

  // 兼容两种请求格式:
  // 1. 百炼格式: { model, input: { prompt }, parameters: { size, duration, ... } }
  // 2. 简洁格式: { model, prompt, size, duration, ... }
  let model: string;
  let dashBody: any;

  if (req.body.input) {
    // 百炼格式 — 直接透传
    model = req.body.model || "pixverse/pixverse-v5.6-t2v";
    dashBody = {
      model,
      input: req.body.input,
      parameters: req.body.parameters || {},
    };
  } else {
    // 简洁格式 — 转成百炼格式
    model = req.body.model || "pixverse/pixverse-v5.6-t2v";
    dashBody = {
      model,
      input: {
        prompt: req.body.prompt || "",
      },
      parameters: {
        size: req.body.size || "1280*720",
        duration: req.body.duration || 5,
        audio: req.body.audio ?? false,
        watermark: req.body.watermark ?? false,
      },
    };
    if (req.body.seed !== undefined) dashBody.parameters.seed = req.body.seed;
    if (req.body.negative_prompt) dashBody.input.negative_prompt = req.body.negative_prompt;
  }

  const startTime = Date.now();
  try {
    const response = await fetch(`${DASHSCOPE_BASE}/services/aigc/video-generation/video-synthesis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify(dashBody),
    });

    const data: any = await response.json();
    const latencyMs = Date.now() - startTime;

    logUsage({
      apiKeyId: keyRecord.id,
      model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      status: response.ok ? "success" : "error",
      latencyMs,
    });

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.json(data);
  } catch (err: any) {
    logUsage({
      apiKeyId: keyRecord.id,
      model,
      promptTokens: 0, completionTokens: 0, totalTokens: 0,
      cost: 0, status: "error", latencyMs: Date.now() - startTime,
    });
    res.status(500).json({ error: { message: `Upstream request failed: ${err.message}` } });
  }
}

router.post("/text", handleVideoSynthesis);
router.post("/video-synthesis", handleVideoSynthesis);

// ── 图生视频（首帧）──────────────────────────────────────────────
async function handleImageToVideo(req: Request, res: Response) {
  const token = extractToken(req);
  const keyRecord = token ? validateApiKey(token) : null;
  if (!token || !keyRecord) {
    res.status(401).json({ error: { message: "Invalid API key.", code: "invalid_api_key" } });
    return;
  }

  const apiKey = getDashScopeKey();
  if (!apiKey) {
    res.status(500).json({ error: { message: "DashScope API key not configured.", code: "upstream_error" } });
    return;
  }

  const model = req.body.model || "pixverse/pixverse-v5.6-i2v";
  const dashBody = req.body.input
    ? { model, input: req.body.input, parameters: req.body.parameters || {} }
    : {
        model,
        input: {
          prompt: req.body.prompt || "",
          image_url: req.body.image_url || "",
        },
        parameters: {
          size: req.body.size || "1280*720",
          duration: req.body.duration || 5,
        },
      };

  const startTime = Date.now();
  try {
    const response = await fetch(`${DASHSCOPE_BASE}/services/aigc/video-generation/video-synthesis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify(dashBody),
    });
    const data: any = await response.json();
    logUsage({ apiKeyId: keyRecord.id, model, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, status: response.ok ? "success" : "error", latencyMs: Date.now() - startTime });
    res.status(response.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: { message: `Upstream request failed: ${err.message}` } });
  }
}

router.post("/image", handleImageToVideo);

// ── 查询任务状态 ─────────────────────────────────────────────────
// GET /v1/video/tasks/:taskId
// GET /v1/tasks/:taskId (通过 index.ts 的 tasksRouter)
router.get("/tasks/:taskId", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token || !validateApiKey(token)) {
    res.status(401).json({ error: { message: "Invalid API key.", code: "invalid_api_key" } });
    return;
  }

  const apiKey = getDashScopeKey();
  if (!apiKey) {
    res.status(500).json({ error: { message: "DashScope API key not configured.", code: "upstream_error" } });
    return;
  }

  try {
    const response = await fetch(`${DASHSCOPE_BASE}/tasks/${req.params.taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data: any = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: { message: `Upstream request failed: ${err.message}` } });
  }
});

// 兼容旧路径 GET /v1/video/status/:taskId
router.get("/status/:taskId", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token || !validateApiKey(token)) {
    res.status(401).json({ error: { message: "Invalid API key.", code: "invalid_api_key" } });
    return;
  }

  const apiKey = getDashScopeKey();
  if (!apiKey) {
    res.status(500).json({ error: { message: "DashScope API key not configured.", code: "upstream_error" } });
    return;
  }

  try {
    const response = await fetch(`${DASHSCOPE_BASE}/tasks/${req.params.taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data: any = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: { message: `Upstream request failed: ${err.message}` } });
  }
});

export default router;
