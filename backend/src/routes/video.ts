/**
 * Video Generation API (for Playground)
 * 
 * Supports both:
 * - DashScope video models (wanx / wan2.6 / happyhorse)
 * - PixVerse models (pixverse-v4.5, etc.)
 */

import { Router, Request, Response } from "express";
import { models } from "../data/models";
import { validateApiKey } from "../data/apikeys";
import { validateSession } from "../data/users";
import {
  createTask,
  getTaskById,
  setUpstreamTaskId,
  completeTask,
  failTask,
  updateTaskStatus
} from "../data/tasks";
import { selectProvider, acquireConcurrency, recordSuccess, recordFailure } from "../services/scheduler";
import { getProviderById } from "../data/providers";
import { billAsyncError, billAsyncSuccess, estimateDiscountedAsyncCost, hasEnoughBalance } from "../services/async-billing";
import { getEffectiveRateLimit } from "../data/ratelimits";
import { checkRPM } from "../services/rate-limiter";
import {
  adaptVideoRequest,
  adaptHappyHorseRequest,
  adaptPixVerseRequest,
  pollDashScopeTask,
  pollPixVerseTask,
} from "../services/adapters";

const router = Router();

type Caller = {
  userId: string | null;
  apiKeyId: string | null;
  errorIdentity: { id: string | null; user_id: string | null } | null;
};

function getDashScopeKey(): string {
  return process.env.DASHSCOPE_API_KEY || "";
}

