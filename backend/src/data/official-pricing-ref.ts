/**
 * Hand-verified official price reference (moved verbatim from
 * scripts/verify-official-pricing.ts so runtime tooling such as the Bailian
 * catalog sync can compare against it). Values are copied from the official
 * price books; never edit them to match a parser or the catalog without the
 * archived source (see docs/MODEL_ONBOARDING.md §4.20).
 *
 * 百炼参考值逐条抄自官方 CSV（中国内地部署范围）；Claude 参考值来自
 * Anthropic 官方定价页，按 1 USD = 6.8 CNY 折算。
 */
import type { AIModel } from "./models";

export interface Ref {
  ctx?: number;          // 上下文
  maxOut?: number;       // 最大输出
  in?: number;           // 输入
  out?: number;          // 输出
  cache?: number;        // 输入（缓存命中）= 隐式
  create?: number;       // 显式缓存创建
  read?: number;         // 显式缓存命中
  tiers?: { max: number; in: number; out: number; cache?: number; read?: number; thinkingOut?: number }[];
  thinkingOut?: number;  // 输出（思考）
  audioIn?: number;
  audioOut?: number;
}

export const REF: Record<string, Ref> = {
  "gpt-6-astra": {
    ctx: 1_050_000,
    maxOut: 128_000,
    tiers: [
      { max: 272_000, in: 68, out: 340, cache: 6.8, read: 6.8 },
      { max: 1_050_000, in: 136, out: 510, cache: 13.6, read: 13.6 },
    ],
  },
  "claude-haiku-4-5": { ctx: 200000, maxOut: 64000, in: 6.8, out: 34, cache: 0.68, read: 0.68 },
  "claude-sonnet-4-6": { ctx: 1000000, maxOut: 64000, in: 20.4, out: 102, cache: 2.04, read: 2.04 },
  "claude-sonnet-5": { ctx: 1000000, maxOut: 128000, in: 13.6, out: 68, cache: 1.36, read: 1.36 },
  "claude-opus-4-8": { ctx: 1000000, maxOut: 128000, in: 34, out: 170, cache: 3.4, read: 3.4 },
  "claude-opus-5": { ctx: 1000000, maxOut: 128000, in: 34, out: 170, cache: 3.4, read: 3.4 },
  "qwen3.8-max": { ctx: 1000000, maxOut: 131072, in: 12, out: 36, cache: 1.5, create: 15, read: 1 },
  "qwen3.8-flash": { ctx: 1000000, maxOut: 131072, in: 0.8, out: 2.7, cache: 0.16, read: 0.08 },
  "qwen3.7-max": { ctx: 1000000, maxOut: 131072, in: 12, out: 36, cache: 2.4, create: 15, read: 1.2 },
  "qwen3.7-plus": {
    ctx: 1000000, maxOut: 131072,
    tiers: [
      { max: 262144, in: 2, out: 8, cache: 0.4, read: 0.2 },
      { max: 1000000, in: 6, out: 24, cache: 1.2, read: 0.6 },
    ],
  },
  "qwen3-max": {
    ctx: 262144, maxOut: 65536,
    tiers: [
      { max: 32768, in: 2.5, out: 10, cache: 0.5, read: 0.25 },
      { max: 131072, in: 4, out: 16, cache: 0.8, read: 0.4 },
      { max: 262144, in: 7, out: 28, cache: 1.4, read: 0.7 },
    ],
  },
  "qwen3.6-max-preview": {
    ctx: 262144, maxOut: 65536,
    tiers: [
      { max: 131072, in: 9, out: 54, read: 0.9 },
      { max: 262144, in: 15, out: 90, read: 1.5 },
    ],
  },
  "qwen3.6-plus": {
    ctx: 1000000, maxOut: 65536,
    tiers: [
      { max: 262144, in: 2, out: 12, read: 0.2 },
      { max: 1000000, in: 8, out: 48, read: 0.8 },
    ],
  },
  "qwen3.5-plus": {
    ctx: 1000000, maxOut: 65536,
    tiers: [
      { max: 131072, in: 0.8, out: 4.8, read: 0.08 },
      { max: 262144, in: 2, out: 12, read: 0.2 },
      { max: 1000000, in: 4, out: 24, read: 0.4 },
    ],
  },
  "qwen3.7-flash": {
    ctx: 1000000, maxOut: 131072,
    tiers: [
      { max: 32768, in: 0.2, out: 0.8, cache: 0.04, read: 0.02 },
      { max: 262144, in: 0.6, out: 2.4, cache: 0.12, read: 0.06 },
      { max: 1000000, in: 1.2, out: 4.8, cache: 0.24, read: 0.12 },
    ],
  },
  "qwen3.6-flash": {
    ctx: 1000000, maxOut: 65536,
    tiers: [
      { max: 262144, in: 1.2, out: 7.2, read: 0.12 },
      { max: 1000000, in: 4.8, out: 28.8, read: 0.48 },
    ],
  },
  "qwen3.5-flash": {
    ctx: 1000000, maxOut: 65536,
    tiers: [
      { max: 131072, in: 0.2, out: 2, read: 0.02 },
      { max: 262144, in: 0.8, out: 8, read: 0.08 },
      { max: 1000000, in: 1.2, out: 12, read: 0.12 },
    ],
  },
  "qwen-plus": {
    ctx: 1000000, maxOut: 32768,
    tiers: [
      { max: 131072, in: 0.8, out: 2, cache: 0.16, read: 0.08, thinkingOut: 8 },
      { max: 262144, in: 2.4, out: 20, cache: 0.48, read: 0.24, thinkingOut: 24 },
      { max: 1000000, in: 4.8, out: 48, cache: 0.96, read: 0.48, thinkingOut: 64 },
    ],
  },
  "qwen-turbo": { ctx: 131072, maxOut: 16384, in: 0.3, out: 0.6, cache: 0.06, thinkingOut: 3 },
  "qwen-long": { ctx: 10000000, maxOut: 8192, in: 0.5, out: 2 },
  "qwen-flash": {
    ctx: 1000000, maxOut: 32768,
    tiers: [
      { max: 131072, in: 0.15, out: 1.5, cache: 0.03, read: 0.015 },
      { max: 262144, in: 0.6, out: 6, cache: 0.12, read: 0.06 },
      { max: 1000000, in: 1.2, out: 12, cache: 0.24, read: 0.12 },
    ],
  },
  "qwq-plus": { ctx: 131072, maxOut: 8192, in: 1.6, out: 4 },
  "qwen3-vl-plus": {
    ctx: 262144, maxOut: 32768,
    tiers: [
      { max: 32768, in: 1, out: 10, cache: 0.2, read: 0.1 },
      { max: 131072, in: 1.5, out: 15, cache: 0.3, read: 0.15 },
      { max: 262144, in: 3, out: 30, cache: 0.6, read: 0.3 },
    ],
  },
  "qwen3-vl-flash": {
    ctx: 262144, maxOut: 32768,
    tiers: [
      { max: 32768, in: 0.15, out: 1.5, cache: 0.03, read: 0.015 },
      { max: 131072, in: 0.3, out: 3, cache: 0.06, read: 0.03 },
      { max: 262144, in: 0.6, out: 6, cache: 0.12, read: 0.06 },
    ],
  },
  "qwen3-coder-plus": {
    ctx: 1000000, maxOut: 65536,
    tiers: [
      { max: 32768, in: 4, out: 16, cache: 0.8, read: 0.4 },
      { max: 131072, in: 6, out: 24, cache: 1.2, read: 0.6 },
      { max: 262144, in: 10, out: 40, cache: 2, read: 1 },
      { max: 1000000, in: 20, out: 200, cache: 4, read: 2 },
    ],
  },
  "qwen3-coder-flash": {
    ctx: 1000000, maxOut: 65536,
    tiers: [
      { max: 32768, in: 1, out: 4, cache: 0.2, read: 0.1 },
      { max: 131072, in: 1.5, out: 6, cache: 0.3, read: 0.15 },
      { max: 262144, in: 2.5, out: 10, cache: 0.5, read: 0.25 },
      { max: 1000000, in: 5, out: 25, cache: 1, read: 0.5 },
    ],
  },
  "qwen-vl-max": { ctx: 131072, maxOut: 8192, in: 1.6, out: 4, cache: 0.32 },
  "qwen-vl-plus": { ctx: 131072, maxOut: 8192, in: 0.8, out: 2, cache: 0.16 },
  "qwen3-235b-a22b": { ctx: 131072, maxOut: 16384, in: 2, out: 8, thinkingOut: 20 },
  "qwen3.6-35b-a3b": { ctx: 262144, maxOut: 65536, in: 1.8, out: 10.8 },
  "qwen3-32b": { ctx: 131072, maxOut: 8192, in: 2, out: 8, thinkingOut: 20 },
  "qwen3-8b": { ctx: 131072, maxOut: 8192, in: 0.5, out: 2, thinkingOut: 5 },
  "qwen-math-plus": { ctx: 4096, maxOut: 3072, in: 4, out: 12 },
  "qwen-mt-plus": { ctx: 16384, maxOut: 8192, in: 1.8, out: 5.4 },
  "tongyi-intent-detect-v3": { ctx: 8192, maxOut: 1024, in: 0.4, out: 1 },
  "qwen3.5-omni-plus": { ctx: 262144, maxOut: 65536, in: 7, out: 40, audioIn: 53, audioOut: 213 },
  "qwen3.5-omni-flash": { ctx: 262144, maxOut: 65536, in: 2.2, out: 13.3, audioIn: 18, audioOut: 72 },
  "qwen3-omni-flash": { ctx: 65536, maxOut: 16384, in: 1.8, out: 6.9, audioIn: 15.8, audioOut: 62.6 },
  "deepseek-v4-pro": { ctx: 1000000, maxOut: 393216, in: 12, out: 24, cache: 1 },
  "deepseek-v4-pro-0813": { ctx: 1000000, maxOut: 393216, in: 9, out: 27, cache: 1.8 },
  "deepseek-v4-flash": { ctx: 1000000, maxOut: 393216, in: 1, out: 2, cache: 0.2 },
  "deepseek-v4-flash-0731": { ctx: 1000000, maxOut: 393216, in: 1, out: 2, cache: 0.2 },
  "deepseek-v4.1-flash": { ctx: 1000000, maxOut: 393216, in: 1, out: 4, cache: 0.2 },
  "deepseek-v3.2": { ctx: 131072, maxOut: 65536, in: 2, out: 3, cache: 0.4, create: 2.5, read: 0.2 },
  "deepseek-r1": { ctx: 131072, maxOut: 16384, in: 4, out: 16, cache: 0.8 },
  "deepseek-v3": { ctx: 131072, maxOut: 8192, in: 2, out: 8, cache: 0.4 },
  "glm-4.7": {
    ctx: 169984, maxOut: 16384,
    tiers: [
      { max: 32768, in: 3, out: 14, cache: 0.6 },
      { max: 169984, in: 4, out: 16, cache: 0.8 },
    ],
  },
  "glm-5": {
    ctx: 202752, maxOut: 16384,
    tiers: [
      { max: 32768, in: 4, out: 18, cache: 0.8 },
      { max: 202752, in: 6, out: 22, cache: 1.2 },
    ],
  },
  "glm-5.1": {
    ctx: 202745, maxOut: 131072,
    tiers: [
      { max: 32768, in: 6, out: 24, cache: 1.2, read: 0.6 },
      { max: 202752, in: 8, out: 28, cache: 1.6, read: 0.8 },
    ],
  },
  "glm-5.2": { ctx: 1048576, maxOut: 131072, in: 8, out: 28, cache: 2 },
  "glm-5.2-fast-preview": { ctx: 1048576, maxOut: 131072, in: 16, out: 56, cache: 4 },
  "glm-5.3": { ctx: 1048576, maxOut: 131072, in: 8, out: 28, cache: 2 },
  "kimi-k2.5": { ctx: 262144, maxOut: 98304, in: 4, out: 21, cache: 0.8, create: 5, read: 0.4 },
  "kimi-k2.6": { ctx: 262144, maxOut: 98304, in: 6.5, out: 27, cache: 1.3, create: 8.125, read: 0.65 },
  "kimi-k2.7-code": { ctx: 262144, maxOut: 98304, in: 6.5, out: 27, cache: 1.3, read: 0.65 },
  "kimi/kimi-k2.7-code-highspeed": { ctx: 262144, maxOut: 98304, in: 13, out: 54, cache: 2.6, read: 1.3 },
  "kimi-k2-thinking": { ctx: 262144, maxOut: 98304, in: 4, out: 16, cache: 0.8, read: 0.4 },
  "MiniMax/MiniMax-M3": { ctx: 1000000, maxOut: 524288, in: 4.2, out: 16.8, cache: 0.84 },
  "MiniMax-M2.1": { ctx: 204800, maxOut: 32768, in: 2.1, out: 8.4, cache: 0.42 },
  "MiniMax-M2.5": { ctx: 196608, maxOut: 32768, in: 2.1, out: 8.4, cache: 0.42 },
  "MiniMax/MiniMax-M2.7": { ctx: 196608, maxOut: 32768, in: 2.1, out: 8.4, cache: 0.42 },
  "text-embedding-v4": { in: 0.5 },
  "text-embedding-v3": { in: 0.5 },
};

