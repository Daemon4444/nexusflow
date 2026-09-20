export class VideoParameterError extends Error {
  readonly code = "invalid_video_parameters";

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, VideoParameterError.prototype);
  }
}

const DASH_SCOPE_VIDEO_SIZES: Record<string, Record<string, string>> = {
  "720P": {
    "16:9": "1280*720",
    "9:16": "720*1280",
    "1:1": "960*960",
  },
  "1080P": {
    "16:9": "1920*1080",
    "9:16": "1080*1920",
    "1:1": "1440*1440",
  },
};

const ALLOWED_EXACT_SIZES = new Set(
  Object.values(DASH_SCOPE_VIDEO_SIZES).flatMap((ratios) => Object.values(ratios))
);

export function normalizeDashScopeVideoSize(input: {
  size?: unknown;
  resolution?: unknown;
  ratio?: unknown;
}): string {
  if (input.size !== undefined && input.size !== null && String(input.size).trim()) {
    const normalized = String(input.size).trim().toLowerCase().replace(/[x×]/g, "*");
    if (!ALLOWED_EXACT_SIZES.has(normalized)) {
      throw new VideoParameterError(
        `Unsupported video size '${String(input.size)}'. Use 1280*720, 720*1280, 960*960, 1920*1080, 1080*1920, or 1440*1440.`
      );
    }
    return normalized;
  }

  const resolution = String(input.resolution || "720P").trim().toUpperCase();
  const ratio = String(input.ratio || "16:9").trim();
  const size = DASH_SCOPE_VIDEO_SIZES[resolution]?.[ratio];
  if (!size) {
    throw new VideoParameterError(
      `Unsupported resolution/ratio combination '${resolution} ${ratio}'. Wan text-to-video supports 720P or 1080P with 16:9, 9:16, or 1:1.`
    );
  }
  return size;
}

export function normalizeDashScopeVideoResolution(
  resolution?: unknown,
  size?: unknown,
  modelId?: string
): "480P" | "720P" | "1080P" {
  const requested = resolution !== undefined && resolution !== null && String(resolution).trim()
    ? String(resolution).trim().toUpperCase()
    : String(size || "").includes("1080")
      ? "1080P"
      : undefined;

  if (modelId?.startsWith("wan3.0-video")) {
    const normalized = requested || "480P";
    if (normalized !== "480P") {
      throw new VideoParameterError("Wan 3.0 video models currently support only 480P.");
    }
    return normalized;
  }

  const normalized = requested || (modelId === "wan2.7-videoedit" ? "1080P" : "720P");
  if (normalized !== "720P" && normalized !== "1080P") {
    throw new VideoParameterError("Wan video resolution must be 720P or 1080P.");
  }
  return normalized;
}

export function requiresVideoInput(modelId: string): boolean {
  return modelId === "wan2.7-videoedit" || modelId.endsWith("-video-edit");
}

export function requiresImageInput(modelId: string): boolean {
  return modelId.includes("-i2v") || modelId.includes("-r2v");
}
