/**
 * Async Tasks API
 * 
 * Unified interface for async generation tasks (image, video):
 * - POST /v1/tasks - Submit a new task
 * - GET /v1/tasks/:id - Get task status and result
 * - GET /v1/tasks - List recent tasks (for user)
 */

import { Router, Request, Response } from "express";
import { models } from "../data/models";
import { validateApiKey } from "../data/apikeys";
import { getUserById } from "../data/users";
import { 
  createTask, 
  getTaskById, 
  setUpstreamTaskId, 
  completeTask, 
  failTask,
  updateTaskStatus,
  getTasksByUser,
  getRecentTasks
} from "../data/tasks";
import {
  detectModelType,
  adaptImageRequest,
  adaptVideoRequest,
  adaptHappyHorseRequest,
  adaptPixVerseRequest,
  pollDashScopeTask,
  pollPixVerseTask,
} from "../services/adapters";
import { checkConsumerLimits, recordRequest } from "../services/rate-limiter";
import { getPixVerseRuntimeChannel, getPixVerseTaskChannel } from "../services/pixverse-channel";
import { billAsyncError, billAsyncSuccess, estimateAsyncCost, hasEnoughBalance } from "../services/async-billing";

const router = Router();

function getApiKey(): string {
  return process.env.DASHSCOPE_API_KEY || "";
}

/** Extract Bearer token from Authorization header */
function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

