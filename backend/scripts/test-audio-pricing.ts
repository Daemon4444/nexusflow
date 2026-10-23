import assert from "node:assert/strict";
import { models } from "../src/data/models";
import {
  AudioPricingUnavailableError,
  QWEN3_ASR_MAX_SECONDS,
  QWEN3_TTS_HTTP_UPSTREAM_MODEL,
  calculateAsrCost,
  calculateTtsCost,
  QWEN_AUDIO_31_ASR_FLASH_ID,
  calculateTokenAsrCost,
  qwen3AsrPricePerSecond,
  qwen3TtsPricePer10kCharacters,
  qwenAudio31AsrTokenPrices,
} from "../src/services/audio-pricing";

assert.equal(QWEN3_ASR_MAX_SECONDS, 300);
assert.equal(QWEN3_TTS_HTTP_UPSTREAM_MODEL, "qwen3-tts-flash");

assert.equal(qwen3AsrPricePerSecond("cn-beijing"), 0.00022);
assert.equal(qwen3AsrPricePerSecond("ap-southeast-1"), 0.00026);
assert.equal(calculateAsrCost(60, qwen3AsrPricePerSecond("cn-beijing")), 0.0132);

assert.equal(qwen3TtsPricePer10kCharacters("cn-beijing"), 0.8);
assert.equal(qwen3TtsPricePer10kCharacters("ap-southeast-1"), 0.733924);
assert.equal(calculateTtsCost(2_500, qwen3TtsPricePer10kCharacters("cn-beijing")), 0.2);

assert.throws(
  () => qwen3AsrPricePerSecond("us-east-1"),
  AudioPricingUnavailableError,
  "unverified regional prices must fail closed"
);
assert.throws(
  () => calculateTtsCost(Number.NaN, 0.8),
  /finite non-negative/,
  "unknown billing units must never silently become zero"
);

// qwen-audio-3.1-asr-flash: token-billed, 0.8 in / 2.7 out per million tokens (cn-beijing).
assert.deepEqual(qwenAudio31AsrTokenPrices("cn-beijing"), { input: 0.8, output: 2.7 });
assert.deepEqual(qwenAudio31AsrTokenPrices("ap-southeast-1"), { input: 1.094, output: 3.427 });
// vinput's published sample: 997 in / 89 out tokens = ¥0.0010379 at console price.
assert.ok(Math.abs(calculateTokenAsrCost(997, 89, qwenAudio31AsrTokenPrices("cn-beijing")) - 0.0010379) < 1e-12);
assert.throws(() => qwenAudio31AsrTokenPrices("us-east-1"), AudioPricingUnavailableError);
assert.throws(() => calculateTokenAsrCost(Number.NaN, 1, { input: 0.8, output: 2.7 }), /finite non-negative/);
const asr31 = models.find((model) => model.id === QWEN_AUDIO_31_ASR_FLASH_ID);
assert.equal(asr31?.category, "语音模型");
assert.equal(asr31?.promptPrice, 0.8);
assert.equal(asr31?.completionPrice, 2.7);
assert.ok(!asr31?.pricingType || asr31.pricingType === "token");

const asr = models.find((model) => model.id === "qwen3-asr-flash");
assert.equal(asr?.pricingType, "per-second");
assert.equal(asr?.promptPrice, 0.00022);

const tts = models.find((model) => model.id === "qwen3-tts-flash");
assert.equal(tts?.pricingType, "per-10k-characters");
assert.equal(tts?.promptPrice, 0.8);

console.log("audio pricing checks passed");
