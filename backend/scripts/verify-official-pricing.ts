/**
 * 用百炼官方全量价本校验本地模型目录。
 * 参考值逐条抄自官方 CSV（中国内地部署范围），仅覆盖本平台在售的模型。
 * 用途：一次性核对，不参与运行时。
 */
import { getStaticModels, resolveCachePricing, resolveCompletionPrice, AIModel } from "../src/data/models";

interface Ref {
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

const REF: Record<string, Ref> = {
  "qwen3.8-max": { ctx: 1000000, maxOut: 131072, in: 12, out: 36, cache: 1.5, create: 15, read: 1 },
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
      { max: 131072, in: 0.2, out: 0.8, cache: 0.04, read: 0.02 },
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
  "deepseek-v4-flash": { ctx: 1000000, maxOut: 393216, in: 1, out: 2, cache: 0.2 },
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
  "kimi-k2.5": { ctx: 262144, maxOut: 98304, in: 4, out: 21, cache: 0.8, create: 5, read: 0.4 },
  "kimi-k2.6": { ctx: 262144, maxOut: 98304, in: 6.5, out: 27, cache: 1.3, create: 8.125, read: 0.65 },
  "kimi/kimi-k3": { ctx: 1048576, maxOut: 1048576, in: 20, out: 100, cache: 2 },
  "MiniMax/MiniMax-M3": { ctx: 1000000, maxOut: 524288, in: 4.2, out: 16.8, cache: 0.84 },
  "MiniMax-M2.1": { ctx: 204800, maxOut: 32768, in: 2.1, out: 8.4, cache: 0.42 },
  "MiniMax-M2.5": { ctx: 196608, maxOut: 32768, in: 2.1, out: 8.4, cache: 0.42 },
  "text-embedding-v4": { in: 0.5 },
  "text-embedding-v3": { in: 0.5 },
};

const at6 = (v: number) => Math.round(v * 1_000_000) / 1_000_000;
const problems: string[] = [];
const notes: string[] = [];
const add = (id: string, msg: string) => problems.push(`${id.padEnd(22)} ${msg}`);

const models = new Map(getStaticModels().map((m) => [m.id, m]));

for (const [id, ref] of Object.entries(REF)) {
  const m = models.get(id) as AIModel | undefined;
  if (!m) { notes.push(`${id} 不在本地目录（官方有价，未接入）`); continue; }

  if (ref.ctx !== undefined && m.contextLength !== ref.ctx) {
    add(id, `contextLength ${m.contextLength} ≠ 官方 ${ref.ctx}`);
  }
  if (ref.maxOut !== undefined && m.maxOutput !== ref.maxOut) {
    add(id, `maxOutput ${m.maxOutput} ≠ 官方 ${ref.maxOut}`);
  }
  if (ref.in !== undefined && at6(m.promptPrice) !== ref.in) {
    add(id, `输入价 ${m.promptPrice} ≠ 官方 ${ref.in}`);
  }
  if (ref.out !== undefined && at6(m.completionPrice) !== ref.out) {
    add(id, `输出价 ${m.completionPrice} ≠ 官方 ${ref.out}`);
  }

  // 模型级缓存
  const base = resolveCachePricing(m);
  if (ref.cache !== undefined && !ref.tiers && at6(base.implicitHit) !== ref.cache) {
    add(id, `隐式缓存命中 实收 ${at6(base.implicitHit)} ≠ 官方 ${ref.cache}`);
  }
  if (ref.read !== undefined && !ref.tiers && at6(base.explicitHit) !== ref.read) {
    add(id, `显式缓存命中 实收 ${at6(base.explicitHit)} ≠ 官方 ${ref.read}`);
  }
  if (ref.create !== undefined && !ref.tiers && at6(base.explicitCreation) !== ref.create) {
    add(id, `显式缓存创建 实收 ${at6(base.explicitCreation)} ≠ 官方 ${ref.create}`);
  }

  // 档位
  if (ref.tiers) {
    const local = m.tokenPricingTiers || [];
    if (local.length !== ref.tiers.length) {
      add(id, `档位数 ${local.length} ≠ 官方 ${ref.tiers.length}`);
    }
    ref.tiers.forEach((rt, i) => {
      const lt = local[i];
      if (!lt) return;
      if (lt.maxTokens !== rt.max) add(id, `档${i + 1} maxTokens ${lt.maxTokens} ≠ 官方 ${rt.max}`);
      if (at6(lt.promptPrice) !== rt.in) add(id, `档${i + 1} 输入价 ${lt.promptPrice} ≠ 官方 ${rt.in}`);
      if (at6(lt.completionPrice) !== rt.out) add(id, `档${i + 1} 输出价 ${lt.completionPrice} ≠ 官方 ${rt.out}`);
      const tc = resolveCachePricing(m, lt);
      if (rt.cache !== undefined && at6(tc.implicitHit) !== rt.cache) {
        add(id, `档${i + 1} 隐式缓存 实收 ${at6(tc.implicitHit)} ≠ 官方 ${rt.cache}`);
      }
      if (rt.read !== undefined && at6(tc.explicitHit) !== rt.read) {
        add(id, `档${i + 1} 显式缓存 实收 ${at6(tc.explicitHit)} ≠ 官方 ${rt.read}`);
      }
      if (rt.thinkingOut !== undefined) {
        const actual = at6(resolveCompletionPrice(m, lt, true));
        if (actual !== rt.thinkingOut) add(id, `档${i + 1} 思考模式输出 实收 ${actual} ≠ 官方 ${rt.thinkingOut}`);
      }
    });
  }

  // omni 音频分模态
  if (ref.audioIn !== undefined) {
    if (m.audioInputPrice === undefined) add(id, `缺 audioInputPrice（官方音频输入 ${ref.audioIn}，现按文本价 ${m.promptPrice} 计=少收 ${at6(ref.audioIn / m.promptPrice)}倍）`);
    else if (at6(m.audioInputPrice) !== ref.audioIn) add(id, `audioInputPrice ${m.audioInputPrice} ≠ 官方 ${ref.audioIn}`);
  }
  if (ref.audioOut !== undefined) {
    if (m.audioOutputPrice === undefined) add(id, `缺 audioOutputPrice（官方 ${ref.audioOut}）`);
    else if (at6(m.audioOutputPrice) !== ref.audioOut) add(id, `audioOutputPrice ${m.audioOutputPrice} ≠ 官方 ${ref.audioOut}`);
  }

  // 思考模式输出价（模型级）
  if (ref.thinkingOut !== undefined) {
    const actual = at6(resolveCompletionPrice(m, null, true));
    if (actual !== ref.thinkingOut) add(id, `思考模式输出 实收 ${actual} ≠ 官方 ${ref.thinkingOut}`);
  }
}

console.log(`=== 校验 ${Object.keys(REF).length} 个模型，发现 ${problems.length} 处不一致 ===`);
for (const p of problems) console.log("  ✗ " + p);
console.log(`\n=== schema 表达能力缺口 / 备注 ${notes.length} 条 ===`);
for (const n of notes) console.log("  ! " + n);