// POST /v1/tasks - Submit a new async task
router.post("/", async (req: Request, res: Response) => {
  // Auth
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      error: { message: "Missing API key", type: "invalid_request_error", code: "missing_api_key" },
    });
    return;
  }

  const apiKeyRecord = await validateApiKey(token);
  if (!apiKeyRecord) {
    res.status(401).json({
      error: { message: "Invalid API key", type: "invalid_request_error", code: "invalid_api_key" },
    });
    return;
  }

  // Rate limit check
  const rateCheck = checkConsumerLimits(apiKeyRecord.id, apiKeyRecord.rate_limit);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: { message: rateCheck.reason, type: "rate_limit_error", code: "rate_limit_exceeded" },
    });
    return;
  }

  // Balance check
  if (apiKeyRecord.user_id) {
    const owner = await getUserById(apiKeyRecord.user_id);
    if (owner && owner.balance <= 0) {
      res.status(402).json({
        error: { message: "Insufficient balance", type: "billing_error", code: "insufficient_balance" },
      });
      return;
    }
  }

  const { model: modelId, prompt, ...params } = req.body;

  if (!modelId) {
    res.status(400).json({
      error: { message: "Missing model or prompt", type: "invalid_request_error", code: "invalid_request" },
    });
    return;
  }

  // Find model
  const model = models.find((m) => m.id === modelId);
  if (!model) {
    res.status(404).json({
      error: { message: `Model '${modelId}' not found`, type: "invalid_request_error", code: "model_not_found" },
    });
    return;
  }

  const modelType = detectModelType(model.category);
  if (modelType !== "image" && modelType !== "video") {
    res.status(400).json({
      error: { 
        message: `Model '${modelId}' does not support async tasks. Use /v1/chat/completions for chat models.`,
        type: "invalid_request_error", 
        code: "unsupported_model" 
      },
    });
    return;
  }

  const estimatedCost = estimateAsyncCost(model, params);
  if (!(await hasEnoughBalance(apiKeyRecord.user_id, estimatedCost))) {
    res.status(402).json({
      error: { message: "Insufficient balance", type: "billing_error", code: "insufficient_balance" },
    });
    return;
  }

  const requiresReferenceImage =
    modelId === "wanx-style-repaint" ||
    modelId === "wanx-style-repaint-v1" ||
    modelId === "wanx-background-generation" ||
    modelId === "wanx-background-generation-v2";

  if (requiresReferenceImage && !params.ref_img && !params.image_url) {
    res.status(400).json({
      error: { message: `Model '${modelId}' requires ref_img`, type: "invalid_request_error", code: "invalid_request" },
    });
    return;
  }

  const requiresPrompt =
    modelId !== "wanx-style-repaint" &&
    modelId !== "wanx-style-repaint-v1" &&
    modelId !== "wanx-background-generation" &&
    modelId !== "wanx-background-generation-v2";
  if (requiresPrompt && !prompt && modelType === "image") {
    res.status(400).json({
      error: { message: "Missing prompt", type: "invalid_request_error", code: "invalid_request" },
    });
    return;
  }

  if (modelType === "video" && (modelId.includes("-i2v") || modelId.includes("-r2v")) && !params.img_url && !params.img_urls?.length) {
    res.status(400).json({
      error: { message: `Model '${modelId}' requires img_url or img_urls`, type: "invalid_request_error", code: "invalid_request" },
    });
    return;
  }

  if (modelId === "happyhorse-1.0-video-edit" && !params.video_url) {
    res.status(400).json({
      error: { message: `Model '${modelId}' requires video_url`, type: "invalid_request_error", code: "invalid_request" },
    });
    return;
  }

  // Determine provider
  const isPixVerse = modelId.startsWith("pixverse-");
  const pixVerseChannel = isPixVerse ? getPixVerseRuntimeChannel() : null;
  const provider = pixVerseChannel?.taskProvider || "dashscope";

  // Get appropriate API key
  const upstreamApiKey = pixVerseChannel?.apiKey || getApiKey();
  if (!upstreamApiKey) {
    res.status(500).json({
      error: { message: "Upstream API key not configured", type: "server_error", code: "upstream_error" },
    });
    return;
  }

  // Create task record
  const task = await createTask({
    userId: apiKeyRecord.user_id,
    apiKeyId: apiKeyRecord.id,
    type: modelType as "image" | "video",
    model: modelId,
    provider,
    input: { prompt, ...params },
  });

  // Record rate limit
  recordRequest("system", modelId, apiKeyRecord.id, 0);

  // Build upstream request
  let adapted;
  try {
    if (modelType === "image") {
      adapted = adaptImageRequest(upstreamApiKey, { model: modelId, prompt, ...params });
    } else if (isPixVerse && pixVerseChannel?.adapter === "pixverse") {
      adapted = adaptPixVerseRequest(upstreamApiKey, { model: modelId, prompt, ...params }, pixVerseChannel.apiBaseUrl);
    } else if (isPixVerse) {
      adapted = adaptVideoRequest(upstreamApiKey, { model: modelId, prompt, ...params });
    } else if (modelId.startsWith("happyhorse-")) {
      adapted = adaptHappyHorseRequest(upstreamApiKey, { model: modelId, prompt, ...params });
    } else {
      adapted = adaptVideoRequest(upstreamApiKey, { model: modelId, prompt, ...params });
    }
  } catch (err: any) {
    await failTask(task.id, `Adapter error: ${err.message}`);
    res.status(500).json({
      error: { message: `Failed to prepare request: ${err.message}`, type: "server_error", code: "adapter_error" },
    });
    return;
  }

  // Submit to upstream
  try {
    const response = await fetch(adapted.url, {
      method: adapted.method,
      headers: adapted.headers,
      body: JSON.stringify(adapted.body),
    });

    const data: any = await response.json();

    if (!response.ok || data.code || (data.ErrCode !== undefined && data.ErrCode !== 0)) {
      const errorMsg = data.message || data.error?.message || data.ErrMsg || `HTTP ${response.status}`;
      await failTask(task.id, errorMsg);
      await billAsyncError(apiKeyRecord, modelId, Date.now() - new Date(task.created_at).getTime());
      res.status(response.ok ? 400 : response.status).json({
        error: { message: errorMsg, type: "upstream_error", code: "upstream_error" },
      });
      return;
    }

    // Extract task ID from response
    let upstreamTaskId: string | undefined;

    // Handle synchronous response (e.g., wan2.6-t2i returns result directly)
    if (data.output?.choices?.[0]?.message?.content) {
      const content = data.output.choices[0].message.content;
      const imageUrls = content
        .filter((c: any) => c.type === "image" || c.image)
        .map((c: any) => c.image || c.url);
      
      if (imageUrls.length > 0) {
        const output = { type: "image", image_url: imageUrls[0], images: imageUrls };
        const model = models.find((m) => m.id === modelId);
        const cost = model ? estimateAsyncCost(model, task.input || {}) : 0;
        await completeTask(task.id, output, cost);
        if (model) await billAsyncSuccess(task, model, cost, Date.now() - new Date(task.created_at).getTime());
        res.status(202).json({
          id: task.id,
          object: "task",
          status: "succeeded",
          model: modelId,
          type: modelType,
          output,
          created_at: task.created_at,
          completed_at: new Date().toISOString(),
        });
        return;
      }
    }
    
    // DashScope format
    if (data.output?.task_id) {
      upstreamTaskId = data.output.task_id;
    }
    // PixVerse format (official API returns video_id)
    if (data.Resp?.video_id) {
      upstreamTaskId = String(data.Resp.video_id);
    }
    if (data.Resp?.task_id) {
      upstreamTaskId = String(data.Resp.task_id);
    }

    if (upstreamTaskId) {
      await setUpstreamTaskId(task.id, upstreamTaskId);
    } else {
      // Unexpected response format
      await failTask(task.id, "No task_id in upstream response");
      res.status(500).json({
        error: { message: "No task_id returned from upstream", type: "upstream_error", code: "unexpected_response" },
      });
      return;
    }

    // Return task info
    res.status(202).json({
      id: task.id,
      object: "task",
      status: "running",
      model: modelId,
      type: modelType,
      created_at: task.created_at,
    });

  } catch (err: any) {
    await failTask(task.id, `Request failed: ${err.message}`);
    await billAsyncError(apiKeyRecord, modelId, Date.now() - new Date(task.created_at).getTime());
    res.status(500).json({
      error: { message: `Upstream request failed: ${err.message}`, type: "server_error", code: "upstream_error" },
    });
  }
});

