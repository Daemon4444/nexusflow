/**
 * Legacy PixVerse/DashScope-compatible paths.
 *
 * These routes intentionally delegate to the canonical video task pipeline so
 * authentication, model access, provider routing, balance reservations,
 * settlement and task ownership cannot drift from /v1/videos/generations.
 */

import { Router, Request, Response } from "express";
import { handleGenerate, handleVideoStatus } from "./video";

const router = Router();

type LegacyMedia = {
  type?: string;
  url?: string;
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function mediaUrls(media: unknown): { images: string[]; videos: string[] } {
  if (!Array.isArray(media)) return { images: [], videos: [] };
  const images: string[] = [];
  const videos: string[] = [];
  for (const item of media as LegacyMedia[]) {
    if (!item?.url || typeof item.url !== "string") continue;
    if (item.type === "video" || item.type === "video_url") videos.push(item.url);
    else images.push(item.url);
  }
  return { images, videos };
}

async function handleLegacyGenerate(req: Request, res: Response): Promise<void> {
  const body = asRecord(req.body);
  const input = asRecord(body.input);
  const parameters = asRecord(body.parameters);
  const media = mediaUrls(input.media);

  req.body = {
    ...body,
    model: body.model || "pixverse-v6",
    prompt: input.prompt ?? body.prompt ?? "",
    negative_prompt: input.negative_prompt ?? body.negative_prompt,
    duration: parameters.duration ?? body.duration,
    aspect_ratio: parameters.aspect_ratio ?? body.aspect_ratio,
    ratio: parameters.ratio ?? parameters.aspect_ratio ?? body.ratio ?? body.aspect_ratio,
    quality: parameters.quality ?? parameters.resolution ?? body.quality,
    resolution: parameters.resolution ?? body.resolution,
    size: parameters.size ?? body.size,
    audio: parameters.audio ?? body.audio,
    watermark: parameters.watermark ?? body.watermark,
    seed: parameters.seed ?? body.seed,
    img_url: media.images[0] ?? input.image_url ?? body.image_url ?? body.img_url,
    img_end_url: media.images[1] ?? body.img_end_url,
    img_urls: media.images.length > 0 ? media.images : body.img_urls,
    video_url: media.videos[0] ?? body.video_url,
    video_urls: media.videos.length > 0 ? media.videos : body.video_urls,
  };
  res.locals.videoLegacyEnvelope = true;
  await handleGenerate(req, res);
}

async function handleLegacyStatus(req: Request, res: Response): Promise<void> {
  res.locals.videoLegacyEnvelope = true;
  await handleVideoStatus(req, res);
}

router.post("/text", handleLegacyGenerate);
router.post("/video-synthesis", handleLegacyGenerate);
router.post("/image", handleLegacyGenerate);
router.get("/tasks/:taskId", handleLegacyStatus);
router.get("/status/:taskId", handleLegacyStatus);

export default router;
