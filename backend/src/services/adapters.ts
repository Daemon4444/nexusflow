import { randomUUID } from "crypto";
import { normalizeDashScopeVideoResolution, normalizeDashScopeVideoSize } from "../utils/video-parameters";

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
    seed?: number;
    style_index?: number;
    style_ref_url?: string;
    model_version?: "v2" | "v3";
    ref_prompt_weight?: number;
  },
  options: { nativeBase?: string } = {}
): AdapterResult {
  const base = (options.nativeBase || DASHSCOPE_BASE).replace(/\/$/, "");
  const normalizedSize = normalizeImageSize(body.size);
  const sourceImage = body.ref_img || body.image_url;

  if (body.model === "wanx-style-repaint" || body.model === "wanx-style-repaint-v1") {
    return adaptStyleRepaintRequest(apiKey, body, sourceImage, base);
  }

  if (body.model === "wanx-background-generation" || body.model === "wanx-background-generation-v2") {
    return adaptBackgroundGenerationRequest(apiKey, body, sourceImage, base);
  }

  // Check if it's wan2.6 series (uses new multimodal API)
  const isWan26 = body.model.startsWith("wan2.6") || body.model.startsWith("wan2.5");

  if (isWan26) {
    return adaptWan26ImageRequest(apiKey, { ...body, size: normalizedSize }, base);
  }
  
  // Legacy wanx format
  const dashscopeBody: any = {
    model: body.model,
    input: {
      prompt: body.prompt || "",
      ...(body.negative_prompt && { negative_prompt: body.negative_prompt }),
    },
    parameters: {
      size: normalizedSize || "1024*1024",
      n: body.n || 1,
      ...(body.seed !== undefined && body.seed !== null && { seed: body.seed }),
    },
  };

  return {
    url: `${base}/api/v1/services/aigc/text2image/image-synthesis`,
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
  body: { model: string; prompt?: string; n?: number; size?: string; negative_prompt?: string; seed?: number },
  base: string = DASHSCOPE_BASE
): AdapterResult {
  // wan2.6-t2i uses the model name directly (no mapping needed)
  const dashscopeBody: any = {
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
      ...(body.seed !== undefined && body.seed !== null && { seed: body.seed }),
    },
  };

  return {
    url: `${base}/api/v1/services/aigc/multimodal-generation/generation`,
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
  sourceImage?: string,
  base: string = DASHSCOPE_BASE
): AdapterResult {
  const styleIndex = body.style_ref_url ? -1 : body.style_index ?? 3;

  return {
    url: `${base}/api/v1/services/aigc/image-generation/generation`,
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
  sourceImage?: string,
  base: string = DASHSCOPE_BASE
): AdapterResult {
  const parameters: Record<string, unknown> = {
    n: body.n || 1,
    model_version: body.model_version || "v3",
  };

  if (body.ref_prompt_weight !== undefined) {
    parameters.ref_prompt_weight = body.ref_prompt_weight;
  }

  return {
    url: `${base}/api/v1/services/aigc/background-generation/generation/`,
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
    resolution?: string;
    ratio?: string;
    duration?: number;
    img_url?: string;
    img_urls?: string[];
    video_url?: string;
    prompt_extend?: boolean;
    seed?: number;
    watermark?: boolean;
    audio?: boolean;
    audio_url?: string;
    shot_type?: string;
  }
): AdapterResult {
  const isI2V = body.model.includes("i2v");
  const isR2V = body.model.includes("r2v");

  const input: any = {
    prompt: body.prompt,
  };
  if (body.negative_prompt) input.negative_prompt = body.negative_prompt;
  if (body.img_url && (isI2V || !isR2V)) input.img_url = body.img_url;
  if (body.audio_url) input.audio_url = body.audio_url;
  if (isR2V) {
    if (body.img_urls && body.img_urls.length > 0) input.reference_urls = body.img_urls;
    else if (body.img_url) input.reference_urls = [body.img_url];
    if (body.video_url) input.reference_video_urls = [body.video_url];
  }

  const parameters: any = {};
  if (isI2V) {
    parameters.resolution = normalizeDashScopeVideoResolution(body.resolution, body.size);
  } else {
    parameters.size = normalizeDashScopeVideoSize({
      size: body.size,
      resolution: body.resolution,
      ratio: body.ratio,
    });
  }
  if (body.duration) parameters.duration = body.duration;
  if (body.prompt_extend !== undefined) parameters.prompt_extend = body.prompt_extend;
  if (body.seed !== undefined && body.seed !== null) parameters.seed = body.seed;
  if (body.watermark !== undefined) parameters.watermark = body.watermark;
  if (body.audio !== undefined) parameters.audio = body.audio;
  if (body.shot_type) parameters.shot_type = body.shot_type;

  const dashscopeBody = {
    model: getDashScopeVideoModel(body.model),
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

function getDashScopeVideoModel(model: string): string {
  const modelMap: Record<string, string> = {
    "pixverse-v6": "pixverse/pixverse-v6-t2v",
  };
  return modelMap[model] || model;
}


// ============================================================
// HappyHorse Video Adapter (DashScope async)
// ============================================================

/**
 * Convert unified video request to HappyHorse DashScope format
 *
 * Supports 4 model variants:
 * - happyhorse-1.0-t2v: Text-to-Video
 * - happyhorse-1.0-i2v: Image-to-Video (first_frame)
 * - happyhorse-1.0-r2v: Reference-to-Video (1-9 reference_image)
 * - happyhorse-1.0-video-edit: Video editing (video + 0-5 reference_image)
 */
export function adaptHappyHorseRequest(
  apiKey: string,
  body: {
    model: string;
    prompt: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    seed?: number;
    watermark?: boolean;
    img_url?: string;
    img_urls?: string[];
    video_url?: string;
    audio_setting?: string;
  }
): AdapterResult {
  const input: any = {};
  const parameters: any = {};

  // Common parameters - HappyHorse expects uppercase resolution format (720P/1080P)
  if (body.resolution) parameters.resolution = body.resolution.toUpperCase();
  if (body.duration) parameters.duration = body.duration;
  if (body.seed !== undefined && body.seed !== null) parameters.seed = body.seed;
  if (body.watermark !== undefined) parameters.watermark = body.watermark;

  if (body.model === "happyhorse-1.0-t2v") {
    // T2V: prompt + ratio
    input.prompt = body.prompt;
    if (body.ratio) parameters.ratio = body.ratio;

  } else if (body.model === "happyhorse-1.0-i2v") {
    // I2V: prompt (optional) + first_frame image
    if (body.prompt) input.prompt = body.prompt;
    input.media = [
      { type: "first_frame", url: body.img_url }
    ];

  } else if (body.model === "happyhorse-1.0-r2v") {
    // R2V: prompt (required) + 1-9 reference_images
    input.prompt = body.prompt;
    const urls = body.img_urls || (body.img_url ? [body.img_url] : []);
    input.media = urls.map((url: string) => ({ type: "reference_image", url }));
    if (body.ratio) parameters.ratio = body.ratio;

  } else if (body.model === "happyhorse-1.0-video-edit") {
    // Video-Edit: prompt (required) + video + 0-5 reference_images
    input.prompt = body.prompt;
    input.media = [
      { type: "video", url: body.video_url }
    ];
    // Append reference images if provided
    const refUrls = body.img_urls || [];
    for (const url of refUrls) {
      input.media.push({ type: "reference_image", url });
    }
    if (body.audio_setting) parameters.audio_setting = body.audio_setting;
  }

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
// Seedance Video Adapter (Volcengine Ark)
// ============================================================

const VOLCENGINE_ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3";

/**
 * Seedance model ID mapping (nexusflow public ID → upstream model ID).
 * Override per-ID via env: SEEDANCE_<ID>_MODEL_ID (e.g. SEEDANCE_2_0_MODEL_ID).
 *
 * seedance-2.0 / -fast / -mini route through the "volcengine-uaep1" provider
 * (token.genvia.ai relay, see provider_capacity), whose upstream model IDs use
 * the relay's own naming (seedance2.0-pro-uaep1 etc.), not the raw Ark model IDs.
 * The other 3 (1.5-pro / 1.0-pro / 1.0-pro-fast) still route through the direct
 * "volcengine-ark" provider and keep the real Ark model IDs (currently demo/no key).
 */
const SEEDANCE_MODEL_MAP: Record<string, string> = {
  "seedance-2.0": "seedance2.0-pro-uaep1",
  "seedance-2.0-fast": "seedance2.0-fast-uaep1",
  "seedance-2.0-mini": "seedance2.0-mini-uaep1",
  "seedance-1.5-pro": "doubao-seedance-1-5-pro-251215",
  "seedance-1.0-pro": "doubao-seedance-1-0-pro-250528",
  "seedance-1.0-pro-fast": "doubao-seedance-1-0-pro-fast-251015",
};

function getSeedanceUpstreamModel(modelId: string): string {
  // 去掉 "seedance-" 前缀，使 env 名与文档一致：seedance-2.0 → SEEDANCE_2_0_MODEL_ID
  const envKey = `SEEDANCE_${modelId.replace(/^seedance-/, "").toUpperCase().replace(/[.-]/g, "_")}_MODEL_ID`;
  const envOverride = process.env[envKey];
  if (envOverride) return envOverride;
  return SEEDANCE_MODEL_MAP[modelId] || modelId;
}

/**
 * Convert unified video request to Volcengine Seedance format.
 *
 * Unified body fields (nexusflow → Seedance):
 * - prompt: text prompt (optional when media provided)
 * - img_url: first frame image URL
 * - img_end_url: last frame image URL (enables first+last frame mode)
 * - img_urls: reference images (0-9, multi-modal ref, 2.0 only)
 * - video_urls: reference videos (0-3, multi-modal ref, 2.0 only)
 * - audio_urls: reference audios (0-3, multi-modal ref, 2.0 only)
 * - resolution: 480p / 720p / 1080p / 4k
 * - ratio: 16:9 / 4:3 / 1:1 / 3:4 / 9:16 / 21:9 / adaptive
 * - duration: integer seconds
 * - seed: integer (not supported on 2.0 series)
 * - watermark: boolean
 * - generate_audio | audio: boolean (2.0 and 1.5 Pro only, default true)
 * - draft: boolean (1.5 Pro only)
 * - return_last_frame: boolean
 * - camera_fixed: boolean (not on 2.0, not with reference images)
 * - service_tier: "default" | "flex" (not on 2.0)
 * - callback_url: string
 * - priority: 0-9 (2.0 only)
 *
 * Doc: https://www.volcengine.com/docs/82379/1520757
 */
export function adaptSeedanceRequest(
  apiKey: string,
  body: {
    model: string;
    prompt?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    seed?: number;
    watermark?: boolean;
    img_url?: string;
    img_end_url?: string;
    img_urls?: string[];
    video_urls?: string[];
    audio_urls?: string[];
    audio?: boolean;
    generate_audio?: boolean;
    draft?: boolean;
    return_last_frame?: boolean;
    camera_fixed?: boolean;
    service_tier?: string;
    callback_url?: string;
    priority?: number;
  },
  apiBaseUrl: string = VOLCENGINE_ARK_BASE
): AdapterResult {
  const content: any[] = [];

  if (body.prompt) {
    content.push({ type: "text", text: body.prompt });
  }

  const isSeedance20 = body.model.startsWith("seedance-2.0");
  const hasMultiModalRef =
    isSeedance20 &&
    ((body.img_urls && body.img_urls.length > 0) ||
      (body.video_urls && body.video_urls.length > 0) ||
      (body.audio_urls && body.audio_urls.length > 0));

  if (hasMultiModalRef) {
    for (const url of body.img_urls || []) {
      content.push({
        type: "image_url",
        image_url: { url },
        role: "reference_image",
      });
    }
    for (const url of body.video_urls || []) {
      content.push({
        type: "video_url",
        video_url: { url },
        role: "reference_video",
      });
    }
    for (const url of body.audio_urls || []) {
      content.push({
        type: "audio_url",
        audio_url: { url },
        role: "reference_audio",
      });
    }
  } else if (body.img_url && body.img_end_url) {
    content.push({
      type: "image_url",
      image_url: { url: body.img_url },
      role: "first_frame",
    });
    content.push({
      type: "image_url",
      image_url: { url: body.img_end_url },
      role: "last_frame",
    });
  } else if (body.img_url) {
    content.push({
      type: "image_url",
      image_url: { url: body.img_url },
      role: "first_frame",
    });
  }

  if (content.length === 0) {
    throw new Error("Seedance request requires at least a prompt or an image input");
  }

  const requestBody: any = {
    model: getSeedanceUpstreamModel(body.model),
    content,
  };

  if (body.resolution) requestBody.resolution = body.resolution;
  if (body.ratio) requestBody.ratio = body.ratio;
  if (body.duration !== undefined && body.duration !== null) {
    requestBody.duration = body.duration;
  }
  if (body.seed !== undefined && body.seed !== null && !isSeedance20) {
    requestBody.seed = body.seed;
  }
  if (body.watermark !== undefined) requestBody.watermark = body.watermark;
  if (body.camera_fixed !== undefined && !isSeedance20) {
    requestBody.camera_fixed = body.camera_fixed;
  }
  if (body.return_last_frame !== undefined) {
    requestBody.return_last_frame = body.return_last_frame;
  }
  if (body.service_tier && !isSeedance20) {
    requestBody.service_tier = body.service_tier;
  }
  if (body.callback_url) requestBody.callback_url = body.callback_url;

  // generate_audio: only 2.0 series and 1.5 Pro
  const supportsAudio = isSeedance20 || body.model === "seedance-1.5-pro";
  if (supportsAudio) {
    const genAudio =
      typeof body.generate_audio === "boolean"
        ? body.generate_audio
        : typeof body.audio === "boolean"
          ? body.audio
          : true;
    requestBody.generate_audio = genAudio;
  }

  // draft: 1.5 Pro only
  if (body.model === "seedance-1.5-pro" && body.draft !== undefined) {
    requestBody.draft = body.draft;
  }

  // priority: 2.0 only
  if (isSeedance20 && body.priority !== undefined) {
    requestBody.priority = body.priority;
  }

  return {
    url: `${apiBaseUrl.replace(/\/$/, "")}/contents/generations/tasks`,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: requestBody,
    isAsync: true,
  };
}

// ============================================================
// Volcengine Ark Task Status Polling
// ============================================================

export async function pollVolcEngineTask(apiKey: string, taskId: string, apiBaseUrl: string = VOLCENGINE_ARK_BASE): Promise<TaskResult> {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/contents/generations/tasks/${taskId}`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  const data: any = await response.json();

  if (!response.ok || data.error) {
    return {
      status: "failed",
      error: data.error?.message || data.message || `Task query failed (HTTP ${response.status})`,
    };
  }

  const statusMap: Record<string, TaskResult["status"]> = {
    "queued": "pending",
    "running": "running",
    "succeeded": "succeeded",
    "failed": "failed",
    "expired": "failed",
  };

  const status = statusMap[data.status] || "pending";

  const result: TaskResult = {
    status,
    usage: data.usage,
  };

  if (status === "succeeded") {
    const content = data.content || {};
    const output: any = { type: "video" };
    if (content.video_url) output.video_url = content.video_url;
    if (content.last_frame_url) output.last_frame_url = content.last_frame_url;
    if (content.file_url) output.file_url = content.file_url;
    if (data.duration !== undefined) output.duration = data.duration;
    if (data.resolution) output.resolution = data.resolution;
    if (data.ratio) output.ratio = data.ratio;
    if (data.generate_audio !== undefined) output.generate_audio = data.generate_audio;
    if (data.seed !== undefined) output.seed = data.seed;
    if (data.frames !== undefined) output.frames = data.frames;
    if (data.framespersecond !== undefined) output.framespersecond = data.framespersecond;
    result.output = output;
    result.progress = 100;
  } else if (status === "failed") {
    result.error = data.error?.message || "Task failed";
  } else if (status === "running") {
    result.progress = 50;
  }

  return result;
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
  body: {
    model: string;
    prompt: string;
    duration?: number;
    aspect_ratio?: string;
    quality?: string;
    resolution?: string;
    negative_prompt?: string;
    img_url?: string;
    motion_mode?: string;
    seed?: number;
    style?: string;
    camera_movement?: string;
    water_mark?: boolean;
    watermark?: boolean;
    audio?: boolean | number;
  },
  apiBaseUrl = "https://app-api.pixverse.ai/openapi/v2"
): AdapterResult {
  const modelMap: Record<string, string> = {
    "pixverse-v6": "v6",
  };

  const pixBody: any = {
    prompt: body.prompt,
    model: modelMap[body.model] || "v6",
    duration: body.duration || 5,
    aspect_ratio: body.aspect_ratio || "16:9",
    quality: body.quality || body.resolution || "540p",
  };
  if (body.negative_prompt) pixBody.negative_prompt = body.negative_prompt;
  if (body.img_url) pixBody.img_url = body.img_url;
  if (body.motion_mode) pixBody.motion_mode = body.motion_mode;
  if (body.seed !== undefined && body.seed !== null) pixBody.seed = body.seed;
  if (body.style) pixBody.style = body.style;
  if (body.camera_movement) pixBody.camera_movement = body.camera_movement;
  if (body.water_mark !== undefined) pixBody.water_mark = body.water_mark;
  else if (body.watermark !== undefined) pixBody.water_mark = body.watermark;
  if (body.audio !== undefined) pixBody.audio = body.audio === true || body.audio === 1 ? 1 : 0;

  const endpoint = body.img_url ? "/video/image/generate" : "/video/text/generate";

  return {
    url: `${apiBaseUrl.replace(/\/$/, "")}${endpoint}`,
    method: "POST",
    headers: {
      "API-KEY": apiKey,
      "Content-Type": "application/json",
      "Ai-trace-id": randomUUID(),
    },
    body: pixBody,
    isAsync: true,
  };
}

export async function pollPixVerseTask(apiKey: string, taskId: string, apiBaseUrl = "https://app-api.pixverse.ai/openapi/v2"): Promise<TaskResult> {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/video/result/${taskId}`, {
    headers: {
      "API-KEY": apiKey,
      "Ai-trace-id": randomUUID(),
    },
  });

  const data: any = await response.json();

  if (data.ErrCode !== 0) {
    return { status: "failed", error: data.ErrMsg || "Query failed" };
  }

  const statusMap: Record<string, TaskResult["status"]> = {
    "1": "succeeded",
    "5": "running",
    "7": "failed",
    "8": "failed",
    pending: "pending",
    processing: "running",
    successful: "succeeded",
    failed: "failed",
  };

  const rawStatus = data.Resp?.status;
  const result: TaskResult = {
    status: statusMap[String(rawStatus)] || "pending",
  };

  if (result.status === "succeeded") {
    result.output = {
      type: "video",
      video_url: data.Resp?.url || data.Resp?.video_url,
    };
    result.progress = 100;
  } else if (result.status === "failed") {
    result.error = data.Resp?.err_msg || data.Resp?.message || data.ErrMsg || "Video generation failed";
  } else if (result.status === "running") {
    result.progress = 50;
  }

  return result;
}