// GET /v1/tasks/:id - Get task status
router.get("/:id", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      error: { message: "Missing API key", type: "invalid_request_error", code: "missing_api_key" },
    });
    return;
  }

  const apiKeyRecord = await validateApiKey(token);
  if (!apiKeyRecord) {
    res.status(401).json({
      error: { message: "Invalid API key", type: "invalid_request_error", code: "invalid_api_key" },
    });
    return;
  }

  const taskId = req.params.id as string;
  const task = await getTaskById(taskId);

  if (
    !task ||
    (task.api_key_id && task.api_key_id !== apiKeyRecord.id) ||
    (task.user_id && task.user_id !== apiKeyRecord.user_id)
  ) {
    res.status(404).json({
      error: { message: "Task not found", type: "invalid_request_error", code: "task_not_found" },
    });
    return;
  }

  // If task is already complete, return cached result
  if (task.status === "succeeded" || task.status === "failed") {
    res.json({
      id: task.id,
      object: "task",
      status: task.status,
      model: task.model,
      type: task.type,
      progress: task.progress,
      output: task.output,
      error: task.error_message,
      created_at: task.created_at,
      completed_at: task.completed_at,
    });
    return;
  }

  // Poll upstream for status
  if (!task.upstream_task_id) {
    res.json({
      id: task.id,
      object: "task",
      status: "pending",
      model: task.model,
      type: task.type,
      progress: 0,
      created_at: task.created_at,
    });
    return;
  }

  try {
    const isPixVerse = task.provider.startsWith("pixverse");
    const pixVerseChannel = isPixVerse ? getPixVerseTaskChannel(task.provider) : null;
    const apiKey = pixVerseChannel?.apiKey || getApiKey();
    
    const result = isPixVerse && pixVerseChannel?.adapter === "pixverse"
      ? await pollPixVerseTask(apiKey, task.upstream_task_id, pixVerseChannel.apiBaseUrl)
      : await pollDashScopeTask(apiKey, task.upstream_task_id);

    // Update task based on result
    if (result.status === "succeeded") {
      const model = models.find((m) => m.id === task.model);
      const cost = model ? estimateAsyncCost(model, task.input || {}) : 0;
      await completeTask(task.id, result.output, cost);
      if (model) await billAsyncSuccess(task, model, cost, Date.now() - new Date(task.created_at).getTime());
    } else if (result.status === "failed") {
      await failTask(task.id, result.error || "Task failed");
      await billAsyncError(task.api_key_id ? { id: task.api_key_id, user_id: task.user_id } : null, task.model, Date.now() - new Date(task.created_at).getTime());
    } else {
      await updateTaskStatus(task.id, result.status, result.progress || 0);
    }

    res.json({
      id: task.id,
      object: "task",
      status: result.status,
      model: task.model,
      type: task.type,
      progress: result.progress || 0,
      output: result.output,
      error: result.error,
      created_at: task.created_at,
      completed_at: result.status === "succeeded" || result.status === "failed" 
        ? new Date().toISOString() 
        : null,
    });

  } catch (err: any) {
    res.status(500).json({
      error: { message: `Failed to poll task status: ${err.message}`, type: "server_error", code: "poll_error" },
    });
  }
});

// GET /v1/tasks - List tasks (requires auth)
router.get("/", async (req: Request, res: Response) => {
  const token = extractToken(req);
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  if (token) {
    const apiKeyRecord = await validateApiKey(token);
    if (apiKeyRecord?.user_id) {
      const tasks = await getTasksByUser(apiKeyRecord.user_id, limit);
      res.json({
        object: "list",
        data: tasks.map((t) => ({
          id: t.id,
          object: "task",
          status: t.status,
          model: t.model,
          type: t.type,
          progress: t.progress,
          created_at: t.created_at,
          completed_at: t.completed_at,
        })),
      });
      return;
    }
  }

  // No auth or no user - return empty list
  res.json({ object: "list", data: [] });
});

export default router;