function getPixVerseKey(): string {
  return process.env.PIXVERSE_API_KEY || "";
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function authenticateCaller(req: Request): Promise<Caller | null> {
  const token = extractToken(req);
  if (!token) return null;

  const apiKeyRecord = await validateApiKey(token);
  if (apiKeyRecord) {
    return {
      userId: apiKeyRecord.user_id,
      apiKeyId: apiKeyRecord.id,
      errorIdentity: apiKeyRecord,
    };
  }

  const session = await validateSession(token);
  if (session) {
    return {
      userId: session.id,
      apiKeyId: null,
      errorIdentity: { id: null, user_id: session.id },
    };
  }

  return null;
}

async function canAccessTask(req: Request, taskUserId: string | null, taskApiKeyId: string | null): Promise<boolean> {
  const token = extractToken(req);
  if (!token) return false;
  const apiKeyRecord = await validateApiKey(token);
  if (apiKeyRecord) {
    return (!!taskApiKeyId && apiKeyRecord.id === taskApiKeyId) || (!!taskUserId && apiKeyRecord.user_id === taskUserId);
  }
  const session = await validateSession(token);
  return !!session && !!taskUserId && session.id === taskUserId;
}

// Submit video generation task. Mounted as /api/video/generate and
// /v1/videos/generations for clients that expect an OpenAI-style video path.
const handleGenerate = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { 
    model: modelId, prompt, duration, aspect_ratio, quality, negative_prompt, size,
    img_url, img_urls, video_url, resolution, ratio, audio, audio_setting, seed, watermark,
    style, camera_movement, water_mark, audio_url, shot_type, motion_mode, prompt_extend
  } = req.body;

  if (!modelId) {
    res.status(400).json({ success: false, message: "Please provide a model ID" });
    return;
  }

  // HappyHorse video-edit doesn't strictly require prompt at creation
  const isHappyHorse = modelId.startsWith("happyhorse-");
  if (!isHappyHorse && !prompt) {
    res.status(400).json({ success: false, message: "Please provide a prompt" });
    return;
  }

  const caller = await authenticateCaller(req);
  if (!caller) {
    res.status(401).json({ success: false, message: "Please log in or provide a valid API Key" });
    return;
  }

  const model = models.find((m) => m.id === modelId);
  if (!model || model.category !== "Video Generation") {
    res.status(404).json({ success: false, message: "Video generation model not found" });
    return;
  }

  if (caller.userId) {
    const userLimits = await getEffectiveRateLimit(caller.userId, modelId);
    const rpmCheck = await checkRPM(`user:${caller.userId}:${modelId}`, userLimits.qpm);
    if (!rpmCheck.allowed) {
      res.status(429).json({ success: false, message: `Model QPM rate limit triggered: ${userLimits.qpm}/min, please retry in ${Math.ceil(rpmCheck.resetMs / 1000)} seconds` });
      return;
    }
  }

  const estimatedCost = await estimateDiscountedAsyncCost(caller.userId, model, { duration, quality, resolution, audio, audio_setting });
  if (!(await hasEnoughBalance(caller.userId, estimatedCost))) {
    res.status(402).json({ success: false, message: "Insufficient balance, please recharge" });
    return;
  }

  // Select provider via scheduler
  const selected = await selectProvider(modelId, { userId: caller.userId });
  if (!selected) {
    res.status(503).json({ success: false, message: "No available channel currently" });
    return;
  }
  const apiKey = selected.apiKey;
  acquireConcurrency(selected.providerId, modelId);

  if ((modelId.includes("-i2v") || modelId.includes("-r2v")) && !img_url && !img_urls?.length) {
    res.status(400).json({
      success: false,
      message: `${modelId} requires img_url or img_urls`,
    });
    return;
  }

  if (modelId === "happyhorse-1.0-video-edit" && !video_url) {
    res.status(400).json({
      success: false,
      message: `${modelId} requires video_url`,
    });
    return;
  }

  const isPixVerseOfficial = selected.apiBaseUrl.includes("pixverse.ai");

  // Create internal task record
  const task = await createTask({
    userId: caller.userId,
    apiKeyId: caller.apiKeyId,
    type: "video",
    model: modelId,
    provider: selected.providerId,
    input: { prompt, duration, aspect_ratio, quality, negative_prompt, size, img_url, img_urls, video_url, resolution, ratio, audio, audio_setting, seed, watermark, style, camera_movement, water_mark, audio_url, shot_type, motion_mode, prompt_extend },
  });

  // Build request based on provider
  try {
    let adapted;
    if (isPixVerseOfficial) {
      adapted = adaptPixVerseRequest(apiKey, {
        model: modelId,
        prompt,
        duration,
        aspect_ratio: ratio || aspect_ratio,
        quality: resolution || quality,
        negative_prompt,
        img_url,
        motion_mode,
        seed,
        style,
        camera_movement,
        water_mark: water_mark ?? watermark,
        audio,
      }, selected.apiBaseUrl);
    } else if (isHappyHorse) {
      adapted = adaptHappyHorseRequest(apiKey, {
        model: modelId,
        prompt: prompt || "",
        resolution,
        ratio,
        duration,
        seed,
        watermark,
        img_url,
        img_urls,
        video_url,
        audio_setting,
      });
    } else {
      adapted = adaptVideoRequest(apiKey, {
        model: modelId,
        prompt,
        negative_prompt,
        size: size || "1280*720",
        resolution,
        duration: duration || 5,
        img_url: modelId.includes("i2v") ? img_url : undefined,
        img_urls: modelId.includes("r2v") ? (img_urls || (img_url ? [img_url] : undefined)) : undefined,
        video_url: modelId.includes("r2v") ? video_url : undefined,
        prompt_extend: prompt_extend !== undefined ? prompt_extend : true,
        seed,
        watermark,
        audio,
        audio_url,
        shot_type,
      });
    }

    const response = await fetch(adapted.url, {
      method: adapted.method,
      headers: adapted.headers,
      body: JSON.stringify(adapted.body),
    });

    const data: any = await response.json();

    // Handle official PixVerse API response
    if (isPixVerseOfficial) {
      if (data.ErrCode !== 0) {
        recordFailure(selected.providerId, modelId, data.ErrMsg || "Video generation failed");
        await failTask(task.id, data.ErrMsg || "Video generation failed");
        await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime);
        res.status(400).json({
          success: false,
          message: data.ErrMsg || "Video generation failed",
        });
        return;
      }

      recordSuccess(selected.providerId, modelId, Date.now() - startTime);
      const upstreamId = data.Resp?.video_id || data.Resp?.task_id;
      if (upstreamId) {
        await setUpstreamTaskId(task.id, String(upstreamId));
      }

      res.json({
        success: true,
        data: {
          task_id: task.id,
          upstream_task_id: upstreamId,
        },
      });
      return;
    }

    // Handle DashScope response
    if (!response.ok || data.code) {
      const errorMsg = data.message || `HTTP ${response.status}`;
      recordFailure(selected.providerId, modelId, errorMsg);
      await failTask(task.id, errorMsg);
      await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime);
      res.status(response.status || 400).json({
        success: false,
        message: errorMsg,
        detail: data,
      });
      return;
    }

    recordSuccess(selected.providerId, modelId, Date.now() - startTime);

    if (data.output?.task_id) {
      await setUpstreamTaskId(task.id, data.output.task_id);
    }

    res.json({
      success: true,
      data: {
        task_id: task.id,
        upstream_task_id: data.output?.task_id,
        task_status: data.output?.task_status,
      },
    });

  } catch (err: any) {
    recordFailure(selected.providerId, modelId, err.message);
    await failTask(task.id, err.message);
    await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime);
    res.status(500).json({
      success: false,
      message: `Request failed: ${err.message}`,
    });
  }
};

