/**
 * Image Generation API (for Playground)
 * 
 * Supports DashScope image models:
 * - wanx2.1-t2i-turbo/plus (text to image)
 * - z-image
 * - wanx-style-repaint (style transfer)
 * - wanx-background-generation
 */

import { Router, Request, Response } from "express";
import { models } from "../data/models";
import { 
  createTask, 
  getTaskById, 
  setUpstreamTaskId, 
  completeTask, 
  failTask,
  updateTaskStatus
} from "../data/tasks";
import { adaptImageRequest, pollDashScopeTask } from "../services/adapters";
import { billAsyncError, billAsyncSuccess, ensureAsyncTaskSettlement, estimateDiscountedAsyncCost } from "../services/async-billing";
import { releaseReservation } from "../data/billing";
import { sendBillingReservationFailure } from "../utils/billing-response";
import { upstreamErrorBody } from "../services/upstream";
import { getProviderById } from "../data/providers";
import { getProviderChannel } from "../data/provider-channels";
import { pollTaskWithControl } from "../services/task-poll-control";
import { InferenceContext } from "../pipeline/context";
import {
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
  capacityErrorType,
  capacityHttpStatus,
} from "../pipeline/stages";

const router = Router();

// POST /api/image/generate - Submit image generation task
router.post("/generate", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const {
    model: modelId,
    prompt,
    negative_prompt,
    size,
    n,
    ref_img,
    image_url,
    seed,
    style_index,
    style_ref_url,
    model_version,
    ref_prompt_weight,
  } = req.body;

  if (!modelId) {
    res.status(400).json({
      success: false,
      message: "请提供模型ID",
    });
    return;
  }

  const ctx = new InferenceContext("image.generate", req, res);
  if (!(await authenticateApiKeyOrSession(ctx, bearerToken(req)))) {
    res.status(401).json({ success: false, message: "请先登录或提供有效的 API Key" });
    return;
  }
  const caller = ctx.requireCaller();

  const model = resolveModel(ctx, modelId) ? ctx.requireModel() : null;
  if (!model || model.category !== "图像生成") {
    res.status(404).json({ success: false, message: "图像生成模型不存在" });
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

  const routeFailure = await selectRoute(ctx);
  if (routeFailure) {
    res.status(routeFailure.status).json({
      success: false,
      ...upstreamErrorBody(routeFailure),
    });
    return;
  }
  const upstream = ctx.requireUpstream();

  const requiresPrompt =
    modelId !== "wanx-style-repaint" &&
    modelId !== "wanx-style-repaint-v1" &&
    modelId !== "wanx-background-generation" &&
    modelId !== "wanx-background-generation-v2";
  if (requiresPrompt && !prompt) {
    res.status(400).json({
      success: false,
      message: "请提供提示词",
    });
    return;
  }

  if ((modelId === "wanx-style-repaint" || modelId === "wanx-style-repaint-v1") && !ref_img) {
    res.status(400).json({
      success: false,
      message: "风格重绘模型需要传入 ref_img",
    });
    return;
  }

  if ((modelId === "wanx-background-generation" || modelId === "wanx-background-generation-v2") && !ref_img) {
    res.status(400).json({
      success: false,
      message: "背景生成模型需要传入 ref_img",
    });
    return;
  }

  const estimatedCost = await estimateDiscountedAsyncCost(caller.userId, model, { n });
  const billingFailure = await reserveBilling(ctx, estimatedCost, "image", 30 * 24 * 60 * 60);
  if (billingFailure) {
    sendBillingReservationFailure(res, billingFailure, "api");
    return;
  }
  const reservation = ctx.billingReservation!;

  // Create internal task record
  let task;
  try {
    const capacityFailure = await reserveProviderCapacity(ctx, 0);
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
      type: "image",
      model: modelId,
      provider: upstream.providerId,
      input: {
        prompt,
        negative_prompt,
        size,
        n,
        ref_img,
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
      },
      billingReservationId: reservation.id,
    });
  } catch (error) {
    await releaseReservation(reservation.id);
    await release(ctx, { releaseReservation: false });
    throw error;
  }

  try {
    // Use the correct model ID for the API
    const actualModel = getActualModelId(modelId);
    
    const adapted = adaptImageRequest(upstream.apiKey, {
      model: actualModel,
      prompt,
      negative_prompt,
      size: size || "1024*1024",
      n: n || 1,
      ref_img,
      image_url,
      seed,
      style_index,
      style_ref_url,
      model_version,
      ref_prompt_weight,
    }, { nativeBase: upstream.nativeBaseUrl });

    const response = await invokeUpstream(ctx, {
      url: adapted.url,
      method: adapted.method,
      headers: adapted.headers,
      auth: false,
      body: adapted.body,
      timeoutMs: null,
    });

    const data: any = await response.json();

    if (!response.ok || data.code) {
      const errorMsg = data.message || `HTTP ${response.status}`;
      await failTask(task.id, errorMsg);
      await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime, task.billing_reservation_id);
      res.status(response.status || 400).json({
        success: false,
        message: errorMsg,
        detail: data,
      });
      return;
    }

    // Check if synchronous response (wan2.6 series returns result directly)
    if (!adapted.isAsync && data.output?.choices) {
      // Synchronous multimodal response - extract image URLs
      const choices = data.output.choices || [];
      const results = choices.map((choice: any) => {
        const imageContent = choice.message?.content?.find((c: any) => c.image);
        return imageContent ? { url: imageContent.image } : null;
      }).filter(Boolean);

      if (results.length > 0) {
        const won = await completeTask(task.id, { type: "image", results }, estimatedCost);
        if (won) await billAsyncSuccess(task, model, estimatedCost, Date.now() - startTime);
        res.json({
          success: true,
          data: {
            task_id: task.id,
            task_status: "SUCCEEDED",
            results: results,
          },
        });
      } else {
        const won = await failTask(task.id, "No image generated");
        if (won) await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime, task.billing_reservation_id);
        res.status(500).json({
          success: false,
          message: "图像生成失败，未返回结果",
        });
      }
      return;
    }

    // Async response - store upstream task ID for polling
    if (!data.output?.task_id) {
      const won = await failTask(task.id, "Upstream did not return a task ID");
      if (won) await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime, task.billing_reservation_id);
      res.status(502).json({ success: false, message: "上游未返回任务 ID" });
      return;
    }
    await setUpstreamTaskId(task.id, data.output.task_id);

    res.json({
      success: true,
      data: {
        task_id: task.id,
        upstream_task_id: data.output?.task_id,
        task_status: data.output?.task_status,
      },
    });
  } catch (err: any) {
    const won = await failTask(task.id, err.message);
    if (won) await billAsyncError(caller.errorIdentity, modelId, Date.now() - startTime, task.billing_reservation_id);
    res.status(500).json({
      success: false,
      message: `请求失败: ${err.message}`,
    });
  } finally {
    await release(ctx, { releaseReservation: false });
  }
});

