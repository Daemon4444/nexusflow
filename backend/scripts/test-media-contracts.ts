import assert from "node:assert/strict";
import { models } from "../src/data/models";
import { adaptHappyHorseRequest, adaptImageRequest, adaptVideoRequest } from "../src/services/adapters";
import { estimateAsyncCost } from "../src/services/async-billing";
import {
  normalizeDashScopeVideoResolution,
  requiresImageInput,
  requiresVideoInput,
  VideoParameterError,
} from "../src/utils/video-parameters";

const nativeBase = "https://workspace.cn-beijing.maas.aliyuncs.com";

const image = adaptImageRequest("test-key", {
  model: "wan2.7-image-pro",
  prompt: "restyle the object",
  image_url: "https://example.invalid/source.png",
  size: "2K",
  n: 2,
}, { nativeBase });
assert.equal(image.url, `${nativeBase}/api/v1/services/aigc/multimodal-generation/generation`);
assert.equal(image.isAsync, false);
assert.deepEqual(image.body.input.messages[0].content, [
  { image: "https://example.invalid/source.png" },
  { text: "restyle the object" },
]);
assert.equal(image.body.parameters.size, "2K");
assert.equal(image.body.parameters.negative_prompt, undefined);

const videoEdit = adaptVideoRequest("test-key", {
  model: "wan2.7-videoedit",
  prompt: "change the lighting",
  video_url: "https://example.invalid/source.mp4",
  img_urls: ["https://example.invalid/reference.png"],
  resolution: "1080P",
}, nativeBase);
assert.equal(videoEdit.url, `${nativeBase}/api/v1/services/aigc/video-generation/video-synthesis`);
assert.deepEqual(videoEdit.body.input.media, [
  { type: "video", url: "https://example.invalid/source.mp4" },
  { type: "reference_image", url: "https://example.invalid/reference.png" },
]);
assert.equal(videoEdit.body.parameters.resolution, "1080P");
assert.equal(videoEdit.body.parameters.duration, undefined);
assert.throws(
  () => adaptVideoRequest("test-key", { model: "wan2.7-videoedit", prompt: "edit" }, nativeBase),
  /requires video_url/
);

const wan30 = adaptVideoRequest("test-key", {
  model: "wan3.0-video",
  prompt: "animate",
  img_url: "https://example.invalid/first.png",
  resolution: "480P",
}, nativeBase);
assert.equal(wan30.body.parameters.resolution, "480P");
assert.deepEqual(wan30.body.input.media, [
  { type: "first_frame", url: "https://example.invalid/first.png" },
]);
assert.equal(normalizeDashScopeVideoResolution(undefined, undefined, "wan3.0-video"), "480P");
assert.throws(
  () => normalizeDashScopeVideoResolution("720P", undefined, "wan3.0-video"),
  VideoParameterError
);

for (const [model, expectedInput] of [
  ["happyhorse-1.1-t2v", { prompt: "horse" }],
  ["happyhorse-1.1-i2v", { prompt: "horse", media: [{ type: "first_frame", url: "https://example.invalid/first.png" }] }],
  ["happyhorse-1.1-r2v", { prompt: "horse", media: [{ type: "reference_image", url: "https://example.invalid/ref.png" }] }],
] as const) {
  const adapted = adaptHappyHorseRequest("test-key", {
    model,
    prompt: "horse",
    img_url: model.endsWith("i2v") ? "https://example.invalid/first.png" : undefined,
    img_urls: model.endsWith("r2v") ? ["https://example.invalid/ref.png"] : undefined,
  }, nativeBase);
  assert.deepEqual(adapted.body.input, expectedInput);
  assert.equal(adapted.url, `${nativeBase}/api/v1/services/aigc/video-generation/video-synthesis`);
}

assert.equal(requiresImageInput("happyhorse-1.1-i2v"), true);
assert.equal(requiresVideoInput("wan2.7-videoedit"), true);

const wan27 = models.find((model) => model.id === "wan2.7-videoedit")!;
assert.ok(wan27);
assert.equal(estimateAsyncCost(wan27, { duration: 10, resolution: "720P" }), 12);
assert.equal(estimateAsyncCost(wan27, { duration: 10, resolution: "1080P" }), 20);
assert.equal(
  estimateAsyncCost(wan27, {
    resolution: "1080P",
    usage: { input_video_duration: 5.02, output_video_duration: 5.02, duration: 10.04 },
  }),
  10.04
);
assert.throws(
  () => estimateAsyncCost(wan27, { duration: 10, resolution: "480P" }),
  /No price is configured/
);

const wan27R2v = models.find((model) => model.id === "wan2.7-r2v")!;
assert.ok(wan27R2v);
assert.equal(
  estimateAsyncCost(wan27R2v, {
    duration: 10,
    resolution: "720P",
    video_url: "https://example.invalid/reference.mp4",
  }),
  9
);

console.log("media adapter, parameter, and billing contract tests passed");
