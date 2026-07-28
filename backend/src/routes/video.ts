/**
 * Video Generation API (for Playground)
 * 
 * Supports both:
 * - DashScope video models (wanx / wan2.6 / happyhorse)
 * - PixVerse models (pixverse-v4.5, etc.)
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
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
import {
  acquireProviderCapacity,
  releaseProviderCapacity,
  recordSuccess,
  recordFailure,
  type ProviderRequestCapacityLease,
} from "../services/scheduler";
import { getProviderById } from "../data/providers";
import { getProviderChannel } from "../data/provider-channels";
import { billAsyncError, billAsyncSuccess, ensureAsyncTaskSettlement, estimateDiscountedAsyncCost } from "../services/async-billing";
import { releaseReservation, reserveBalanceWithReason } from "../data/billing";
import { isModelAllowed } from "../data/model-access";
import { reserveAccountQpm } from "../services/account-rate-limiter";
import {
  adaptVideoRequest,
  adaptHappyHorseRequest,
  adaptPixVerseRequest,
  adaptSeedanceRequest,
  pollDashScopeTask,
  pollPixVerseTask,
  pollVolcEngineTask,
} from "../services/adapters";
import { sendBillingReservationFailure } from "../utils/billing-response";
import {
  normalizeDashScopeVideoResolution,
  normalizeDashScopeVideoSize,
  VideoParameterError,
} from "../utils/video-parameters";
import { getRequestedRegion, resolveUpstream, upstreamErrorBody } from "../services/upstream";
import { safeProviderFetch } from "../services/outbound-url-policy";
import { pollTaskWithControl } from "../services/task-poll-control";

const router = Router();

type Caller = {
  userId: string | null;
  apiKeyId: string | null;
  parentUserId: string | null;
  allowedModels: string | null;
  errorIdentity: { id: string | null; user_id: string | null } | null;
};

type VideoTaskStatus = "pending" | "processing" | "successful" | "failed";

function sendVideoTaskCreated(
  res: Response,
  taskId: string,
  upstreamTaskId: string | number,
  upstreamStatus?: string
): void {
  if (res.locals.videoLegacyEnvelope) {
    res.json({
      request_id: randomUUID(),
      output: {
        task_id: taskId,
        task_status: upstreamStatus || "PENDING",
      },
    });
    return;
  }
  res.json({
    success: true,
    data: {
      task_id: taskId,
      upstream_task_id: upstreamTaskId,
      ...(upstreamStatus ? { task_status: upstreamStatus } : {}),
    },
  });
}

function sendVideoTaskStatus(
  res: Response,
  data: {
    taskId: string;
    status: VideoTaskStatus;
    videoUrl?: string;
    error?: string | null;
    progress?: number;
  }
): void {
  if (res.locals.videoLegacyEnvelope) {
    const taskStatus: Record<VideoTaskStatus, string> = {
      pending: "PENDING",
      processing: "RUNNING",
      successful: "SUCCEEDED",
      failed: "FAILED",
    };
    res.json({
      request_id: randomUUID(),
      output: {
        task_id: data.taskId,
        task_status: taskStatus[data.status],
        ...(data.videoUrl ? { video_url: data.videoUrl } : {}),
        ...(data.error ? { message: data.error } : {}),
        ...(data.progress !== undefined ? { progress: data.progress } : {}),
      },
    });
    return;
  }
  res.json({
    success: true,
    data: {
      task_id: data.taskId,
      status: data.status,
      ...(data.videoUrl ? { video_url: data.videoUrl } : {}),
      ...(data.error ? { error: data.error } : {}),
      ...(data.progress !== undefined ? { progress: data.progress } : {}),
    },
  });
}

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
      parentUserId: apiKeyRecord.parent_user_id,
      allowedModels: apiKeyRecord.allowed_models,
      errorIdentity: apiKeyRecord,
    };
  }

  const session = await validateSession(token);
  if (session) {
    return {
      userId: session.id,
      apiKeyId: null,
      parentUserId: session.parent_user_id,
      allowedModels: session.allowed_models,
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
export const handleGenerate = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const {
    model: modelId, prompt, duration, aspect_ratio, quality, negative_prompt, size,
    img_url, img_end_url, img_urls, video_url, video_urls, audio_urls,
    resolution, ratio, audio, audio_setting, generate_audio, draft,
    return_last_frame, camera_fixed, service_tier, callback_url, priority,
    seed, watermark, style, camera_movement, water_mark, audio_url,
    shot_type, motion_mode, prompt_extend
  } = req.body;

  if (!modelId) {
    res.status(400).json({ success: false, message: "请提供模型ID" });
    return;
  }

  // HappyHorse video-edit and Seedance (image/video input optional) don't strictly require prompt
  const isHappyHorse = modelId.startsWith("happyhorse-");
  const isSeedance = modelId.startsWith("seedance-");
  if (!isHappyHorse && !isSeedance && !prompt) {
    res.status(400).json({ success: false, message: "请提供提示词" });
    return;
  }

  const caller = await authenticateCaller(req);
  if (!caller) {
    res.status(401).json({ success: false, message: "请先登录或提供有效的 API Key" });
    return;
  }

  const model = models.find((m) => m.id === modelId);
  if (!model || model.category !== "视频生成") {
    res.status(404).json({ success: false, message: "视频生成模型不存在" });
    return;
  }

  // 匿名 key（无归属用户）不允许创建任务：会绕过余额与白名单
  if (!caller.userId) {
    res.status(403).json({ success: false, message: "此 API Key 未关联用户账号，无法使用该接口。" });
    return;
  }

  if (!isModelAllowed(caller.parentUserId, caller.allowedModels, modelId)) {
    res.status(403).json({ success: false, message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。` });
    return;
  }

  if (caller.userId) {
    const rpmCheck = await reserveAccountQpm({
      userId: caller.userId,
      parentUserId: caller.parentUserId,
      modelId,
    });
    if (!rpmCheck.allowed) {
      res.status(429).json({ success: false, message: `模型 QPM 限流已触发：${rpmCheck.limit}/min` });
      return;
    }
  }

  if ((modelId.includes("-i2v") || modelId.includes("-r2v")) && !img_url && !img_urls?.length) {
    res.status(400).json({
      success: false,
      message: `${modelId} 需要传入 img_url 或 img_urls`,
    });
    return;
  }

  if (modelId === "happyhorse-1.0-video-edit" && !video_url) {
    res.status(400).json({
      success: false,
      message: `${modelId} 需要传入 video_url`,
    });
    return;
  }

  let normalizedSize = size;
  let normalizedResolution = resolution;
  const isPixVerse = modelId.startsWith("pixverse-");
  if (!isHappyHorse && !isSeedance && !isPixVerse) {
    try {
      if (modelId.includes("-i2v")) {
        normalizedResolution = normalizeDashScopeVideoResolution(resolution, size);
      } else {
        normalizedSize = normalizeDashScopeVideoSize({ size, resolution, ratio });
      }
    } catch (error) {
      if (error instanceof VideoParameterError) {
        res.status(400).json({
          success: false,
          message: error.message,
          code: error.code,
        });
        return;
      }
      throw error;
    }
  }

  const resolvedUpstream = await resolveUpstream(modelId, {
    region: getRequestedRegion(req),
    userId: caller.userId,
  });
  if (!resolvedUpstream.ok) {
    res.status(resolvedUpstream.status).json({
      success: false,
      ...upstreamErrorBody(resolvedUpstream),
    });
    return;
  }
  const selected = {
    providerId: resolvedUpstream.upstream.providerId,
    apiKey: resolvedUpstream.upstream.apiKey,
    apiBaseUrl: resolvedUpstream.upstream.nativeBaseUrl,
    channelId: resolvedUpstream.upstream.channelId,
    region: resolvedUpstream.upstream.region,
    managed: resolvedUpstream.upstream.managed,
    rpm: resolvedUpstream.upstream.rpm,
    tpm: resolvedUpstream.upstream.tpm,
    dailyLimit: resolvedUpstream.upstream.dailyLimit,
    concurrentLimit: resolvedUpstream.upstream.concurrentLimit,
  };
  const apiKey = selected.apiKey;

  const estimatedCost = await estimateDiscountedAsyncCost(caller.userId, model, {
    duration,
    quality,
    resolution: normalizedResolution,
    audio,
    audio_setting,
  });
  const reservationResult = await reserveBalanceWithReason(
    caller.userId,
    estimatedCost,
    `video:${randomUUID()}`,
    30 * 24 * 60 * 60
  );
  if (!reservationResult.reservation) {
    sendBillingReservationFailure(res, reservationResult.reason, "api");
    return;
  }
  const reservation = reservationResult.reservation;
  let providerCapacityLease: ProviderRequestCapacityLease | null = null;

  const isPixVerseOfficial = selected.apiBaseUrl.includes("pixverse.ai");
  const isVolcEngine = selected.apiBaseUrl.includes("volces.com") || selected.apiBaseUrl.includes("genvia.ai");

  // Create internal task record
  let task;
  try {
    const capacity = await acquireProviderCapacity(selected, modelId, 0);
    if (!capacity.ok) {
      await releaseReservation(reservation.id, "provider_capacity_unavailable");
      res.status(503).json({
        success: false,
        message: capacity.message,
        code: capacity.code,
      });
      return;
    }
    providerCapacityLease = capacity.lease;

    task = await createTask({
      userId: caller.userId,
      apiKeyId: caller.apiKeyId,
      type: "video",
      model: modelId,
      provider: selected.providerId,
      input: {
        prompt,
        duration,
        aspect_ratio,
        quality,
        negative_prompt,
        size: normalizedSize,
        img_url,
        img_end_url,
        img_urls,
        video_url,
        video_urls,
        audio_urls,
        resolution: normalizedResolution,
        ratio,
        audio,
        audio_setting,
        generate_audio,
        draft,
        return_last_frame,
        camera_fixed,
        service_tier,
        callback_url,
        priority,
        seed,
        watermark,
        style,
        camera_movement,
        water_mark,
        audio_url,
        shot_type,
        motion_mode,
        prompt_extend,
        _route: {
          channelId: selected.channelId,
          region: selected.region,
          nativeBaseUrl: selected.apiBaseUrl,
          managed: selected.managed,
          rpm: selected.rpm,
          tpm: selected.tpm,
          dailyLimit: selected.dailyLimit,
          concurrentLimit: selected.concurrentLimit,
        },
      },
      billingReservationId: reservation.id,
    });
  } catch (error) {
    await releaseReservation(reservation.id);
    await releaseProviderCapacity(providerCapacityLease, 0);
    providerCapacityLease = null;
    throw error;
  }

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
    } else if (isSeedance) {
      adapted = adaptSeedanceRequest(apiKey, {
        model: modelId,
        prompt: prompt || "",
        resolution,
        ratio,
        duration,
        seed,
        watermark,
        img_url,
        img_end_url,
        img_urls,
        video_urls,
        audio_urls,
        audio,
        generate_audio,
        draft,
        return_last_frame,
        camera_fixed,
        service_tier,
        callback_url,
        priority,
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
        size: normalizedSize,
        resolution: normalizedResolution,
        ratio,
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

    const response = await safeProviderFetch(adapted.url, {
      method: adapted.method,
      headers: adapted.headers,
      body: JSON.stringify(adapted.body),
    });

    const data: any = await response.json();

    // Handle official PixVerse API response
    if (isPixVerseOfficial) {
      if (data.ErrCode !== 0) {
        recordFailure(selected.providerId, modelId, data.ErrMsg || "视频生成失败");
        await failTask(task.id, data.ErrMsg || "视频生成失败");
        await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime, task.billing_reservation_id);
        res.status(400).json({
          success: false,
          message: data.ErrMsg || "视频生成失败",
        });
        return;
      }

      recordSuccess(selected.providerId, modelId, Date.now() - startTime);
      const upstreamId = data.Resp?.video_id || data.Resp?.task_id;
      if (!upstreamId) {
        const won = await failTask(task.id, "Upstream did not return a task ID");
        if (won) await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime, task.billing_reservation_id);
        res.status(502).json({ success: false, message: "上游未返回任务 ID" });
        return;
      }
      await setUpstreamTaskId(task.id, String(upstreamId));

      sendVideoTaskCreated(res, task.id, upstreamId);
      return;
    }

    // Handle Volcengine Ark response: { id: "cgt-..." } on success, { error: {...} } on failure
    if (isVolcEngine) {
      if (!response.ok || data.error) {
        const errorMsg = data.error?.message || data.message || `HTTP ${response.status}`;
        recordFailure(selected.providerId, modelId, errorMsg);
        await failTask(task.id, errorMsg);
        await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime, task.billing_reservation_id);
        res.status(response.status || 400).json({
          success: false,
          message: errorMsg,
          detail: data,
        });
        return;
      }

      recordSuccess(selected.providerId, modelId, Date.now() - startTime);
      const upstreamId = data.id;
      if (!upstreamId || typeof upstreamId !== "string") {
        const won = await failTask(task.id, "Upstream did not return a task ID");
        if (won) await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime, task.billing_reservation_id);
        res.status(502).json({ success: false, message: "上游未返回任务 ID" });
        return;
      }
      await setUpstreamTaskId(task.id, upstreamId);

      sendVideoTaskCreated(res, task.id, upstreamId);
      return;
    }

    // Handle DashScope response
    if (!response.ok || data.code) {
      const errorMsg = data.message || `HTTP ${response.status}`;
      recordFailure(selected.providerId, modelId, errorMsg);
      await failTask(task.id, errorMsg);
      await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime, task.billing_reservation_id);
      res.status(response.status || 400).json({
        success: false,
        message: errorMsg,
        detail: data,
      });
      return;
    }

    recordSuccess(selected.providerId, modelId, Date.now() - startTime);

    if (!data.output?.task_id) {
      const won = await failTask(task.id, "Upstream did not return a task ID");
      if (won) await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime, task.billing_reservation_id);
      res.status(502).json({ success: false, message: "上游未返回任务 ID" });
      return;
    }
    await setUpstreamTaskId(task.id, data.output.task_id);

    sendVideoTaskCreated(res, task.id, data.output.task_id, data.output?.task_status);

  } catch (err: any) {
    recordFailure(selected.providerId, modelId, err.message);
    const won = await failTask(task.id, err.message);
    if (won) await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime, task.billing_reservation_id);
    res.status(500).json({
      success: false,
      message: `请求失败: ${err.message}`,
    });
  } finally {
    await releaseProviderCapacity(providerCapacityLease, 0);
  }
};

router.post("/generate", handleGenerate);
router.post("/generations", handleGenerate);

// GET /api/video/status/:taskId - Get video generation status
export const handleVideoStatus = async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  const caller = await authenticateCaller(req);
  if (!caller) {
    res.status(401).json({ success: false, message: "请先登录或提供有效的 API Key" });
    return;
  }
  
  // First try to find our internal task
  const task = await getTaskById(taskId);
  
  if (task) {
    if (!(await canAccessTask(req, task.user_id, task.api_key_id))) {
      res.status(403).json({ success: false, message: "无权查看该任务" });
      return;
    }

    // Use our task system
    if (task.status === "succeeded" || task.status === "failed") {
      if (task.status === "succeeded") {
        const model = models.find((item) => item.id === task.model);
        if (model) {
          try {
            await ensureAsyncTaskSettlement(task, model);
          } catch (error) {
            console.error(`[video] settlement repair failed for ${task.id}:`, error);
          }
        }
      }
      sendVideoTaskStatus(res, {
        taskId: task.id,
        status: task.status === "succeeded" ? "successful" : "failed",
        videoUrl: task.output?.video_url,
        error: task.error_message,
      });
      return;
    }

    if (!task.upstream_task_id) {
      sendVideoTaskStatus(res, { taskId: task.id, status: "pending" });
      return;
    }

    // Poll upstream
    try {
      let pollApiKey: string;
      let isPixVerseOfficialPoll: boolean;
      let isVolcEnginePoll: boolean;
      let pollApiBaseUrl: string | undefined;

      if (task.provider.includes(":")) {
        // Backward compatibility: old format "pixverse:channelId:adapter"
        const [, , adapter] = task.provider.split(":");
        isPixVerseOfficialPoll = adapter === "pixverse";
        isVolcEnginePoll = false;
        pollApiKey = isPixVerseOfficialPoll ? getPixVerseKey() : getDashScopeKey();
      } else {
        const providerRecord = await getProviderById(task.provider);
        if (!providerRecord) {
          res.status(500).json({ success: false, message: "渠道配置不存在" });
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
        pollApiBaseUrl = resolvedPollBaseUrl;
        isPixVerseOfficialPoll = resolvedPollBaseUrl.includes("pixverse.ai");
        isVolcEnginePoll = resolvedPollBaseUrl.includes("volces.com") || resolvedPollBaseUrl.includes("genvia.ai");
      }

      const controlledPoll = await pollTaskWithControl({
        task,
        actorId: caller.apiKeyId
          ? `api-key:${caller.apiKeyId}`
          : `session:${caller.userId}`,
        userId: caller.userId,
        poll: () => isPixVerseOfficialPoll
          ? pollPixVerseTask(pollApiKey, task.upstream_task_id!, pollApiBaseUrl)
          : isVolcEnginePoll
            ? pollVolcEngineTask(pollApiKey, task.upstream_task_id!, pollApiBaseUrl)
            : pollDashScopeTask(pollApiKey, task.upstream_task_id!, pollApiBaseUrl),
      });
      if (!controlledPoll.ok) {
        const storeUnavailable =
          controlledPoll.reason === "control_store_unavailable"
          || controlledPoll.reason === "provider_capacity_store_unavailable";
        res
          .status(storeUnavailable ? 503 : 429)
          .set("Retry-After", storeUnavailable ? "5" : "2")
          .json({
            success: false,
            message: storeUnavailable
              ? "任务状态服务暂时不可用"
              : "任务查询过于频繁或供应商容量不足",
            code: controlledPoll.reason,
          });
        return;
      }
      if (controlledPoll.state === "in_flight") {
        sendVideoTaskStatus(res, {
          taskId: task.id,
          status: task.status === "running" ? "processing" : "pending",
          progress: task.progress,
        });
        return;
      }
      const result = controlledPoll.result;

      if (result.status === "succeeded") {
        const model = models.find((m) => m.id === task.model);
        const cost = model ? await estimateDiscountedAsyncCost(task.user_id, model, task.input || {}) : 0;
        const won = await completeTask(task.id, result.output, cost);
        if (won && model) await billAsyncSuccess(task, model, cost, Date.now() - new Date(task.created_at).getTime());
      } else if (result.status === "failed") {
        const won = await failTask(task.id, result.error || "Task failed");
        if (won) await billAsyncError(
          task.user_id || task.api_key_id ? { id: task.api_key_id, user_id: task.user_id } : null,
          task.model,
          Date.now() - new Date(task.created_at).getTime(),
          task.billing_reservation_id,
        );
      } else {
        await updateTaskStatus(
          task.id,
          result.status === "running" ? "running" : "pending",
          result.progress || 0
        );
      }
      const persistedTask = (await getTaskById(task.id)) || task;
      sendVideoTaskStatus(res, {
        taskId: persistedTask.id,
        status: persistedTask.status === "succeeded"
          ? "successful"
          : persistedTask.status === "failed"
            ? "failed"
            : persistedTask.status === "running"
              ? "processing"
              : "pending",
        videoUrl: persistedTask.output?.video_url,
        error: persistedTask.error_message,
        progress: persistedTask.progress,
      });
      return;

    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: `查询失败: ${err.message}`,
      });
      return;
    }
  }

  // Never poll arbitrary upstream task IDs. Legacy creation endpoints now
  // return the internal task ID, which is owner-checked above.
  res.status(404).json({
    success: false,
    message: "任务不存在",
  });
};

router.get("/status/:taskId", handleVideoStatus);

export default router;