// GET /api/image/status/:taskId - Get image generation status
router.get("/status/:taskId", async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;

  const ctx = new InferenceContext("image.status", req, res);
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
            console.error(`[image] settlement repair failed for ${task.id}:`, error);
          }
        }
      }
      res.json({
        success: true,
        data: {
          task_id: task.id,
          task_status: task.status === "succeeded" ? "SUCCEEDED" : "FAILED",
          results: task.output?.results,
          error: task.error_message,
        },
      });
      return;
    }

    if (!task.upstream_task_id) {
      res.json({
        success: true,
        data: { task_id: task.id, task_status: "PENDING" },
      });
      return;
    }

    // Poll upstream
    try {
      const taskProvider = await getProviderById(task.provider);
      const taskChannelId = task.input?._route?.channelId;
      const taskChannel = taskChannelId
        ? await getProviderChannel(task.provider, taskChannelId)
        : null;
      const taskApiKey = taskChannel?.api_key || taskProvider?.api_key || "";
      if (!taskApiKey) {
        res.status(503).json({
          success: false,
          message: "图像供应商尚未配置",
          code: "provider_not_configured",
        });
        return;
      }
      const controlledPoll = await pollTaskWithControl({
        task,
        actorId: caller.apiKeyId
          ? `api-key:${caller.apiKeyId}`
          : `session:${caller.userId}`,
        userId: caller.userId,
        poll: () => pollDashScopeTask(
          taskApiKey,
          task.upstream_task_id!,
          task.input?._route?.nativeBaseUrl
        ),
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
        res.json({
          success: true,
          data: {
            task_id: task.id,
            task_status: task.status === "running" ? "RUNNING" : "PENDING",
          },
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
      res.json({
        success: true,
        data: {
          task_id: persistedTask.id,
          task_status: persistedTask.status === "succeeded"
            ? "SUCCEEDED"
            : persistedTask.status === "failed"
              ? "FAILED"
              : persistedTask.status === "running"
                ? "RUNNING"
                : "PENDING",
          results: persistedTask.output?.results,
          error: persistedTask.error_message,
        },
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

  // Never interpret an arbitrary ID as an upstream provider task. Creation
  // always returns an owner-checked NexusFlow task ID.
  res.status(404).json({ success: false, message: "任务不存在" });
});

// Map frontend model IDs to actual DashScope model IDs (for legacy models)
function getActualModelId(modelId: string): string {
  // wan2.6/wan2.5 series are handled by adapters.ts
  if (modelId.startsWith("wan2.6") || modelId.startsWith("wan2.5")) {
    return modelId;
  }
  
  const mapping: Record<string, string> = {
    "wanx2.1-t2i-turbo": "wanx2.1-t2i-turbo",
    "wanx2.1-t2i-plus": "wanx2.1-t2i-plus",
    "z-image": "wanx-x",
    "wanx-style-repaint": "wanx-style-repaint-v1",
    "wanx-background-generation": "wanx-background-generation-v2",
    "wan2.2-t2i-plus": "wanx2.2-t2i-plus",
    "wan2.2-t2i-turbo": "wanx2.2-t2i-turbo",
  };
  return mapping[modelId] || modelId;
}

export default router;
