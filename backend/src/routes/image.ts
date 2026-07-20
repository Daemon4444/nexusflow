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
import { adaptImageRequest, pollDashScopeTask } from "../services/adapters";
import { billAsyncError, billAsyncSuccess, ensureAsyncTaskSettlement, estimateDiscountedAsyncCost } from "../services/async-billing";
import { releaseReservation, reserveBalance } from "../data/billing";
import { getEffectiveRateLimit } from "../data/ratelimits";
import { isModelAllowed } from "../data/model-access";
import { checkRPM } from "../services/rate-limiter";

const router = Router();

type Caller = {
  userId: string | null;
  apiKeyId: string | null;
  parentUserId: string | null;
  allowedModels: string | null;
  errorIdentity: { id: string | null; user_id: string | null } | null;
};

function getApiKey(): string {
  return process.env.DASHSCOPE_API_KEY || "";
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

  const caller = await authenticateCaller(req);
  if (!caller) {
    res.status(401).json({ success: false, message: "请先登录或提供有效的 API Key" });
    return;
  }

  const model = models.find((m) => m.id === modelId);
  if (!model || model.category !== "图像生成") {
    res.status(404).json({ success: false, message: "图像生成模型不存在" });
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
    const userLimits = await getEffectiveRateLimit(caller.userId, modelId);
    const rpmCheck = await checkRPM(`user:${caller.userId}:${modelId}`, userLimits.qpm);
    if (!rpmCheck.allowed) {
      res.status(429).json({ success: false, message: `模型 QPM 限流已触发：${userLimits.qpm}/min，请 ${Math.ceil(rpmCheck.resetMs / 1000)} 秒后重试` });
      return;
    }
  }

  const DASHSCOPE_API_KEY = getApiKey();
  if (!DASHSCOPE_API_KEY) {
    res.status(500).json({ success: false, message: "未配置 API Key" });
    return;
  }

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
  const reservation = await reserveBalance(caller.userId, estimatedCost, `image:${randomUUID()}`, 30 * 24 * 60 * 60);
  if (!reservation) {
    res.status(402).json({ success: false, message: "余额不足，请先充值" });
    return;
  }

  // Create internal task record
  let task;
  try {
    task = await createTask({
      userId: caller.userId,
      apiKeyId: caller.apiKeyId,
      type: "image",
      model: modelId,
      provider: "dashscope",
      input: { prompt, negative_prompt, size, n, ref_img },
      billingReservationId: reservation.id,
    });
  } catch (error) {
    await releaseReservation(reservation.id);
    throw error;
  }

  try {
    // Use the correct model ID for the API
    const actualModel = getActualModelId(modelId);
    
    const adapted = adaptImageRequest(DASHSCOPE_API_KEY, {
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
    });

    const response = await fetch(adapted.url, {
      method: adapted.method,
      headers: adapted.headers,
      body: JSON.stringify(adapted.body),
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
  }
});

// GET /api/image/status/:taskId - Get image generation status
router.get("/status/:taskId", async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;

  if (!(await authenticateCaller(req))) {
    res.status(401).json({ success: false, message: "请先登录或提供有效的 API Key" });
    return;
  }
  
  const DASHSCOPE_API_KEY = getApiKey();
  if (!DASHSCOPE_API_KEY) {
    res.status(500).json({ success: false, message: "未配置 API Key" });
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
      const result = await pollDashScopeTask(DASHSCOPE_API_KEY, task.upstream_task_id);

      if (result.status === "succeeded") {
        const model = models.find((m) => m.id === task.model);
        const cost = model ? await estimateDiscountedAsyncCost(task.user_id, model, task.input || {}) : 0;
        const won = await completeTask(task.id, result.output, cost);
        if (won && model) await billAsyncSuccess(task, model, cost, Date.now() - new Date(task.created_at).getTime());
        res.json({
          success: true,
          data: {
            task_id: task.id,
            task_status: "SUCCEEDED",
            results: result.output?.results,
          },
        });
      } else if (result.status === "failed") {
        const won = await failTask(task.id, result.error || "Task failed");
        if (won) await billAsyncError(
          task.user_id || task.api_key_id ? { id: task.api_key_id, user_id: task.user_id } : null,
          task.model,
          Date.now() - new Date(task.created_at).getTime(),
          task.billing_reservation_id,
        );
        res.json({
          success: true,
          data: {
            task_id: task.id,
            task_status: "FAILED",
            error: result.error,
          },
        });
      } else {
        await updateTaskStatus(task.id, result.status, result.progress || 0);
        res.json({
          success: true,
          data: {
            task_id: task.id,
            task_status: result.status === "running" ? "RUNNING" : "PENDING",
          },
        });
      }
      return;

    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: `查询失败: ${err.message}`,
      });
      return;
    }
  }

  // Fallback: treat as direct DashScope task ID
  if (!(await authenticateCaller(req))) {
    res.status(401).json({ success: false, message: "请先登录或提供有效的 API Key" });
    return;
  }

  try {
    const result = await pollDashScopeTask(DASHSCOPE_API_KEY, taskId);

    res.json({
      success: true,
      data: {
        task_id: taskId,
        task_status: result.status === "succeeded" ? "SUCCEEDED"
          : result.status === "failed" ? "FAILED"
          : result.status === "running" ? "RUNNING" : "PENDING",
        results: result.output?.results,
        error: result.error,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: `查询失败: ${err.message}`,
    });
  }
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