router.post("/generate", handleGenerate);
router.post("/generations", handleGenerate);

// GET /api/video/status/:taskId - Get video generation status
router.get("/status/:taskId", async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  
  // First try to find our internal task
  const task = await getTaskById(taskId);
  
  if (task) {
    if (!(await canAccessTask(req, task.user_id, task.api_key_id))) {
      res.status(403).json({ success: false, message: "No permission to view this task" });
      return;
    }

    // Use our task system
    if (task.status === "succeeded" || task.status === "failed") {
      res.json({
        success: true,
        data: {
          task_id: task.id,
          status: task.status === "succeeded" ? "successful" : "failed",
          video_url: task.output?.video_url,
          error: task.error_message,
        },
      });
      return;
    }

    if (!task.upstream_task_id) {
      res.json({
        success: true,
        data: { task_id: task.id, status: "pending" },
      });
      return;
    }

    // Poll upstream
    try {
      let pollApiKey: string;
      let isPixVerseOfficialPoll: boolean;

      if (task.provider.includes(":")) {
        // Backward compatibility: old format "pixverse:channelId:adapter"
        const [, , adapter] = task.provider.split(":");
        isPixVerseOfficialPoll = adapter === "pixverse";
        pollApiKey = isPixVerseOfficialPoll ? getPixVerseKey() : getDashScopeKey();
      } else {
        const providerRecord = await getProviderById(task.provider);
        if (!providerRecord) {
          res.status(500).json({ success: false, message: "Channel configuration not found" });
          return;
        }
        pollApiKey = providerRecord.api_key;
        isPixVerseOfficialPoll = providerRecord.api_base_url.includes("pixverse.ai");
      }

      const result = isPixVerseOfficialPoll
        ? await pollPixVerseTask(pollApiKey, task.upstream_task_id)
        : await pollDashScopeTask(pollApiKey, task.upstream_task_id);

      if (result.status === "succeeded") {
        const model = models.find((m) => m.id === task.model);
        const cost = model ? await estimateDiscountedAsyncCost(task.user_id, model, task.input || {}) : 0;
        await completeTask(task.id, result.output, cost);
        if (model) await billAsyncSuccess(task, model, cost, Date.now() - new Date(task.created_at).getTime());
        res.json({
          success: true,
          data: {
            task_id: task.id,
            status: "successful",
            video_url: result.output?.video_url,
          },
        });
      } else if (result.status === "failed") {
        await failTask(task.id, result.error || "Task failed");
        await billAsyncError(task.user_id || task.api_key_id ? { id: task.api_key_id, user_id: task.user_id } : null, task.model, Date.now() - new Date(task.created_at).getTime());
        res.json({
          success: true,
          data: {
            task_id: task.id,
            status: "failed",
            error: result.error,
          },
        });
      } else {
        await updateTaskStatus(task.id, result.status, result.progress || 0);
        res.json({
          success: true,
          data: {
            task_id: task.id,
            status: result.status === "running" ? "processing" : "pending",
            progress: result.progress,
          },
        });
      }
      return;

    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: `Query failed: ${err.message}`,
      });
      return;
    }
  }

  // Fallback: treat taskId as direct PixVerse/DashScope task ID (legacy support)
  if (!(await authenticateCaller(req))) {
    res.status(401).json({ success: false, message: "Please log in or provide a valid API Key" });
    return;
  }

  const pixVerseKey = getPixVerseKey();
  const dashScopeKey = getDashScopeKey();

  // Try PixVerse first (legacy behavior)
  if (pixVerseKey) {
    try {
      const result = await pollPixVerseTask(pixVerseKey, taskId);
      res.json({
        success: true,
        data: {
          task_id: taskId,
          status: result.status === "succeeded" ? "successful" 
            : result.status === "failed" ? "failed"
            : result.status === "running" ? "processing" : "pending",
          video_url: result.output?.video_url,
          error: result.error,
        },
      });
      return;
    } catch {}
  }

  // Try DashScope
  if (dashScopeKey) {
    try {
      const result = await pollDashScopeTask(dashScopeKey, taskId);
      res.json({
        success: true,
        data: {
          task_id: taskId,
          status: result.status === "succeeded" ? "successful"
            : result.status === "failed" ? "failed"
            : result.status === "running" ? "processing" : "pending",
          video_url: result.output?.video_url,
          error: result.error,
        },
      });
      return;
    } catch {}
  }

  res.status(404).json({
    success: false,
    message: "Task not found",
  });
});

export default router;
