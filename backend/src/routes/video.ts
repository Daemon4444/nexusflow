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
import {
  createTask,
  getTaskById,
  setUpstreamTaskId,
  completeTask,
  failTask,
  updateTaskStatus
} from "../data/tasks";
import { recordSuccess, recordFailure } from "../services/scheduler";
import { getProviderById } from "../data/providers";
import { getProviderChannel } from "../data/provider-channels";
import { billAsyncError, billAsyncSuccess, ensureAsyncTaskSettlement, estimateDiscountedAsyncCost, settleAsyncCost } from "../services/async-billing";
import { releaseReservation } from "../data/billing";
import { pollDashScopeTask, pollPixVerseTask, pollVolcEngineTask } from "../services/adapters";
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
import { adaptAsync, type AsyncAdapterCall } from "../traffic/async-submit";
import { enqueueAsyncTask, queuePosition } from "../traffic/queue";
import { asyncPolicy } from "../traffic/engine";
import {
  adapterForUpstream,
  authenticateApiKeyOrSession,
  bearerToken,
  canAccessTask,
  checkModelAccess,
  invokeUpstream,
  release,
  reserveBilling,
  reserveProviderCapacity,
  reserveQpm,
  resolveModel,
  selectRoute,
  capacityHttpStatus,
} from "../pipeline/stages";

const router = Router();

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

