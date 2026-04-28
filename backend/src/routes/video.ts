/**
 * Video Generation API (for Playground)
 * 
 * Supports both:
 * - DashScope video models (wanx / wan2.6 / happyhorse)
 * - PixVerse models (pixverse-v4.5, etc.)
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
import { getPixVerseRuntimeChannel } from "../services/pixverse-channel";
import {
  adaptVideoRequest,
  adaptHappyHorseRequest,
  adaptPixVerseRequest,
  pollDashScopeTask,
  pollPixVerseTask,
} from "../services/adapters";

const router = Router();

function getDashScopeKey(): string {
  return process.env.DASHSCOPE_API_KEY || "";
}

function getPixVerseKey(): string {
  return process.env.PIXVERSE_API_KEY || "";
}

// POST /api/video/generate - Submit video generation task
router.post("/generate", async (req: Request, res: Response) => {
  const { 
    model: modelId, prompt, duration, aspect_ratio, quality, negative_prompt, size,
    img_url, img_urls, video_url, resolution, ratio, audio_setting, seed, watermark
  } = req.body;

  if (!modelId) {
    res.status(400).json({ success: false, message: "请提供模型ID" });
    return;
  }

  // HappyHorse video-edit doesn't strictly require prompt at creation
  const isHappyHorse = modelId.startsWith("happyhorse-");
  if (!isHappyHorse && !prompt) {
    res.status(400).json({ success: false, message: "请提供提示词" });
    return;
  }

  const model = models.find((m) => m.id === modelId);
  if (!model || model.category !== "视频生成") {
    res.status(404).json({ success: false, message: "视频生成模型不存在" });
    return;
  }

  // PixVerse models - check channel config from database
  const isPixVerseModel = modelId.startsWith("pixverse-") || modelId.startsWith("pixverse/");
  const isDashScopeModel = modelId.startsWith("wan") || modelId.startsWith("wanx") || isHappyHorse;

  if (!isPixVerseModel && !isDashScopeModel) {
    res.status(400).json({ success: false, message: `不支持的视频模型: ${modelId}` });
    return;
  }

  // Get channel config for PixVerse models using new channel system
  let pixverseChannel: ReturnType<typeof getPixVerseRuntimeChannel> | null = null;
  if (isPixVerseModel) {
    pixverseChannel = getPixVerseRuntimeChannel();
  }

  // Determine adapter type
  const useDashScopeAdapter = isDashScopeModel || (pixverseChannel && pixverseChannel.adapter === "dashscope");
  const apiKey = pixverseChannel?.apiKey || (useDashScopeAdapter ? getDashScopeKey() : getPixVerseKey());

  if (!apiKey) {
    res.status(500).json({
      success: false,
      message: useDashScopeAdapter ? "未配置 DashScope API Key" : "未配置 PixVerse API Key"
    });
    return;
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

  // Create internal task record
  const task = createTask({
    type: "video",
    model: modelId,
    provider: useDashScopeAdapter ? "dashscope" : "pixverse",
    input: { prompt, duration, aspect_ratio, quality, negative_prompt, size, img_url, img_urls, video_url, resolution, ratio, audio_setting, seed, watermark },
  });

  // Build request based on provider/adapter
  try {
    let adapted;
    if (!useDashScopeAdapter && isPixVerseModel) {
      // Official PixVerse API (when channel is "official")
      adapted = adaptPixVerseRequest(apiKey, {
        model: modelId,
        prompt,
        duration,
        aspect_ratio: ratio || aspect_ratio,
        quality: resolution || quality,
        negative_prompt,
        img_url,
        motion_mode: req.body.motion_mode,
        seed: req.body.seed,
      });
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
      // DashScope API (wan video models, HappyHorse, or PixVerse via bailian channel)
      // adapters.ts handles model name normalization (pixverse-v6 -> pixverse/pixverse-v6-t2v)
      adapted = adaptVideoRequest(apiKey, {
        model: modelId,
        prompt,
        negative_prompt,
        size: size || "1280*720",
        duration: duration || 5,
        img_url: modelId.includes("i2v") ? img_url : undefined,
        prompt_extend: true,
      });
    }

    const response = await fetch(adapted.url, {
      method: adapted.method,
      headers: adapted.headers,
      body: JSON.stringify(adapted.body),
    });

    const data: any = await response.json();

    // Handle official PixVerse API response
    if (!useDashScopeAdapter && isPixVerseModel) {
      if (data.ErrCode !== 0) {
        failTask(task.id, data.ErrMsg || "视频生成失败");
        res.status(400).json({
          success: false,
          message: data.ErrMsg || "视频生成失败",
        });
        return;
      }

      // Official PixVerse API returns video_id in Resp
      const upstreamId = data.Resp?.video_id || data.Resp?.task_id;
      if (upstreamId) {
        setUpstreamTaskId(task.id, String(upstreamId));
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
      failTask(task.id, errorMsg);
      res.status(response.status || 400).json({
        success: false,
        message: errorMsg,
        detail: data,
      });
      return;
    }

    if (data.output?.task_id) {
      setUpstreamTaskId(task.id, data.output.task_id);
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
    failTask(task.id, err.message);
    res.status(500).json({
      success: false,
      message: `请求失败: ${err.message}`,
    });
  }
});

// GET /api/video/status/:taskId - Get video generation status
router.get("/status/:taskId", async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  
  // First try to find our internal task
  const task = getTaskById(taskId);
  
  if (task) {
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
      const isPixVerse = task.provider === "pixverse";
      const apiKey = isPixVerse ? getPixVerseKey() : getDashScopeKey();
      
      const result = isPixVerse
        ? await pollPixVerseTask(apiKey, task.upstream_task_id)
        : await pollDashScopeTask(apiKey, task.upstream_task_id);

      if (result.status === "succeeded") {
        completeTask(task.id, result.output, 0);
        res.json({
          success: true,
          data: {
            task_id: task.id,
            status: "successful",
            video_url: result.output?.video_url,
          },
        });
      } else if (result.status === "failed") {
        failTask(task.id, result.error || "Task failed");
        res.json({
          success: true,
          data: {
            task_id: task.id,
            status: "failed",
            error: result.error,
          },
        });
      } else {
        updateTaskStatus(task.id, result.status, result.progress || 0);
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
        message: `查询失败: ${err.message}`,
      });
      return;
    }
  }

  // Fallback: treat taskId as direct PixVerse/DashScope task ID (legacy support)
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
    message: "任务不存在",
  });
});

export default router;
