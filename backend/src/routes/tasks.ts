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
import {
  createTask,
  getTaskById,
  setUpstreamTaskId,
  completeTask,
  failTask,
  updateTaskStatus,
  getTasksByUser,
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
import { setRateLimitHeaders } from "../utils/rate-limit-headers";
import { recordSuccess, recordFailure } from "../services/scheduler";
import { getProviderById } from "../data/providers";
import { getProviderChannel } from "../data/provider-channels";
import { billAsyncError, billAsyncSuccess, ensureAsyncTaskSettlement, estimateDiscountedAsyncCost, settleAsyncCost } from "../services/async-billing";
import { sanitizeUpstreamError } from "../utils/sanitize-error";
import { sendBillingReservationFailure } from "../utils/billing-response";
import {
  normalizeDashScopeVideoResolution,
  normalizeDashScopeVideoSize,
  requiresImageInput,
  requiresVideoInput,
  VideoParameterError,
} from "../utils/video-parameters";
import { upstreamErrorBody } from "../services/upstream";
import { pollTaskWithControl } from "../services/task-poll-control";
import { InferenceContext } from "../pipeline/context";
import { taskProtocolFor } from "../pipeline/adapters";
import {
  adapterForUpstream,
  authenticateApiKey,
  bearerToken,
  checkConsumer,
  checkModelAccess,
  findModel,
  invokeUpstream,
  release,
  reserveBilling,
  reserveProviderCapacity,
  reserveQpm,
  resolveModel,
  selectRoute,
} from "../pipeline/stages";

const router = Router();

function getApiKey(): string {
  return process.env.DASHSCOPE_API_KEY || "";
}

// POST /v1/tasks - Submit a new async task
router.post("/", async (req: Request, res: Response) => {
  const ctx = new InferenceContext("v1.tasks.create", req, res);
  // Auth
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({
      error: { message: "Missing API key", type: "invalid_request_error", code: "missing_api_key" },
    });
    return;
  }
  if (!(await authenticateApiKey(ctx, token))) {
    res.status(401).json({
      error: { message: "Invalid API key", type: "invalid_request_error", code: "invalid_api_key" },
    });
    return;
  }
  const caller = ctx.requireCaller();
  const apiKeyRecord = caller.apiKey!;

  // 匿名 key（无归属用户）不允许创建任务：会绕过余额与白名单（与 /v1/chat 口径一致）
  if (!caller.userId) {
    res.status(403).json({
      error: { message: "This API key is not associated with a user account.", type: "invalid_request_error", code: "anonymous_key_not_allowed" },
    });
    return;
  }

  // Rate limit check
  const consumerFailure = await checkConsumer(ctx);
  if (consumerFailure) {
    setRateLimitHeaders(res, { ...consumerFailure.check, rejected: true });
    res.status(429).json({
      error: { message: consumerFailure.check.reason, type: "rate_limit_error", code: "rate_limit_exceeded" },
    });
    return;
  }

  const { model: modelId, prompt, ...params } = req.body;

  if (!modelId) {
    res.status(400).json({
      error: { message: "Missing model or prompt", type: "invalid_request_error", code: "invalid_request" },
    });
    return;
  }

  // Find model
  if (!resolveModel(ctx, modelId)) {
    res.status(404).json({
      error: { message: `Model '${modelId}' not found`, type: "invalid_request_error", code: "model_not_found" },
    });
    return;
  }
  const model = ctx.requireModel();

  if (!checkModelAccess(ctx)) {
    res.status(403).json({
      error: {
        message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。`,
        type: "invalid_request_error",
        code: "model_not_allowed",
      },
    });
    return;
  }
  const qpmFailure = await reserveQpm(ctx);
  if (qpmFailure) {
    res.status(429).json({
      error: {
        message: `Model-level QPM limit exceeded: ${qpmFailure.limit} requests/min for '${modelId}'.`,
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
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

  if (modelType === "video" && requiresImageInput(modelId) && !params.img_url && !params.img_urls?.length) {
    res.status(400).json({
      error: { message: `Model '${modelId}' requires img_url or img_urls`, type: "invalid_request_error", code: "invalid_request" },
    });
    return;
  }

  if (modelType === "video" && requiresVideoInput(modelId) && !params.video_url) {
    res.status(400).json({
      error: { message: `Model '${modelId}' requires video_url`, type: "invalid_request_error", code: "invalid_request" },
    });
    return;
  }

  const isSpecialVideoProvider =
    modelId.startsWith("pixverse-")
    || modelId.startsWith("seedance-")
    || modelId.startsWith("happyhorse-");
  if (modelType === "video" && !isSpecialVideoProvider) {
    try {
      if (modelId.includes("-i2v") || modelId.startsWith("wan3.0-video") || modelId === "wan2.7-videoedit") {
        params.resolution = normalizeDashScopeVideoResolution(params.resolution, params.size, modelId);
      } else {
        params.size = normalizeDashScopeVideoSize({
          size: params.size,
          resolution: params.resolution,
          ratio: params.ratio,
        });
      }
    } catch (error) {
      if (error instanceof VideoParameterError) {
        res.status(400).json({
          error: {
            message: error.message,
            type: "invalid_request_error",
            code: error.code,
          },
        });
        return;
      }
      throw error;
    }
  }

  let estimatedCost: number;
  try {
    estimatedCost = await estimateDiscountedAsyncCost(caller.userId, model, params);
  } catch (error) {
    res.status(400).json({
      error: {
        message: error instanceof Error ? error.message : "Unable to price this request",
        type: "invalid_request_error",
        code: "unsupported_video_parameters",
      },
    });
    return;
  }
  const routeFailure = await selectRoute(ctx);
  if (routeFailure) {
    res.status(routeFailure.status).json({ error: upstreamErrorBody(routeFailure) });
    return;
  }
  const upstream = ctx.requireUpstream();
  const nativeBaseUrl = upstream.nativeBaseUrl;
  const upstreamApiKey = upstream.apiKey;
  if (estimatedCost > 0) {
    const billingFailure = await reserveBilling(ctx, estimatedCost, "task", 30 * 24 * 60 * 60);
    if (billingFailure) {
      sendBillingReservationFailure(res, billingFailure);
      return;
    }
  }

  try {
    const capacityFailure = await reserveProviderCapacity(ctx, 0);
    if (capacityFailure) {
      res.status(503).json({
        error: {
          message: capacityFailure.message,
          type: "server_error",
          code: capacityFailure.code,
        },
      });
      return;
    }

    // Create task record
    const task = await createTask({
      userId: caller.userId,
      apiKeyId: caller.apiKeyId,
      type: modelType as "image" | "video",
      model: modelId,
      provider: upstream.providerId,
      input: {
        prompt,
        ...params,
        _route: {
          channelId: upstream.channelId,
          region: upstream.region,
          nativeBaseUrl,
          managed: upstream.managed,
          rpm: upstream.rpm,
          tpm: upstream.tpm,
          dailyLimit: upstream.dailyLimit,
          concurrentLimit: upstream.concurrentLimit,
        },
      },
      billingReservationId: ctx.billingReservation?.id,
    });

    // Build upstream request: the protocol follows the upstream adapter.
    const taskProtocol = taskProtocolFor(ctx.adapter!);
    let adapted;
    try {
      if (modelType === "image") {
        adapted = adaptImageRequest(
          upstreamApiKey,
          { model: modelId, prompt, ...params },
          { nativeBase: nativeBaseUrl }
        );
      } else if (taskProtocol === "pixverse") {
        adapted = adaptPixVerseRequest(upstreamApiKey, { model: modelId, prompt, ...params }, nativeBaseUrl);
      } else if (modelId.startsWith("seedance-")) {
        adapted = adaptSeedanceRequest(upstreamApiKey, { model: modelId, prompt, ...params }, nativeBaseUrl);
      } else if (modelId.startsWith("happyhorse-")) {
        adapted = adaptHappyHorseRequest(
          upstreamApiKey,
          { model: modelId, prompt, ...params },
          nativeBaseUrl
        );
      } else {
        adapted = adaptVideoRequest(
          upstreamApiKey,
          { model: modelId, prompt, ...params },
          nativeBaseUrl
        );
      }
    } catch (err: any) {
      recordFailure(upstream.providerId, modelId, err.message);
      await failTask(task.id, `Adapter error: ${err.message}`);
      await billAsyncError(apiKeyRecord, modelId, Date.now() - new Date(task.created_at).getTime(), task.billing_reservation_id);
      res.status(err instanceof VideoParameterError ? 400 : 500).json({
        error: {
          message: `Failed to prepare request: ${sanitizeUpstreamError(err)}`,
          type: err instanceof VideoParameterError ? "invalid_request_error" : "server_error",
          code: err instanceof VideoParameterError ? err.code : "adapter_error",
        },
      });
      return;
    }

    // Submit to upstream
    const submitStart = Date.now();
    try {
      const response = await invokeUpstream(ctx, {
        url: adapted.url,
        method: adapted.method,
        headers: adapted.headers,
        auth: false,
        body: adapted.body,
        timeoutMs: null,
      });

      const data: any = await response.json();

      // Volcengine Ark error format: { error: { message, code, ... } }
      const volcEngineError = taskProtocol === "volcengine" && data.error;
      if (!response.ok || data.code || (data.ErrCode !== undefined && data.ErrCode !== 0) || volcEngineError) {
        const errorMsg = data.message || data.error?.message || data.ErrMsg || `HTTP ${response.status}`;
        recordFailure(upstream.providerId, modelId, errorMsg);
        await failTask(task.id, errorMsg);
        await billAsyncError(apiKeyRecord, modelId, Date.now() - new Date(task.created_at).getTime(), task.billing_reservation_id);
        res.status(response.ok ? 400 : response.status).json({
          error: { message: errorMsg, type: "upstream_error", code: "upstream_error" },
        });
        return;
      }

      recordSuccess(upstream.providerId, modelId, Date.now() - submitStart);

      // Extract task ID from response
      let upstreamTaskId: string | undefined;

      // Handle synchronous response (e.g., wan2.6-t2i returns result directly)
      if (data.output?.choices?.[0]?.message?.content) {
        const content = data.output.choices[0].message.content;
        const imageUrls = content
          .filter((c: any) => c.type === "image" || c.image)
          .map((c: any) => c.image || c.url);

        if (imageUrls.length > 0) {
          // Upstream has delivered a billable result. Keep the hold if database
          // settlement fails so a retry/reconciler can finish it safely.
          ctx.billableResponseReceived = true;
          const output = { type: "image", image_url: imageUrls[0], images: imageUrls };
          const model = findModel(modelId);
          const cost = model ? await estimateDiscountedAsyncCost(task.user_id, model, task.input || {}) : 0;
          const won = await completeTask(task.id, output, cost);
          if (won && model) await billAsyncSuccess(task, model, cost, Date.now() - new Date(task.created_at).getTime());
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
      if (taskProtocol === "volcengine" && data.id && typeof data.id === "string") {
        upstreamTaskId = data.id;
      }

      if (upstreamTaskId) {
        await setUpstreamTaskId(task.id, upstreamTaskId);
        ctx.billableResponseReceived = true;
      } else {
        // Unexpected response format
        await failTask(task.id, "No task_id in upstream response");
        await billAsyncError(apiKeyRecord, modelId, Date.now() - new Date(task.created_at).getTime(), task.billing_reservation_id);
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
      recordFailure(upstream.providerId, modelId, err.message);
      const won = await failTask(task.id, `Request failed: ${sanitizeUpstreamError(err)}`);
      if (won) {
        await billAsyncError(apiKeyRecord, modelId, Date.now() - new Date(task.created_at).getTime(), task.billing_reservation_id);
      }
      res.status(500).json({
        error: { message: `Upstream request failed: ${sanitizeUpstreamError(err)}`, type: "server_error", code: "upstream_error" },
      });
    }
  } finally {
    await release(ctx, { releaseReason: "task_submission_not_running" });
  }
});

// GET /v1/tasks/:id - Get task status
router.get("/:id", async (req: Request, res: Response) => {
  const token = bearerToken(req);
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
    if (task.status === "succeeded") {
      const model = models.find((item) => item.id === task.model);
      if (model) {
        try {
          await ensureAsyncTaskSettlement(task, model);
        } catch (error) {
          console.error(`[tasks] settlement repair failed for ${task.id}:`, error);
        }
      }
    }
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
      const taskChannelId = task.input?._route?.channelId;
      const taskChannel = taskChannelId
        ? await getProviderChannel(task.provider, taskChannelId)
        : null;
      pollApiKey = taskChannel?.api_key || providerRecord.api_key;
      const resolvedPollBaseUrl = String(
        task.input?._route?.nativeBaseUrl || providerRecord.api_base_url
      );
      pixVerseBaseUrl = resolvedPollBaseUrl;
      const pollProtocol = taskProtocolFor(
        (await adapterForUpstream(providerRecord.id, taskChannelId || null, resolvedPollBaseUrl)).adapter
      );
      isPixVerseOfficial = pollProtocol === "pixverse";
      isVolcEngine = pollProtocol === "volcengine";
    }

    const controlledPoll = await pollTaskWithControl({
      task,
      actorId: `api-key:${apiKeyRecord.id}`,
      userId: apiKeyRecord.user_id,
      poll: () => isPixVerseOfficial
        ? pollPixVerseTask(pollApiKey, task.upstream_task_id!, pixVerseBaseUrl!)
        : isVolcEngine
          ? pollVolcEngineTask(pollApiKey, task.upstream_task_id!, pixVerseBaseUrl)
          : pollDashScopeTask(pollApiKey, task.upstream_task_id!, pixVerseBaseUrl),
    });
    if (!controlledPoll.ok) {
      const storeUnavailable =
        controlledPoll.reason === "control_store_unavailable"
        || controlledPoll.reason === "provider_capacity_store_unavailable";
      res
        .status(storeUnavailable ? 503 : 429)
        .set("Retry-After", storeUnavailable ? "5" : "2")
        .json({
          error: {
            message: storeUnavailable
              ? "Task polling is temporarily unavailable."
              : "Task polling rate or provider capacity limit exceeded.",
            type: storeUnavailable ? "server_error" : "rate_limit_error",
            code: controlledPoll.reason,
          },
        });
      return;
    }
    if (controlledPoll.state === "in_flight") {
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
    const result = controlledPoll.result;

    // Update task based on result
    if (result.status === "succeeded") {
      const model = models.find((m) => m.id === task.model);
      const output = { ...(result.output || {}), ...(result.usage ? { usage: result.usage } : {}) };
      const cost = model
        ? await settleAsyncCost(task.user_id, model, task.input || {}, result.usage)
        : 0;
      const won = await completeTask(task.id, output, cost);
      if (won && model) {
        await billAsyncSuccess({ ...task, output }, model, cost, Date.now() - new Date(task.created_at).getTime());
      }
    } else if (result.status === "failed") {
      const won = await failTask(task.id, result.error || "Task failed");
      if (won) {
        await billAsyncError(
          task.api_key_id ? { id: task.api_key_id, user_id: task.user_id } : null,
          task.model,
          Date.now() - new Date(task.created_at).getTime(),
          task.billing_reservation_id
        );
      }
    } else {
      await updateTaskStatus(
        task.id,
        result.status === "running" ? "running" : "pending",
        result.progress || 0
      );
    }

    const persistedTask = (await getTaskById(task.id)) || task;
    res.json({
      id: persistedTask.id,
      object: "task",
      status: persistedTask.status,
      model: persistedTask.model,
      type: persistedTask.type,
      progress: persistedTask.progress,
      output: persistedTask.output,
      error: persistedTask.error_message,
      created_at: persistedTask.created_at,
      completed_at: persistedTask.completed_at,
    });

  } catch (err: any) {
    res.status(500).json({
      error: { message: `Failed to poll task status: ${err.message}`, type: "server_error", code: "poll_error" },
    });
  }
});

// GET /v1/tasks - List tasks (requires auth)
router.get("/", async (req: Request, res: Response) => {
  const token = bearerToken(req);
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