export interface UnitRef {
  pricingType: NonNullable<AIModel["pricingType"]>;
  base: number;
  tiers: Array<{ label: string; price: number }>;
}

// 非 token 计费的百炼在售模型。PixVerse 是 NexusFlow 的跨渠道产品 ID，
// 这里校验其百炼渠道对应的 V6 官方计费档位；不把该产品 ID 冒充百炼原生 ID。
export const UNIT_REF: Record<string, UnitRef> = {
  "qwen3-asr-flash": { pricingType: "per-second", base: 0.00022, tiers: [{ label: "华北2（北京）", price: 0.00022 }] },
  "qwen3-tts-flash": { pricingType: "per-10k-characters", base: 0.8, tiers: [{ label: "华北2（北京）", price: 0.8 }] },
  "wan2.6-t2i": { pricingType: "per-image", base: 0.2, tiers: [{ label: "标准", price: 0.2 }] },
  "wan2.6-t2v": { pricingType: "per-second", base: 0.6, tiers: [{ label: "720P", price: 0.6 }, { label: "1080P", price: 1 }] },
  "wan2.6-i2v": { pricingType: "per-second", base: 0.6, tiers: [{ label: "720P", price: 0.6 }, { label: "1080P", price: 1 }] },
  "wan2.6-r2v": { pricingType: "per-second", base: 0.6, tiers: [{ label: "720P", price: 0.6 }, { label: "1080P", price: 1 }] },
  "wan2.6-i2v-flash": { pricingType: "per-second", base: 0.15, tiers: [{ label: "720P 有声", price: 0.3 }, { label: "1080P 有声", price: 0.5 }, { label: "720P 无声", price: 0.15 }, { label: "1080P 无声", price: 0.25 }] },
  "wan2.6-r2v-flash": { pricingType: "per-second", base: 0.15, tiers: [{ label: "720P 有声", price: 0.3 }, { label: "1080P 有声", price: 0.5 }, { label: "720P 无声", price: 0.15 }, { label: "1080P 无声", price: 0.25 }] },
  "pixverse-v6": { pricingType: "per-second", base: 0.15, tiers: [{ label: "360P 有声", price: 0.21 }, { label: "540P 有声", price: 0.27 }, { label: "720P 有声", price: 0.36 }, { label: "1080P 有声", price: 0.68 }, { label: "360P 无声", price: 0.15 }, { label: "540P 无声", price: 0.21 }, { label: "720P 无声", price: 0.27 }, { label: "1080P 无声", price: 0.53 }] },
  "happyhorse-1.0-t2v": { pricingType: "per-second", base: 0.9, tiers: [{ label: "720P", price: 0.9 }, { label: "1080P", price: 1.6 }] },
  "happyhorse-1.0-i2v": { pricingType: "per-second", base: 0.9, tiers: [{ label: "720P", price: 0.9 }, { label: "1080P", price: 1.6 }] },
  "happyhorse-1.0-r2v": { pricingType: "per-second", base: 0.9, tiers: [{ label: "720P", price: 0.9 }, { label: "1080P", price: 1.6 }] },
  "happyhorse-1.0-video-edit": { pricingType: "per-second", base: 0.9, tiers: [{ label: "720P", price: 0.9 }, { label: "1080P", price: 1.6 }] },
  "wan2.7-image": { pricingType: "per-image", base: 0.2, tiers: [{ label: "标准", price: 0.2 }] },
  "wan2.7-image-pro": { pricingType: "per-image", base: 0.5, tiers: [{ label: "标准", price: 0.5 }] },
  "wan2.7-t2v": { pricingType: "per-second", base: 0.6, tiers: [{ label: "720P", price: 0.6 }, { label: "1080P", price: 1 }] },
  "wan2.7-i2v": { pricingType: "per-second", base: 0.6, tiers: [{ label: "720P", price: 0.6 }, { label: "1080P", price: 1 }] },
  "wan2.7-r2v": { pricingType: "per-second", base: 0.6, tiers: [{ label: "720P", price: 0.6 }, { label: "1080P", price: 1 }] },
  "wan2.7-videoedit": { pricingType: "per-second", base: 0.6, tiers: [{ label: "720P", price: 0.6 }, { label: "1080P", price: 1 }] },
  "wan3.0-video": { pricingType: "per-second", base: 0.3, tiers: [{ label: "480P", price: 0.3 }] },
  "wan3.0-video-prime": { pricingType: "per-second", base: 0.45, tiers: [{ label: "480P", price: 0.45 }] },
  "happyhorse-1.1-t2v": { pricingType: "per-second", base: 0.45, tiers: [{ label: "480P", price: 0.45 }] },
  "happyhorse-1.1-i2v": { pricingType: "per-second", base: 0.45, tiers: [{ label: "480P", price: 0.45 }] },
  "happyhorse-1.1-r2v": { pricingType: "per-second", base: 0.45, tiers: [{ label: "480P", price: 0.45 }] },
};
