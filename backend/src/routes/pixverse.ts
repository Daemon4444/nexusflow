import { Router, Request, Response } from "express";
import { sanitizeUpstreamError } from "../utils/sanitize-error";
import { validateApiKey } from "../data/apikeys";
import { logUsage } from "../data/usage";
import { getUserById } from "../data/users";
import { getPixVerseRuntimeChannel } from "../services/pixverse-channel";
import { adaptPixVerseRequest, pollPixVerseTask } from "../services/adapters";
import { randomUUID } from "crypto";

const router = Router();

const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1";

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return auth.trim();
}

function getDashScopePixVerseModel(model: string): string {
  return model === "pixverse-v6" ? "pixverse/pixverse-v6-t2v" : model;
}

// ── 创建视频生成任务 ──────────────────────────────────────────────
async function handleVideoSynthesis(req: Request, res: Response) {
  const token = extractToken(req);
  const keyRecord = token ? await validateApiKey(token) : null;
  if (!token || !keyRecord) {
    res.status(401).json({ error: { message: "Invalid API key.", code: "invalid_api_key" } });
    return;
  }

  // 余额检查
  if (keyRecord.user_id) {
    const owner = await getUserById(keyRecord.user_id);
    if (owner && owner.balance <= 0) {
      res.status(402).json({
        error: { message: "Insufficient balance. Please recharge your account.", type: "billing_error", code: "insufficient_balance" },
      });
      return;
    }
  }

  const model = req.body.model || "pixverse-v6";
  const channel = await getPixVerseRuntimeChannel();

  const startTime = Date.now();

  if (channel.adapter === "pixverse") {
    // ── 走 PixVerse 官方 API ──
    const prompt = req.body.input?.prompt || req.body.prompt || "";
    const params = req.body.parameters || {};
    const adapted = adaptPixVerseRequest(channel.apiKey, {
      model,
      prompt,
      duration: params.duration || req.body.duration || 5,
      quality: params.resolution || params.quality || "540p",
      aspect_ratio: params.aspect_ratio || "16:9",
      negative_prompt: req.body.input?.negative_prompt || req.body.negative_prompt,
      seed: params.seed || req.body.seed,
    }, channel.apiBaseUrl);

    try {
      const response = await fetch(adapted.url, {
        method: adapted.method,
        headers: adapted.headers,
        body: JSON.stringify(adapted.body),
      });
      const data: any = await response.json();
      const latencyMs = Date.now() - startTime;

      await logUsage({
        apiKeyId: keyRecord.id,
        model,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        cost: 0, status: response.ok && data.ErrCode === 0 ? "success" : "error", latencyMs,
      });

      if (data.ErrCode !== 0) {
        res.status(400).json({
          error: { message: data.ErrMsg || "PixVerse request failed", code: "upstream_error" },
        });
        return;
      }

      // 返回 DashScope 兼容格式
      res.json({
        request_id: randomUUID(),
        output: {
          task_id: String(data.Resp?.video_id || ""),
          task_status: "PENDING",
        },
      });
    } catch (err: any) {
      await logUsage({ apiKeyId: keyRecord.id, model, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, status: "error", latencyMs: Date.now() - startTime });
      res.status(500).json({ error: { message: `Upstream request failed: ${sanitizeUpstreamError(err)}` } });
    }
  } else {
    // ── 走 DashScope（百炼）──
    const apiKey = channel.apiKey;
    if (!apiKey) {
      res.status(500).json({ error: { message: "DashScope API key not configured.", code: "upstream_error" } });
      return;
    }

    let dashBody: any;
    if (req.body.input) {
      dashBody = {
        model: getDashScopePixVerseModel(model),
        input: req.body.input,
        parameters: req.body.parameters || {},
      };
    } else {
      dashBody = {
        model: getDashScopePixVerseModel(model),
        input: { prompt: req.body.prompt || "" },
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

      await logUsage({
        apiKeyId: keyRecord.id, model,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        cost: 0, status: response.ok ? "success" : "error", latencyMs,
      });

      if (!response.ok) {
        res.status(response.status).json(data);
        return;
      }
      res.json(data);
    } catch (err: any) {
      await logUsage({ apiKeyId: keyRecord.id, model, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, status: "error", latencyMs: Date.now() - startTime });
      res.status(500).json({ error: { message: `Upstream request failed: ${sanitizeUpstreamError(err)}` } });
    }
  }
}

router.post("/text", handleVideoSynthesis);
router.post("/video-synthesis", handleVideoSynthesis);

// ── 图生视频（首帧）──────────────────────────────────────────────
async function handleImageToVideo(req: Request, res: Response) {
  const token = extractToken(req);
  const keyRecord = token ? await validateApiKey(token) : null;
  if (!token || !keyRecord) {
    res.status(401).json({ error: { message: "Invalid API key.", code: "invalid_api_key" } });
    return;
  }

  const model = req.body.model || "pixverse-v6";
  const channel = await getPixVerseRuntimeChannel();

  if (channel.adapter === "pixverse") {
    // 官方 API 暂时用文生视频端点 + img_url
    const prompt = req.body.input?.prompt || req.body.prompt || "";
    const imgUrl = req.body.input?.media?.[0]?.url || req.body.input?.image_url || req.body.image_url || "";
    const params = req.body.parameters || {};
    const adapted = adaptPixVerseRequest(channel.apiKey, {
      model,
      prompt,
      img_url: imgUrl,
      duration: params.duration || req.body.duration || 5,
      quality: params.resolution || "540p",
    }, channel.apiBaseUrl);

    try {
      const response = await fetch(adapted.url, {
        method: adapted.method,
        headers: adapted.headers,
        body: JSON.stringify(adapted.body),
      });
      const data: any = await response.json();
      await logUsage({ apiKeyId: keyRecord.id, model, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, status: data.ErrCode === 0 ? "success" : "error", latencyMs: Date.now() });

      if (data.ErrCode !== 0) {
        res.status(400).json({ error: { message: data.ErrMsg || "PixVerse request failed", code: "upstream_error" } });
        return;
      }
      res.json({
        request_id: randomUUID(),
        output: { task_id: String(data.Resp?.video_id || ""), task_status: "PENDING" },
      });
    } catch (err: any) {
      res.status(500).json({ error: { message: `Upstream request failed: ${sanitizeUpstreamError(err)}` } });
    }
  } else {
    // DashScope
    const apiKey = channel.apiKey;
    if (!apiKey) {
      res.status(500).json({ error: { message: "DashScope API key not configured.", code: "upstream_error" } });
      return;
    }

    const dashBody = req.body.input
      ? { model: getDashScopePixVerseModel(model), input: req.body.input, parameters: req.body.parameters || {} }
      : {
          model: getDashScopePixVerseModel(model),
          input: { prompt: req.body.prompt || "", image_url: req.body.image_url || "" },
          parameters: { size: req.body.size || "1280*720", duration: req.body.duration || 5 },
        };

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
      await logUsage({ apiKeyId: keyRecord.id, model, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, status: response.ok ? "success" : "error", latencyMs: Date.now() });
      res.status(response.status).json(data);
    } catch (err: any) {
      res.status(500).json({ error: { message: `Upstream request failed: ${sanitizeUpstreamError(err)}` } });
    }
  }
}

