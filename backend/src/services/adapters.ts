/**
 * API Format Adapters
 * 
 * Converts between the unified OpenAI-style API format and provider-specific formats.
 * 
 * Supported adapters:
 * - chat: OpenAI-compatible (passthrough for DashScope compatible mode)
 * - embedding: OpenAI-compatible (passthrough)
 * - image: DashScope image generation (async)
 * - video: DashScope video generation (async)
 */

const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com";

// ============================================================
// Types
// ============================================================

export type ModelType = "chat" | "embedding" | "image" | "video" | "audio" | "unknown";

export interface AdapterResult {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  isAsync: boolean;  // Whether this returns a task_id that needs polling
}

export interface TaskResult {
  status: "pending" | "running" | "succeeded" | "failed";
  progress?: number;
  output?: any;       // URL(s) or other result data
  error?: string;
  usage?: any;
}

// ============================================================
// Model Type Detection
// ============================================================

export function detectModelType(category: string): ModelType {
  switch (category) {
    case "大语言模型":
    case "推理模型":
    case "多模态模型":
    case "编程模型":
    case "专业模型":
      return "chat";
    case "向量模型":
      return "embedding";
    case "图像生成":
      return "image";
    case "视频生成":
      return "video";
    case "语音模型":
      return "audio";
    default:
      return "unknown";
  }
}

// ============================================================
// Chat Adapter (OpenAI compatible - passthrough)
// ============================================================

export function adaptChatRequest(
  apiBaseUrl: string,
  apiKey: string,
  body: any
): AdapterResult {
  // DashScope compatible mode is already OpenAI format
  return {
    url: `${apiBaseUrl}/chat/completions`,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
    isAsync: false,
  };
}

// ============================================================
// Embedding Adapter (OpenAI compatible - passthrough)
// ============================================================

export function adaptEmbeddingRequest(
  apiBaseUrl: string,
  apiKey: string,
  body: any
): AdapterResult {
  return {
    url: `${apiBaseUrl}/embeddings`,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
    isAsync: false,
  };
}

// ============================================================
// Image Generation Adapter (DashScope async)
// ============================================================

/**
 * Convert OpenAI-style image request to DashScope format
 * 
 * OpenAI format:
 *   { model, prompt, n, size, negative_prompt }
 * 
 * DashScope format (legacy wanx):
 *   { model, input: { prompt, negative_prompt }, parameters: { size, n } }
 * 
 * DashScope format (wan2.6):
 *   { model, input: { messages: [...] }, parameters: { size, n, ... } }
 */
export function adaptImageRequest(
  apiKey: string,
  body: {
    model: string;
    prompt?: string;
    n?: number;
    size?: string;
    negative_prompt?: string;
    ref_img?: string;
    image_url?: string;
    style_index?: number;
    style_ref_url?: string;
    model_version?: "v2" | "v3";
    ref_prompt_weight?: number;
  }
): AdapterResult {
  const normalizedSize = normalizeImageSize(body.size);
  const sourceImage = body.ref_img || body.image_url;

  if (body.model === "wanx-style-repaint" || body.model === "wanx-style-repaint-v1") {
    return adaptStyleRepaintRequest(apiKey, body, sourceImage);
  }

  if (body.model === "wanx-background-generation" || body.model === "wanx-background-generation-v2") {
    return adaptBackgroundGenerationRequest(apiKey, body, sourceImage);
  }

  // Check if it's wan2.6 series (uses new multimodal API)
  const isWan26 = body.model.startsWith("wan2.6") || body.model.startsWith("wan2.5");
  
  if (isWan26) {
    return adaptWan26ImageRequest(apiKey, { ...body, size: normalizedSize });
  }
  
  // Legacy wanx format
  const dashscopeBody = {
    model: body.model,
    input: {
      prompt: body.prompt || "",
      ...(body.negative_prompt && { negative_prompt: body.negative_prompt }),
    },
    parameters: {
      size: normalizedSize || "1024*1024",
      n: body.n || 1,
    },
  };

  return {
    url: `${DASHSCOPE_BASE}/api/v1/services/aigc/text2image/image-synthesis`,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: dashscopeBody,
    isAsync: true,
  };
}

