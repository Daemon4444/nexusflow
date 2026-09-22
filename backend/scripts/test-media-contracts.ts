import assert from "node:assert/strict";
import { models } from "../src/data/models";
import { adaptHappyHorseRequest, adaptImageRequest, adaptVideoRequest } from "../src/services/adapters";
import { estimateAsyncCost } from "../src/services/async-billing";
import {
  normalizeDashScopeVideoResolution,
  normalizeDashScopeVideoSize,
  requiresImageInput,
  requiresVideoInput,
  resolveVideoSizeTier,
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

// ========== 回归：t2v/r2v 的归一化结果只落在 size 上，计费必须能读到它 ==========
// 这两类模型走 normalizeDashScopeVideoSize，params.resolution 始终是 undefined。
// 计费侧漏读 size 会让 wan2.7 系列在默认档直接失去价格（整条链路 500），
// 并让「按 size 表达的 1080P」被按 720P 少收。
assert.equal(resolveVideoSizeTier("1280*720"), "720P");
assert.equal(resolveVideoSizeTier("960*960"), "720P", "1:1 的 720P 档不含 720 字样，只能靠映射表");
assert.equal(resolveVideoSizeTier("1920*1080"), "1080P");
assert.equal(resolveVideoSizeTier("1440*1440"), "1080P", "1:1 的 1080P 档不含 1080 字样");
assert.equal(resolveVideoSizeTier("1920x1080"), "1080P", "x / × 分隔符必须归一");
assert.equal(resolveVideoSizeTier(undefined), undefined);
assert.equal(resolveVideoSizeTier("640*480"), undefined, "非白名单尺寸不得猜档位");

for (const modelId of ["wan2.7-t2v", "wan2.7-r2v", "wan2.6-t2v"] as const) {
  const entry = models.find((model) => model.id === modelId)!;
  assert.ok(entry);
  for (const [request, expectedPerSecond] of [
    [{}, 0.6],
    [{ ratio: "1:1" }, 0.6],
    [{ resolution: "1080P" }, 1],
    [{ resolution: "1080P", ratio: "1:1" }, 1],
  ] as const) {
    // 完整复刻路由的归一化：t2v/r2v 只产出 size
    const size = normalizeDashScopeVideoSize(request);
    assert.equal(
      estimateAsyncCost(entry, { duration: 5, size }),
      Math.round(expectedPerSecond * 5 * 100) / 100,
      `${modelId} 以 size='${size}' 结算时必须命中 ¥${expectedPerSecond}/秒`
    );
  }
}

// 非白名单分辨率仍然 fail-closed（路由层负责转成 400，而不是 500）
assert.throws(
  () => estimateAsyncCost(models.find((model) => model.id === "wan2.7-t2v")!, { duration: 5, resolution: "480P" }),
  /No price is configured/
);

// ========== 回归：轮询路径上 usage 缺时长不得抛错 ==========
// 抛错会让 completeTask 永不执行，任务卡在 pending 且预留余额不释放。
const videoEditModel = models.find((model) => model.id === "wan2.7-videoedit")!;
assert.equal(
  estimateAsyncCost(videoEditModel, { duration: 10, resolution: "1080P", usage: { requestId: "x" } }),
  20,
  "usage 缺时长时必须落回退公式（输入视频时长已计入），不能抛错"
);
const r2vModel = models.find((model) => model.id === "wan2.7-r2v")!;
assert.equal(
  estimateAsyncCost(r2vModel, {
    duration: 5,
    resolution: "720P",
    video_url: "https://example.invalid/reference.mp4",
    usage: {},
  }),
  6,
  "带输入视频的 r2v 在 usage 缺失时同样落回退公式"
);
assert.equal(
  estimateAsyncCost(videoEditModel, { duration: 10, resolution: "1080P", usage: { duration: 12.5 } }),
  12.5,
  "usage 有真实时长时仍以它为准"
);

console.log("video size-tier billing and usage-fallback regression tests passed");
