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

const router = Router();

function getApiKey(): string {
  return process.env.DASHSCOPE_API_KEY || "";
}

// POST /api/image/generate - Submit image generation task
router.post("/generate", async (req: Request, res: Response) => {
  const {
    model: modelId,
    prompt,
    negative_prompt,
    size,
    n,
    ref_img,
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

  const model = models.find((m) => m.id === modelId);
  if (!model || model.category !== "图像生成") {
    res.status(404).json({ success: false, message: "图像生成模型不存在" });
    return;
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

  // Create internal task record
  const task = createTask({
    type: "image",
    model: modelId,
    provider: "dashscope",
    input: { prompt, negative_prompt, size, n, ref_img },
  });

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
      failTask(task.id, errorMsg);
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
        completeTask(task.id, { type: "image", results }, 0);
        res.json({
          success: true,
          data: {
            task_id: task.id,
            task_status: "SUCCEEDED",
            results: results,
          },
        });
      } else {
        failTask(task.id, "No image generated");
        res.status(500).json({
          success: false,
          message: "图像生成失败，未返回结果",
        });
      }
      return;
    }

    // Async response - store upstream task ID for polling
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

// GET /api/image/status/:taskId - Get image generation status
router.get("/status/:taskId", async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  
  const DASHSCOPE_API_KEY = getApiKey();
  if (!DASHSCOPE_API_KEY) {
    res.status(500).json({ success: false, message: "未配置 API Key" });
    return;
  }

  // First try to find our internal task
  const task = getTaskById(taskId);
  
  if (task) {
    // Use our task system
    if (task.status === "succeeded" || task.status === "failed") {
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
        completeTask(task.id, result.output, 0);
        res.json({
          success: true,
          data: {
            task_id: task.id,
            task_status: "SUCCEEDED",
            results: result.output?.results,
          },
        });
      } else if (result.status === "failed") {
        failTask(task.id, result.error || "Task failed");
        res.json({
          success: true,
          data: {
            task_id: task.id,
            task_status: "FAILED",
            error: result.error,
          },
        });
      } else {
        updateTaskStatus(task.id, result.status, result.progress || 0);
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