/**
 * Wan2.6 series uses new multimodal generation API (synchronous)
 * Endpoint: /api/v1/services/aigc/multimodal-generation/generation
 */
function adaptWan26ImageRequest(
  apiKey: string,
  body: { model: string; prompt?: string; n?: number; size?: string; negative_prompt?: string }
): AdapterResult {
  // wan2.6-t2i uses the model name directly (no mapping needed)
  const dashscopeBody = {
    model: body.model,
    input: {
      messages: [
        {
          role: "user",
          content: [
            { text: body.prompt || "" }
          ]
        }
      ]
    },
    parameters: {
      size: normalizeImageSize(body.size) || "1280*1280",
      n: body.n || 1,
      negative_prompt: body.negative_prompt || "",
      prompt_extend: true,
      watermark: false,
    },
  };

  return {
    url: `${DASHSCOPE_BASE}/api/v1/services/aigc/multimodal-generation/generation`,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: dashscopeBody,
    isAsync: false,  // Synchronous call - returns result directly
  };
}

function adaptStyleRepaintRequest(
  apiKey: string,
  body: {
    model: string;
    style_index?: number;
    style_ref_url?: string;
  },
  sourceImage?: string
): AdapterResult {
  const styleIndex = body.style_ref_url ? -1 : body.style_index ?? 3;

  return {
    url: `${DASHSCOPE_BASE}/api/v1/services/aigc/image-generation/generation`,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: {
      model: "wanx-style-repaint-v1",
      input: {
        image_url: sourceImage,
        style_index: styleIndex,
        ...(body.style_ref_url ? { style_ref_url: body.style_ref_url } : {}),
      },
    },
    isAsync: true,
  };
}

function adaptBackgroundGenerationRequest(
  apiKey: string,
  body: {
    prompt?: string;
    n?: number;
    model_version?: "v2" | "v3";
    ref_img?: string;
    image_url?: string;
    ref_prompt_weight?: number;
  },
  sourceImage?: string
): AdapterResult {
  const parameters: Record<string, unknown> = {
    n: body.n || 1,
    model_version: body.model_version || "v3",
  };

  if (body.ref_prompt_weight !== undefined) {
    parameters.ref_prompt_weight = body.ref_prompt_weight;
  }

  return {
    url: `${DASHSCOPE_BASE}/api/v1/services/aigc/background-generation/generation/`,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: {
      model: "wanx-background-generation-v2",
      input: {
        base_image_url: sourceImage,
        ...(body.prompt ? { ref_prompt: body.prompt } : {}),
      },
      parameters,
    },
    isAsync: true,
  };
}

function normalizeImageSize(size?: string): string | undefined {
  if (!size) return undefined;
  return size.replace(/x/gi, "*");
}

// ============================================================
// Video Generation Adapter (DashScope async)
// ============================================================

/**
 * Convert unified video request to DashScope format
 * 
 * Input: { model, prompt, negative_prompt, size, duration, img_url }
 * 
 * DashScope format:
 *   { model, input: { prompt, negative_prompt, img_url }, parameters: { size, duration, ... } }
 */
export function adaptVideoRequest(
  apiKey: string,
  body: {
    model: string;
    prompt: string;
    negative_prompt?: string;
    size?: string;
    duration?: number;
    img_url?: string;
    prompt_extend?: boolean;
  }
): AdapterResult {
  const input: any = {
    prompt: body.prompt,
  };
  if (body.negative_prompt) input.negative_prompt = body.negative_prompt;
  if (body.img_url) input.img_url = body.img_url;

  const parameters: any = {};
  if (body.size) parameters.size = body.size;
  if (body.duration) parameters.duration = body.duration;
  if (body.prompt_extend !== undefined) parameters.prompt_extend = body.prompt_extend;

  const dashscopeBody = {
    model: body.model,
    input,
    parameters,
  };

  return {
    url: `${DASHSCOPE_BASE}/api/v1/services/aigc/video-generation/video-synthesis`,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: dashscopeBody,
    isAsync: true,
  };
}

