import assert from "node:assert/strict";
import { models } from "../src/data/models";
import {
  AudioPricingUnavailableError,
  QWEN3_ASR_MAX_SECONDS,
  QWEN3_TTS_HTTP_UPSTREAM_MODEL,
  calculateAsrCost,
  calculateTtsCost,
  qwen3AsrPricePerSecond,
  qwen3TtsPricePer10kCharacters,
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

const asr = models.find((model) => model.id === "qwen3-asr-flash");
assert.equal(asr?.pricingType, "per-second");
assert.equal(asr?.promptPrice, 0.00022);

const tts = models.find((model) => model.id === "qwen3-tts-flash");
assert.equal(tts?.pricingType, "per-10k-characters");
assert.equal(tts?.promptPrice, 0.8);

console.log("audio pricing checks passed");