router.post("/image", handleImageToVideo);

// ── 查询任务状态 ─────────────────────────────────────────────────
router.get("/tasks/:taskId", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token || !await validateApiKey(token)) {
    res.status(401).json({ error: { message: "Invalid API key.", code: "invalid_api_key" } });
    return;
  }

  const taskId = req.params.taskId as string;
  const channel = await getPixVerseRuntimeChannel();

  try {
    if (channel.adapter === "pixverse") {
      // PixVerse 官方轮询
      const result = await pollPixVerseTask(channel.apiKey, taskId, channel.apiBaseUrl);
      if (result.status === "succeeded") {
        res.json({
          request_id: randomUUID(),
          output: {
            task_id: taskId,
            task_status: "SUCCEEDED",
            video_url: result.output?.video_url || "",
          },
        });
      } else if (result.status === "failed") {
        res.json({
          request_id: randomUUID(),
          output: {
            task_id: taskId,
            task_status: "FAILED",
            message: result.error || "Task failed",
          },
        });
      } else {
        res.json({
          request_id: randomUUID(),
          output: {
            task_id: taskId,
            task_status: "RUNNING",
          },
        });
      }
    } else {
      // DashScope 轮询
      const response = await fetch(`${DASHSCOPE_BASE}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${channel.apiKey}` },
      });
      const data: any = await response.json();
      res.status(response.status).json(data);
    }
  } catch (err: any) {
    res.status(500).json({ error: { message: `Upstream request failed: ${sanitizeUpstreamError(err)}` } });
  }
});

// 兼容旧路径
router.get("/status/:taskId", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token || !await validateApiKey(token)) {
    res.status(401).json({ error: { message: "Invalid API key.", code: "invalid_api_key" } });
    return;
  }

  const taskId = req.params.taskId as string;
  const channel = await getPixVerseRuntimeChannel();

  try {
    if (channel.adapter === "pixverse") {
      const result = await pollPixVerseTask(channel.apiKey, taskId, channel.apiBaseUrl);
      if (result.status === "succeeded") {
        res.json({ request_id: randomUUID(), output: { task_id: taskId, task_status: "SUCCEEDED", video_url: result.output?.video_url || "" } });
      } else if (result.status === "failed") {
        res.json({ request_id: randomUUID(), output: { task_id: taskId, task_status: "FAILED", message: result.error || "Task failed" } });
      } else {
        res.json({ request_id: randomUUID(), output: { task_id: taskId, task_status: "RUNNING" } });
      }
    } else {
      const response = await fetch(`${DASHSCOPE_BASE}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${channel.apiKey}` },
      });
      const data: any = await response.json();
      res.status(response.status).json(data);
    }
  } catch (err: any) {
    res.status(500).json({ error: { message: `Upstream request failed: ${sanitizeUpstreamError(err)}` } });
  }
});

export default router;