// ============================================================
// Task Status Polling (DashScope)
// ============================================================

export async function pollDashScopeTask(apiKey: string, taskId: string): Promise<TaskResult> {
  const response = await fetch(`${DASHSCOPE_BASE}/api/v1/tasks/${taskId}`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  const data: any = await response.json();

  if (!response.ok || data.code) {
    return {
      status: "failed",
      error: data.message || `Task query failed (HTTP ${response.status})`,
    };
  }

  const taskStatus = data.output?.task_status;
  const statusMap: Record<string, TaskResult["status"]> = {
    "PENDING": "pending",
    "RUNNING": "running",
    "SUCCEEDED": "succeeded",
    "FAILED": "failed",
    "CANCELED": "failed",
    "UNKNOWN": "pending",
  };

  const result: TaskResult = {
    status: statusMap[taskStatus] || "pending",
    usage: data.usage,
  };

  if (taskStatus === "SUCCEEDED") {
    // Image results
    if (data.output?.results) {
      result.output = {
        type: "image",
        results: data.output.results,
      };
    }
    // Video result
    if (data.output?.video_url) {
      result.output = {
        type: "video",
        video_url: data.output.video_url,
      };
    }
    result.progress = 100;
  } else if (taskStatus === "FAILED") {
    result.error = data.output?.message || data.output?.code || "Task failed";
  } else if (taskStatus === "RUNNING") {
    result.progress = 50;
  }

  return result;
}

// ============================================================
// PixVerse Adapter (for third-party video)
// ============================================================

export function adaptPixVerseRequest(
  apiKey: string,
  body: { model: string; prompt: string; duration?: number; aspect_ratio?: string; quality?: string; negative_prompt?: string }
): AdapterResult {
  const modelMap: Record<string, string> = {
    "pixverse-v4.5": "v4.5",
    "pixverse-v4": "v4",
    "pixverse-v3.5": "v3.5",
  };

  const pixBody: any = {
    prompt: body.prompt,
    model: modelMap[body.model] || "v4.5",
    duration: body.duration || 5,
    aspect_ratio: body.aspect_ratio || "16:9",
    quality: body.quality || "540p",
  };
  if (body.negative_prompt) pixBody.negative_prompt = body.negative_prompt;

  return {
    url: "https://app-api.pixverseai.cn/openapi/v2/video/text/generate",
    method: "POST",
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
      "Ai-Trace-Id": `air-${Date.now()}`,
    },
    body: pixBody,
    isAsync: true,
  };
}

export async function pollPixVerseTask(apiKey: string, taskId: string): Promise<TaskResult> {
  const response = await fetch(`https://app-api.pixverseai.cn/openapi/v2/video/result/${taskId}`, {
    headers: {
      "Api-Key": apiKey,
      "Ai-Trace-Id": `air-${Date.now()}`,
    },
  });

  const data: any = await response.json();

  if (data.ErrCode !== 0) {
    return { status: "failed", error: data.ErrMsg || "Query failed" };
  }

  const statusMap: Record<string, TaskResult["status"]> = {
    "pending": "pending",
    "processing": "running",
    "successful": "succeeded",
    "failed": "failed",
  };

  const result: TaskResult = {
    status: statusMap[data.Resp?.status] || "pending",
  };

  if (data.Resp?.status === "successful") {
    result.output = {
      type: "video",
      video_url: data.Resp.video_url,
    };
    result.progress = 100;
  } else if (data.Resp?.status === "failed") {
    result.error = "Video generation failed";
  } else if (data.Resp?.status === "processing") {
    result.progress = 50;
  }

  return result;
}