function sendVideoTaskQueued(res: Response, taskId: string, position: number): void {
  if (res.locals.videoLegacyEnvelope) {
    res.json({ request_id: randomUUID(), output: { task_id: taskId, task_status: "QUEUED", queue_position: position } });
    return;
  }
  res.json({ success: true, data: { task_id: taskId, status: "queued", queue_position: position } });
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

// Submit video generation task. Mounted as /api/video/generate and
// /v1/videos/generations for clients that expect an OpenAI-style video path.
export const handleGenerate = async (req: Request, res: Response) => {
  const ctx = new InferenceContext("video.generate", req, res);
  const startTime = ctx.startTime;
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

  if (!(await authenticateApiKeyOrSession(ctx, bearerToken(req)))) {
    res.status(401).json({ success: false, message: "请先登录或提供有效的 API Key" });
    return;
  }
  const caller = ctx.requireCaller();

  const model = resolveModel(ctx, modelId) ? ctx.requireModel() : null;
  if (!model || model.category !== "视频生成") {
    res.status(404).json({ success: false, message: "视频生成模型不存在" });
    return;
  }

  // 匿名 key（无归属用户）不允许创建任务：会绕过余额与白名单
  if (!caller.userId) {
    res.status(403).json({ success: false, message: "此 API Key 未关联用户账号，无法使用该接口。" });
    return;
  }

  if (!checkModelAccess(ctx)) {
    res.status(403).json({ success: false, message: `当前账号无权使用模型 '${modelId}'，请联系主账号授权。` });
    return;
  }

  const qpmFailure = await reserveQpm(ctx);
  if (qpmFailure) {
    res.status(429).json({ success: false, message: `模型 QPM 限流已触发：${qpmFailure.limit}/min` });
    return;
  }

  if (requiresImageInput(modelId) && !img_url && !img_urls?.length) {
    res.status(400).json({
      success: false,
      message: `${modelId} 需要传入 img_url 或 img_urls`,
    });
    return;
  }

  if (requiresVideoInput(modelId) && !video_url) {
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
      if (modelId.includes("-i2v") || modelId.startsWith("wan3.0-video") || modelId === "wan2.7-videoedit") {
        normalizedResolution = normalizeDashScopeVideoResolution(resolution, size, modelId);
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

  const routeFailure = await selectRoute(ctx);
  if (routeFailure) {
    res.status(routeFailure.status).json({
      success: false,
      ...upstreamErrorBody(routeFailure),
    });
    return;
  }
  const upstream = ctx.requireUpstream();
  const selected = { providerId: upstream.providerId, apiBaseUrl: upstream.nativeBaseUrl };
  const apiKey = upstream.apiKey;

  let estimatedCost: number;
  try {
    estimatedCost = await estimateDiscountedAsyncCost(caller.userId, model, {
      duration,
      quality,
      // t2v/r2v 归一化的结果落在 size 上而不是 resolution，漏传会让计费拿不到档位
      size: normalizedSize,
      resolution: normalizedResolution,
      video_url,
      audio,
      audio_setting,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "无法为该请求定价",
      code: "unsupported_video_parameters",
    });
    return;
  }
  const billingFailure = await reserveBilling(ctx, estimatedCost, "video", 30 * 24 * 60 * 60);
  if (billingFailure) {
    sendBillingReservationFailure(res, billingFailure, "api");
    return;
  }
  const reservation = ctx.billingReservation!;

  // The request/poll protocol follows the upstream adapter, not the URL.
  const taskProtocol = taskProtocolFor(ctx.adapter!);
  const isPixVerseOfficial = taskProtocol === "pixverse";
  const isVolcEngine = taskProtocol === "volcengine";

  // Upstream call, described as data so a queued task can be submitted later.
  let call: AsyncAdapterCall;
  if (isPixVerseOfficial) {
    call = { kind: "pixverse", args: {
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
    } };
  } else if (isSeedance) {
    call = { kind: "seedance", args: {
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
    } };
  } else if (isHappyHorse) {
    call = { kind: "happyhorse", args: {
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
    } };
  } else {
    call = { kind: "video", args: {
      model: modelId,
      prompt,
      negative_prompt,
      size: normalizedSize,
      resolution: normalizedResolution,
      ratio,
      duration: modelId === "wan2.7-videoedit" ? duration : (duration || 5),
      img_url,
      img_end_url,
      img_urls,
      video_url,
      video_urls,
      audio_urls,
      prompt_extend: prompt_extend !== undefined ? prompt_extend : true,
      seed,
      watermark,
      audio,
      audio_url,
      audio_setting,
      shot_type,
    } };
  }

  const taskInput = {
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
        channelId: upstream.channelId,
        region: upstream.region,
        nativeBaseUrl: upstream.nativeBaseUrl,
        managed: upstream.managed,
        rpm: upstream.rpm,
        tpm: upstream.tpm,
        dailyLimit: upstream.dailyLimit,
        concurrentLimit: upstream.concurrentLimit,
      },
    };

  // Create internal task record
  let task;
  try {
    const capacityFailure = await reserveProviderCapacity(ctx, 0, { overflow: "queue" });
    if (capacityFailure?.code === "capacity_exhausted" && capacityFailure.queue) {
      // NF_TRAFFIC_MODE=enforce: wait in the queue instead of failing (D1).
      const queued = await enqueueAsyncTask({
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
        modelId,
        providerId: selected.providerId,
        input: taskInput,
        call,
        billingReservationId: reservation.id,
        policy: asyncPolicy(modelId, caller.userId),
      });
      if (queued.ok) {
        sendVideoTaskQueued(res, queued.task.id, queued.position);
        return;
      }
      await releaseReservation(reservation.id, "provider_capacity_unavailable");
      res.status(capacityHttpStatus(res, capacityFailure)).json({ success: false, message: queued.message, code: queued.reason });
      return;
    }
    if (capacityFailure) {
      await releaseReservation(reservation.id, "provider_capacity_unavailable");
      res.status(capacityHttpStatus(res, capacityFailure)).json({
        success: false,
        message: capacityFailure.message,
        code: capacityFailure.code,
      });
      return;
    }

    task = await createTask({
      userId: caller.userId,
      apiKeyId: caller.apiKeyId,
      type: "video",
      model: modelId,
      provider: selected.providerId,
      input: taskInput,
      billingReservationId: reservation.id,
    });
  } catch (error) {
    await releaseReservation(reservation.id);
    await release(ctx, { releaseReservation: false });
    throw error;
  }

  // Build request based on provider
  try {
    const adapted = adaptAsync(call, apiKey, selected.apiBaseUrl);

    const response = await invokeUpstream(ctx, {
      url: adapted.url,
      method: adapted.method,
      headers: adapted.headers,
      auth: false,
      body: adapted.body,
      timeoutMs: null,
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
    await release(ctx, { releaseReservation: false });
  }
};

router.post("/generate", handleGenerate);
router.post("/generations", handleGenerate);

// GET /api/video/status/:taskId - Get video generation status
export const handleVideoStatus = async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  const ctx = new InferenceContext("video.status", req, res);
  const caller = (await authenticateApiKeyOrSession(ctx, bearerToken(req))) ? ctx.requireCaller() : null;
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

    if (task.status === "queued") {
      sendVideoTaskQueued(res, task.id, (await queuePosition(task)) ?? 1);
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
        const pollProtocol = taskProtocolFor(
          (await adapterForUpstream(providerRecord.id, taskChannelId || null, resolvedPollBaseUrl)).adapter
        );
        isPixVerseOfficialPoll = pollProtocol === "pixverse";
        isVolcEnginePoll = pollProtocol === "volcengine";
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
