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

  const isPixVerse = modelId.startsWith("pixverse-");
  const isDashScope = modelId.startsWith("wan") || isHappyHorse;
  
  if (!isPixVerse && !isDashScope) {
    res.status(400).json({ success: false, message: `不支持的视频模型: ${modelId}` });
    return;
  }

  const apiKey = isPixVerse ? getPixVerseKey() : getDashScopeKey();
  if (!apiKey) {
    res.status(500).json({ 
      success: false, 
      message: isPixVerse ? "未配置 PixVerse API Key" : "未配置 DashScope API Key" 
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
    provider: isPixVerse ? "pixverse" : "dashscope",
    input: { prompt, duration, aspect_ratio, quality, negative_prompt, size, img_url, img_urls, video_url, resolution, ratio, audio_setting, seed, watermark },
  });

  // Build request based on provider
  try {
    let adapted;
    if (isPixVerse) {
      adapted = adaptPixVerseRequest(apiKey, {
        model: modelId,
        prompt,
        duration,
        aspect_ratio,
        quality,
        negative_prompt,
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
      // DashScope wan video models
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

    // Handle PixVerse response
    if (isPixVerse) {
      if (data.ErrCode !== 0) {
        failTask(task.id, data.ErrMsg || "视频生成失败");
        res.status(400).json({
          success: false,
          message: data.ErrMsg || "视频生成失败",
        });
        return;
      }

      if (data.Resp?.task_id) {
        setUpstreamTaskId(task.id, data.Resp.task_id);
      }

      res.json({
        success: true,
        data: {
          task_id: task.id,
          upstream_task_id: data.Resp?.task_id,
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
