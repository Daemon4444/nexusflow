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
  adaptSeedanceRequest,
  pollDashScopeTask,
  pollPixVerseTask,
  pollVolcEngineTask,
} from "../services/adapters";
import { checkConsumerLimits, checkRPM, recordRequest } from "../services/rate-limiter";
import { getEffectiveRateLimit } from "../data/ratelimits";
import { isModelAllowed } from "../data/model-access";
import { selectProvider, acquireConcurrency, releaseConcurrency, recordSuccess, recordFailure } from "../services/scheduler";
import { getProviderById } from "../data/providers";
import { billAsyncError, billAsyncSuccess, estimateDiscountedAsyncCost, hasEnoughBalance } from "../services/async-billing";
import { sanitizeUpstreamError } from "../utils/sanitize-error";

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

  if (apiKeyRecord.user_id) {
    if (!isModelAllowed(apiKeyRecord.parent_user_id, apiKeyRecord.allowed_models, modelId)) {
      res.status(403).json({
        error: {
          message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`,
          type: "invalid_request_error",
          code: "model_not_allowed",
        },
      });
      return;
    }
    const userLimits = await getEffectiveRateLimit(apiKeyRecord.user_id, modelId);
    const rpmCheck = await checkRPM(`user:${apiKeyRecord.user_id}:${modelId}`, userLimits.qpm);
    if (!rpmCheck.allowed) {
      res.status(429).json({
        error: {
          message: `Model-level QPM limit exceeded: ${userLimits.qpm} requests/min for '${modelId}'. Retry after ${Math.ceil(rpmCheck.resetMs / 1000)}s.`,
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      });
      return;
    }
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

  const estimatedCost = await estimateDiscountedAsyncCost(apiKeyRecord.user_id, model, params);
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

  // Select provider via scheduler (respects provider_capacity config)
  const selected = await selectProvider(modelId, { userId: apiKeyRecord.user_id });
  if (!selected) {
    res.status(503).json({
      error: { message: "No available provider for this model", type: "server_error", code: "provider_unavailable" },
    });
    return;
  }
  const upstreamApiKey = selected.apiKey;
  const provider = selected.providerId;
  acquireConcurrency(selected.providerId, modelId);

  try {
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
    const isPixVerseOfficial = selected.apiBaseUrl.includes("pixverse.ai");
    const isVolcEngine = selected.apiBaseUrl.includes("volces.com") || selected.apiBaseUrl.includes("genvia.ai");
    let adapted;
    try {
      if (modelType === "image") {
        adapted = adaptImageRequest(upstreamApiKey, { model: modelId, prompt, ...params });
      } else if (isPixVerseOfficial) {
        adapted = adaptPixVerseRequest(upstreamApiKey, { model: modelId, prompt, ...params }, selected.apiBaseUrl);
      } else if (modelId.startsWith("seedance-")) {
        adapted = adaptSeedanceRequest(upstreamApiKey, { model: modelId, prompt, ...params }, selected.apiBaseUrl);
      } else if (modelId.startsWith("happyhorse-")) {
        adapted = adaptHappyHorseRequest(upstreamApiKey, { model: modelId, prompt, ...params });
      } else {
        adapted = adaptVideoRequest(upstreamApiKey, { model: modelId, prompt, ...params });
      }
    } catch (err: any) {
      recordFailure(selected.providerId, modelId, err.message);
      await failTask(task.id, `Adapter error: ${err.message}`);
      res.status(500).json({
        error: { message: `Failed to prepare request: ${sanitizeUpstreamError(err)}`, type: "server_error", code: "adapter_error" },
      });
      return;
    }

    // Submit to upstream
    const submitStart = Date.now();
    try {
      const response = await fetch(adapted.url, {
        method: adapted.method,
        headers: adapted.headers,
        body: JSON.stringify(adapted.body),
      });

      const data: any = await response.json();

      // Volcengine Ark error format: { error: { message, code, ... } }
      const volcEngineError = isVolcEngine && data.error;
      if (!response.ok || data.code || (data.ErrCode !== undefined && data.ErrCode !== 0) || volcEngineError) {
        const errorMsg = data.message || data.error?.message || data.ErrMsg || `HTTP ${response.status}`;
        recordFailure(selected.providerId, modelId, errorMsg);
        await failTask(task.id, errorMsg);
        await billAsyncError(apiKeyRecord, modelId, Date.now() - new Date(task.created_at).getTime());
        res.status(response.ok ? 400 : response.status).json({
          error: { message: errorMsg, type: "upstream_error", code: "upstream_error" },
        });
        return;
      }

      recordSuccess(selected.providerId, modelId, Date.now() - submitStart);

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
          const cost = model ? await estimateDiscountedAsyncCost(task.user_id, model, task.input || {}) : 0;
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
      // Volcengine Ark format: { id: "cgt-..." } (direct Ark) or { id: "task_..." } (genvia relay)
      if (isVolcEngine && data.id && typeof data.id === "string") {
        upstreamTaskId = data.id;
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
      recordFailure(selected.providerId, modelId, err.message);
      await failTask(task.id, `Request failed: ${sanitizeUpstreamError(err)}`);
      await billAsyncError(apiKeyRecord, modelId, Date.now() - new Date(task.created_at).getTime());
      res.status(500).json({
        error: { message: `Upstream request failed: ${sanitizeUpstreamError(err)}`, type: "server_error", code: "upstream_error" },
      });
    }
  } finally {
    releaseConcurrency(selected.providerId, modelId);
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
    let pollApiKey: string;
    let isPixVerseOfficial: boolean;
    let isVolcEngine: boolean;
    let pixVerseBaseUrl: string | undefined;

    // Backward compatibility: old tasks stored provider as "pixverse:channelId:adapter"
    if (task.provider.includes(":")) {
      const [, , adapter] = task.provider.split(":");
      isPixVerseOfficial = adapter === "pixverse";
      isVolcEngine = false;
      pollApiKey = isPixVerseOfficial
        ? (process.env.PIXVERSE_API_KEY || "")
        : getApiKey();
      pixVerseBaseUrl = isPixVerseOfficial ? "https://app-api.pixverse.ai/openapi/v2" : undefined;
    } else {
      // New format: provider ID directly
      const providerRecord = await getProviderById(task.provider);
      if (!providerRecord) {
        res.status(500).json({
          error: { message: "Provider not found for this task", type: "server_error", code: "provider_not_found" },
        });
        return;
      }
      pollApiKey = providerRecord.api_key;
      isPixVerseOfficial = providerRecord.api_base_url.includes("pixverse.ai");
      isVolcEngine = providerRecord.api_base_url.includes("volces.com") || providerRecord.api_base_url.includes("genvia.ai");
      pixVerseBaseUrl = providerRecord.api_base_url;
    }

    const result = isPixVerseOfficial
      ? await pollPixVerseTask(pollApiKey, task.upstream_task_id, pixVerseBaseUrl!)
      : isVolcEngine
        ? await pollVolcEngineTask(pollApiKey, task.upstream_task_id, pixVerseBaseUrl)
        : await pollDashScopeTask(pollApiKey, task.upstream_task_id);

    // Update task based on result
    if (result.status === "succeeded") {
      const model = models.find((m) => m.id === task.model);
      const cost = model ? await estimateDiscountedAsyncCost(task.user_id, model, task.input || {}) : 0;
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

  if (!apiKeyRecord.user_id) {
    res.json({ object: "list", data: [] });
    return;
  }

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
});

export default router;
