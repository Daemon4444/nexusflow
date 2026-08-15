/**
 * Auditable list prices for the public audio aliases. Units are deliberately
 * explicit: ASR is per audio second; Qwen3 TTS Flash is per 10,000 characters.
 *
 * Alibaba Cloud Model Studio sources (checked 2026-07-28):
 * https://help.aliyun.com/zh/model-studio/qwen3-asr-flash
 * https://help.aliyun.com/zh/model-studio/model-pricing
 */

export const QWEN3_ASR_MAX_SECONDS = 5 * 60;
export const QWEN3_TTS_HTTP_UPSTREAM_MODEL = "qwen3-tts-flash";

const QWEN3_ASR_CNY_PER_SECOND: Record<string, number> = {
  "cn-beijing": 0.00022,
  "ap-southeast-1": 0.00026,
};

const QWEN3_TTS_CNY_PER_10K_CHARACTERS: Record<string, number> = {
  "cn-beijing": 0.8,
  "ap-southeast-1": 0.733924,
};

export class AudioPricingUnavailableError extends Error {
  constructor(readonly region: string, readonly modelId: string) {
    super(`No verified audio price is configured for model '${modelId}' in region '${region}'.`);
    this.name = "AudioPricingUnavailableError";
  }
}

function verifiedPrice(
  prices: Record<string, number>,
  modelId: string,
  region: string
): number {
  const price = prices[region];
  if (!Number.isFinite(price) || price < 0) {
    throw new AudioPricingUnavailableError(region, modelId);
  }
  return price;
}

function finiteNonNegative(value: number, unit: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${unit} must be a finite non-negative number`);
  }
  return value;
}

export function qwen3AsrPricePerSecond(region: string): number {
  return verifiedPrice(QWEN3_ASR_CNY_PER_SECOND, "qwen3-asr-flash", region);
}

export function qwen3TtsPricePer10kCharacters(region: string): number {
  return verifiedPrice(
    QWEN3_TTS_CNY_PER_10K_CHARACTERS,
    "qwen3-tts-flash",
    region
  );
}

export function calculateAsrCost(seconds: number, pricePerSecond: number): number {
  return finiteNonNegative(seconds, "seconds")
    * finiteNonNegative(pricePerSecond, "pricePerSecond");
}

export function calculateTtsCost(characters: number, pricePer10kCharacters: number): number {
  return (finiteNonNegative(characters, "characters") / 10_000)
    * finiteNonNegative(pricePer10kCharacters, "pricePer10kCharacters");
}
